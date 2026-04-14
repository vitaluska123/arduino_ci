import React from "react";

export default function AppHeader({
  activePage,
  setActivePage,
  tabClass,
  outlineBtnClass,
  onMinimizeToTray,
  mutedClass,
  softCardClass,
}) {
  const headerClass = softCardClass || "rounded-2xl border border-slate-200 bg-white/95";
  return (
    <div className={`${headerClass} px-3 py-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Arduino CI</h1>
          <div className={`text-xs ${mutedClass}`}>
            Build, upload, libs and serial monitor
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className={tabClass("main")} onClick={() => setActivePage("main")}>
            Главная
          </button>
          <button className={tabClass("libs")} onClick={() => setActivePage("libs")}>
            Libs
          </button>
          <button className={tabClass("serial")} onClick={() => setActivePage("serial")}>
            Serial
          </button>
          <button className={tabClass("settings")} onClick={() => setActivePage("settings")}>
            Настройки
          </button>
          <button className={outlineBtnClass} onClick={onMinimizeToTray} title="Свернуть в трей">
            —
          </button>
        </div>
      </div>
    </div>
  );
}
