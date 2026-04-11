import React, { useState } from "react";

const ProjectSelector = ({ onProjectSelect }) => {
  const [projectPath, setProjectPath] = useState("");

  const handleBrowse = () => {
    // В будущем будет вызов Tauri API для выбора папки
    console.log("Выбор проекта...");
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow mb-4">
      <h2 className="text-xl font-semibold mb-2">Выбор проекта</h2>
      <div className="flex gap-2">
        <input
          type="text"
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
          placeholder="Путь к проекту"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button
          onClick={handleBrowse}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Обзор
        </button>
      </div>
      {projectPath && (
        <button
          onClick={() => onProjectSelect(projectPath)}
          className="mt-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Открыть проект
        </button>
      )}
    </div>
  );
};

export default ProjectSelector;
