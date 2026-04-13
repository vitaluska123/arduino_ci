#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod cli_exec;
mod models;
mod serial_runtime;

use crate::models::AppSession;
use std::{fs, path::PathBuf};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, LogicalPosition, Manager, WindowEvent,
};

fn show_window_bottom_right(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Окно 'main' не найдено".to_string())?;

    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten());

    if let Some(m) = monitor {
        let mpos = m.position();
        let msize = m.size();
        let wsize = window.outer_size().map_err(|e| e.to_string())?;

        let margin_x = 16.0;
        let margin_y = 56.0;
        let x = mpos.x as f64 + msize.width as f64 - wsize.width as f64 - margin_x;
        let y = mpos.y as f64 + msize.height as f64 - wsize.height as f64 - margin_y;

        let _ = window.set_position(LogicalPosition::new(x, y));
    }

    let _ = window.unminimize();
    window.show().map_err(|e| e.to_string())?;
    let _ = window.set_focus();
    Ok(())
}

fn toggle_main_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Окно 'main' не найдено".to_string())?;

    let visible = window.is_visible().map_err(|e| e.to_string())?;
    if visible {
        window.hide().map_err(|e| e.to_string())?;
    } else {
        show_window_bottom_right(app)?;
    }
    Ok(())
}

fn session_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;

    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| format!("create_dir_all error: {e}"))?;
    }

    Ok(app_dir.join("session.json"))
}

#[tauri::command]
fn pick_project_dir(_app: AppHandle) -> Result<Option<String>, String> {
    let picked = rfd::FileDialog::new()
        .set_title("Выберите папку проекта Arduino")
        .pick_folder();
    Ok(picked.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn hide_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn save_session(app: AppHandle, session: AppSession) -> Result<(), String> {
    let path = session_file_path(&app)?;
    let text = serde_json::to_string_pretty(&session).map_err(|e| format!("serialize error: {e}"))?;
    fs::write(path, text).map_err(|e| format!("write session error: {e}"))?;
    Ok(())
}

#[tauri::command]
fn load_session(app: AppHandle) -> Result<AppSession, String> {
    let path = session_file_path(&app)?;
    if !path.exists() {
        return Ok(AppSession::default());
    }
    let text = fs::read_to_string(path).map_err(|e| format!("read session error: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("parse session error: {e}"))
}

fn main() {
    tauri::Builder::default()
        .manage(serial_runtime::SerialState::default())
        .manage(cli_exec::CliJobsState::default())
        .manage(cli_exec::LibCacheState::default())
        .setup(|app| {
            let app_handle = app.handle().clone();

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.hide();
                let app_for_close = app_handle.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(w) = app_for_close.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    }
                });
            }

            let open_i = MenuItemBuilder::new("Открыть").id("open").build(app);
            let quit_i = MenuItemBuilder::new("Завершить").id("quit").build(app);

            let mut tray_ready = false;
            if let (Ok(open_i), Ok(quit_i)) = (open_i, quit_i) {
                if let Ok(menu) = MenuBuilder::new(app).item(&open_i).item(&quit_i).build() {
                    if let Some(icon) = app.default_window_icon().cloned() {
                        let app_for_click = app_handle.clone();
                        let app_for_menu = app_handle.clone();
                        tray_ready = TrayIconBuilder::with_id("main")
                            .icon(icon)
                            .tooltip("Arduino CI")
                            .menu(&menu)
                            .show_menu_on_left_click(false)
                            .on_tray_icon_event(move |_tray, event| {
                                if let TrayIconEvent::Click {
                                    button: MouseButton::Left,
                                    button_state: MouseButtonState::Up,
                                    ..
                                } = event
                                {
                                    let _ = toggle_main_window(&app_for_click);
                                }
                            })
                            .on_menu_event(move |_tray, event| match event.id.as_ref() {
                                "open" => {
                                    let _ = show_window_bottom_right(&app_for_menu);
                                }
                                "quit" => {
                                    std::process::exit(0);
                                }
                                _ => {}
                            })
                            .build(app)
                            .is_ok();
                    }
                }
            }

            if !tray_ready {
                let _ = show_window_bottom_right(&app_handle);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hide_main_window,
            pick_project_dir,
            save_session,
            load_session,
            cli_exec::cli_job_start,
            cli_exec::cli_job_take_output,
            cli_exec::cli_job_status,
            cli_exec::cli_job_drop,
            cli_exec::compile_project,
            cli_exec::upload_project,
            cli_exec::list_ports,
            cli_exec::board_listall,
            cli_exec::lib_search,
            cli_exec::lib_list,
            cli_exec::lib_install,
            cli_exec::lib_uninstall,
            cli_exec::core_search,
            cli_exec::core_install,
            serial_runtime::serial_status,
            serial_runtime::serial_start,
            serial_runtime::serial_send,
            serial_runtime::serial_take_output,
            serial_runtime::serial_stop
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
