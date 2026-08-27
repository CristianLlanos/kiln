use dirs::home_dir;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::AppHandle;
use tauri::Manager;

/// Store the AppHandle so theme loading can find the resource directory.
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

pub fn init(app_handle: &AppHandle) {
    let _ = APP_HANDLE.set(app_handle.clone());
}

// ── Theme structs ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KilnTheme {
    pub name: String,
    pub author: String,
    pub colors: ThemeColors,
    pub terminal: TerminalColors,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeColors {
    pub background: String,
    pub surface: String,
    pub surface_raised: String,
    pub border: String,
    pub text_primary: String,
    pub text_secondary: String,
    pub accent_primary: String,
    pub accent_secondary: String,
    pub error: String,
    pub success: String,
    pub warning: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalColors {
    pub black: String,
    pub red: String,
    pub green: String,
    pub yellow: String,
    pub blue: String,
    pub magenta: String,
    pub cyan: String,
    pub white: String,
    pub bright_black: String,
    pub bright_red: String,
    pub bright_green: String,
    pub bright_yellow: String,
    pub bright_blue: String,
    pub bright_magenta: String,
    pub bright_cyan: String,
    pub bright_white: String,
}

// ── Paths ──────────────────────────────────────────────────────────────────

/// User themes directory: ~/.config/kiln/themes/
fn user_themes_dir() -> PathBuf {
    home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config")
        .join("kiln")
        .join("themes")
}

/// Built-in themes directory inside the Tauri resource bundle.
fn builtin_themes_dir() -> Option<PathBuf> {
    APP_HANDLE
        .get()
        .and_then(|h| h.path().resource_dir().ok())
        .map(|d| d.join("themes"))
}

// ── Public API ─────────────────────────────────────────────────────────────

/// Load a theme by name. Checks built-in themes first, then user themes.
pub fn load_theme(name: &str) -> Result<KilnTheme, String> {
    let filename = format!("{}.toml", name);

    // 1. Built-in themes
    if let Some(builtin_dir) = builtin_themes_dir() {
        let path = builtin_dir.join(&filename);
        if path.exists() {
            return parse_theme_file(&path);
        }
    }

    // 2. User themes
    let user_path = user_themes_dir().join(&filename);
    if user_path.exists() {
        return parse_theme_file(&user_path);
    }

    Err(format!("Theme '{}' not found", name))
}

/// List all available theme names (built-in + user, deduplicated).
pub fn list_themes() -> Vec<String> {
    let mut names = Vec::new();
    let mut seen = HashSet::new();

    // Built-in
    if let Some(dir) = builtin_themes_dir() {
        collect_theme_names(&dir, &mut names, &mut seen);
    }

    // User
    collect_theme_names(&user_themes_dir(), &mut names, &mut seen);

    names
}

// ── Helpers ────────────────────────────────────────────────────────────────

fn parse_theme_file(path: &std::path::Path) -> Result<KilnTheme, String> {
    let contents = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read theme file {}: {}", path.display(), e))?;
    toml::from_str::<KilnTheme>(&contents)
        .map_err(|e| format!("Failed to parse theme file {}: {}", path.display(), e))
}

fn collect_theme_names(dir: &std::path::Path, names: &mut Vec<String>, seen: &mut HashSet<String>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "toml") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    let name = stem.to_string();
                    if seen.insert(name.clone()) {
                        names.push(name);
                    }
                }
            }
        }
    }
}
