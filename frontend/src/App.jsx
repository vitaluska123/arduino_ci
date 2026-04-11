import React, { useEffect, useMemo, useRef, useState } from "react";
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

  const [libQuery, setLibQuery] = useState("");
  const [libraries, setLibraries] = useState([]);
  const [installedLibraries, setInstalledLibraries] = useState([]);
  const [libsBusy, setLibsBusy] = useState(false);
  const [libActionBusy, setLibActionBusy] = useState(false);

  const [cores, setCores] = useState([]);
  const [selectedCoreId, setSelectedCoreId] = useState("");
  const [coreBusy, setCoreBusy] = useState(false);
  const [coreInstallBusy, setCoreInstallBusy] = useState(false);

  const [serialPort, setSerialPort] = useState("");
  const [serialBaud, setSerialBaud] = useState("115200");
  const [serialRunning, setSerialRunning] = useState(false);
  const [serialBusy, setSerialBusy] = useState(false);
  const [serialOutput, setSerialOutput] = useState("");
  const [serialInput, setSerialInput] = useState("");
  const [serialAddNewline, setSerialAddNewline] = useState(true);
  const serialOutputRef = useRef(null);
  const logOutputRef = useRef(null);

  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);

  const isDark = theme === "dark" || (theme === "system" && systemDark);
  const bgClass = isDark
    ? "bg-slate-950 text-slate-100"
    : "bg-slate-100 text-slate-900";
  const inputClass = isDark
    ? "h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-slate-100"
    : "h-10 rounded-xl border border-slate-300 bg-white px-3 text-slate-900";
  const mutedClass = isDark ? "text-slate-400" : "text-slate-500";
  const softCardClass = isDark
    ? "rounded-2xl border border-slate-700 bg-slate-900/85"
    : "rounded-2xl border border-slate-200 bg-white/95";
  const outlineBtnClass = isDark
    ? "h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-slate-100 hover:bg-slate-800"
    : "h-10 rounded-xl border border-slate-300 bg-white px-3 text-slate-900 hover:bg-slate-50";
  const activeTabClass =
    "h-10 rounded-xl border border-indigo-500 bg-indigo-600 px-3 text-white";
  const idleTabClass = isDark
    ? "h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-slate-100 hover:bg-slate-800"
    : "h-10 rounded-xl border border-slate-300 bg-white px-3 text-slate-900 hover:bg-slate-50";
  const tabClass = (key) =>
    activePage === key ? activeTabClass : idleTabClass;

  const installedLibSet = useMemo(
    () => new Set(installedLibraries.map((x) => x.name.toLowerCase())),
    [installedLibraries],
  );

  const appendLog = (text) => {
    setLog((prev) => `${prev}${prev ? "\n" : ""}${text}`);
  };

  const appendSerial = (text) => {
    setSerialOutput((prev) => `${prev}${text}`);
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

  const refreshLibraries = async (q = "") => {
    setLibsBusy(true);
    try {
      const data = await api.searchLibraries(q);
      setLibraries(data);
    } catch (e) {
      appendLog(`Ошибка searchLibraries: ${String(e)}`);
    } finally {
      setLibsBusy(false);
    }
  };

  const refreshInstalledLibraries = async () => {
    try {
      const data = await api.listLibraries();
      setInstalledLibraries(data);
    } catch (e) {
      appendLog(`Ошибка listLibraries: ${String(e)}`);
    }
  };

  const refreshCores = async () => {
    setCoreBusy(true);
    try {
      const data = await api.searchExtensions("");
      setCores(data);
    } catch (e) {
      appendLog(`Ошибка core_search: ${String(e)}`);
    } finally {
      setCoreBusy(false);
    }
  };

  const refreshSerialStatus = async () => {
    try {
      const status = await api.serialStatus();
      setSerialRunning(Boolean(status?.running));
      if (status?.port) setSerialPort(status.port);
      if (status?.baud_rate) setSerialBaud(String(status.baud_rate));
    } catch (e) {
      appendLog(`Ошибка serialStatus: ${String(e)}`);
    }
  };

  useEffect(() => {
    if (!cores.length) {
      setSelectedCoreId("");
      return;
    }
    if (!selectedCoreId || !cores.some((x) => x.id === selectedCoreId)) {
      setSelectedCoreId(cores[0].id);
    }
  }, [cores, selectedCoreId]);

  useEffect(() => {
    if (port && !serialPort) setSerialPort(port);
  }, [port, serialPort]);

  useEffect(() => {
    const node = serialOutputRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [serialOutput]);

  useEffect(() => {
    const node = logOutputRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [log]);

  useEffect(() => {
    if (!serialRunning) return undefined;
    const tick = async () => {
      try {
        const data = await api.serialTakeOutput();
        if (data) appendSerial(String(data));
      } catch {
        // ignore polling errors while serial transitions
      }
    };
    tick();
    const id = setInterval(tick, 120);
    return () => clearInterval(id);
  }, [serialRunning]);

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
    document.documentElement.style.backgroundColor = isDark
      ? "#020617"
      : "#f1f5f9";
    document.body.style.backgroundColor = isDark ? "#020617" : "#f1f5f9";
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
      await refreshLibraries("");
      await refreshInstalledLibraries();
      await refreshCores();
      await refreshSerialStatus();
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

  const onInstallLibrary = async (name, latest) => {
    if (libActionBusy) return;
    setLibActionBusy(true);
    appendLog(`=== LIB INSTALL START (${name}) ===`);
    const res = await api.installLibrary(name, latest || null).catch((e) => ({
      success: false,
      stdout: "",
      stderr: String(e),
      status: -1,
    }));
    if (res.stdout) appendLog(res.stdout);
    if (res.stderr) appendLog(res.stderr);
    appendLog(`=== LIB INSTALL END (${name}, status=${res.status}) ===`);
    await refreshInstalledLibraries();
    setLibActionBusy(false);
  };

  const onUninstallLibrary = async (name) => {
    if (libActionBusy) return;
    setLibActionBusy(true);
    appendLog(`=== LIB UNINSTALL START (${name}) ===`);
    const res = await api.uninstallLibrary(name).catch((e) => ({
      success: false,
      stdout: "",
      stderr: String(e),
      status: -1,
    }));
    if (res.stdout) appendLog(res.stdout);
    if (res.stderr) appendLog(res.stderr);
    appendLog(`=== LIB UNINSTALL END (${name}, status=${res.status}) ===`);
    await refreshInstalledLibraries();
    setLibActionBusy(false);
  };

  const onInstallCore = async () => {
    if (!selectedCoreId || coreInstallBusy) return;
    setCoreInstallBusy(true);
    appendLog(`=== CORE INSTALL START (${selectedCoreId}) ===`);
    const res = await api.installExtension(selectedCoreId, null).catch((e) => ({
      success: false,
      stdout: "",
      stderr: String(e),
      status: -1,
    }));
    if (res.stdout) appendLog(res.stdout);
    if (res.stderr) appendLog(res.stderr);
    appendLog(
      `=== CORE INSTALL END (${selectedCoreId}, status=${res.status}) ===`,
    );
    setCoreInstallBusy(false);
  };

  const onSerialStart = async () => {
    if (!serialPort) {
      appendSerial("\n[serial] Выбери COM-порт\n");
      return;
    }
    setSerialBusy(true);
    try {
      await api.serialStart(serialPort, Number(serialBaud));
      setSerialRunning(true);
      appendSerial(`\n[serial] started ${serialPort} @ ${serialBaud}\n`);
    } catch (e) {
      appendSerial(`\n[serial] start error: ${String(e)}\n`);
      setSerialRunning(false);
    } finally {
      setSerialBusy(false);
    }
  };

  const onSerialStop = async () => {
    setSerialBusy(true);
    try {
      await api.serialStop();
      const tail = await api.serialTakeOutput().catch(() => "");
      if (tail) appendSerial(String(tail));
      setSerialRunning(false);
      appendSerial("\n[serial] stopped\n");
    } catch (e) {
      appendSerial(`\n[serial] stop error: ${String(e)}\n`);
    } finally {
      setSerialBusy(false);
    }
  };

  const onSerialSend = async () => {
    if (!serialRunning) {
      appendSerial("\n[serial] не запущен\n");
      return;
    }
    if (!serialInput) return;
    const payload = serialAddNewline ? `${serialInput}\n` : serialInput;
    try {
      await api.serialSend(payload);
      setSerialInput("");
    } catch (e) {
      appendSerial(`\n[serial] send error: ${String(e)}\n`);
    }
  };

  const onMinimizeToTray = async () => {
    try {
      await api.hideMainWindow();
    } catch (e) {
      appendLog(`Ошибка сворачивания окна: ${String(e)}`);
    }
  };

  return (
    <div className={`fixed inset-0 flex flex-col gap-3 p-3 ${bgClass}`}>
      <div className={`${softCardClass} px-3 py-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Arduino CI</h1>
            <div className={`text-xs ${mutedClass}`}>
              Build, upload, libs and serial monitor
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className={tabClass("main")}
              onClick={() => setActivePage("main")}
            >
              Главная
            </button>
            <button
              className={tabClass("libs")}
              onClick={() => setActivePage("libs")}
            >
              Libs
            </button>
            <button
              className={tabClass("serial")}
              onClick={() => setActivePage("serial")}
            >
              Serial
            </button>
            <button
              className={tabClass("settings")}
              onClick={() => setActivePage("settings")}
            >
              Настройки
            </button>
            <button
              className={outlineBtnClass}
              onClick={onMinimizeToTray}
              title="Свернуть в трей"
            >
              —
            </button>
          </div>
        </div>
      </div>

      <div
        className={`${softCardClass} flex flex-1 min-h-0 flex-col overflow-hidden`}
      >
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {activePage === "main" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <input
                  className={`min-w-0 flex-1 ${inputClass}`}
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  placeholder="Путь к проекту"
                />
                <button className={outlineBtnClass} onClick={pickProject}>
                  Выбрать
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  className={`w-56 ${inputClass}`}
                  value={boardQuery}
                  onChange={(e) => setBoardQuery(e.target.value)}
                  placeholder="Поиск платы"
                />
                <button
                  className={outlineBtnClass}
                  onClick={() => refreshBoards(boardQuery)}
                >
                  Найти
                </button>
              </div>

              <div>
                <select
                  className={`w-full max-w-[440px] ${inputClass}`}
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
                  className={`min-w-0 max-w-[440px] flex-1 ${inputClass}`}
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
                <button className={outlineBtnClass} onClick={refreshPorts}>
                  Обновить порты
                </button>
              </div>
            </div>
          )}

          {activePage === "libs" && (
            <div className="flex h-full min-h-0 flex-col gap-3">
              <div className="text-sm font-semibold">
                Библиотеки (arduino-cli lib)
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  className={`flex-1 ${inputClass}`}
                  value={libQuery}
                  onChange={(e) => setLibQuery(e.target.value)}
                  placeholder="Поиск библиотеки"
                />
                <button
                  className={outlineBtnClass}
                  disabled={libsBusy || libActionBusy}
                  onClick={() => refreshLibraries(libQuery)}
                >
                  Поиск
                </button>
                <button
                  className={outlineBtnClass}
                  disabled={libActionBusy}
                  onClick={refreshInstalledLibraries}
                >
                  Обновить установленные
                </button>
              </div>

              <div className="flex-1 min-h-0 space-y-2 overflow-y-auto">
                {libraries.map((lib) => {
                  const installed = installedLibSet.has(
                    (lib.name || "").toLowerCase(),
                  );
                  return (
                    <div
                      key={lib.name}
                      className={`${softCardClass} flex items-center justify-between px-3 py-3`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {lib.name}
                        </div>
                        <div className={`text-xs ${mutedClass}`}>
                          {lib.latest ? `latest ${lib.latest}` : "version ?"}
                        </div>
                      </div>
                      {installed ? (
                        <button
                          className="h-10 rounded-xl border border-red-500 bg-red-600 px-3 text-white disabled:opacity-50"
                          disabled={libActionBusy}
                          onClick={() => onUninstallLibrary(lib.name)}
                        >
                          Uninstall
                        </button>
                      ) : (
                        <button
                          className="h-10 rounded-xl border border-indigo-500 bg-indigo-600 px-3 text-white disabled:opacity-50"
                          disabled={libActionBusy}
                          onClick={() => onInstallLibrary(lib.name, lib.latest)}
                        >
                          Install
                        </button>
                      )}
                    </div>
                  );
                })}
                {!libraries.length && (
                  <div className={`text-sm ${mutedClass}`}>
                    Ничего не найдено
                  </div>
                )}
              </div>
            </div>
          )}

          {activePage === "serial" && (
            <div className="flex h-full min-h-0 flex-col gap-3">
              <div className="text-sm font-semibold">Serial Monitor</div>
              <div className="flex flex-wrap gap-2">
                <select
                  className={`min-w-[140px] ${inputClass}`}
                  value={serialPort}
                  onChange={(e) => setSerialPort(e.target.value)}
                >
                  <option value="">Порт</option>
                  {ports.map((p) => (
                    <option key={p.address} value={p.address}>
                      {p.address}
                    </option>
                  ))}
                </select>
                <select
                  className={`min-w-[120px] ${inputClass}`}
                  value={serialBaud}
                  onChange={(e) => setSerialBaud(e.target.value)}
                >
                  {["9600", "19200", "38400", "57600", "115200", "230400"].map(
                    (b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ),
                  )}
                </select>
                <button className={outlineBtnClass} onClick={refreshPorts}>
                  Обновить порты
                </button>
                {!serialRunning ? (
                  <button
                    className="h-10 rounded-xl border border-emerald-500 bg-emerald-600 px-3 text-white disabled:opacity-50"
                    disabled={serialBusy || !serialPort}
                    onClick={onSerialStart}
                  >
                    {serialBusy ? "Запуск..." : "Start"}
                  </button>
                ) : (
                  <button
                    className="h-10 rounded-xl border border-red-500 bg-red-600 px-3 text-white disabled:opacity-50"
                    disabled={serialBusy}
                    onClick={onSerialStop}
                  >
                    {serialBusy ? "Остановка..." : "Stop"}
                  </button>
                )}
                <button
                  className={outlineBtnClass}
                  onClick={() => setSerialOutput("")}
                >
                  Clear
                </button>
                <span className={`self-center text-xs ${mutedClass}`}>
                  {serialRunning
                    ? `RUNNING ${serialPort}@${serialBaud}`
                    : "STOPPED"}
                </span>
              </div>

              <textarea
                ref={serialOutputRef}
                readOnly
                value={serialOutput}
                className="min-h-0 w-full flex-1 resize-none overflow-y-auto rounded-2xl border border-slate-700 bg-black p-3 font-mono text-xs text-green-300"
              />

              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={`min-w-[200px] flex-1 ${inputClass}`}
                  value={serialInput}
                  onChange={(e) => setSerialInput(e.target.value)}
                  placeholder="Данные для отправки"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onSerialSend();
                    }
                  }}
                />
                <label className={`text-xs ${mutedClass}`}>
                  <input
                    type="checkbox"
                    checked={serialAddNewline}
                    onChange={(e) => setSerialAddNewline(e.target.checked)}
                    className="mr-1"
                  />
                  \n
                </label>
                <button
                  className="h-10 rounded-xl border border-indigo-500 bg-indigo-600 px-3 text-white disabled:opacity-50"
                  disabled={!serialRunning || !serialInput}
                  onClick={onSerialSend}
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {activePage === "settings" && (
            <div className="flex flex-col gap-3">
              <div className="text-sm font-semibold">Тема</div>
              <select
                className={`w-56 ${inputClass}`}
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>

              <div
                className={`mt-2 border-t pt-3 ${isDark ? "border-slate-700" : "border-slate-300"}`}
              >
                <div className="mb-1 text-sm font-semibold">
                  Наборы плат (arduino-cli core install)
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    className={`w-full max-w-[440px] ${inputClass}`}
                    value={selectedCoreId}
                    onChange={(e) => setSelectedCoreId(e.target.value)}
                  >
                    {!cores.length && (
                      <option value="">Нет доступных наборов плат</option>
                    )}
                    {cores.map((core) => (
                      <option key={core.id} value={core.id}>
                        {core.name} — {core.id}
                      </option>
                    ))}
                  </select>
                  <button
                    className={outlineBtnClass}
                    disabled={coreBusy || coreInstallBusy}
                    onClick={refreshCores}
                  >
                    Обновить список
                  </button>
                  <button
                    className="h-10 rounded-xl border border-indigo-500 bg-indigo-600 px-3 text-white disabled:opacity-50"
                    disabled={!selectedCoreId || coreInstallBusy}
                    onClick={onInstallCore}
                  >
                    {coreInstallBusy ? "Установка..." : "Установить набор плат"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {activePage === "main" && (
          <div className="border-t border-slate-700/40 p-3 pt-2">
            <div className="mb-2 flex items-center justify-between">
              {/* <div className="text-xs font-semibold">Логи</div>*/}
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={onCompile}
                  className="h-10 rounded-xl border border-indigo-500 bg-indigo-600 px-4 text-white disabled:opacity-50"
                >
                  Compile
                </button>
                <button
                  disabled={busy}
                  onClick={onUpload}
                  className="h-10 rounded-xl border border-emerald-500 bg-emerald-600 px-4 text-white disabled:opacity-50"
                >
                  Upload
                </button>
              </div>
              <button onClick={() => setLog("")} className={outlineBtnClass}>
                Clear log
              </button>
            </div>
            <textarea
              ref={logOutputRef}
              readOnly
              value={log}
              className="h-[220px] w-full resize-none rounded-2xl border border-slate-700 bg-black p-3 font-mono text-xs text-green-300"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
