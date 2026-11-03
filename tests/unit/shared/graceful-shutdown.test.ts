import { EventEmitter } from "node:events";
import { afterEach, expect, test, vi as vitest } from "vitest";
import { registerGracefulShutdown } from "../../../src/shared/http/graceful-shutdown.ts";

const DISCONNECT_METHOD = "$disconnect";

function createLogger() {
  return { info: vitest.fn(), error: vitest.fn() };
}

function createDependencies(calls: string[], closeError?: Error) {
  const log = createLogger();
  const processEvents = new EventEmitter();
  const app = {
    close: async () => {
      calls.push("close");
      if (closeError) {
        throw closeError;
      }
    },
    log,
  };
  const prisma = {
    [DISCONNECT_METHOD]: async () => {
      calls.push("disconnect");
    },
  };
  return { app, prisma, processEvents, log };
}

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
});

test("closes the server before disconnecting the database on SIGTERM", async () => {
  const calls: string[] = [];
  const { app, prisma, processEvents, log } = createDependencies(calls);
  registerGracefulShutdown({ app, prisma, processEvents });

  processEvents.emit("SIGTERM");

  await vitest.waitFor(() => {
    expect(calls).toEqual(["close", "disconnect"]);
  });
  expect(log.info).toHaveBeenCalledWith({ signal: "SIGTERM" }, expect.any(String));
});

test("also handles SIGINT", async () => {
  const calls: string[] = [];
  const { app, prisma, processEvents } = createDependencies(calls);
  registerGracefulShutdown({ app, prisma, processEvents });

  processEvents.emit("SIGINT");

  await vitest.waitFor(() => {
    expect(calls).toEqual(["close", "disconnect"]);
  });
});

test("runs the shutdown sequence once when a second signal arrives", async () => {
  const calls: string[] = [];
  const { app, prisma, processEvents } = createDependencies(calls);
  registerGracefulShutdown({ app, prisma, processEvents });

  processEvents.emit("SIGTERM");
  processEvents.emit("SIGINT");

  await vitest.waitFor(() => {
    expect(calls).toEqual(["close", "disconnect"]);
  });
  await new Promise((resolve) => setImmediate(resolve));
  expect(calls).toEqual(["close", "disconnect"]);
});

test("logs the failure and sets the exit code when closing fails", async () => {
  const calls: string[] = [];
  const failure = new Error("close failed");
  const { app, prisma, processEvents, log } = createDependencies(calls, failure);
  process.exitCode = undefined;
  registerGracefulShutdown({ app, prisma, processEvents });

  processEvents.emit("SIGTERM");

  await vitest.waitFor(() => {
    expect(log.error).toHaveBeenCalledWith({ err: failure }, expect.any(String));
  });
  expect(process.exitCode).toBe(1);
  expect(calls).toEqual(["close", "disconnect"]);
});
