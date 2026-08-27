mod commands;
mod completions;
pub mod config;
mod parser;
pub mod persistence;
mod session;
mod shell_integration;
pub mod theme;

use session::SessionManager;

pub fn run() {
    tauri::Builder::default()
        .manage(SessionManager::new())
        .setup(|app| {
            config::init(app.handle());
            theme::init(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::execute_command,
            commands::write_stdin,
            commands::resize_pty,
            commands::close_session,
            commands::install_shell_integration,
            commands::check_shell_integration,
            commands::create_window,
            commands::force_interactive,
            commands::exit_interactive,
            commands::interactive_ready,
            commands::open_url,
            commands::open_path,
            commands::get_config,
            commands::open_config,
            completions::get_completions,
            completions::get_history_completions,
            commands::get_theme,
            commands::list_themes,
            commands::set_theme,
            commands::save_session_state,
            commands::load_session_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
