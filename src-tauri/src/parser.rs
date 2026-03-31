use crate::session::SessionSync;
use base64::Engine;
use serde::Serialize;
use std::collections::VecDeque;
use std::io::Read;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

// ── Event payloads ──────────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
pub struct BlockStartEvent {
    pub session_id: String,
    pub block_id: String,
    pub command: String,
    pub cwd: String,
    pub timestamp: u64,
}

#[derive(Clone, Serialize)]
pub struct BlockOutputEvent {
    pub session_id: String,
    pub block_id: String,
    pub segments: Vec<StyledSegment>,
}

#[derive(Clone, Serialize)]
pub struct BlockCompleteEvent {
    pub session_id: String,
    pub block_id: String,
    pub exit_code: i32,
    pub duration: f64,
}

#[derive(Clone, Serialize)]
pub struct ModeSwitchEvent {
    pub session_id: String,
    pub mode: String,
}

#[derive(Clone, Serialize)]
pub struct PtyStreamEvent {
    pub session_id: String,
    pub data: String, // base64-encoded raw bytes
}

#[derive(Clone, Serialize)]
pub struct SessionErrorEvent {
    pub session_id: String,
    pub error: String,
}

#[derive(Clone, Serialize)]
pub struct SessionCwdEvent {
    pub session_id: String,
    pub cwd: String,
}

#[derive(Clone, Serialize, Debug)]
pub struct StyledSegment {
    pub text: String,
    pub style: SegmentStyle,
}

#[derive(Clone, Serialize, Debug, Default)]
pub struct SegmentStyle {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fg: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bg: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bold: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub italic: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub underline: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dim: Option<bool>,
}

// ── ANSI style state ────────────────────────────────────────────────────────

#[derive(Clone, Default, Debug)]
struct AnsiStyle {
    fg: Option<String>,
    bg: Option<String>,
    bold: bool,
    italic: bool,
    underline: bool,
    dim: bool,
}

impl AnsiStyle {
    fn reset(&mut self) {
        *self = Self::default();
    }

    fn to_segment_style(&self) -> SegmentStyle {
        SegmentStyle {
            fg: self.fg.clone(),
            bg: self.bg.clone(),
            bold: self.bold.then_some(true),
            italic: self.italic.then_some(true),
            underline: self.underline.then_some(true),
            dim: self.dim.then_some(true),
        }
    }
}

// ── Standard ANSI color palette ─────────────────────────────────────────────

fn ansi_color_to_hex(n: u8) -> Option<String> {
    let hex = match n {
        0 => "#000000",
        1 => "#cc0000",
        2 => "#4e9a06",
        3 => "#c4a000",
        4 => "#3465a4",
        5 => "#75507b",
        6 => "#06989a",
        7 => "#d3d7cf",
        8 => "#555753",
        9 => "#ef2929",
        10 => "#8ae234",
        11 => "#fce94f",
        12 => "#729fcf",
        13 => "#ad7fa8",
        14 => "#34e2e2",
        15 => "#eeeeec",
        16..=231 => {
            let idx = n - 16;
            let r = (idx / 36) % 6;
            let g = (idx / 6) % 6;
            let b = idx % 6;
            let to_val = |c: u8| if c == 0 { 0u8 } else { 55 + 40 * c };
            return Some(format!("#{:02x}{:02x}{:02x}", to_val(r), to_val(g), to_val(b)));
        }
        232..=255 => {
            let v = 8 + 10 * (n - 232);
            return Some(format!("#{:02x}{:02x}{:02x}", v, v, v));
        }
    };
    Some(hex.to_string())
}

// ── UTF-8 decoder ───────────────────────────────────────────────────────────

struct Utf8Decoder {
    buf: [u8; 4],
    len: usize,
    expected: usize,
}

impl Utf8Decoder {
    fn new() -> Self {
        Self {
            buf: [0; 4],
            len: 0,
            expected: 0,
        }
    }

