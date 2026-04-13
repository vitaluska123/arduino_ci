export async function runCliJob({
  args,
  api,
  appendLog,
  startLine,
  endLine,
  pollMs = 120,
}) {
  if (startLine) appendLog(startLine);
  const started = await api.cliJobStart(args);
  const jobId = started?.job_id;
  if (!jobId) {
    throw new Error("Не удалось получить job id");
  }

  try {
    while (true) {
      const chunk = await api.cliJobTakeOutput(jobId).catch(() => "");
      if (chunk) appendLog(String(chunk));

      const status = await api.cliJobStatus(jobId);
      if (!status?.running) {
        const tail = await api.cliJobTakeOutput(jobId).catch(() => "");
        if (tail) appendLog(String(tail));
        if (status?.error) {
          appendLog(String(status.error));
        }
        if (endLine) {
          appendLog(endLine(status?.exit_code ?? -1));
        }
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  } finally {
    await api.cliJobDrop(jobId).catch(() => {});
  }
}
