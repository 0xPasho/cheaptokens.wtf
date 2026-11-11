import type { Logger, LogFields } from "./types";

export function createJsonLogger(write: (line: string) => void = console.log): Logger {
  const emit = (level: string, event: string, fields?: LogFields) => {
    write(JSON.stringify({ ...fields, ts: new Date().toISOString(), level, event }));
  };
  return {
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, fields) => emit("error", event, fields),
  };
}
