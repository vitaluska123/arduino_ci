import React, { useState } from "react";
import MainWindow from "./components/MainWindow";

function App() {
  const [currentProject, setCurrentProject] = useState("");
  const [currentPort, setCurrentPort] = useState("");

  const handleOpenProject = (path) => {
    setCurrentProject(path);
    console.log("Открыт проект:", path);
  };

  const handleSelectPort = (port) => {
    setCurrentPort(port);
    console.log("Выбран порт:", port);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-600 text-white p-4">
        <h1 className="text-2xl font-bold">Arduino CI</h1>
      </header>
      <main className="p-4">
        <MainWindow onOpenProject={handleOpenProject} onSelectPort={handleSelectPort} />
      </main>
    </div>
  );
}

export default App;
