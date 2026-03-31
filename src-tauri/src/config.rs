use dirs::home_dir;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Global config state shared across commands and the file watcher.
static CONFIG: OnceLock<Arc<Mutex<KilnConfig>>> = OnceLock::new();

/// Keep the watcher alive for the lifetime of the app.
static WATCHER: OnceLock<Mutex<Option<RecommendedWatcher>>> = OnceLock::new();

// ── Config structs ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KilnConfig {
    #[serde(default = "default_shell")]
    pub shell: ShellConfig,
    #[serde(default)]
    pub appearance: AppearanceConfig,
    #[serde(default)]
    pub scrollback: ScrollbackConfig,
    #[serde(default)]
    pub performance: PerformanceConfig,
    #[serde(default)]
    pub keybindings: KeybindingsConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShellConfig {
    #[serde(default = "default_shell_program")]
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default = "default_interactive_commands")]
    pub interactive_commands: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceConfig {
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_font_size")]
    pub font_size: u32,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_collapse_threshold")]
    pub collapse_threshold: u32,
    #[serde(default = "default_previews")]
    pub previews: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrollbackConfig {
    #[serde(default = "default_max_lines")]
    pub max_lines: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceConfig {
    #[serde(default = "default_max_lines_per_block")]
    pub max_lines_per_block: u32,
    #[serde(default = "default_stream_throttle_ms")]
    pub stream_throttle_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeybindingsConfig {
    #[serde(default = "default_kb_session_switcher")]
    pub session_switcher: String,
    #[serde(default = "default_kb_command_palette")]
    pub command_palette: String,
    #[serde(default = "default_kb_search")]
    pub search: String,
    #[serde(default = "default_kb_new_window")]
    pub new_window: String,
    #[serde(default = "default_kb_new_session")]
    pub new_session: String,
    #[serde(default = "default_kb_close_session")]
    pub close_session: String,
}

// ── Default value functions ─────────────────────────────────────────────────

fn default_shell() -> ShellConfig {
    ShellConfig {
        program: default_shell_program(),
        args: vec![],
        interactive_commands: default_interactive_commands(),
    }
}

fn default_interactive_commands() -> Vec<String> {
    vec![
        "vim".to_string(),
        "nvim".to_string(),
        "vi".to_string(),
        "htop".to_string(),
        "top".to_string(),
        "claude".to_string(),
        "ssh".to_string(),
        "less".to_string(),
        "man".to_string(),
        "nano".to_string(),
        "emacs".to_string(),
    ]
}

fn default_shell_program() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

fn default_font_family() -> String {
    "JetBrains Mono".to_string()
}
fn default_font_size() -> u32 {
    14
}
fn default_theme() -> String {
    "kiln-dark".to_string()
}
fn default_collapse_threshold() -> u32 {
    50
}
fn default_previews() -> bool {
    true
}
fn default_max_lines() -> u32 {
    10000
}
fn default_max_lines_per_block() -> u32 {
    50000
}
fn default_stream_throttle_ms() -> u32 {
    16
}

fn default_kb_session_switcher() -> String {
    "super+e".to_string()
}
fn default_kb_command_palette() -> String {
    "super+p".to_string()
}
fn default_kb_search() -> String {
    "super+f".to_string()
}
fn default_kb_new_window() -> String {
    "super+n".to_string()
}
fn default_kb_new_session() -> String {
    "super+shift+n".to_string()
}
fn default_kb_close_session() -> String {
    "super+w".to_string()
}

// ── Default trait implementations ───────────────────────────────────────────

impl Default for KilnConfig {
    fn default() -> Self {
        Self {
            shell: default_shell(),
            appearance: AppearanceConfig::default(),
            scrollback: ScrollbackConfig::default(),
            performance: PerformanceConfig::default(),
            keybindings: KeybindingsConfig::default(),
        }
    }
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self {
            font_family: default_font_family(),
            font_size: default_font_size(),
            theme: default_theme(),
            collapse_threshold: default_collapse_threshold(),
            previews: default_previews(),
        }
    }
}

impl Default for ScrollbackConfig {
    fn default() -> Self {
        Self {
            max_lines: default_max_lines(),
        }
    }
}

impl Default for PerformanceConfig {
    fn default() -> Self {
        Self {
            max_lines_per_block: default_max_lines_per_block(),
            stream_throttle_ms: default_stream_throttle_ms(),
        }
    }
}

impl Default for KeybindingsConfig {
    fn default() -> Self {
        Self {
            session_switcher: default_kb_session_switcher(),
            command_palette: default_kb_command_palette(),
            search: default_kb_search(),
            new_window: default_kb_new_window(),
            new_session: default_kb_new_session(),
            close_session: default_kb_close_session(),
        }
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/// Path to the config file: ~/.config/kiln/config.toml
pub fn config_path() -> PathBuf {
    home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config")
        .join("kiln")
        .join("config.toml")
}

/// The default config file content, as a TOML string.
fn default_config_toml() -> String {
    let shell_program = default_shell_program();
    let interactive_cmds = default_interactive_commands()
        .iter()
        .map(|s| format!("\"{}\"", s))
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        r#"[shell]
program = "{shell_program}"
args = []
interactive_commands = [{interactive_cmds}]

[appearance]
font_family = "JetBrains Mono"
font_size = 14
theme = "kiln-dark"
collapse_threshold = 50
previews = true

[scrollback]
max_lines = 10000

[performance]
max_lines_per_block = 50000
stream_throttle_ms = 16

[keybindings]
session_switcher = "super+e"
command_palette = "super+p"
search = "super+f"
new_window = "super+n"
new_session = "super+shift+n"
close_session = "super+w"
"#
    )
}

/// Read and parse the config file. Returns defaults on any error.
fn load_config_from_disk() -> KilnConfig {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(contents) => match toml::from_str::<KilnConfig>(&contents) {
            Ok(cfg) => cfg,
            Err(e) => {
                eprintln!("[kiln] Failed to parse config at {}: {}", path.display(), e);
                KilnConfig::default()
            }
        },
        Err(e) => {
            eprintln!(
                "[kiln] Could not read config at {}: {} — using defaults",
                path.display(),
                e
            );
            KilnConfig::default()
        }
    }
}

/// Ensure the config file exists; create it with defaults if missing.
fn ensure_config_file() {
    let path = config_path();
    if !path.exists() {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Err(e) = fs::write(&path, default_config_toml()) {
            eprintln!("[kiln] Failed to write default config: {}", e);
        }
    }
}

// ── Public API ──────────────────────────────────────────────────────────────

/// Initialise the config system: create file if needed, load, start watcher.
/// Call this once during app setup.
pub fn init(app_handle: &AppHandle) {
    ensure_config_file();

    let cfg = load_config_from_disk();
    CONFIG.get_or_init(|| Arc::new(Mutex::new(cfg)));

    // Pre-initialise the watcher slot
    WATCHER.get_or_init(|| Mutex::new(None));

    start_watcher(app_handle.clone());
}

/// Return a snapshot of the current config.
pub fn current() -> KilnConfig {
    CONFIG
        .get()
        .and_then(|arc| arc.lock().ok())
        .map(|guard| guard.clone())
        .unwrap_or_default()
}

/// Reload config from disk and emit change event.
fn reload(app_handle: &AppHandle) {
    let cfg = load_config_from_disk();
    if let Some(arc) = CONFIG.get() {
        match arc.lock() {
            Ok(mut guard) => *guard = cfg.clone(),
            Err(poisoned) => {
                // Recover from a poisoned mutex by replacing the value
                let mut guard = poisoned.into_inner();
                *guard = cfg.clone();
            }
        }
    }
    let _ = app_handle.emit("config_changed", cfg);
}

// ── File watcher ────────────────────────────────────────────────────────────

fn start_watcher(app_handle: AppHandle) {
    let path = config_path();

    // We watch the parent directory because many editors do atomic saves
    // (write to tmp + rename), which can remove the watch on the original file.
    let watch_dir = match path.parent() {
        Some(d) => d.to_path_buf(),
        None => return,
    };

    let last_reload = Arc::new(Mutex::new(Instant::now()));
    let debounce = Duration::from_millis(300);

    let handle = app_handle.clone();
    let target_name = path.file_name().map(|n| n.to_os_string());

    let watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            // Only react to events that touch our config file
            let touches_config = event.paths.iter().any(|p| {
                p.file_name().map(|n| n.to_os_string()) == target_name
            });
            if !touches_config {
                return;
            }

            // Debounce
            let mut last = match last_reload.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            let now = Instant::now();
            if now.duration_since(*last) < debounce {
                return;
            }
            *last = now;
            drop(last);

            reload(&handle);
        }
    });

    match watcher {
        Ok(mut w) => {
            if let Err(e) = w.watch(&watch_dir, RecursiveMode::NonRecursive) {
                eprintln!("[kiln] Failed to watch config directory: {}", e);
                return;
            }
            // Store watcher so it isn't dropped
            if let Some(slot) = WATCHER.get() {
                let mut guard = match slot.lock() {
                    Ok(g) => g,
                    Err(p) => p.into_inner(),
                };
                *guard = Some(w);
            }
        }
        Err(e) => {
            eprintln!("[kiln] Failed to create config file watcher: {}", e);
        }
    }
}
