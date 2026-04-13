import React from "react";

export default function LogPanel({
  logOutputRef,
  log,
  setLog,
  outlineBtnClass,
  busy,
  onCompile,
  onUpload,
}) {
  return (
    <div className="border-t border-slate-700/40 p-3 pt-2">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={onCompile}
            className="h-10 rounded-xl border border-indigo-500 bg-indigo-600 px-4 text-white disabled:opacity-50"
          >
            Compile
          </button>
          <button
            disabled={busy}
            onClick={onUpload}
            className="h-10 rounded-xl border border-emerald-500 bg-emerald-600 px-4 text-white disabled:opacity-50"
          >
            Upload
          </button>
        </div>
        <button onClick={() => setLog("")} className={outlineBtnClass}>
          Clear log
        </button>
      </div>
      <textarea
        ref={logOutputRef}
        readOnly
        value={log}
        className="h-[220px] w-full resize-none rounded-2xl border border-slate-700 bg-black p-3 font-mono text-xs text-green-300"
      />
    </div>
  );
}
