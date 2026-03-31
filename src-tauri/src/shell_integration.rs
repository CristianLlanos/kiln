use std::fs;
use std::path::PathBuf;

const KILN_ZSH: &str = include_str!("../shell/kiln.zsh");
const KILN_BASH: &str = include_str!("../shell/kiln.bash");
const KILN_FISH: &str = include_str!("../shell/kiln.fish");

/// Directory where shell integration scripts are installed.
fn shell_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".config").join("kiln").join("shell"))
}

// ---------------------------------------------------------------------------
// Zsh
// ---------------------------------------------------------------------------

/// Compute the path to the kiln.zsh script without writing to disk.
pub fn get_zsh_script_path() -> Result<String, String> {
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

// ---------------------------------------------------------------------------
// Bash
// ---------------------------------------------------------------------------

/// Compute the path to the kiln.bash script without writing to disk.
pub fn get_bash_script_path() -> Result<String, String> {
    let dir = shell_dir()?;
    let path = dir.join("kiln.bash");
    Ok(path.to_string_lossy().to_string())
}

/// Write the kiln.bash script to ~/.config/kiln/shell/kiln.bash.
/// Returns the path to the installed script.
pub fn install_bash_integration() -> Result<String, String> {
    let dir = shell_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;

    let path = dir.join("kiln.bash");
    fs::write(&path, KILN_BASH).map_err(|e| format!("Failed to write script: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}

/// The source line that should go in .bashrc.
pub fn bashrc_source_line() -> String {
    let dir = shell_dir().unwrap_or_else(|_| PathBuf::from("~/.config/kiln/shell"));
    format!("source \"{}\"", dir.join("kiln.bash").to_string_lossy())
}

/// Check if .bashrc already sources kiln.
pub fn is_installed_in_bashrc() -> bool {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return false,
    };
    let bashrc = home.join(".bashrc");
    match fs::read_to_string(bashrc) {
        Ok(content) => content.contains("kiln.bash") || content.contains("kiln/shell"),
        Err(_) => false,
    }
}

/// Add the source line to .bashrc if not already present.
pub fn add_to_bashrc() -> Result<(), String> {
    if is_installed_in_bashrc() {
        return Ok(());
    }

    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let bashrc = home.join(".bashrc");

    let mut content = fs::read_to_string(&bashrc).unwrap_or_default();
    if !content.ends_with('\n') && !content.is_empty() {
        content.push('\n');
    }
    content.push_str(&format!("\n# Kiln shell integration\n{}\n", bashrc_source_line()));

    // Backup existing .bashrc
    let backup = home.join(".bashrc.bak");
    if bashrc.exists() {
        fs::copy(&bashrc, &backup).map_err(|e| format!("Failed to backup .bashrc: {}", e))?;
    }

    fs::write(&bashrc, content).map_err(|e| format!("Failed to write .bashrc: {}", e))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Fish
// ---------------------------------------------------------------------------

/// Compute the path to the kiln.fish script without writing to disk.
pub fn get_fish_script_path() -> Result<String, String> {
    let dir = shell_dir()?;
    let path = dir.join("kiln.fish");
    Ok(path.to_string_lossy().to_string())
}

/// Write the kiln.fish script to ~/.config/kiln/shell/kiln.fish.
/// Returns the path to the installed script.
pub fn install_fish_integration() -> Result<String, String> {
    let dir = shell_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;

    let path = dir.join("kiln.fish");
    fs::write(&path, KILN_FISH).map_err(|e| format!("Failed to write script: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}

/// The source line that should go in fish config.
pub fn fish_config_source_line() -> String {
    let dir = shell_dir().unwrap_or_else(|_| PathBuf::from("~/.config/kiln/shell"));
    format!("source \"{}\"", dir.join("kiln.fish").to_string_lossy())
}

/// Path to the fish config file.
fn fish_config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".config").join("fish").join("config.fish"))
}

/// Check if fish config already sources kiln.
pub fn is_installed_in_fish_config() -> bool {
    match fish_config_path() {
        Ok(path) => match fs::read_to_string(path) {
            Ok(content) => content.contains("kiln.fish") || content.contains("kiln/shell"),
            Err(_) => false,
        },
        Err(_) => false,
    }
}

/// Add the source line to fish config if not already present.
pub fn add_to_fish_config() -> Result<(), String> {
    if is_installed_in_fish_config() {
        return Ok(());
    }

    let config_path = fish_config_path()?;

    // Ensure the directory exists
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create fish config dir: {}", e))?;
    }

    let mut content = fs::read_to_string(&config_path).unwrap_or_default();
    if !content.ends_with('\n') && !content.is_empty() {
        content.push('\n');
    }
    content.push_str(&format!("\n# Kiln shell integration\n{}\n", fish_config_source_line()));

    // Backup existing config.fish
    if config_path.exists() {
        let backup = config_path.with_extension("fish.bak");
        fs::copy(&config_path, &backup).map_err(|e| format!("Failed to backup config.fish: {}", e))?;
    }

    fs::write(&config_path, content).map_err(|e| format!("Failed to write config.fish: {}", e))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Multi-shell helpers
// ---------------------------------------------------------------------------

/// Detect the shell name from SHELL env var (returns "zsh", "bash", "fish", or the raw name).
pub fn detect_shell() -> String {
    let shell_path = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let shell_name = std::path::Path::new(&shell_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "zsh".to_string());
    shell_name
}

/// Install the integration script for a given shell name.
/// Returns the path to the installed script.
pub fn install_for_shell(shell: &str) -> Result<String, String> {
    match shell {
        "bash" => install_bash_integration(),
        "fish" => install_fish_integration(),
        _ => install_zsh_integration(), // default to zsh
    }
}

/// Add the source line to the appropriate rc file for a given shell.
pub fn add_to_rc_for_shell(shell: &str) -> Result<(), String> {
    match shell {
        "bash" => add_to_bashrc(),
        "fish" => add_to_fish_config(),
        _ => add_to_zshrc(),
    }
}

/// Check if the integration is installed in the rc file for a given shell.
pub fn is_installed_in_rc_for_shell(shell: &str) -> bool {
    match shell {
        "bash" => is_installed_in_bashrc(),
        "fish" => is_installed_in_fish_config(),
        _ => is_installed_in_zshrc(),
    }
}

/// Get the script path for a given shell.
pub fn get_script_path_for_shell(shell: &str) -> Result<String, String> {
    match shell {
        "bash" => get_bash_script_path(),
        "fish" => get_fish_script_path(),
        _ => get_zsh_script_path(),
    }
}
