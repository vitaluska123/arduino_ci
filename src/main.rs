use serde::{Deserialize, Serialize};
use serialport::{ClearBuffer, DataBits, FlowControl, Parity, StopBits};
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::PathBuf,
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{channel, Sender},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, LogicalPosition, Manager, State, WindowEvent,
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

#[derive(Debug, Serialize, Deserialize)]
struct CliInstalledLibrary {
    name: String,
    version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CliCore {
    id: String,
    name: String,
    latest: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
struct AppSession {
    project_path: Option<String>,
    fqbn: Option<String>,
    port: Option<String>,
    theme: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CliRunResult {
    success: bool,
    stdout: String,
    stderr: String,
    status: i32,
}

#[derive(Debug, Serialize)]
struct SerialStatus {
    running: bool,
    port: Option<String>,
    baud_rate: Option<u32>,
}

struct SerialRuntime {
    stop: Arc<AtomicBool>,
    tx: Sender<Vec<u8>>,
    handle: JoinHandle<()>,
    output: Arc<Mutex<String>>,
    port: String,
    baud_rate: u32,
}

#[derive(Default)]
struct SerialState {
    runtime: Mutex<Option<SerialRuntime>>,
}

fn append_serial_buffer(output: &Arc<Mutex<String>>, text: &str) {
    if let Ok(mut buf) = output.lock() {
        buf.push_str(text);
    }
}

fn show_window_bottom_right(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Окно 'main' не найдено".to_string())?;

    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;

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
fn pick_project_dir(app: AppHandle) -> Result<Option<String>, String> {
    let picked = rfd::FileDialog::new()
        .set_title("Выберите папку проекта Arduino")
        .pick_folder();

    Ok(picked.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn save_session(app: AppHandle, session: AppSession) -> Result<(), String> {
    let path = session_file_path(&app)?;
    let text =
        serde_json::to_string_pretty(&session).map_err(|e| format!("serialize error: {e}"))?;
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
    let session: AppSession =
        serde_json::from_str(&text).map_err(|e| format!("parse session error: {e}"))?;
    Ok(session)
}

#[tauri::command]
fn compile_project(project_path: String, fqbn: String) -> Result<CliRunResult, String> {
    let output = Command::new("arduino-cli")
        .args(["compile", "--fqbn", &fqbn, &project_path])
        .output()
        .map_err(|e| format!("Не удалось запустить arduino-cli compile: {e}"))?;

    Ok(CliRunResult {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        status: output.status.code().unwrap_or(-1),
    })
}

#[tauri::command]
fn upload_project(
    project_path: String,
    fqbn: String,
    port: String,
) -> Result<CliRunResult, String> {
    let output = Command::new("arduino-cli")
        .args(["upload", "-p", &port, "--fqbn", &fqbn, &project_path])
        .output()
        .map_err(|e| format!("Не удалось запустить arduino-cli upload: {e}"))?;

    Ok(CliRunResult {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        status: output.status.code().unwrap_or(-1),
    })
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

    let ports_json = parsed
        .get("detected_ports")
        .or_else(|| parsed.get("result").and_then(|r| r.get("detected_ports")))
        .and_then(|v| v.as_array());

    let mut ports = Vec::new();
    if let Some(arr) = ports_json {
        for p in arr {
            // Newer arduino-cli uses nested `port` object.
            let port_obj = p.get("port").unwrap_or(p);

            let address = port_obj
                .get("address")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();

            if address.is_empty() {
                continue;
            }

            ports.push(CliPort {
                address,
                protocol: port_obj
                    .get("protocol")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                protocol_label: port_obj
                    .get("protocol_label")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                properties: port_obj
                    .get("properties")
                    .cloned()
                    .or_else(|| port_obj.get("properties_map").cloned())
                    .or_else(|| p.get("properties").cloned()),
                hardware_id: port_obj
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

    let mut boards = Vec::new();
    let search_lc = search
        .as_deref()
        .unwrap_or_default()
        .trim()
        .to_lowercase();

    if output.status.success() {
        let parsed: serde_json::Value = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Ошибка разбора JSON: {e}"))?;

        if let Some(arr) = parsed.get("boards").and_then(|v| v.as_array()) {
            for b in arr {
                let name = b
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();
                let fqbn = b
                    .get("fqbn")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();
                if !name.is_empty() && !fqbn.is_empty() {
                    boards.push(CliBoard { name, fqbn });
                }
            }
        }
    }

    if boards.is_empty() {
        let output_connected = Command::new("arduino-cli")
            .args(["board", "list", "--format", "json"])
            .output()
            .map_err(|e| format!("Не удалось запустить arduino-cli: {e}"))?;

        if !output_connected.status.success() {
            return Err(String::from_utf8_lossy(&output_connected.stderr).to_string());
        }

        let parsed: serde_json::Value = serde_json::from_slice(&output_connected.stdout)
            .map_err(|e| format!("Ошибка разбора JSON: {e}"))?;
        boards = parse_connected_boards(&parsed);
    }

    if search_lc.is_empty() {
        return Ok(boards);
    }

    Ok(boards
        .into_iter()
        .filter(|b| {
            b.name.to_lowercase().contains(&search_lc) || b.fqbn.to_lowercase().contains(&search_lc)
        })
        .collect())
}

fn parse_connected_boards(parsed: &serde_json::Value) -> Vec<CliBoard> {
    let ports_json = parsed
        .get("detected_ports")
        .or_else(|| parsed.get("result").and_then(|r| r.get("detected_ports")))
        .and_then(|v| v.as_array());

    let mut boards = Vec::new();
    let mut seen = HashSet::new();

    if let Some(arr) = ports_json {
        for p in arr {
            let from_port = p
                .get("matching_boards")
                .or_else(|| p.get("port").and_then(|port| port.get("matching_boards")))
                .and_then(|v| v.as_array());

            if let Some(matches) = from_port {
                for b in matches {
                    let name = b
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    let fqbn = b
                        .get("fqbn")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();

                    if name.is_empty() || fqbn.is_empty() || !seen.insert(fqbn.clone()) {
                        continue;
                    }
                    boards.push(CliBoard { name, fqbn });
                }
            }
        }
    }

    boards
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
    if let Some(arr) = parsed
        .get("libraries")
        .or_else(|| parsed.get("result").and_then(|r| r.get("libraries")))
        .and_then(|v| v.as_array())
    {
        for l in arr {
            let item = l.get("library").unwrap_or(l);
            libs.push(CliLibrary {
                name: item
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                latest: item
                    .get("latest")
                    .or_else(|| item.get("version"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                sentence: item
                    .get("sentence")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                paragraph: item
                    .get("paragraph")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                website: item
                    .get("website")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            });
        }
    }

    Ok(libs)
}

#[tauri::command]
fn lib_install(name: String, version: Option<String>) -> Result<CliRunResult, String> {
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

    Ok(CliRunResult {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        status: output.status.code().unwrap_or(-1),
    })
}

#[tauri::command]
fn lib_list() -> Result<Vec<CliInstalledLibrary>, String> {
    let output = Command::new("arduino-cli")
        .args(["lib", "list", "--format", "json"])
        .output()
        .map_err(|e| format!("Не удалось запустить arduino-cli: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let parsed: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("Ошибка разбора JSON: {e}"))?;

    let arr = parsed
        .get("installed_libraries")
        .or_else(|| parsed.get("libraries"))
        .or_else(|| parsed.get("result").and_then(|r| r.get("installed_libraries")))
        .or_else(|| parsed.get("result").and_then(|r| r.get("libraries")))
        .and_then(|v| v.as_array());

    let mut libs = Vec::new();
    let mut seen = HashSet::new();
    if let Some(items) = arr {
        for l in items {
            let item = l.get("library").unwrap_or(l);
            let name = item
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            if name.is_empty() {
                continue;
            }
            let version = item
                .get("version")
                .or_else(|| l.get("release").and_then(|r| r.get("version")))
                .or_else(|| item.get("latest"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let key = name.to_lowercase();
            if seen.insert(key) {
                libs.push(CliInstalledLibrary { name, version });
            }
        }
    }

    Ok(libs)
}

#[tauri::command]
async fn lib_uninstall(name: String) -> Result<CliRunResult, String> {
    let lib_name = name.trim().to_string();
    if lib_name.is_empty() {
        return Err("Пустое имя библиотеки".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new("arduino-cli")
            .arg("lib")
            .arg("uninstall")
            .arg(&lib_name)
            .output()
            .map_err(|e| format!("Не удалось запустить arduino-cli: {e}"))?;

        Ok(CliRunResult {
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            status: output.status.code().unwrap_or(-1),
        })
    })
    .await
    .map_err(|e| format!("Ошибка фонового удаления: {e}"))?
}

#[tauri::command]
fn core_search(query: Option<String>) -> Result<Vec<CliCore>, String> {
    let mut cmd = Command::new("arduino-cli");
    cmd.arg("core").arg("search");
    if let Some(q) = query.as_deref().map(str::trim) {
        if !q.is_empty() {
            cmd.arg(q);
        }
    }
    cmd.arg("--format").arg("json");

    let output = cmd
        .output()
        .map_err(|e| format!("Не удалось запустить arduino-cli: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout_text = String::from_utf8_lossy(&output.stdout).to_string();
    let mut cores = Vec::new();

    if let Ok(parsed) = serde_json::from_slice::<serde_json::Value>(&output.stdout) {
        cores = parse_cores_from_json(&parsed);
    }

    if cores.is_empty() {
        cores = parse_cores_from_table(&stdout_text);
    }

    if cores.is_empty() {
        return Err("Не удалось получить список наборов плат (core search)".to_string());
    }

    Ok(cores)
}

fn parse_cores_from_json(parsed: &serde_json::Value) -> Vec<CliCore> {
    fn get_str_field<'a>(
        obj: &'a serde_json::Map<String, serde_json::Value>,
        keys: &[&str],
    ) -> Option<&'a str> {
        keys.iter()
            .find_map(|k| obj.get(*k).and_then(|v| v.as_str()))
            .map(str::trim)
            .filter(|s| !s.is_empty())
    }

    fn walk(value: &serde_json::Value, cores: &mut Vec<CliCore>, seen: &mut HashSet<String>) {
        match value {
            serde_json::Value::Object(obj) => {
                let mut id = get_str_field(obj, &["id", "ID", "core", "Core", "fqbn", "FQBN"])
                    .unwrap_or_default()
                    .to_string();
                let mut name = get_str_field(obj, &["name", "Name", "title", "Title"])
                    .unwrap_or_default()
                    .to_string();
                let latest = get_str_field(obj, &["latest", "Latest", "version", "Version"])
                    .map(|s| s.to_string());

                if id.is_empty() && name.contains(':') {
                    id = name.clone();
                }
                if !id.contains(':') {
                    id.clear();
                }
                if !id.is_empty() {
                    if name.is_empty() {
                        name = id.clone();
                    }
                    if seen.insert(id.clone()) {
                        cores.push(CliCore { id, name, latest });
                    }
                }

                for v in obj.values() {
                    walk(v, cores, seen);
                }
            }
            serde_json::Value::Array(arr) => {
                for v in arr {
                    walk(v, cores, seen);
                }
            }
            _ => {}
        }
    }

    let mut cores = Vec::new();
    let mut seen = HashSet::new();
    walk(parsed, &mut cores, &mut seen);
    cores
}

fn parse_cores_from_table(stdout: &str) -> Vec<CliCore> {
    let mut cores = Vec::new();
    let mut seen = HashSet::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("ID ") || line.starts_with("ID\t") || line.starts_with("--") {
            continue;
        }

        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.is_empty() {
            continue;
        }

        let id = cols[0].trim().to_string();
        if !id.contains(':') {
            continue;
        }

        let latest = if cols.len() >= 3 && cols[2] != "-" {
            Some(cols[2].to_string())
        } else {
            None
        };
        let name = if cols.len() >= 4 {
            cols[3..].join(" ")
        } else {
            id.clone()
        };

        if seen.insert(id.clone()) {
            cores.push(CliCore { id, name, latest });
        }
    }

    cores
}

#[tauri::command]
async fn core_install(name: String, _version: Option<String>) -> Result<CliRunResult, String> {
    let core_name = name.trim().to_string();
    if core_name.is_empty() {
        return Err("Пустое имя набора плат".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new("arduino-cli")
            .arg("core")
            .arg("install")
            .arg(&core_name)
            .output()
            .map_err(|e| format!("Не удалось запустить arduino-cli: {e}"))?;

        Ok(CliRunResult {
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            status: output.status.code().unwrap_or(-1),
        })
    })
    .await
    .map_err(|e| format!("Ошибка фоновой установки: {e}"))?
}

#[tauri::command]
fn serial_status(state: State<'_, SerialState>) -> Result<SerialStatus, String> {
    let guard = state
        .runtime
        .lock()
        .map_err(|e| format!("serial state lock error: {e}"))?;
    if let Some(runtime) = guard.as_ref() {
        Ok(SerialStatus {
            running: true,
            port: Some(runtime.port.clone()),
            baud_rate: Some(runtime.baud_rate),
        })
    } else {
        Ok(SerialStatus {
            running: false,
            port: None,
            baud_rate: None,
        })
    }
}

#[tauri::command]
fn serial_start(
    state: State<'_, SerialState>,
    port: String,
    baud_rate: u32,
) -> Result<(), String> {
    let port_name = port.trim().to_string();
    if port_name.is_empty() {
        return Err("Пустой COM-порт".to_string());
    }
    if baud_rate == 0 {
        return Err("Некорректный baud rate".to_string());
    }

    let mut guard = state
        .runtime
        .lock()
        .map_err(|e| format!("serial state lock error: {e}"))?;
    if guard.is_some() {
        return Err("Serial уже запущен".to_string());
    }

    let mut serial_port = serialport::new(&port_name, baud_rate)
        .data_bits(DataBits::Eight)
        .parity(Parity::None)
        .stop_bits(StopBits::One)
        .flow_control(FlowControl::None)
        .timeout(Duration::from_millis(120))
        .open()
        .map_err(|e| format!("Не удалось открыть {port_name}: {e}"))?;

    let _ = serial_port.clear(ClearBuffer::All);
    let _ = serial_port.write_data_terminal_ready(true);
    let _ = serial_port.write_request_to_send(true);

    let output = Arc::new(Mutex::new(String::new()));
    append_serial_buffer(&output, &format!("[serial] opened {port_name} @ {baud_rate}\n"));

    let stop = Arc::new(AtomicBool::new(false));
    let stop_for_thread = stop.clone();
    let (tx, rx) = channel::<Vec<u8>>();
    let output_for_thread = output.clone();
    let port_for_thread = port_name.clone();

    let handle = thread::spawn(move || {
        let mut buf = [0_u8; 2048];
        while !stop_for_thread.load(Ordering::Relaxed) {
            while let Ok(data) = rx.try_recv() {
                if let Err(e) = serial_port.write_all(&data) {
                    append_serial_buffer(
                        &output_for_thread,
                        &format!("\n[serial error] write error ({port_for_thread}): {e}\n"),
                    );
                }
            }

            match serial_port.read(&mut buf) {
                Ok(n) if n > 0 => {
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    append_serial_buffer(&output_for_thread, &text);
                }
                Ok(_) => {}
                Err(e)
                    if matches!(
                        e.kind(),
                        std::io::ErrorKind::TimedOut
                            | std::io::ErrorKind::WouldBlock
                            | std::io::ErrorKind::Interrupted
                    ) => {}
                Err(e) => {
                    append_serial_buffer(
                        &output_for_thread,
                        &format!("\n[serial error] read error ({port_for_thread}): {e}\n"),
                    );
                    thread::sleep(Duration::from_millis(60));
                }
            }
        }
    });

    *guard = Some(SerialRuntime {
        stop,
        tx,
        handle,
        output,
        port: port_name,
        baud_rate,
    });
    Ok(())
}

#[tauri::command]
fn serial_send(state: State<'_, SerialState>, data: String) -> Result<(), String> {
    let guard = state
        .runtime
        .lock()
        .map_err(|e| format!("serial state lock error: {e}"))?;
    let runtime = guard
        .as_ref()
        .ok_or_else(|| "Serial не запущен".to_string())?;
    runtime
        .tx
        .send(data.into_bytes())
        .map_err(|e| format!("Ошибка отправки в serial поток: {e}"))
}

#[tauri::command]
fn serial_take_output(state: State<'_, SerialState>) -> Result<String, String> {
    let guard = state
        .runtime
        .lock()
        .map_err(|e| format!("serial state lock error: {e}"))?;
    let Some(runtime) = guard.as_ref() else {
        return Ok(String::new());
    };

    let mut out = runtime
        .output
        .lock()
        .map_err(|e| format!("serial output lock error: {e}"))?;
    if out.is_empty() {
        return Ok(String::new());
    }
    let data = out.clone();
    out.clear();
    Ok(data)
}

#[tauri::command]
fn serial_stop(state: State<'_, SerialState>) -> Result<(), String> {
    let runtime = {
        let mut guard = state
            .runtime
            .lock()
            .map_err(|e| format!("serial state lock error: {e}"))?;
        guard.take()
    };

    if let Some(runtime) = runtime {
        runtime.stop.store(true, Ordering::Relaxed);
        drop(runtime.tx);
        runtime
            .handle
            .join()
            .map_err(|_| "Ошибка остановки serial потока".to_string())?;
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(SerialState::default())
        .setup(|app| {
            let app_handle = app.handle().clone();

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.hide();

                let app_for_close = app_handle.clone();
                window.on_window_event(move |event| match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        if let Some(w) = app_for_close.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    }
                    WindowEvent::Focused(false) => {
                        if let Some(w) = app_for_close.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    }
                    _ => {}
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
            pick_project_dir,
            save_session,
            load_session,
            compile_project,
            upload_project,
            list_ports,
            board_listall,
            lib_search,
            lib_list,
            lib_install,
            lib_uninstall,
            core_search,
            core_install,
            serial_status,
            serial_start,
            serial_send,
            serial_take_output,
            serial_stop
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
