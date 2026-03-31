use base64::Engine;
use crate::config;
use crate::session::SessionManager;
use crate::shell_integration;
use tauri::{Emitter, State, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

#[tauri::command]
pub fn create_session(
    session_id: String,
    app_handle: tauri::AppHandle,
    session_mgr: State<'_, SessionManager>,
) -> Result<(), String> {
    session_mgr.create_session(&session_id, &app_handle)
}

#[tauri::command]
pub fn write_stdin(
    session_id: String,
    data: String,
    session_mgr: State<'_, SessionManager>,
) -> Result<(), String> {
    session_mgr.write_to_session(&session_id, &data)
}

#[tauri::command]
pub fn execute_command(
    session_id: String,
    command: String,
    session_mgr: State<'_, SessionManager>,
) -> Result<(), String> {
    // Check if the command's first token matches interactive_commands
    let cfg = crate::config::current();
    let first_token = command.split_whitespace().next().unwrap_or("");
    if cfg.shell.interactive_commands.iter().any(|ic| ic == first_token) {
        session_mgr.set_force_interactive(&session_id)?;
    }

    session_mgr.write_to_session(&session_id, &format!("{}\n", command))
}

#[tauri::command]
pub fn resize_pty(
    session_id: String,
    cols: u16,
    rows: u16,
    session_mgr: State<'_, SessionManager>,
) -> Result<(), String> {
    session_mgr.resize_session(&session_id, cols, rows)
}

#[tauri::command]
pub fn close_session(
    session_id: String,
    session_mgr: State<'_, SessionManager>,
) -> Result<(), String> {
    session_mgr.close_session(&session_id)
}

#[tauri::command]
pub fn create_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    let label = format!("kiln-{}", Uuid::new_v4());
    WebviewWindowBuilder::new(&app_handle, &label, WebviewUrl::default())
        .title("Kiln")
        .inner_size(900.0, 600.0)
        .min_inner_size(600.0, 400.0)
        .build()
        .map_err(|e| format!("Failed to create window: {}", e))?;
    Ok(())
}

#[derive(Clone, serde::Serialize)]
pub struct ShellIntegrationStatus {
    installed: bool,
    script_path: String,
    in_rc: bool,
    shell: String,
}

#[tauri::command]
pub fn install_shell_integration(shell: Option<String>) -> Result<ShellIntegrationStatus, String> {
    let shell_name = shell.unwrap_or_else(|| shell_integration::detect_shell());
    let script_path = shell_integration::install_for_shell(&shell_name)?;
    shell_integration::add_to_rc_for_shell(&shell_name)?;
    Ok(ShellIntegrationStatus {
        installed: true,
        script_path,
        in_rc: shell_integration::is_installed_in_rc_for_shell(&shell_name),
        shell: shell_name,
    })
}

#[tauri::command]
pub fn get_config() -> config::KilnConfig {
    config::current()
}

/// Open a path or URL with the system's default handler.
fn open_with_system(arg: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(arg)
            .spawn()
            .map_err(|e| format!("Failed to open: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", arg])
            .spawn()
            .map_err(|e| format!("Failed to open: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(arg)
            .spawn()
            .map_err(|e| format!("Failed to open: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_config() -> Result<(), String> {
    let path = config::config_path();
    open_with_system(&path.to_string_lossy())
}

#[tauri::command]
pub fn force_interactive(
    session_id: String,
    app_handle: tauri::AppHandle,
    session_mgr: State<'_, SessionManager>,
) -> Result<(), String> {
    session_mgr.force_interactive_with_wake(&session_id)?;
    // Emit mode_switch immediately so the frontend switches without waiting
    // for the parser to wake up (it may be blocked on read())
    let _ = app_handle.emit(
        "mode_switch",
        crate::parser::ModeSwitchEvent {
            session_id,
            mode: "interactive".to_string(),
        },
    );
    Ok(())
}

#[tauri::command]
pub fn exit_interactive(
    session_id: String,
    session_mgr: State<'_, SessionManager>,
) -> Result<(), String> {
    session_mgr.exit_interactive(&session_id)
}

#[tauri::command]
pub fn interactive_ready(
    session_id: String,
    session_mgr: State<'_, SessionManager>,
) -> Result<String, String> {
    let buffered = session_mgr.interactive_ready(&session_id)?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&buffered);
    Ok(encoded)
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    // Only allow http/https URLs to prevent arbitrary file/app execution
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err(format!("Refused to open non-HTTP URL: {}", url));
    }
    open_with_system(&url)
}

#[tauri::command]
pub fn check_shell_integration(shell: Option<String>) -> ShellIntegrationStatus {
    let shell_name = shell.unwrap_or_else(|| shell_integration::detect_shell());
    let script_path = shell_integration::get_script_path_for_shell(&shell_name)
        .unwrap_or_default();
    let path = std::path::Path::new(&script_path);
    ShellIntegrationStatus {
        installed: !script_path.is_empty() && path.exists(),
        script_path,
        in_rc: shell_integration::is_installed_in_rc_for_shell(&shell_name),
        shell: shell_name,
    }
}
