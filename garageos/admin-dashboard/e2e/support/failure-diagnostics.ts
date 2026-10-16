import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { freemem, totalmem, platform } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ConsoleMessage, Page, Request, Response, TestInfo } from "@playwright/test";

const methods = new Set(["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"]);
const number = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Only callers' reconstructed numeric/enum schemas reach this writer. */
export async function writeDiagnostic(info: TestInfo, file: string, value: object) {
  const raw = JSON.stringify(value);
  if (Buffer.byteLength(raw) > 32_768) return;
  const destination = info.outputPath(file);
  const temporary = destination + "." + randomUUID() + ".tmp";
  await mkdir(dirname(destination), { recursive: true });
  try {
    await writeFile(temporary, raw, "utf8");
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

/** Observe waits; never change their promises or complete their animations. */
export async function observeMotion(page: Page, info: TestInfo) {
  const prefix = "qa-motion-" + randomUUID() + ":";
  let writes = Promise.resolve();
  const listener = (message: ConsoleMessage) => {
    const raw = message.text();
    if (!raw.startsWith(prefix) || raw.length > 32_768) return;
    try {
      const input = JSON.parse(raw.slice(prefix.length));
      if (!["fonts", "animations", "settled"].includes(input.phase)
          || !["loading", "loaded"].includes(input.fonts?.status)
          || number(input.elapsedMs) === null || !Array.isArray(input.animations)) return;
      const value = {
        phase: input.phase,
        elapsedMs: number(input.elapsedMs),
        fonts: { status: input.fonts.status },
        animations: input.animations.slice(0, 32).map((item: Record<string, unknown>) => ({
          playState: ["idle", "running", "paused", "finished"].includes(String(item.playState))
            ? item.playState : "unknown",
          currentTime: number(item.currentTime), startTime: number(item.startTime),
          duration: number(item.duration),
          iterations: item.iterations === "Infinity" ? "Infinity" : number(item.iterations),
        })),
      };
      writes = writes.then(() => writeDiagnostic(info, "motion-state.json", value)).catch(() => {});
    } catch { /* Observation cannot replace the owning wait's failure. */ }
  };
  page.on("console", listener);
  return {
    prefix,
    async close() { page.off("console", listener); await writes; },
  };
}

type Options = { targetPath?: string; followingLabel?: string };

const execute = promisify(execFile);

/** Sample this host without persisting socket addresses or individual ports. */
async function hostAggregates() {
  const host = {
    availablePhysicalBytes: freemem(), totalPhysicalBytes: totalmem(),
    processRssBytes: process.memoryUsage().rss,
    tcpTotal: null as number | null, tcpTimeWait: null as number | null,
    tcpLocalPortCount: null as number | null, tcpListenerCount: null as number | null,
    probeCompleted: false,
  };
  if (platform() !== "win32") return host;
  try {
    const command = "$ErrorActionPreference='Stop'; " +
      "$ip=[System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties(); " +
      "$connections=@($ip.GetActiveTcpConnections()); " +
      "@{tcpTotal=$connections.Count; " +
      "tcpTimeWait=@($connections | Where-Object State -eq TimeWait).Count; " +
      "tcpLocalPortCount=@($connections | ForEach-Object {$_.LocalEndPoint.Port} | Sort-Object -Unique).Count; " +
      "tcpListenerCount=@($ip.GetActiveTcpListeners()).Count} | ConvertTo-Json -Compress";
    const result = await execute("C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { windowsHide: true, timeout: 2500, maxBuffer: 8192 });
    const parsed = JSON.parse(result.stdout);
    const keys = ["tcpTotal", "tcpTimeWait", "tcpLocalPortCount", "tcpListenerCount"] as const;
    if (keys.some(key => !Number.isSafeInteger(parsed[key]) || parsed[key] < 0)) return host;
    for (const key of keys) host[key] = parsed[key];
    host.probeCompleted = true;
  } catch { /* Unsupported/slow probes remain explicitly incomplete. */ }
  return host;
}

/** Retain the operation's return/error identity; publish only bounded metadata. */
export async function withFailureDiagnostics<T>(
  page: Page, info: TestInfo, _name: string, operation: () => Promise<T>, options: Options = {},
): Promise<T> {
  const prefix = "qa-pointer-" + randomUUID() + ":";
  const events: object[] = [];
  let pointer: object | null = null;
  const started = Date.now();
  const classify = (request: Request) => {
    let kind = "other";
    try {
      const path = new URL(request.url()).pathname;
      if (options.targetPath && path === options.targetPath) kind = "target";
      else if (path === "/api/proxy/auth/me") kind = "auth";
    } catch { /* No raw request data is retained. */ }
    return { method: methods.has(request.method()) ? request.method() : "unknown", kind };
  };
  const record = (event: string, request: Request, status?: number) => {
    if (events.length >= 48) return;
    events.push({ event, ...classify(request), elapsedMs: Date.now() - started,
      ...(status === undefined ? {} : { status }) });
  };
  const onRequest = (request: Request) => record("request", request);
  const onResponse = (response: Response) => record("response", response.request(), response.status());
  const onFailed = (request: Request) => record("requestfailed", request);
  const onConsole = (message: ConsoleMessage) => {
    const raw = message.text();
    if (!raw.startsWith(prefix) || raw.length > 4096) return;
    try {
      const input = JSON.parse(raw.slice(prefix.length));
      if (!["pointerdown", "pointerup", "click"].includes(input.type)
          || typeof input.isTrusted !== "boolean" || typeof input.disabled !== "boolean") return;
      pointer = { type: input.type, isTrusted: input.isTrusted, disabled: input.disabled,
        button: number(input.button), buttons: number(input.buttons),
        x: number(input.x), y: number(input.y) };
    } catch { /* Ignore unrecognized messages rather than copying browser text. */ }
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("requestfailed", onFailed);
  page.on("console", onConsole);
  let installed = false;
  try {
    if (options.followingLabel) {
      try {
        await page.evaluate(({ prefix, label }) => {
          const state = window as unknown as {
            qaFailureObservers?: Map<string, (event: Event) => void>;
          };
          const listener = (event: Event) => {
            const target = event.target instanceof Element ? event.target.closest("button") : null;
            if (!(target instanceof HTMLButtonElement) || target.textContent?.trim() !== label) return;
            const pointer = event as PointerEvent;
            console.debug(prefix + JSON.stringify({ type: event.type, isTrusted: event.isTrusted,
              disabled: target.disabled, button: pointer.button, buttons: pointer.buttons,
              x: pointer.clientX, y: pointer.clientY }));
          };
          state.qaFailureObservers ??= new Map();
          state.qaFailureObservers.set(prefix, listener);
          for (const type of ["pointerdown", "pointerup", "click"]) document.addEventListener(type, listener, true);
        }, { prefix, label: options.followingLabel });
        installed = true;
      } catch { /* A closed page must still execute/rethrow the original operation. */ }
    }
    try { return await operation(); }
    catch (error) {
      try {
        // Only the selected browser error activates host inspection. Never
        // serialize its message, stack, URL or any child-process output.
        const host = error instanceof Error && error.message.includes("net::ERR_NO_BUFFER_SPACE")
          ? await hostAggregates() : undefined;
        await writeDiagnostic(info, "failure-state.json", {
          phase: "failure", elapsedMs: Date.now() - started, requests: events, pointer,
          ...(host ? { host } : {}),
        });
        await info.attach("failure-state", {
          contentType: "application/json", path: info.outputPath("failure-state.json"),
        });
      } catch { /* Diagnostic I/O errors cannot replace the original error. */ }
      throw error;
    }
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
    page.off("requestfailed", onFailed);
    page.off("console", onConsole);
    if (installed && !page.isClosed()) {
      await page.evaluate(prefix => {
        const state = window as unknown as { qaFailureObservers?: Map<string, (event: Event) => void> };
        const listener = state.qaFailureObservers?.get(prefix);
        if (listener) for (const type of ["pointerdown", "pointerup", "click"]) document.removeEventListener(type, listener, true);
        state.qaFailureObservers?.delete(prefix);
      }, prefix).catch(() => {});
    }
  }
}
