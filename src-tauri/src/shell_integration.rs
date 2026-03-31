use std::fs;
use std::path::PathBuf;

const KILN_ZSH: &str = include_str!("../shell/kiln.zsh");

/// Directory where shell integration scripts are installed.
fn shell_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".config").join("kiln").join("shell"))
}

/// Compute the path to the kiln.zsh script without writing to disk.
pub fn get_script_path() -> Result<String, String> {
    let dir = shell_dir()?;
    let path = dir.join("kiln.zsh");
    Ok(path.to_string_lossy().to_string())
}

/// Write the kiln.zsh script to ~/.config/kiln/shell/kiln.zsh.
/// Returns the path to the installed script.
pub fn install_zsh_integration() -> Result<String, String> {
    let dir = shell_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;

    let path = dir.join("kiln.zsh");
    fs::write(&path, KILN_ZSH).map_err(|e| format!("Failed to write script: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}

/// The source line that should go in .zshrc.
pub fn zshrc_source_line() -> String {
    let dir = shell_dir().unwrap_or_else(|_| PathBuf::from("~/.config/kiln/shell"));
    format!("source \"{}\"", dir.join("kiln.zsh").to_string_lossy())
}

/// Check if .zshrc already sources kiln.
pub fn is_installed_in_zshrc() -> bool {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return false,
    };
    let zshrc = home.join(".zshrc");
    match fs::read_to_string(zshrc) {
        Ok(content) => content.contains("kiln.zsh") || content.contains("kiln/shell"),
        Err(_) => false,
    }
}

/// Add the source line to .zshrc if not already present.
pub fn add_to_zshrc() -> Result<(), String> {
    if is_installed_in_zshrc() {
        return Ok(());
    }

    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let zshrc = home.join(".zshrc");

    let mut content = fs::read_to_string(&zshrc).unwrap_or_default();
    if !content.ends_with('\n') && !content.is_empty() {
        content.push('\n');
    }
    content.push_str(&format!("\n# Kiln shell integration\n{}\n", zshrc_source_line()));

    // Backup existing .zshrc
    let backup = home.join(".zshrc.bak");
    if zshrc.exists() {
        fs::copy(&zshrc, &backup).map_err(|e| format!("Failed to backup .zshrc: {}", e))?;
    }

    fs::write(&zshrc, content).map_err(|e| format!("Failed to write .zshrc: {}", e))?;
    Ok(())
}
