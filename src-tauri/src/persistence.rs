use dirs::home_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// ── Persisted state types ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedState {
    pub windows: Vec<PersistedWindow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedWindow {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub sessions: Vec<PersistedSession>,
    pub active_session_index: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedSession {
    pub name: String,
    pub cwd: String,
    pub blocks: Vec<PersistedBlock>,
    pub command_history: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedBlock {
    pub id: String,
    pub command: String,
    pub cwd: String,
    pub timestamp: u64,
    pub exit_code: Option<i32>,
    pub duration: Option<f64>,
    pub status: String,
    pub segments: Vec<PersistedSegment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedSegment {
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fg: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bg: Option<String>,
    #[serde(default)]
    pub bold: bool,
    #[serde(default)]
    pub italic: bool,
    #[serde(default)]
    pub underline: bool,
    #[serde(default)]
    pub dim: bool,
}

// ── Helpers ────────────────────────────────────────────────────────────────

/// Path to the persisted state file.
fn state_path() -> PathBuf {
    home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config")
        .join("kiln")
        .join("state")
        .join("session_state.msgpack")
}

/// Save persisted state to disk as MessagePack.
pub fn save_state(state: &PersistedState) -> Result<(), String> {
    let path = state_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create state directory: {}", e))?;
    }
    let bytes =
        rmp_serde::to_vec(state).map_err(|e| format!("Failed to serialize state: {}", e))?;
    fs::write(&path, bytes).map_err(|e| format!("Failed to write state file: {}", e))?;
    Ok(())
}

/// Load persisted state from disk. Returns None on any error (missing file, corrupt data, etc.).
pub fn load_state() -> Option<PersistedState> {
    let path = state_path();
    let bytes = fs::read(&path).ok()?;
    rmp_serde::from_slice(&bytes).ok()
}
