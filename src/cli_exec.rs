use crate::models::{
    CliBoard, CliCore, CliInstalledLibrary, CliJobStartResponse, CliJobStatus, CliLibrary, CliPort, CliRunResult,
};
use std::{
    collections::{HashMap, HashSet},
    io::{BufRead, BufReader, Read},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use tauri::State;

fn arduino_cli_command() -> Command {
    let mut cmd = Command::new("arduino-cli");
    #[cfg(target_os = "windows")]
    {
        // CREATE_NO_WINDOW
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}

fn run_cli_capture(args: &[String]) -> Result<CliRunResult, String> {
    let output = arduino_cli_command()
        .args(args)
        .output()
        .map_err(|e| format!("Не удалось запустить arduino-cli: {e}"))?;

    Ok(CliRunResult {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        status: output.status.code().unwrap_or(-1),
    })
}

fn run_cli_stdout_json(args: &[String]) -> Result<serde_json::Value, String> {
    let output = arduino_cli_command()
        .args(args)
        .output()
        .map_err(|e| format!("Не удалось запустить arduino-cli: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    serde_json::from_slice(&output.stdout).map_err(|e| format!("Ошибка разбора JSON: {e}"))
}

struct CliJobEntry {
    running: Arc<AtomicBool>,
    success: Arc<Mutex<Option<bool>>>,
    exit_code: Arc<Mutex<Option<i32>>>,
    error: Arc<Mutex<Option<String>>>,
    output: Arc<Mutex<String>>,
}

#[derive(Default)]
pub struct CliJobsState {
    jobs: Mutex<HashMap<String, CliJobEntry>>,
    next_id: AtomicU64,
}

#[derive(Default)]
pub struct LibCacheState {
    cache: Mutex<Option<(Instant, Vec<CliInstalledLibrary>)>>,
}

const LIBS_CACHE_TTL: Duration = Duration::from_secs(20);

fn append_job_output(output: &Arc<Mutex<String>>, chunk: &str) {
    if let Ok(mut out) = output.lock() {
        out.push_str(chunk);
    }
}

fn stream_reader<R: Read + Send + 'static>(reader: R, output: Arc<Mutex<String>>) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        loop {
            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => append_job_output(&output, &line),
                Err(_) => break,
            }
        }
    })
}

