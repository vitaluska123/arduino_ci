import React, { useEffect, useState } from "react";
import { api } from "./api/arduinoCli";

function App() {
  const [projectPath, setProjectPath] = useState("");
  const [fqbn, setFqbn] = useState("");
  const [port, setPort] = useState("");

  const [ports, setPorts] = useState([]);
  const [boards, setBoards] = useState([]);
  const [boardQuery, setBoardQuery] = useState("");

  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);

  const appendLog = (text) => {
    setLog((prev) => `${prev}${prev ? "\n" : ""}${text}`);
  };

  const refreshPorts = async () => {
    try {
      const data = await api.listPorts();
      setPorts(data);
    } catch (e) {
      appendLog(`Ошибка listPorts: ${String(e)}`);
    }
  };

  const refreshBoards = async (q = "") => {
    try {
      const data = await api.listBoards(q);
      setBoards(data);
    } catch (e) {
      appendLog(`Ошибка listBoards: ${String(e)}`);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const saved = await api.loadSession();
        if (saved?.project_path) setProjectPath(saved.project_path);
        if (saved?.fqbn) setFqbn(saved.fqbn);
        if (saved?.port) setPort(saved.port);
      } catch (e) {
        appendLog(`loadSession: ${String(e)}`);
      }
      await refreshPorts();
      await refreshBoards("");
    })();
  }, []);

  useEffect(() => {
    api
      .saveSession({
        project_path: projectPath || null,
        fqbn: fqbn || null,
        port: port || null,
      })
      .catch(() => {});
  }, [projectPath, fqbn, port]);

  const pickProject = async () => {
    try {
      const path = await api.pickProjectDir();
      if (path) setProjectPath(path);
    } catch (e) {
      appendLog(`Ошибка выбора проекта: ${String(e)}`);
    }
  };

  const onCompile = async () => {
    if (!projectPath || !fqbn) {
      appendLog("Для compile нужны projectPath и fqbn");
      return;
    }

    setBusy(true);
    appendLog("=== COMPILE START ===");
    const res = await api.compileProject(projectPath, fqbn).catch((e) => ({
      success: false,
      stdout: "",
      stderr: String(e),
      status: -1,
    }));
    if (res.stdout) appendLog(res.stdout);
    if (res.stderr) appendLog(res.stderr);
    appendLog(`=== COMPILE END (status=${res.status}) ===`);
    setBusy(false);
  };

  const onUpload = async () => {
    if (!projectPath || !fqbn || !port) {
      appendLog("Для upload нужны projectPath, fqbn и port");
      return;
    }

    setBusy(true);
    appendLog("=== UPLOAD START ===");
    const res = await api.uploadProject(projectPath, fqbn, port).catch((e) => ({
      success: false,
      stdout: "",
      stderr: String(e),
      status: -1,
    }));
    if (res.stdout) appendLog(res.stdout);
    if (res.stderr) appendLog(res.stderr);
    appendLog(`=== UPLOAD END (status=${res.status}) ===`);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-gray-100 text-gray-900">
      <div className="p-3 border-b bg-white">
        <h1 className="text-lg font-semibold">Arduino CI</h1>
      </div>

      <div className="p-3 space-y-3">
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded px-2 py-1"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            placeholder="Путь к проекту"
          />
          <button className="px-3 py-1 border rounded" onClick={pickProject}>
            Выбрать
          </button>
        </div>

        <div className="flex gap-2">
          <input
            className="w-56 border rounded px-2 py-1"
            value={boardQuery}
            onChange={(e) => setBoardQuery(e.target.value)}
            placeholder="Поиск платы"
          />
          <button
            className="px-3 py-1 border rounded"
            onClick={() => refreshBoards(boardQuery)}
          >
            Найти
          </button>

          <select
            className="flex-1 border rounded px-2 py-1"
            value={fqbn}
            onChange={(e) => setFqbn(e.target.value)}
          >
            <option value="">Выбери плату (fqbn)</option>
            {boards.map((b) => (
              <option key={`${b.fqbn}-${b.name}`} value={b.fqbn}>
                {b.name} — {b.fqbn}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <select
            className="flex-1 border rounded px-2 py-1"
            value={port}
            onChange={(e) => setPort(e.target.value)}
          >
            <option value="">Выбери порт</option>
            {ports.map((p) => (
              <option key={p.address} value={p.address}>
                {p.address} ({p.protocol_label || p.protocol})
              </option>
            ))}
          </select>

          <button className="px-3 py-1 border rounded" onClick={refreshPorts}>
            Обновить порты
          </button>
        </div>

        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={onCompile}
            className="px-4 py-1 rounded border bg-blue-600 text-white disabled:opacity-50"
          >
            Compile
          </button>
          <button
            disabled={busy}
            onClick={onUpload}
            className="px-4 py-1 rounded border bg-green-600 text-white disabled:opacity-50"
          >
            Upload
          </button>
          <button
            onClick={() => setLog("")}
            className="px-4 py-1 rounded border"
          >
            Clear log
          </button>
        </div>

        <textarea
          readOnly
          value={log}
          className="w-full h-[360px] border rounded p-2 font-mono text-xs bg-black text-green-300"
        />
      </div>
    </div>
  );
}

export default App;
