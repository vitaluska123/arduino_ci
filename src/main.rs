use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::LogicalPosition;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};

#[derive(Debug, Serialize, Deserialize)]
struct CliPort {
    address: String,
    protocol: String,
    protocol_label: String,
    properties: Option<serde_json::Value>,
    hardware_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CliBoard {
    name: String,
    fqbn: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct CliLibrary {
    name: String,
    latest: Option<String>,
    sentence: Option<String>,
    paragraph: Option<String>,
    website: Option<String>,
}

fn show_window_bottom_right(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Окно 'main' не найдено".to_string())?;

    // show first (needed on some platforms before querying monitor data reliably)
    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;

    // Move to bottom-right of current monitor work area
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten());

    if let Some(m) = monitor {
        let mpos = m.position();
        let msize = m.size();
        let wsize = window.outer_size().map_err(|e| e.to_string())?;

        let margin = 16.0;
        let x = mpos.x as f64 + msize.width as f64 - wsize.width as f64 - margin;
        let y = mpos.y as f64 + msize.height as f64 - wsize.height as f64 - margin;

        let _ = window.set_position(LogicalPosition::new(x, y));
    }

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

#[tauri::command]
fn list_ports() -> Result<Vec<CliPort>, String> {
    let output = Command::new("arduino-cli")
        .args(["board", "list", "--format", "json"])
        .output()
        .map_err(|e| format!("Не удалось запустить arduino-cli: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let parsed: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("Ошибка разбора JSON: {e}"))?;

    let mut ports = Vec::new();
    if let Some(arr) = parsed.get("detected_ports").and_then(|v| v.as_array()) {
        for p in arr {
            ports.push(CliPort {
                address: p
                    .get("address")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                protocol: p
                    .get("protocol")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                protocol_label: p
                    .get("protocol_label")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                properties: p.get("properties").cloned(),
                hardware_id: p
                    .get("hardware_id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            });
        }
    }
    Ok(ports)
}

#[tauri::command]
fn board_listall(search: Option<String>) -> Result<Vec<CliBoard>, String> {
    let mut args = vec!["board", "listall", "--format", "json"];
    if let Some(s) = &search {
        if !s.trim().is_empty() {
            args.push(s.trim());
        }
    }

    let output = Command::new("arduino-cli")
        .args(args)
        .output()
        .map_err(|e| format!("Не удалось запустить arduino-cli: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let parsed: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("Ошибка разбора JSON: {e}"))?;

    let mut boards = Vec::new();
    if let Some(arr) = parsed.get("boards").and_then(|v| v.as_array()) {
        for b in arr {
            boards.push(CliBoard {
                name: b
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                fqbn: b
                    .get("fqbn")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
            });
        }
    }

    Ok(boards)
}

#[tauri::command]
fn lib_search(query: String) -> Result<Vec<CliLibrary>, String> {
    let output = Command::new("arduino-cli")
        .args(["lib", "search", &query, "--format", "json"])
        .output()
        .map_err(|e| format!("Не удалось запустить arduino-cli: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let parsed: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("Ошибка разбора JSON: {e}"))?;

    let mut libs = Vec::new();
    if let Some(arr) = parsed.get("libraries").and_then(|v| v.as_array()) {
        for l in arr {
            libs.push(CliLibrary {
                name: l
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                latest: l
                    .get("latest")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                sentence: l
                    .get("sentence")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                paragraph: l
                    .get("paragraph")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                website: l
                    .get("website")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            });
        }
    }

    Ok(libs)
}

#[tauri::command]
fn lib_install(name: String, version: Option<String>) -> Result<String, String> {
    let mut cmd = Command::new("arduino-cli");
    cmd.arg("lib").arg("install").arg(name);

    if let Some(v) = version {
        if !v.trim().is_empty() {
            cmd.arg("--version").arg(v);
        }
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Не удалось запустить arduino-cli: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "Ошибка установки: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.hide();

                // Hide on close button
                let app_for_close = app_handle.clone();
                window.on_window_event(move |event| {
                    match event {
                        WindowEvent::CloseRequested { api, .. } => {
                            api.prevent_close();
                            if let Some(w) = app_for_close.get_webview_window("main") {
                                let _ = w.hide();
                            }
                        }
                        // Hide when click outside
                        WindowEvent::Focused(false) => {
                            if let Some(w) = app_for_close.get_webview_window("main") {
                                let _ = w.hide();
                            }
                        }
                        _ => {}
                    }
                });
            }

            let open_i = MenuItemBuilder::new("Открыть").id("open").build(app)?;
            let quit_i = MenuItemBuilder::new("Завершить").id("quit").build(app)?;
            let menu = MenuBuilder::new(app).item(&open_i).item(&quit_i).build()?;

            let app_for_click = app_handle.clone();
            let app_for_menu = app_handle.clone();

            let _tray = TrayIconBuilder::with_id("main")
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .ok_or("Иконка приложения не найдена")?,
                )
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
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_ports,
            board_listall,
            lib_search,
            lib_install
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
