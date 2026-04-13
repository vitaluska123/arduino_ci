import React from "react";

export default function MainTab({
  inputClass,
  outlineBtnClass,
  projectPath,
  setProjectPath,
  boardQuery,
  setBoardQuery,
  refreshBoards,
  pickProject,
  boards,
  fqbn,
  setFqbn,
  ports,
  port,
  setPort,
  refreshPorts,
}) {
  return (
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
        <button className={outlineBtnClass} onClick={() => refreshBoards(boardQuery)}>
          Найти
        </button>
      </div>

      <div className="flex flex-col gap-2">
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
  );
}
