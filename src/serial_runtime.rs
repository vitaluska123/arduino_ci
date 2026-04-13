use crate::models::SerialStatus;
use serialport::{ClearBuffer, DataBits, FlowControl, Parity, StopBits};
use std::{
    io::{Read, Write},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{channel, Sender},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};
use tauri::State;

struct SerialRuntime {
    stop: Arc<AtomicBool>,
    tx: Sender<Vec<u8>>,
    handle: JoinHandle<()>,
    output: Arc<Mutex<String>>,
    port: String,
    baud_rate: u32,
}

#[derive(Default)]
pub struct SerialState {
    runtime: Mutex<Option<SerialRuntime>>,
}

fn append_serial_buffer(output: &Arc<Mutex<String>>, text: &str) {
    if let Ok(mut buf) = output.lock() {
        buf.push_str(text);
    }
}

#[tauri::command]
pub fn serial_status(state: State<'_, SerialState>) -> Result<SerialStatus, String> {
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
pub fn serial_start(state: State<'_, SerialState>, port: String, baud_rate: u32) -> Result<(), String> {
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
pub fn serial_send(state: State<'_, SerialState>, data: String) -> Result<(), String> {
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
pub fn serial_take_output(state: State<'_, SerialState>) -> Result<String, String> {
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
pub fn serial_stop(state: State<'_, SerialState>) -> Result<(), String> {
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
