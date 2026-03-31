use crate::parser::StreamParser;
use crate::shell_integration;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::Write;
use std::sync::Mutex;
use std::thread;
use tauri::AppHandle;

pub struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
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

        // Store session
        {
            let mut sessions = self.sessions.lock().unwrap_or_else(|p| p.into_inner());
            sessions.insert(
                session_id.to_string(),
                PtySession {
                    writer,
                    master: pair.master,
                },
            );
        }

        // Auto-source shell integration into the new session
        if let Ok(script_path) = shell_integration::install_zsh_integration() {
            let source_cmd = format!("source \"{}\"\n", script_path);
            self.write_to_session(session_id, &source_cmd).ok();
        }

        // Spawn reader thread with stream parser
        let sid = session_id.to_string();
        let handle = app_handle.clone();
        thread::spawn(move || {
            StreamParser::start(sid, handle, reader);
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
}
