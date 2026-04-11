import React, { useEffect, useState } from "react";
import { api } from "./api/arduinoCli";

function App() {
  const [activePage, setActivePage] = useState("main");

  const [projectPath, setProjectPath] = useState("");
  const [fqbn, setFqbn] = useState("");
  const [port, setPort] = useState("");
  const [theme, setTheme] = useState("system");
  const [systemDark, setSystemDark] = useState(false);

  const [ports, setPorts] = useState([]);
  const [boards, setBoards] = useState([]);
  const [boardQuery, setBoardQuery] = useState("");

  const [extensionQuery, setExtensionQuery] = useState("");
  const [extensions, setExtensions] = useState([]);
  const [extBusy, setExtBusy] = useState(false);

  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);

  const isDark = theme === "dark" || (theme === "system" && systemDark);
  const bgClass = isDark ? "bg-slate-900 text-slate-100" : "bg-gray-100 text-gray-900";
  const panelClass = isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200";
  const inputClass = isDark
    ? "border-slate-600 bg-slate-900 text-slate-100"
    : "border-gray-300 bg-white text-gray-900";
  const mutedClass = isDark ? "text-slate-400" : "text-gray-500";

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

  const refreshExtensions = async (q = "") => {
    setExtBusy(true);
    try {
      const data = await api.searchExtensions(q);
      setExtensions(data);
    } catch (e) {
      appendLog(`Ошибка searchExtensions: ${String(e)}`);
    } finally {
      setExtBusy(false);
    }
  };

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.backgroundColor = isDark ? "#0f172a" : "#f3f4f6";
    document.body.style.backgroundColor = isDark ? "#0f172a" : "#f3f4f6";
  }, [isDark]);

  useEffect(() => {
    (async () => {
      try {
        const saved = await api.loadSession();
        if (saved?.project_path) setProjectPath(saved.project_path);
        if (saved?.fqbn) setFqbn(saved.fqbn);
        if (saved?.port) setPort(saved.port);
        if (saved?.theme) setTheme(saved.theme);
      } catch (e) {
        appendLog(`loadSession: ${String(e)}`);
      }
      await refreshPorts();
      await refreshBoards("");
      await refreshExtensions("");
    })();
  }, []);

  useEffect(() => {
    api
      .saveSession({
        project_path: projectPath || null,
        fqbn: fqbn || null,
        port: port || null,
        theme: theme || null,
      })
      .catch(() => {});
  }, [projectPath, fqbn, port, theme]);

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

  const onInstallExtension = async (id, latest) => {
    appendLog(`=== EXTENSION INSTALL START (${id}) ===`);
    const res = await api.installExtension(id, latest || null).catch((e) => ({
      success: false,
      stdout: "",
      stderr: String(e),
      status: -1,
    }));
    if (res.stdout) appendLog(res.stdout);
    if (res.stderr) appendLog(res.stderr);
    appendLog(`=== EXTENSION INSTALL END (${id}, status=${res.status}) ===`);
  };

  return (
    <div className={`fixed inset-0 flex flex-col ${bgClass}`}>
      <div className={`border-b ${panelClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2">
          <h1 className="text-lg font-semibold">Arduino CI</h1>
          <div className="flex flex-wrap gap-2">
            <button className={`px-3 py-1 border ${inputClass}`} onClick={() => setActivePage("main")}>
              Главная
            </button>
            <button
              className={`px-3 py-1 border ${inputClass}`}
              onClick={() => setActivePage("extensions")}
            >
              Extensions
            </button>
            <button
              className={`px-3 py-1 border ${inputClass}`}
              onClick={() => setActivePage("settings")}
            >
              Настройки
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto">
          {activePage === "main" && (
            <div className="flex flex-col gap-2 px-2 py-2">
              <div className="flex flex-wrap gap-2">
                <input
                  className={`flex-1 min-w-0 border px-2 py-1 ${inputClass}`}
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  placeholder="Путь к проекту"
                />
                <button className={`px-3 py-1 border ${inputClass}`} onClick={pickProject}>
                  Выбрать
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  className={`w-56 border px-2 py-1 ${inputClass}`}
                  value={boardQuery}
                  onChange={(e) => setBoardQuery(e.target.value)}
                  placeholder="Поиск платы"
                />
                <button
                  className={`px-3 py-1 border ${inputClass}`}
                  onClick={() => refreshBoards(boardQuery)}
                >
                  Найти
                </button>
              </div>

              <div>
                <select
                  className={`w-full max-w-[360px] border px-2 py-1 ${inputClass}`}
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

              <div className="flex flex-wrap gap-2">
                <select
                  className={`flex-1 min-w-0 max-w-[360px] border px-2 py-1 ${inputClass}`}
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

                <button className={`px-3 py-1 border shrink-0 ${inputClass}`} onClick={refreshPorts}>
                  Обновить порты
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={onCompile}
                  className="px-4 py-1 border bg-blue-600 text-white disabled:opacity-50"
                >
                  Compile
                </button>
                <button
                  disabled={busy}
                  onClick={onUpload}
                  className="px-4 py-1 border bg-green-600 text-white disabled:opacity-50"
                >
                  Upload
                </button>
              </div>
            </div>
          )}

          {activePage === "extensions" && (
            <div className="flex flex-col gap-2 px-2 py-2">
              <div className="text-sm font-semibold">Arduino extensions (cores)</div>
              <div className="flex gap-2">
                <input
                  className={`flex-1 border px-2 py-1 ${inputClass}`}
                  value={extensionQuery}
                  onChange={(e) => setExtensionQuery(e.target.value)}
                  placeholder="Поиск, например arduino"
                />
                <button
                  className={`px-3 py-1 border ${inputClass}`}
                  disabled={extBusy}
                  onClick={() => refreshExtensions(extensionQuery)}
                >
                  Найти
                </button>
              </div>

              <div className="space-y-2 overflow-auto">
                {extensions.map((ext) => (
                  <div key={ext.id} className={`border px-2 py-2 flex items-center justify-between ${inputClass}`}>
                    <div>
                      <div className="text-sm font-medium">{ext.name}</div>
                      <div className={`text-xs ${mutedClass}`}>
                        {ext.id}
                        {ext.latest ? ` (latest ${ext.latest})` : ""}
                      </div>
                    </div>
                    <button
                      className="px-3 py-1 border bg-indigo-600 text-white"
                      onClick={() => onInstallExtension(ext.id, ext.latest)}
                    >
                      Install
                    </button>
                  </div>
                ))}
                {!extensions.length && <div className={`text-sm ${mutedClass}`}>Ничего не найдено</div>}
              </div>
            </div>
          )}

          {activePage === "settings" && (
            <div className="flex flex-col gap-2 px-2 py-2">
              <div className="text-sm font-semibold">Тема</div>
              <select
                className={`w-56 border px-2 py-1 ${inputClass}`}
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          )}
        </div>

        {activePage === "main" && (
          <div className={`border-t ${panelClass}`}>
            <div className="flex items-center justify-between px-2 py-1">
              <div className="text-xs font-semibold">Логи</div>
              <button onClick={() => setLog("")} className={`px-3 py-1 text-xs border ${inputClass}`}>
                Clear log
              </button>
            </div>
            <textarea
              readOnly
              value={log}
              className="w-full h-[220px] border-0 border-t p-2 font-mono text-xs bg-black text-green-300 resize-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