    fn feed(&mut self, byte: u8) -> Option<char> {
        if self.expected == 0 {
            if byte < 0x80 {
                return Some(byte as char);
            } else if byte & 0xE0 == 0xC0 {
                self.expected = 2;
            } else if byte & 0xF0 == 0xE0 {
                self.expected = 3;
            } else if byte & 0xF8 == 0xF0 {
                self.expected = 4;
            } else {
                return Some('\u{FFFD}');
            }
            self.buf[0] = byte;
            self.len = 1;
            None
        } else if byte & 0xC0 != 0x80 {
            self.expected = 0;
            self.len = 0;
            Some('\u{FFFD}')
        } else {
            self.buf[self.len] = byte;
            self.len += 1;
            if self.len == self.expected {
                let s = std::str::from_utf8(&self.buf[..self.len]);
                self.expected = 0;
                self.len = 0;
                match s {
                    Ok(s) => s.chars().next(),
                    Err(_) => Some('\u{FFFD}'),
                }
            } else {
                None
            }
        }
    }
}

// ── Parser state machine ────────────────────────────────────────────────────

#[derive(Debug, PartialEq, Clone)]
enum Region {
    /// Before the first user command — suppress all output
    Init,
    /// Between D marker and C marker — prompt region, suppress output
    Prompt,
    /// Between C marker and D marker — command output
    Command,
}

const BATCH_INTERVAL: Duration = Duration::from_millis(16);

/// Maximum number of lines allowed in a single block before truncation kicks in.
const MAX_LINES_PER_BLOCK: usize = 50_000;

/// Number of lines to preserve from the start of a block when truncating.
const HEAD_LINES_TO_KEEP: usize = 100;

/// Time to wait for OSC 133 markers before falling back to raw terminal mode.
const FALLBACK_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, PartialEq, Clone)]
enum SessionMode {
    /// Normal block mode — parsing OSC 133 markers
    Normal,
    /// Interactive mode — alt screen active, forwarding raw bytes
    Interactive,
    /// Fallback mode — no OSC 133 detected, forwarding raw bytes
    Fallback,
}

impl SessionMode {
    fn as_str(&self) -> &'static str {
        match self {
            SessionMode::Normal => "normal",
            SessionMode::Interactive => "interactive",
            SessionMode::Fallback => "fallback",
        }
    }
}

pub struct StreamParser {
    session_id: String,
    app_handle: AppHandle,
    sync: Arc<SessionSync>,

    // Parser state
    region: Region,
    style: AnsiStyle,
    current_block_id: Option<String>,
    block_start_time: Option<Instant>,
    current_cwd: String,

    // Escape sequence accumulator
    esc_buf: Vec<u8>,
    in_escape: bool,
    in_osc: bool,

    // UTF-8 decoder
    utf8: Utf8Decoder,

    // Batching
    pending_segments: Vec<StyledSegment>,
    pending_text: String,
    last_flush: Instant,

    // Block buffer cap — line tracking and tail ring buffer
    block_line_count: usize,
    head_phase: bool,
    tail_ring: VecDeque<StyledSegment>,
    tail_line_count: usize,
    tail_capacity_lines: usize,
    total_lines_seen: usize,
    truncated: bool,

    // Mode switching
    session_mode: SessionMode,
    osc133_seen: bool,
    created_at: Instant,
    fallback_emitted: bool,
}

impl StreamParser {
    fn new(session_id: String, app_handle: AppHandle, sync: Arc<SessionSync>) -> Self {
        let tail_capacity_lines = MAX_LINES_PER_BLOCK.saturating_sub(HEAD_LINES_TO_KEEP);
        Self {
            session_id,
            app_handle,
            sync,
            region: Region::Init,
            style: AnsiStyle::default(),
            current_block_id: None,
            block_start_time: None,
            current_cwd: String::new(),
            esc_buf: Vec::with_capacity(256),
            in_escape: false,
            in_osc: false,
            utf8: Utf8Decoder::new(),
            pending_segments: Vec::new(),
            pending_text: String::new(),
            last_flush: Instant::now(),
            block_line_count: 0,
            head_phase: true,
            tail_ring: VecDeque::new(),
            tail_line_count: 0,
            tail_capacity_lines,
            total_lines_seen: 0,
            truncated: false,
            session_mode: SessionMode::Normal,
            osc133_seen: false,
            created_at: Instant::now(),
            fallback_emitted: false,
        }
    }

    /// Emit a mode_switch event to the frontend.
    fn emit_mode_switch(&self, mode: &SessionMode) {
        let _ = self.app_handle.emit(
            "mode_switch",
            ModeSwitchEvent {
                session_id: self.session_id.clone(),
                mode: mode.as_str().to_string(),
            },
        );
    }

