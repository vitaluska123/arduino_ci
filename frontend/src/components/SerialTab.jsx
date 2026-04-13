import React from "react";

export default function SerialTab({
  inputClass,
  outlineBtnClass,
  serialPort,
  setSerialPort,
  ports,
  serialBaud,
  setSerialBaud,
  refreshPorts,
  serialRunning,
  serialBusy,
  onSerialStart,
  onSerialStop,
  serialOutputRef,
  serialOutput,
  setSerialOutput,
  mutedClass,
  serialInput,
  setSerialInput,
  serialAddNewline,
  setSerialAddNewline,
  onSerialSend,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="text-sm font-semibold">Serial Monitor</div>
      <div className="flex flex-wrap gap-2">
        <select
          className={`min-w-[140px] ${inputClass}`}
          value={serialPort}
          onChange={(e) => setSerialPort(e.target.value)}
        >
          <option value="">Порт</option>
          {ports.map((p) => (
            <option key={p.address} value={p.address}>
              {p.address}
            </option>
          ))}
        </select>
        <select
          className={`min-w-[120px] ${inputClass}`}
          value={serialBaud}
          onChange={(e) => setSerialBaud(e.target.value)}
        >
          {["9600", "19200", "38400", "57600", "115200", "230400"].map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <button className={outlineBtnClass} onClick={refreshPorts}>
          Обновить порты
        </button>
        {!serialRunning ? (
          <button
            className="h-10 rounded-xl border border-emerald-500 bg-emerald-600 px-3 text-white disabled:opacity-50"
            disabled={serialBusy || !serialPort}
            onClick={onSerialStart}
          >
            {serialBusy ? "Запуск..." : "Start"}
          </button>
        ) : (
          <button
            className="h-10 rounded-xl border border-red-500 bg-red-600 px-3 text-white disabled:opacity-50"
            disabled={serialBusy}
            onClick={onSerialStop}
          >
            {serialBusy ? "Остановка..." : "Stop"}
          </button>
        )}
        <button className={outlineBtnClass} onClick={() => setSerialOutput("")}>
          Clear
        </button>
        <span className={`self-center text-xs ${mutedClass}`}>
          {serialRunning ? `RUNNING ${serialPort}@${serialBaud}` : "STOPPED"}
        </span>
      </div>

      <textarea
        ref={serialOutputRef}
        readOnly
        value={serialOutput}
        className="min-h-0 w-full flex-1 resize-none overflow-y-auto rounded-2xl border border-slate-700 bg-black p-3 font-mono text-xs text-green-300"
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`min-w-[200px] flex-1 ${inputClass}`}
          value={serialInput}
          onChange={(e) => setSerialInput(e.target.value)}
          placeholder="Данные для отправки"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSerialSend();
            }
          }}
        />
        <label className={`text-xs ${mutedClass}`}>
          <input
            type="checkbox"
            checked={serialAddNewline}
            onChange={(e) => setSerialAddNewline(e.target.checked)}
            className="mr-1"
          />
          \n
        </label>
        <button
          className="h-10 rounded-xl border border-indigo-500 bg-indigo-600 px-3 text-white disabled:opacity-50"
          disabled={!serialRunning || !serialInput}
          onClick={onSerialSend}
        >
          Send
        </button>
      </div>
    </div>
  );
}
