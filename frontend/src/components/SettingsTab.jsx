import React from "react";

export default function SettingsTab({
  inputClass,
  isDark,
  theme,
  setTheme,
  cores,
  selectedCoreId,
  setSelectedCoreId,
  coreBusy,
  coreInstallBusy,
  refreshCores,
  onInstallCore,
  outlineBtnClass,
}) {
  return (
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

      <div className={`mt-2 border-t pt-3 ${isDark ? "border-slate-700" : "border-slate-300"}`}>
        <div className="mb-1 text-sm font-semibold">Наборы плат (arduino-cli core install)</div>
        <div className="flex flex-wrap gap-2">
          <select
            className={`w-full max-w-[440px] ${inputClass}`}
            value={selectedCoreId}
            onChange={(e) => setSelectedCoreId(e.target.value)}
          >
            {!cores.length && <option value="">Нет доступных наборов плат</option>}
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
  );
}