    /// Forward raw PTY bytes to the frontend as base64.
    fn emit_pty_stream(&self, data: &[u8]) {
        let encoded = base64::engine::general_purpose::STANDARD.encode(data);
        let _ = self.app_handle.emit(
            "pty_stream",
            PtyStreamEvent {
                session_id: self.session_id.clone(),
                data: encoded,
            },
        );
    }

    /// Check if fallback timeout has elapsed without seeing OSC 133 markers.
    fn check_fallback_timeout(&mut self) {
        if !self.osc133_seen
            && !self.fallback_emitted
            && self.session_mode == SessionMode::Normal
            && self.created_at.elapsed() >= FALLBACK_TIMEOUT
        {
            self.fallback_emitted = true;
            self.session_mode = SessionMode::Fallback;
            self.emit_mode_switch(&SessionMode::Fallback);
        }
    }

    /// Emit a session_error event to the frontend.
    fn emit_session_error(&self, error: &str) {
        let _ = self.app_handle.emit(
            "session_error",
            SessionErrorEvent {
                session_id: self.session_id.clone(),
                error: error.to_string(),
            },
        );
    }

    /// Finalize any currently running block with an error status.
    fn finalize_running_block_with_error(&mut self) {
        self.flush_text_segment();
        self.flush_pending();

        if self.truncated {
            self.emit_truncation_tail();
        }

        if let Some(block_id) = self.current_block_id.take() {
            let duration = self
                .block_start_time
                .map(|t| t.elapsed().as_secs_f64())
                .unwrap_or(0.0);

            let _ = self.app_handle.emit(
                "block_complete",
                BlockCompleteEvent {
                    session_id: self.session_id.clone(),
                    block_id,
                    exit_code: -1,
                    duration,
                },
            );
        }

        self.block_start_time = None;
        self.style.reset();
    }

    /// Main entry point — run the parser loop reading from the PTY.
    pub fn start(session_id: String, app_handle: AppHandle, mut reader: Box<dyn Read + Send>, sync: Arc<SessionSync>) {
        let mut parser = Self::new(session_id, app_handle, sync);
        let mut buf = [0u8; 4096];

        loop {
            // Check force-interactive flag (set by execute_command for commands in interactive_commands list)
            if parser.sync.force_interactive.swap(false, Ordering::SeqCst) {
                if parser.session_mode == SessionMode::Normal {
                    parser.flush_text_segment();
                    parser.flush_pending();
                    parser.session_mode = SessionMode::Interactive;
                    parser.sync.start_buffering();
                    parser.emit_mode_switch(&SessionMode::Interactive);
                }
            }

            match reader.read(&mut buf) {
                Ok(0) => {
                    // PTY closed — shell process exited
                    parser.finalize_running_block_with_error();
                    parser.emit_session_error("Shell process exited");
                    break;
                }
                Ok(n) => {
                    let chunk = &buf[..n];

                    // Re-check force-interactive flag after read returns —
                    // the flag may have been set while we were blocked on read()
                    if parser.sync.force_interactive.swap(false, Ordering::SeqCst) {
                        if parser.session_mode == SessionMode::Normal {
                            parser.flush_text_segment();
                            parser.flush_pending();
                            parser.session_mode = SessionMode::Interactive;
                            parser.sync.start_buffering();
                            parser.emit_mode_switch(&SessionMode::Interactive);
                        }
                    }

                    // Check fallback timeout before processing
                    parser.check_fallback_timeout();

                    match parser.session_mode {
                        SessionMode::Interactive | SessionMode::Fallback => {
                            // In interactive/fallback mode, forward raw bytes
                            // but still scan for alt screen exit sequence
                            parser.scan_for_interactive_exit(chunk);

                            // Buffer or emit depending on frontend readiness
                            if parser.sync.buffering.load(Ordering::SeqCst) {
                                parser.sync.buffer_data(chunk);
                            } else {
                                parser.emit_pty_stream(chunk);
                            }
                        }
                        SessionMode::Normal => {
                            parser.feed(chunk);
                            if parser.last_flush.elapsed() >= BATCH_INTERVAL {
                                parser.flush_pending();
                            }
                        }
                    }
                }
                Err(e) => {
                    // PTY read error
                    parser.finalize_running_block_with_error();
                    parser.emit_session_error(&format!("PTY read error: {}", e));
                    break;
                }
            }
        }
        parser.flush_pending();
    }

