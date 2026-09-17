import { spawn, type ChildProcess } from "node:child_process";

/**
 * The e2e application server, kept alive.
 *
 * `wrangler dev` occasionally dies mid-suite on CI — an empty `✘ [ERROR]` and
 * the process is gone. Playwright's own `webServer` starts a command once and
 * never restarts it, so one death took the whole rest of the run with it: the
 * test in flight failed, and so did every later test and every retry, all with
 * `ERR_CONNECTION_REFUSED`. A dozen red tests, one cause, and a green rerun —
 * which teaches everyone to rerun rather than to read.
 *
 * This wraps the server in the smallest supervisor that fixes that: when the
 * child exits and we did not ask it to, say so loudly and start it again. A
 * crash then costs the one test that was running, which its retry can pass —
 * `waitForServer` in the resilience fixture gives the port time to come back.
 *
 * It deliberately does NOT hide a server that cannot start at all: after a few
 * restarts in quick succession it gives up, so a genuinely broken build still
 * fails the run instead of looping forever.
 */

const port = Number(process.argv[2] ?? 8788);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  console.error(`serve-e2e: "${process.argv[2]}" is not a usable port.`);
  process.exit(1);
}

/** Enough restarts to survive a bad patch, few enough to expose a broken build. */
const maxRestarts = 5;
/** Restarts inside this window count as "in quick succession". */
const rapidRestartWindowMs = 60_000;

let child: ChildProcess | null = null;
let stopping = false;
const restarts: number[] = [];

function start(): void {
  child = spawn(
    "pnpm",
    [
      "exec",
      "wrangler",
      "dev",
      "--config",
      "wrangler.example.jsonc",
      "--local",
      "--port",
      String(port),
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );

  child.on("exit", (code, signal) => {
    if (stopping) return;
    const now = Date.now();
    restarts.push(now);
    while (restarts.length > 0 && now - restarts[0]! > rapidRestartWindowMs) restarts.shift();
    // Loud on purpose: this line is the difference between "the dev server died
    // again" and half an hour spent reading a dozen connection-refused failures.
    console.error(
      `serve-e2e: the application server exited (code=${code}, signal=${signal}). ` +
        `Restart ${restarts.length} of ${maxRestarts}.`,
    );
    if (restarts.length > maxRestarts) {
      console.error("serve-e2e: the server keeps dying on start; this is not a flake. Giving up.");
      process.exit(1);
    }
    setTimeout(start, 1_000);
  });
}

function stop(signal: NodeJS.Signals): void {
  stopping = true;
  child?.kill(signal);
  process.exit(0);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

start();
