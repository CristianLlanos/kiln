mod commands;
mod completions;
pub mod config;
mod parser;
mod session;
mod shell_integration;

use session::SessionManager;

pub fn run() {
    tauri::Builder::default()
        .manage(SessionManager::new())
        .setup(|app| {
            config::init(app.handle());
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
            commands::get_config,
            commands::open_config,
            completions::get_completions,
            completions::get_history_completions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
