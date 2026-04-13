use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CliPort {
    pub address: String,
    pub protocol: String,
    pub protocol_label: String,
    pub properties: Option<serde_json::Value>,
    pub hardware_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CliBoard {
    pub name: String,
    pub fqbn: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CliLibrary {
    pub name: String,
    pub latest: Option<String>,
    pub sentence: Option<String>,
    pub paragraph: Option<String>,
    pub website: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CliInstalledLibrary {
    pub name: String,
    pub version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CliCore {
    pub id: String,
    pub name: String,
    pub latest: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct AppSession {
    pub project_path: Option<String>,
    pub fqbn: Option<String>,
    pub port: Option<String>,
    pub theme: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CliRunResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub status: i32,
}

#[derive(Debug, Serialize, Clone)]
pub struct SerialStatus {
    pub running: bool,
    pub port: Option<String>,
    pub baud_rate: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct CliJobStartResponse {
    pub job_id: String,
}

#[derive(Debug, Serialize)]
pub struct CliJobStatus {
    pub running: bool,
    pub success: Option<bool>,
    pub exit_code: Option<i32>,
    pub error: Option<String>,
}
