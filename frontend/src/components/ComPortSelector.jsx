import React, { useState, useEffect } from "react";

const ComPortSelector = ({ onPortSelect }) => {
  const [ports, setPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState("");

  useEffect(() => {
    // В будущем будет вызов Tauri API для получения списка портов
    setPorts([
      { path: "COM1", productId: "0x0000", vendorId: "0x0000", manufacturer: "N/A", serialNumber: "N/A" },
      { path: "COM3", productId: "0x804E", vendorId: "0x2341", manufacturer: "Arduino LLC", serialNumber: "N/A" },
      { path: "COM5", productId: "0x02D5", vendorId: "0x16C0", manufacturer: "SparkFun", serialNumber: "N/A" }
    ]);
  }, []);

  const handlePortChange = (e) => {
    setSelectedPort(e.target.value);
    if (onPortSelect) {
      onPortSelect(e.target.value);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-2">Выбор COM-порта</h2>
      <select
        value={selectedPort}
        onChange={handlePortChange}
        className="w-full px-3 py-2 border rounded"
      >
        <option value="">--Выберите порт--</option>
        {ports.map((port) => (
          <option key={port.path} value={port.path}>
            {port.path} - {port.manufacturer || "Unknown"}
          </option>
        ))}
      </select>
    </div>
  );
};

export default ComPortSelector;