fn invalidate_lib_cache(cache: &LibCacheState) {
    if let Ok(mut guard) = cache.cache.lock() {
        *guard = None;
    }
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
pub fn cli_job_start(args: Vec<String>, jobs: State<'_, CliJobsState>) -> Result<CliJobStartResponse, String> {
    if args.is_empty() {
        return Err("Пустая команда".to_string());
    }

    let job_id = format!("job-{}", jobs.next_id.fetch_add(1, Ordering::Relaxed) + 1);
    let running = Arc::new(AtomicBool::new(true));
    let success = Arc::new(Mutex::new(None));
    let exit_code = Arc::new(Mutex::new(None));
    let error = Arc::new(Mutex::new(None));
    let output = Arc::new(Mutex::new(String::new()));

    let entry = CliJobEntry {
        running: running.clone(),
        success: success.clone(),
        exit_code: exit_code.clone(),
        error: error.clone(),
        output: output.clone(),
    };
    jobs.jobs
        .lock()
        .map_err(|e| format!("cli jobs lock error: {e}"))?
        .insert(job_id.clone(), entry);

    thread::spawn(move || {
        let mut cmd = arduino_cli_command();
        cmd.args(&args).stdout(Stdio::piped()).stderr(Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(child) => child,
            Err(e) => {
                if let Ok(mut err) = error.lock() {
                    *err = Some(format!("Не удалось запустить arduino-cli: {e}"));
                }
                running.store(false, Ordering::Relaxed);
                return;
            }
        };

        let stdout_reader = child
            .stdout
            .take()
            .map(|out| stream_reader(out, output.clone()));
        let stderr_reader = child
            .stderr
            .take()
            .map(|err| stream_reader(err, output.clone()));

        let status = child.wait();

        if let Some(handle) = stdout_reader {
            let _ = handle.join();
        }
        if let Some(handle) = stderr_reader {
            let _ = handle.join();
        }

        match status {
            Ok(st) => {
                if let Ok(mut code) = exit_code.lock() {
                    *code = st.code();
                }
                if let Ok(mut ok) = success.lock() {
                    *ok = Some(st.success());
                }
            }
            Err(e) => {
                if let Ok(mut err) = error.lock() {
                    *err = Some(format!("Ошибка ожидания процесса: {e}"));
                }
            }
        }

        running.store(false, Ordering::Relaxed);
    });

    Ok(CliJobStartResponse { job_id })
}

#[tauri::command]
pub fn cli_job_take_output(job_id: String, jobs: State<'_, CliJobsState>) -> Result<String, String> {
    let guard = jobs
        .jobs
        .lock()
        .map_err(|e| format!("cli jobs lock error: {e}"))?;
    let entry = guard
        .get(&job_id)
        .ok_or_else(|| format!("Job не найден: {job_id}"))?;
    let mut out = entry
        .output
        .lock()
        .map_err(|e| format!("cli job output lock error: {e}"))?;
    if out.is_empty() {
        return Ok(String::new());
    }
    let data = out.clone();
    out.clear();
    Ok(data)
}

#[tauri::command]
pub fn cli_job_status(job_id: String, jobs: State<'_, CliJobsState>) -> Result<CliJobStatus, String> {
    let guard = jobs
        .jobs
        .lock()
        .map_err(|e| format!("cli jobs lock error: {e}"))?;
    let entry = guard
        .get(&job_id)
        .ok_or_else(|| format!("Job не найден: {job_id}"))?;

    let success = *entry
        .success
        .lock()
        .map_err(|e| format!("cli job success lock error: {e}"))?;
    let exit_code = *entry
        .exit_code
        .lock()
        .map_err(|e| format!("cli job exit lock error: {e}"))?;
    let error = entry
        .error
        .lock()
        .map_err(|e| format!("cli job error lock error: {e}"))?
        .clone();

    Ok(CliJobStatus {
        running: entry.running.load(Ordering::Relaxed),
        success,
        exit_code,
        error,
    })
}

#[tauri::command]
pub fn cli_job_drop(job_id: String, jobs: State<'_, CliJobsState>) -> Result<(), String> {
    jobs.jobs
        .lock()
        .map_err(|e| format!("cli jobs lock error: {e}"))?
        .remove(&job_id);
    Ok(())
}

#[tauri::command]
pub async fn compile_project(project_path: String, fqbn: String) -> Result<CliRunResult, String> {
    let args = vec!["compile".to_string(), "--fqbn".to_string(), fqbn, project_path];
    tauri::async_runtime::spawn_blocking(move || run_cli_capture(&args))
        .await
        .map_err(|e| format!("Ошибка фоновой компиляции: {e}"))?
}

#[tauri::command]
pub async fn upload_project(project_path: String, fqbn: String, port: String) -> Result<CliRunResult, String> {
    let args = vec![
        "upload".to_string(),
        "-p".to_string(),
        port,
        "--fqbn".to_string(),
        fqbn,
        project_path,
    ];
    tauri::async_runtime::spawn_blocking(move || run_cli_capture(&args))
        .await
        .map_err(|e| format!("Ошибка фоновой загрузки: {e}"))?
}

#[tauri::command]
pub async fn list_ports() -> Result<Vec<CliPort>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let parsed = run_cli_stdout_json(&[
            "board".to_string(),
            "list".to_string(),
            "--format".to_string(),
            "json".to_string(),
        ])?;

        let ports_json = parsed
            .get("detected_ports")
            .or_else(|| parsed.get("result").and_then(|r| r.get("detected_ports")))
            .and_then(|v| v.as_array());

        let mut ports = Vec::new();
        if let Some(arr) = ports_json {
            for p in arr {
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
    })
    .await
    .map_err(|e| format!("Ошибка фонового получения портов: {e}"))?
}