    /// Feed a chunk of raw bytes into the parser.
    fn feed(&mut self, data: &[u8]) {
        for &byte in data {
            if self.in_escape {
                self.esc_buf.push(byte);
                if self.in_osc {
                    // OSC terminates with BEL (0x07) or ST (ESC \)
                    let len = self.esc_buf.len();
                    if byte == 0x07
                        || (len >= 2
                            && self.esc_buf[len - 2] == 0x1b
                            && self.esc_buf[len - 1] == b'\\')
                    {
                        let seq = std::mem::take(&mut self.esc_buf);
                        self.in_escape = false;
                        self.in_osc = false;
                        self.handle_osc(&seq);
                    } else if len > 4096 {
                        // Safety cap — malformed sequence
                        self.esc_buf.clear();
                        self.in_escape = false;
                        self.in_osc = false;
                    }
                } else {
                    self.try_complete_escape();
                }
            } else if byte == 0x1b {
                // Start of escape sequence
                self.in_escape = true;
                self.esc_buf.clear();
                self.esc_buf.push(byte);
            } else if self.region == Region::Command {
                // Visible text in command output — decode UTF-8
                if let Some(ch) = self.utf8.feed(byte) {
                    // Strip control characters except newline, tab, carriage return
                    if ch >= '\x20' || ch == '\n' || ch == '\t' || ch == '\r' {
                        self.pending_text.push(ch);
                    }
                }
            }
            // In Init or Prompt regions, discard visible text
        }
    }

    /// Try to determine if a non-OSC escape sequence is complete.
    fn try_complete_escape(&mut self) {
        let len = self.esc_buf.len();
        if len < 2 {
            return;
        }

        match self.esc_buf[1] {
            b'[' => {
                // CSI sequence — ends with a byte in 0x40..=0x7e
                let last = *self.esc_buf.last().unwrap();
                if (0x40..=0x7e).contains(&last) && len > 2 {
                    let seq = std::mem::take(&mut self.esc_buf);
                    self.in_escape = false;
                    self.handle_csi(&seq);
                } else if len > 256 {
                    // Safety cap
                    self.esc_buf.clear();
                    self.in_escape = false;
                }
            }
            b']' => {
                // OSC — switch to OSC accumulation mode
                self.in_osc = true;
            }
            b'(' | b')' | b'*' | b'+' => {
                // Character set designation — 3 bytes total
                if len >= 3 {
                    self.esc_buf.clear();
                    self.in_escape = false;
                }
            }
            _ => {
                // Simple two-char escape — done
                self.esc_buf.clear();
                self.in_escape = false;
            }
        }
    }

    // ── OSC handling ────────────────────────────────────────────────────────

    fn handle_osc(&mut self, seq: &[u8]) {
        // Extract payload between ESC ] and terminator
        let end = if seq.last() == Some(&0x07) {
            seq.len() - 1
        } else {
            // ST = ESC \  — remove last 2 bytes
            seq.len() - 2
        };
        if end <= 2 {
            return;
        }
        let payload = &seq[2..end];
        let text = String::from_utf8_lossy(payload);

        if let Some(params) = text.strip_prefix("133;") {
            self.handle_osc133(params);
        } else if let Some(url) = text.strip_prefix("7;") {
            // CWD reporting: file://hostname/path
            if let Some(path_start) = url.find("//") {
                if let Some(slash) = url[path_start + 2..].find('/') {
                    let new_cwd = url[path_start + 2 + slash..].to_string();
                    if new_cwd != self.current_cwd {
                        self.current_cwd = new_cwd.clone();
                        let _ = self.app_handle.emit(
                            "session_cwd",
                            SessionCwdEvent {
                                session_id: self.session_id.clone(),
                                cwd: new_cwd,
                            },
                        );
                    }
                }
            }
        }
    }

