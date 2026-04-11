import React, { useState } from "react";
import ProjectSelector from "./ProjectSelector";
import ComPortSelector from "./ComPortSelector";
import LibraryManager from "./LibraryManager";

const MainWindow = ({ onOpenProject, onSelectPort }) => {
  const [activeTab, setActiveTab] = useState("project");

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      <div className="flex gap-2 mb-4">
        <button
          className={`px-4 py-2 rounded ${activeTab === "project" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("project")}
        >
          Проект
        </button>
        <button
          className={`px-4 py-2 rounded ${activeTab === "port" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("port")}
        >
          COM-порт
        </button>
        <button
          className={`px-4 py-2 rounded ${activeTab === "libraries" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("libraries")}
        >
          Библиотеки
        </button>
      </div>

      <div className="border rounded p-4 min-h-[300px]">
        {activeTab === "project" && <ProjectSelector onProjectSelect={onOpenProject} />}
        {activeTab === "port" && <ComPortSelector onPortSelect={onSelectPort} />}
        {activeTab === "libraries" && <LibraryManager />}
      </div>
    </div>
  );
};

export default MainWindow;
