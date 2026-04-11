import React, { useState } from "react";

const LibraryManager = () => {
  const [libraries, setLibraries] = useState([
    { name: "ArduinoJson", version: "6.21.0", installed: true },
    { name: "EEPROM", version: "2.0.0", installed: true },
    { name: "DHT sensor library", version: "1.4.4", installed: false }
  ]);
  const [searchTerm, setSearchTerm] = useState("");

  const handleInstall = (libraryName) => {
    console.log(`Установка библиотеки: ${libraryName}`);
    // В будущем будет вызов Tauri API
  };

  const handleUninstall = (libraryName) => {
    console.log(`Удаление библиотеки: ${libraryName}`);
    // В будущем будет вызов Tauri API
  };

  const filteredLibraries = libraries.filter(lib =>
    lib.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-2">Управление библиотеками</h2>
      
      <div className="mb-4">
        <input
          type="text"
          placeholder="Поиск библиотеки..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 border rounded"
        />
      </div>

      <div className="space-y-2">
        {filteredLibraries.map((lib) => (
          <div key={lib.name} className="flex justify-between items-center p-2 border rounded">
            <div>
              <span className="font-medium">{lib.name}</span>
              <span className="text-gray-500 text-sm ml-2">v{lib.version}</span>
            </div>
            <div className="flex gap-2">
              {lib.installed ? (
                <button
                  onClick={() => handleUninstall(lib.name)}
                  className="px-3 py-1 text-red-600 border border-red-600 rounded hover:bg-red-50"
                >
                  Удалить
                </button>
              ) : (
                <button
                  onClick={() => handleInstall(lib.name)}
                  className="px-3 py-1 text-green-600 border border-green-600 rounded hover:bg-green-50"
                >
                  Установить
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LibraryManager;