    fn handle_osc133(&mut self, params: &str) {
        // Mark that we've seen OSC 133 — no fallback needed
        self.osc133_seen = true;

        match params {
            "A" => {
                // Prompt start — transition to prompt region (but not from Init)
                if self.region != Region::Init {
                    self.region = Region::Prompt;
                }
            }
            "B" => {
                // Prompt end — no state change needed
            }
            "C" => {
                // Command start — begin a new block
                self.flush_text_segment();
                self.flush_pending();

                let block_id = uuid::Uuid::new_v4().to_string();
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;

                let _ = self.app_handle.emit(
                    "block_start",
                    BlockStartEvent {
                        session_id: self.session_id.clone(),
                        block_id: block_id.clone(),
                        command: String::new(), // Captured by frontend
                        cwd: self.current_cwd.clone(),
                        timestamp: now,
                    },
                );

                self.current_block_id = Some(block_id);
                self.block_start_time = Some(Instant::now());
                self.region = Region::Command;
                self.style.reset();

                // Reset buffer cap state for the new block
                self.block_line_count = 0;
                self.head_phase = true;
                self.tail_ring.clear();
                self.tail_line_count = 0;
                self.total_lines_seen = 0;
                self.truncated = false;
            }
            _ if params.starts_with("D") => {
                // Command finish — D or D;{exit_code}
                self.flush_text_segment();
                self.flush_pending();

                // If truncation occurred, emit the marker and buffered tail
                if self.truncated {
                    self.emit_truncation_tail();
                }

                let exit_code: i32 = params
                    .strip_prefix("D;")
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);

                let duration = self
                    .block_start_time
                    .map(|t| t.elapsed().as_secs_f64())
                    .unwrap_or(0.0);

                if let Some(block_id) = self.current_block_id.take() {
                    let _ = self.app_handle.emit(
                        "block_complete",
                        BlockCompleteEvent {
                            session_id: self.session_id.clone(),
                            block_id,
                            exit_code,
                            duration,
                        },
                    );
                }

                self.block_start_time = None;
                self.region = Region::Prompt;
                self.style.reset();
            }
            _ => {} // Unknown OSC 133 param — ignore
        }
    }

    // ── CSI handling ────────────────────────────────────────────────────────

    fn handle_csi(&mut self, seq: &[u8]) {
        // Check for alt screen activation/deactivation using byte comparison
        if seq.len() >= 5 {
            let params = &seq[2..];
            // Alt screen activation variants
            if params == b"?1049h" || params == b"?1047h" || params == b"?47h" {
                self.flush_text_segment();
                self.flush_pending();
                self.session_mode = SessionMode::Interactive;
                self.sync.start_buffering();
                self.emit_mode_switch(&SessionMode::Interactive);
                return;
            }
            // Alt screen deactivation variants
            if params == b"?1049l" || params == b"?1047l" || params == b"?47l" {
                self.session_mode = SessionMode::Normal;
                self.emit_mode_switch(&SessionMode::Normal);
                return;
            }
        }

        // Only handle SGR (Select Graphic Rendition): ESC [ ... m
        if seq.last() != Some(&b'm') {
            return; // Not SGR — strip it (cursor movement, etc.)
        }
        if self.region != Region::Command {
            return;
        }

        // Flush current text before style change
        self.flush_text_segment();

        // Parse parameters between ESC [ and m (only convert to string for SGR parsing)
        let params_str = String::from_utf8_lossy(&seq[2..seq.len() - 1]);
        if params_str.is_empty() {
            self.style.reset();
            return;
        }

        let parts: Vec<&str> = params_str.split(';').collect();
        let mut i = 0;
        while i < parts.len() {
            let code: u16 = parts[i].parse().unwrap_or(0);
            match code {
                0 => self.style.reset(),
                1 => self.style.bold = true,
                2 => self.style.dim = true,
                3 => self.style.italic = true,
                4 => self.style.underline = true,
                22 => {
                    self.style.bold = false;
                    self.style.dim = false;
                }
                23 => self.style.italic = false,
                24 => self.style.underline = false,

                // Foreground 8-color
                30..=37 => self.style.fg = ansi_color_to_hex((code - 30) as u8),
                39 => self.style.fg = None,
                // Foreground bright
                90..=97 => self.style.fg = ansi_color_to_hex((code - 90 + 8) as u8),

                // Background 8-color
                40..=47 => self.style.bg = ansi_color_to_hex((code - 40) as u8),
                49 => self.style.bg = None,
                // Background bright
                100..=107 => self.style.bg = ansi_color_to_hex((code - 100 + 8) as u8),

                // Extended foreground: 256-color and RGB
                38 => {
                    i += self.parse_extended_color(&parts, i, true);
                }
                // Extended background: 256-color and RGB
                48 => {
                    i += self.parse_extended_color(&parts, i, false);
                }

                _ => {} // Unknown SGR code — ignore
            }
            i += 1;
        }
    }

    /// Parse 256-color (38;5;N) or RGB (38;2;R;G;B) sequences.
    /// Returns how many extra parts were consumed.
    fn parse_extended_color(&mut self, parts: &[&str], i: usize, is_fg: bool) -> usize {
        if i + 1 >= parts.len() {
            return 0;
        }
        let mode: u16 = parts[i + 1].parse().unwrap_or(0);
        if mode == 5 && i + 2 < parts.len() {
            let n: u8 = parts[i + 2].parse().unwrap_or(0);
            let color = ansi_color_to_hex(n);
            if is_fg {
                self.style.fg = color;
            } else {
                self.style.bg = color;
            }
            2
        } else if mode == 2 && i + 4 < parts.len() {
            let r: u8 = parts[i + 2].parse().unwrap_or(0);
            let g: u8 = parts[i + 3].parse().unwrap_or(0);
            let b: u8 = parts[i + 4].parse().unwrap_or(0);
            let color = Some(format!("#{:02x}{:02x}{:02x}", r, g, b));
            if is_fg {
                self.style.fg = color;
            } else {
                self.style.bg = color;
            }
            4
        } else {
            0
        }
    }

    // ── Flush / batching ────────────────────────────────────────────────────

    fn flush_text_segment(&mut self) {
        if self.pending_text.is_empty() {
            return;
        }
        let text = std::mem::take(&mut self.pending_text);
        self.pending_segments.push(StyledSegment {
            text,
            style: self.style.to_segment_style(),
        });
    }

    fn flush_pending(&mut self) {
        self.flush_text_segment();
        self.last_flush = Instant::now();

        if self.pending_segments.is_empty() {
            return;
        }

        if self.current_block_id.is_none() {
            self.pending_segments.clear();
            return;
        }

        // Process segments through the buffer cap logic
        let segments = std::mem::take(&mut self.pending_segments);

        if self.head_phase {
            // Still in head phase — count lines and emit, switching to tail if needed
            let mut head_segments = Vec::new();
            for seg in segments {
                let newlines = count_newlines(&seg.text);
                let new_total = self.block_line_count + newlines;

                if new_total <= HEAD_LINES_TO_KEEP {
                    // Entire segment fits in head
                    self.block_line_count = new_total;
                    self.total_lines_seen = new_total;
                    head_segments.push(seg);
                } else {
                    // This segment crosses the head boundary — split it
                    let lines_remaining_in_head =
                        HEAD_LINES_TO_KEEP.saturating_sub(self.block_line_count);
                    if lines_remaining_in_head > 0 {
                        let (head_text, tail_text) =
                            split_at_nth_newline(&seg.text, lines_remaining_in_head);
                        if !head_text.is_empty() {
                            head_segments.push(StyledSegment {
                                text: head_text,
                                style: seg.style.clone(),
                            });
                        }
                        self.block_line_count = HEAD_LINES_TO_KEEP;
                        self.total_lines_seen = HEAD_LINES_TO_KEEP;

                        // Switch to tail phase with the remainder
                        self.head_phase = false;
                        if !tail_text.is_empty() {
                            let tail_newlines = count_newlines(&tail_text);
                            self.total_lines_seen += tail_newlines;
                            self.append_to_tail(StyledSegment {
                                text: tail_text,
                                style: seg.style,
                            }, tail_newlines);
                        }
                    } else {
                        // Already at head limit — go straight to tail
                        self.head_phase = false;
                        self.total_lines_seen += newlines;
                        self.append_to_tail(seg, newlines);
                    }
                }
            }

            // Emit head segments
            if !head_segments.is_empty() {
                if let Some(block_id) = &self.current_block_id {
                    let _ = self.app_handle.emit(
                        "block_output",
                        BlockOutputEvent {
                            session_id: self.session_id.clone(),
                            block_id: block_id.clone(),
                            segments: head_segments,
                        },
                    );
                }
            }
        } else {
            // Already in tail phase — append all to ring buffer
            for seg in segments {
                let newlines = count_newlines(&seg.text);
                self.total_lines_seen += newlines;
                self.append_to_tail(seg, newlines);
            }
        }
    }

    // ── Block buffer cap ───────────────────────────────────────────────────

    /// Append a segment to the tail ring buffer, evicting old segments if over capacity.
    fn append_to_tail(&mut self, segment: StyledSegment, newline_count: usize) {
        self.truncated = true;
        self.tail_ring.push_back(segment);
        self.tail_line_count += newline_count;

        // Evict from front of tail ring if over capacity
        while self.tail_line_count > self.tail_capacity_lines && !self.tail_ring.is_empty() {
            if let Some(front) = self.tail_ring.pop_front() {
                let front_lines = count_newlines(&front.text);
                self.tail_line_count -= front_lines;
            }
        }
    }

    /// Emit the truncation marker and buffered tail segments on block completion.
    fn emit_truncation_tail(&mut self) {
        let block_id = match &self.current_block_id {
            Some(id) => id.clone(),
            None => return,
        };

        let truncated_count = self
            .total_lines_seen
            .saturating_sub(HEAD_LINES_TO_KEEP + self.tail_line_count);

        // Only emit the marker if lines were actually dropped
        if truncated_count > 0 {
            let marker_text = format!("\n[... {} lines truncated ...]\n", truncated_count);
            let _ = self.app_handle.emit(
                "block_output",
                BlockOutputEvent {
                    session_id: self.session_id.clone(),
                    block_id: block_id.clone(),
                    segments: vec![StyledSegment {
                        text: marker_text,
                        style: SegmentStyle {
                            dim: Some(true),
                            ..SegmentStyle::default()
                        },
                    }],
                },
            );
        }

        // Emit tail segments
        let tail: Vec<StyledSegment> = self.tail_ring.drain(..).collect();
        if !tail.is_empty() {
            let _ = self.app_handle.emit(
                "block_output",
                BlockOutputEvent {
                    session_id: self.session_id.clone(),
                    block_id,
                    segments: tail,
                },
            );
        }
    }

    // ── Alt screen scanning (interactive mode) ─────────────────────────────

    /// Scan raw bytes for interactive mode exit signals:
    /// - Alt screen exit sequences (ESC[?1049l, ESC[?1047l, ESC[?47l)
    /// - OSC 133 shell prompt markers (D; or A) — indicates the shell is back
    ///   after a force-interactive command that doesn't use alt screen
    fn scan_for_interactive_exit(&mut self, data: &[u8]) {
        if self.session_mode != SessionMode::Interactive {
            return;
        }

        // Alt screen exit sequences
        const ALT_EXIT_SEQS: &[&[u8]] = &[
            b"\x1b[?1049l",
            b"\x1b[?1047l",
            b"\x1b[?47l",
        ];

        for exit_seq in ALT_EXIT_SEQS {
            if data.len() >= exit_seq.len() {
                for window in data.windows(exit_seq.len()) {
                    if window == *exit_seq {
                        self.session_mode = SessionMode::Normal;
                        self.emit_mode_switch(&SessionMode::Normal);
                        return;
                    }
                }
            }
        }

        // OSC 133 prompt markers — shell is back after a force-interactive command exits.
        // Skip this check for manual toggle (Cmd+I) — user controls when to exit.
        if !self.sync.manual_interactive.load(Ordering::SeqCst) {
            const OSC_MARKERS: &[&[u8]] = &[
                b"\x1b]133;D",
                b"\x1b]133;A",
            ];

            for marker in OSC_MARKERS {
                if data.len() >= marker.len() {
                    for window in data.windows(marker.len()) {
                        if window == *marker {
                            self.session_mode = SessionMode::Normal;
                            self.emit_mode_switch(&SessionMode::Normal);
                            return;
                        }
                    }
                }
            }
        }
    }
}

/// Count the number of newline bytes in a string (ASCII-safe byte scan).
fn count_newlines(s: &str) -> usize {
    s.bytes().filter(|&b| b == b'\n').count()
}

/// Split a string at the Nth newline. Returns (before_including_nth_newline, after).
fn split_at_nth_newline(s: &str, n: usize) -> (String, String) {
    let mut count = 0;
    for (i, ch) in s.char_indices() {
        if ch == '\n' {
            count += 1;
            if count == n {
                let split_pos = i + 1; // include the newline
                return (s[..split_pos].to_string(), s[split_pos..].to_string());
            }
        }
    }
    // Fewer than n newlines — entire string is "head"
    (s.to_string(), String::new())
}
