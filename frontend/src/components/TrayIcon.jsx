import React from "react";

const TrayIcon = ({ onClick }) => {
  return (
    <div className="tray-icon" onClick={onClick}>
      {/* Заглушка для иконки в трее */}
      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
        <span className="text-white text-xs">Arduino</span>
      </div>
    </div>
  );
};

export default TrayIcon;
