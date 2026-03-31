use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Serialize)]
pub struct CompletionItem {
    pub text: String,
    pub kind: String,
}

/// Expand `~` at the start of a path to the user's home directory.
fn expand_tilde(path: &str) -> String {
    if path == "~" || path.starts_with("~/") {
        if let Some(home) = dirs::home_dir() {
            return format!("{}{}", home.display(), &path[1..]);
        }
    }
    path.to_string()
}

/// Get filesystem completions for a partial path.
///
/// If the partial contains a `/`, split into directory + prefix and list
/// matching entries. Otherwise list entries in `cwd` matching the partial.
fn filesystem_completions(partial: &str, cwd: &str) -> Vec<CompletionItem> {
    let expanded = expand_tilde(partial);
    let path = Path::new(&expanded);

    let (dir, prefix) = if expanded.ends_with('/') {
        // User typed a full directory path with trailing slash — list contents
        (PathBuf::from(&expanded), String::new())
    } else if expanded.contains('/') {
        // Split into parent dir + filename prefix
        let parent = path
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from(cwd));
        let file_prefix = path
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_default();
        (parent, file_prefix)
    } else {
        // No slash — complete in cwd
        (PathBuf::from(cwd), expanded.clone())
    };

    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };

    let mut results: Vec<CompletionItem> = Vec::new();
    let prefix_lower = prefix.to_lowercase();

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files unless user explicitly typed a dot prefix
        if name.starts_with('.') && !prefix.starts_with('.') {
            continue;
        }

        if !prefix.is_empty() && !name.to_lowercase().starts_with(&prefix_lower) {
            continue;
        }

        let is_dir = entry
            .file_type()
            .map(|ft| ft.is_dir())
            .unwrap_or(false);

        // Build the completion text: replace the prefix portion with the full name
        let completion_text = if partial.contains('/') {
            // Keep the directory part of the original partial (preserving ~ or ./ etc.)
            let dir_part = &partial[..partial.rfind('/').unwrap() + 1];
            if is_dir {
                format!("{}{}/", dir_part, name)
            } else {
                format!("{}{}", dir_part, name)
            }
        } else if is_dir {
            format!("{}/", name)
        } else {
            name.clone()
        };

        results.push(CompletionItem {
            text: completion_text,
            kind: if is_dir {
                "directory".to_string()
            } else {
                "file".to_string()
            },
        });

        if results.len() >= 20 {
            break;
        }
    }

    // Sort: files first, then directories, both alphabetical by name
    results.sort_by(|a, b| {
        let a_dir = a.kind == "directory";
        let b_dir = b.kind == "directory";
        a_dir.cmp(&b_dir).then_with(|| a.text.to_lowercase().cmp(&b.text.to_lowercase()))
    });

    results.truncate(20);
    results
}

/// Detect the user's shell from $SHELL.
fn detect_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

/// Find the history file path based on detected shell.
fn history_file_path() -> Option<PathBuf> {
    let shell = detect_shell();
    let home = dirs::home_dir()?;

    if shell.contains("zsh") {
        // Check HISTFILE env var first
        if let Ok(histfile) = std::env::var("HISTFILE") {
            let p = PathBuf::from(histfile);
            if p.exists() {
                return Some(p);
            }
        }
        let p = home.join(".zsh_history");
        if p.exists() {
            return Some(p);
        }
    } else if shell.contains("bash") {
        let p = home.join(".bash_history");
        if p.exists() {
            return Some(p);
        }
    } else if shell.contains("fish") {
        let p = home.join(".local/share/fish/fish_history");
        if p.exists() {
            return Some(p);
        }
    }

    None
}

/// Read shell history entries from the history file.
/// Only reads the last ~10,000 lines for performance.
/// Returns entries with newest first.
fn read_shell_history() -> Vec<String> {
    let path = match history_file_path() {
        Some(p) => p,
        None => return Vec::new(),
    };

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let shell = detect_shell();
    let lines: Vec<&str> = content.lines().collect();

    // Only process last 10,000 lines
    let start = if lines.len() > 10_000 {
        lines.len() - 10_000
    } else {
        0
    };

    let mut entries: Vec<String> = Vec::new();

    if shell.contains("zsh") {
        // Zsh history format: `: timestamp:duration;command`
        // Or multi-line with backslash continuation
        let mut current_command = String::new();
        for line in &lines[start..] {
            if line.starts_with(": ") {
                // New entry — flush previous if any
                if !current_command.is_empty() {
                    entries.push(current_command.clone());
                    current_command.clear();
                }
                // Extract command after the semicolon
                if let Some(semi_pos) = line.find(';') {
                    current_command = line[semi_pos + 1..].to_string();
                    // Handle backslash continuation
                    if current_command.ends_with('\\') {
                        current_command.pop();
                        current_command.push('\n');
                    }
                }
            } else if !current_command.is_empty() {
                // Continuation line
                let mut cont = line.to_string();
                if cont.ends_with('\\') {
                    cont.pop();
                    cont.push('\n');
                }
                current_command.push_str(&cont);
            } else {
                // Plain format (no timestamps)
                if !line.is_empty() {
                    entries.push(line.to_string());
                }
            }
        }
        if !current_command.is_empty() {
            entries.push(current_command);
        }
    } else if shell.contains("fish") {
        // Fish history format: `- cmd: command`
        for line in &lines[start..] {
            if let Some(cmd) = line.strip_prefix("- cmd: ") {
                entries.push(cmd.to_string());
            }
        }
    } else {
        // Bash: one command per line
        for line in &lines[start..] {
            if !line.is_empty() {
                entries.push(line.to_string());
            }
        }
    }

    entries
}

#[tauri::command]
pub fn get_completions(partial: String, cwd: String) -> Vec<CompletionItem> {
    filesystem_completions(&partial, &cwd)
}

#[tauri::command]
pub fn get_history_completions(partial: String) -> Vec<CompletionItem> {
    if partial.is_empty() {
        return Vec::new();
    }

    let entries = read_shell_history();
    let partial_lower = partial.to_lowercase();

    let mut seen = std::collections::HashSet::new();
    let mut results: Vec<CompletionItem> = Vec::new();

    // Iterate newest-first (entries are in chronological order, reverse)
    for entry in entries.iter().rev() {
        let trimmed = entry.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !trimmed.to_lowercase().starts_with(&partial_lower) {
            continue;
        }
        if !seen.insert(trimmed.to_string()) {
            continue;
        }
        results.push(CompletionItem {
            text: trimmed.to_string(),
            kind: "history".to_string(),
        });
        if results.len() >= 10 {
            break;
        }
    }

    results
}
