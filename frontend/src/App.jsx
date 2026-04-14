import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api/arduinoCli";
import { runCliJob } from "./utils/runCliJob";
import AppHeader from "./components/AppHeader";
import MainTab from "./components/MainTab";
import LibsTab from "./components/LibsTab";
import SerialTab from "./components/SerialTab";
import SettingsTab from "./components/SettingsTab";
import LogPanel from "./components/LogPanel";

const LIBS_CACHE_KEY = "arduino_ci_installed_libs_v1";
const normalizeTheme = (value) => {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  if (v === "dark" || v === "light" || v === "system") return v;
  return "system";
};

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
  const [libsSyncing, setLibsSyncing] = useState(false);
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

  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);

  const serialOutputRef = useRef(null);
  const logOutputRef = useRef(null);

  const safeTheme = normalizeTheme(theme);
  const isDark = safeTheme === "dark" || (safeTheme === "system" && systemDark);
  const bgClass = isDark ? "bg-slate-950 text-slate-100" : "bg-slate-100 text-slate-900";
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
  const tabClass = (key) => (activePage === key ? activeTabClass : idleTabClass);

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
      setPorts(await api.listPorts());
    } catch (e) {
      appendLog(`Ошибка listPorts: ${String(e)}`);
    }
  };

  const refreshBoards = async (q = "") => {
    try {
      setBoards(await api.listBoards(q));
    } catch (e) {
      appendLog(`Ошибка listBoards: ${String(e)}`);
    }
  };

  const refreshLibraries = async (q = "") => {
    setLibsBusy(true);
    try {
      setLibraries(await api.searchLibraries(q));
    } catch (e) {
      appendLog(`Ошибка searchLibraries: ${String(e)}`);
    } finally {
      setLibsBusy(false);
    }
  };

  const refreshInstalledLibraries = async (forceRefresh = false) => {
    setLibsSyncing(true);
    try {
      const data = await api.listLibraries(forceRefresh);
      setInstalledLibraries(data);
      localStorage.setItem(LIBS_CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      appendLog(`Ошибка listLibraries: ${String(e)}`);
    } finally {
      setLibsSyncing(false);
    }
  };

  const refreshCores = async () => {
    setCoreBusy(true);
    try {
      setCores(await api.searchExtensions(""));
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
    document.documentElement.style.backgroundColor = isDark ? "#020617" : "#f1f5f9";
    document.body.style.backgroundColor = isDark ? "#020617" : "#f1f5f9";
  }, [isDark]);

  useEffect(() => {
    if (theme !== safeTheme) {
      setTheme(safeTheme);
    }
  }, [theme, safeTheme]);

  useEffect(() => {
    (async () => {
      try {
        const saved = await api.loadSession();
        if (saved?.project_path) setProjectPath(saved.project_path);
        if (saved?.fqbn) setFqbn(saved.fqbn);
        if (saved?.port) setPort(saved.port);
        if (saved?.theme) setTheme(normalizeTheme(saved.theme));
      } catch (e) {
        appendLog(`loadSession: ${String(e)}`);
      }
    })();

    try {
      const cached = localStorage.getItem(LIBS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) setInstalledLibraries(parsed);
      }
    } catch {
      // ignore corrupted local cache
    }

    refreshPorts();
    refreshBoards("");
    refreshLibraries("");
    refreshInstalledLibraries(true);
    refreshCores();
    refreshSerialStatus();
  }, []);

  useEffect(() => {
    api
      .saveSession({
        project_path: projectPath || null,
        fqbn: fqbn || null,
        port: port || null,
        theme: safeTheme || null,
      })
      .catch(() => {});
  }, [projectPath, fqbn, port, safeTheme]);

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
    try {
      await runCliJob({
        api,
        args: ["compile", "--fqbn", fqbn, projectPath],
        appendLog,
        startLine: "=== COMPILE START ===",
        endLine: (code) => `=== COMPILE END (status=${code}) ===`,
      });
    } catch (e) {
      appendLog(`Ошибка compile: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async () => {
    if (!projectPath || !fqbn || !port) {
      appendLog("Для upload нужны projectPath, fqbn и port");
      return;
    }
    setBusy(true);
    try {
      await runCliJob({
        api,
        args: ["upload", "-p", port, "--fqbn", fqbn, projectPath],
        appendLog,
        startLine: "=== UPLOAD START ===",
        endLine: (code) => `=== UPLOAD END (status=${code}) ===`,
      });
    } catch (e) {
      appendLog(`Ошибка upload: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const onInstallLibrary = async (name, _latest) => {
    if (libActionBusy) return;
    setLibActionBusy(true);
    try {
      await runCliJob({
        api,
        args: ["lib", "install", name],
        appendLog,
        startLine: `=== LIB INSTALL START (${name}) ===`,
        endLine: (code) => `=== LIB INSTALL END (${name}, status=${code}) ===`,
      });
      await refreshInstalledLibraries(true);
    } catch (e) {
      appendLog(`Ошибка lib install: ${String(e)}`);
    } finally {
      setLibActionBusy(false);
    }
  };

  const onUninstallLibrary = async (name) => {
    if (libActionBusy) return;
    setLibActionBusy(true);
    try {
      await runCliJob({
        api,
        args: ["lib", "uninstall", name],
        appendLog,
        startLine: `=== LIB UNINSTALL START (${name}) ===`,
        endLine: (code) => `=== LIB UNINSTALL END (${name}, status=${code}) ===`,
      });
      await refreshInstalledLibraries(true);
    } catch (e) {
      appendLog(`Ошибка lib uninstall: ${String(e)}`);
    } finally {
      setLibActionBusy(false);
    }
  };

  const onInstallCore = async () => {
    if (!selectedCoreId || coreInstallBusy) return;
    setCoreInstallBusy(true);
    try {
      await runCliJob({
        api,
        args: ["core", "install", selectedCoreId],
        appendLog,
        startLine: `=== CORE INSTALL START (${selectedCoreId}) ===`,
        endLine: (code) =>
          `=== CORE INSTALL END (${selectedCoreId}, status=${code}) ===`,
      });
    } catch (e) {
      appendLog(`Ошибка core install: ${String(e)}`);
    } finally {
      setCoreInstallBusy(false);
    }
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
      <AppHeader
        activePage={activePage}
        setActivePage={setActivePage}
        tabClass={tabClass}
        outlineBtnClass={outlineBtnClass}
        onMinimizeToTray={onMinimizeToTray}
        mutedClass={mutedClass}
        softCardClass={softCardClass}
      />

      <div className={`${softCardClass} flex flex-1 min-h-0 flex-col overflow-hidden`}>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {activePage === "main" && (
            <MainTab
              inputClass={inputClass}
              outlineBtnClass={outlineBtnClass}
              projectPath={projectPath}
              setProjectPath={setProjectPath}
              boardQuery={boardQuery}
              setBoardQuery={setBoardQuery}
              refreshBoards={refreshBoards}
              pickProject={pickProject}
              boards={boards}
              fqbn={fqbn}
              setFqbn={setFqbn}
              ports={ports}
              port={port}
              setPort={setPort}
              refreshPorts={refreshPorts}
            />
          )}

          {activePage === "libs" && (
            <LibsTab
              inputClass={inputClass}
              outlineBtnClass={outlineBtnClass}
              softCardClass={softCardClass}
              mutedClass={mutedClass}
              libQuery={libQuery}
              setLibQuery={setLibQuery}
              libsBusy={libsBusy}
              libsSyncing={libsSyncing}
              libActionBusy={libActionBusy}
              refreshLibraries={refreshLibraries}
              refreshInstalledLibraries={refreshInstalledLibraries}
              libraries={libraries}
              installedLibSet={installedLibSet}
              onInstallLibrary={onInstallLibrary}
              onUninstallLibrary={onUninstallLibrary}
            />
          )}

          {activePage === "serial" && (
            <SerialTab
              inputClass={inputClass}
              outlineBtnClass={outlineBtnClass}
              serialPort={serialPort}
              setSerialPort={setSerialPort}
              ports={ports}
              serialBaud={serialBaud}
              setSerialBaud={setSerialBaud}
              refreshPorts={refreshPorts}
              serialRunning={serialRunning}
              serialBusy={serialBusy}
              onSerialStart={onSerialStart}
              onSerialStop={onSerialStop}
              serialOutputRef={serialOutputRef}
              serialOutput={serialOutput}
              setSerialOutput={setSerialOutput}
              mutedClass={mutedClass}
              serialInput={serialInput}
              setSerialInput={setSerialInput}
              serialAddNewline={serialAddNewline}
              setSerialAddNewline={setSerialAddNewline}
              onSerialSend={onSerialSend}
            />
          )}

          {activePage === "settings" && (
            <SettingsTab
              inputClass={inputClass}
              isDark={isDark}
              theme={safeTheme}
              setTheme={(next) => setTheme(normalizeTheme(next))}
              cores={cores}
              selectedCoreId={selectedCoreId}
              setSelectedCoreId={setSelectedCoreId}
              coreBusy={coreBusy}
              coreInstallBusy={coreInstallBusy}
              refreshCores={refreshCores}
              onInstallCore={onInstallCore}
              outlineBtnClass={outlineBtnClass}
            />
          )}
        </div>

        {activePage === "main" && (
          <LogPanel
            logOutputRef={logOutputRef}
            log={log}
            setLog={setLog}
            outlineBtnClass={outlineBtnClass}
            busy={busy}
            onCompile={onCompile}
            onUpload={onUpload}
          />
        )}
      </div>
    </div>
  );
}

export default App;
