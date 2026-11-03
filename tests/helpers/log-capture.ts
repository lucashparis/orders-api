import type { LogDestination } from "../../src/shared/logger/logger-options.ts";

export type LogEntry = Record<string, unknown>;

export type LogCapture = {
  destination: LogDestination;
  readEntries(): LogEntry[];
  readText(): string;
};

function isLogEntry(value: unknown): value is LogEntry {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLogLine(line: string): LogEntry {
  const entry: unknown = JSON.parse(line);
  if (!isLogEntry(entry)) {
    throw new Error(`Expected a JSON object log line, received: ${line}`);
  }
  return entry;
}

export function createLogCapture(): LogCapture {
  const lines: string[] = [];
  return {
    destination: {
      write: (line) => {
        lines.push(line);
      },
    },
    readEntries: () => lines.map(parseLogLine),
    readText: () => lines.join(""),
  };
}

export function findEventEntries(capture: LogCapture, event: string): LogEntry[] {
  return capture.readEntries().filter((entry) => entry.event === event);
}
