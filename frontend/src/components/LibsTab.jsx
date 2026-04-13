import React from "react";

export default function LibsTab({
  inputClass,
  outlineBtnClass,
  softCardClass,
  mutedClass,
  libQuery,
  setLibQuery,
  libsBusy,
  libsSyncing,
  libActionBusy,
  refreshLibraries,
  refreshInstalledLibraries,
  libraries,
  installedLibSet,
  onInstallLibrary,
  onUninstallLibrary,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="text-sm font-semibold">Библиотеки (arduino-cli lib)</div>
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
          disabled={libsSyncing || libActionBusy}
          onClick={() => refreshInstalledLibraries(true)}
        >
          {libsSyncing ? "Синхронизация..." : "Обновить установленные"}
        </button>
      </div>

      <div className={`text-xs ${mutedClass}`}>
        {libsSyncing ? "Список установленных библиотек обновляется в фоне" : " "}
      </div>

      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto">
        {libraries.map((lib) => {
          const installed = installedLibSet.has((lib.name || "").toLowerCase());
          return (
            <div
              key={lib.name}
              className={`${softCardClass} flex items-center justify-between px-3 py-3`}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{lib.name}</div>
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
        {!libraries.length && <div className={`text-sm ${mutedClass}`}>Ничего не найдено</div>}
      </div>
    </div>
  );
}
