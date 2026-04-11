import { invoke } from "@tauri-apps/api/core";

export const api = {
  listPorts: () => invoke("list_ports"),
  listBoards: (search = "") =>
    invoke("board_listall", { search: search || null }),

  searchLibraries: (query) => invoke("lib_search", { query }),
  installLibrary: (name, version = null) =>
    invoke("lib_install", { name, version }),

  pickProjectDir: () => invoke("pick_project_dir"),
  saveSession: (session) => invoke("save_session", { session }),
  loadSession: () => invoke("load_session"),

  compileProject: (projectPath, fqbn) =>
    invoke("compile_project", { projectPath, fqbn }),

  uploadProject: (projectPath, fqbn, port) =>
    invoke("upload_project", { projectPath, fqbn, port }),
};
