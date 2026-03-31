use crate::parser::StreamParser;
use crate::shell_integration;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::AppHandle;

/// Shared state between the parser thread and command handlers for a single session.
pub struct SessionSync {
    /// Set by execute_command when the command matches interactive_commands.
    /// Checked by the parser each read loop iteration.
    pub force_interactive: AtomicBool,
    /// Set by the manual Cmd+I toggle. Unlike force_interactive, manual mode
    /// stays until explicitly toggled back — OSC 133 markers won't exit it.
    pub manual_interactive: AtomicBool,
    /// When true, the parser buffers pty_stream data instead of emitting it.
    /// Set to true when entering interactive mode, cleared when interactive_ready is called.
    pub buffering: AtomicBool,
    /// Buffer for pty_stream data while waiting for the frontend to signal interactive_ready.
    pub interactive_buffer: Mutex<Vec<u8>>,
}

impl SessionSync {
    pub fn new() -> Self {
        Self {
            force_interactive: AtomicBool::new(false),
            manual_interactive: AtomicBool::new(false),
            buffering: AtomicBool::new(false),
            interactive_buffer: Mutex::new(Vec::new()),
        }
    }

    /// Start buffering: called by the parser when entering interactive mode.
    pub fn start_buffering(&self) {
        self.buffering.store(true, Ordering::SeqCst);
        if let Ok(mut buf) = self.interactive_buffer.lock() {
            buf.clear();
        }
    }

    /// Signal that the frontend is ready. Returns the buffered data.
    pub fn signal_ready(&self) -> Vec<u8> {
        self.buffering.store(false, Ordering::SeqCst);
        let mut buf = self.interactive_buffer.lock().unwrap_or_else(|p| p.into_inner());
        std::mem::take(&mut *buf)
    }

    /// Append data to the interactive buffer (while buffering is active).
    pub fn buffer_data(&self, data: &[u8]) {
        if let Ok(mut buf) = self.interactive_buffer.lock() {
            // Cap buffer at 1MB to prevent unbounded growth
            if buf.len() + data.len() <= 1_048_576 {
                buf.extend_from_slice(data);
            }
        }
    }
}

pub struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    pub sync: Arc<SessionSync>,
}

pub struct SessionManager {
    sessions: Mutex<HashMap<String, PtySession>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn create_session(
        &self,
        session_id: &str,
        app_handle: &AppHandle,
    ) -> Result<(), String> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let mut cmd = CommandBuilder::new(&shell);
        cmd.arg("-l");

        pair.slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {}", e))?;

        // Drop slave — we only need the master side
        drop(pair.slave);

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take writer: {}", e))?;

        let sync = Arc::new(SessionSync::new());

        // Store session
        {
            let mut sessions = self.sessions.lock().unwrap_or_else(|p| p.into_inner());
            sessions.insert(
                session_id.to_string(),
                PtySession {
                    writer,
                    master: pair.master,
                    sync: Arc::clone(&sync),
                },
            );
        }

        // Auto-source shell integration into the new session.
        // Detect which shell is being used and source the matching script.
        let shell_name = shell_integration::detect_shell();
        if let Ok(script_path) = shell_integration::install_for_shell(&shell_name) {
            let source_cmd = format!("source \"{}\"\n", script_path);
            self.write_to_session(session_id, &source_cmd).ok();
        }

        // Spawn reader thread with stream parser
        let sid = session_id.to_string();
        let handle = app_handle.clone();
        let parser_sync = Arc::clone(&sync);
        thread::spawn(move || {
            StreamParser::start(sid, handle, reader, parser_sync);
        });

        Ok(())
    }

    pub fn write_to_session(&self, session_id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap_or_else(|p| p.into_inner());
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;

        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;

        Ok(())
    }

    pub fn resize_session(
        &self,
        session_id: &str,
        cols: u16,
        rows: u16,
    ) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap_or_else(|p| p.into_inner());
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;

        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {}", e))?;

        Ok(())
    }

    pub fn close_session(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap_or_else(|p| p.into_inner());
        sessions
            .remove(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;
        // Dropping the session closes the PTY
        Ok(())
    }

    /// Set the force-interactive flag for a session.
    pub fn set_force_interactive(&self, session_id: &str) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap_or_else(|p| p.into_inner());
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;
        session.sync.force_interactive.store(true, Ordering::SeqCst);
        Ok(())
    }

    /// Set force-interactive and nudge the PTY to wake a blocked parser.
    /// Used for manual Cmd+I toggle when no command is being executed.
    pub fn force_interactive_with_wake(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap_or_else(|p| p.into_inner());
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;
        session.sync.manual_interactive.store(true, Ordering::SeqCst);
        session.sync.force_interactive.store(true, Ordering::SeqCst);
        // Send a space + backspace to produce PTY activity without side effects
        let _ = session.writer.write_all(b" \x08");
        let _ = session.writer.flush();
        Ok(())
    }

    /// Clear the manual interactive flag and reset the parser to normal mode.
    pub fn exit_interactive(&self, session_id: &str) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap_or_else(|p| p.into_inner());
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;
        session.sync.manual_interactive.store(false, Ordering::SeqCst);
        session.sync.force_interactive.store(false, Ordering::SeqCst);
        Ok(())
    }

    /// Signal that the frontend's xterm.js is mounted and ready.
    /// Returns the buffered pty data for replay.
    pub fn interactive_ready(&self, session_id: &str) -> Result<Vec<u8>, String> {
        let sessions = self.sessions.lock().unwrap_or_else(|p| p.into_inner());
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;
        Ok(session.sync.signal_ready())
    }
}