#[tauri::command]
pub async fn board_listall(search: Option<String>) -> Result<Vec<CliBoard>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut args = vec![
            "board".to_string(),
            "listall".to_string(),
            "--format".to_string(),
            "json".to_string(),
        ];
        if let Some(s) = &search {
            if !s.trim().is_empty() {
                args.push(s.trim().to_string());
            }
        }

        let mut boards = Vec::new();
        let search_lc = search
            .as_deref()
            .unwrap_or_default()
            .trim()
            .to_lowercase();

        let listall_result = run_cli_stdout_json(&args);
        if let Ok(parsed) = listall_result {
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
            let parsed = run_cli_stdout_json(&[
                "board".to_string(),
                "list".to_string(),
                "--format".to_string(),
                "json".to_string(),
            ])?;
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
    })
    .await
    .map_err(|e| format!("Ошибка фонового получения списка плат: {e}"))?
}

#[tauri::command]
pub async fn lib_search(query: String) -> Result<Vec<CliLibrary>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let parsed = run_cli_stdout_json(&[
            "lib".to_string(),
            "search".to_string(),
            query,
            "--format".to_string(),
            "json".to_string(),
        ])?;

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
    })
    .await
    .map_err(|e| format!("Ошибка фонового поиска библиотек: {e}"))?
}

#[tauri::command]
pub async fn lib_install(
    name: String,
    version: Option<String>,
    cache: State<'_, LibCacheState>,
) -> Result<CliRunResult, String> {
    let mut args = vec!["lib".to_string(), "install".to_string(), name];
    if let Some(v) = version {
        if !v.trim().is_empty() {
            args.push("--version".to_string());
            args.push(v);
        }
    }

    let result = tauri::async_runtime::spawn_blocking(move || run_cli_capture(&args))
        .await
        .map_err(|e| format!("Ошибка фоновой установки библиотеки: {e}"))??;
    if result.success {
        invalidate_lib_cache(&cache);
    }
    Ok(result)
}

#[tauri::command]
pub async fn lib_list(
    force_refresh: Option<bool>,
    cache: State<'_, LibCacheState>,
) -> Result<Vec<CliInstalledLibrary>, String> {
    let force = force_refresh.unwrap_or(false);
    if !force {
        let cached = cache
            .cache
            .lock()
            .map_err(|e| format!("lib cache lock error: {e}"))?
            .clone();
        if let Some((at, libs)) = cached {
            if at.elapsed() < LIBS_CACHE_TTL {
                return Ok(libs);
            }
        }
    }

    let libs = tauri::async_runtime::spawn_blocking(|| {
        let parsed = run_cli_stdout_json(&[
            "lib".to_string(),
            "list".to_string(),
            "--format".to_string(),
            "json".to_string(),
        ])?;

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
        Ok::<_, String>(libs)
    })
    .await
    .map_err(|e| format!("Ошибка фонового чтения установленных библиотек: {e}"))??;

    *cache
        .cache
        .lock()
        .map_err(|e| format!("lib cache lock error: {e}"))? = Some((Instant::now(), libs.clone()));
    Ok(libs)
}

#[tauri::command]
pub async fn lib_uninstall(name: String, cache: State<'_, LibCacheState>) -> Result<CliRunResult, String> {
    let lib_name = name.trim().to_string();
    if lib_name.is_empty() {
        return Err("Пустое имя библиотеки".to_string());
    }

    let result = tauri::async_runtime::spawn_blocking(move || {
        run_cli_capture(&["lib".to_string(), "uninstall".to_string(), lib_name])
    })
    .await
    .map_err(|e| format!("Ошибка фонового удаления: {e}"))??;
    if result.success {
        invalidate_lib_cache(&cache);
    }
    Ok(result)
}

#[tauri::command]
pub async fn core_search(query: Option<String>) -> Result<Vec<CliCore>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut args = vec!["core".to_string(), "search".to_string()];
        if let Some(q) = query.as_deref().map(str::trim) {
            if !q.is_empty() {
                args.push(q.to_string());
            }
        }
        args.push("--format".to_string());
        args.push("json".to_string());

        let output = arduino_cli_command()
            .args(&args)
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
    })
    .await
    .map_err(|e| format!("Ошибка фонового поиска core: {e}"))?
}

#[tauri::command]
pub async fn core_install(name: String, _version: Option<String>) -> Result<CliRunResult, String> {
    let core_name = name.trim().to_string();
    if core_name.is_empty() {
        return Err("Пустое имя набора плат".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        run_cli_capture(&["core".to_string(), "install".to_string(), core_name])
    })
    .await
    .map_err(|e| format!("Ошибка фоновой установки core: {e}"))?
}
