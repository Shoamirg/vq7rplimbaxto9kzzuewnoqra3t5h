import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { type Page } from "@playwright/test";
import { queueProfiles } from "./queue";

/** Mint at use time: a suite-wide fixture token can expire before later tests. */
export async function freshOperationsDemoToken(page: Page, baseURL: string) {
  queueProfiles(baseURL);
  const python = process.env.GARAGEOS_BROWSER_PYTHON;
  const backend = resolve(process.cwd(), "../backend");
  const normal = (await page.context().cookies(baseURL)).find(cookie => cookie.name === "garageos_token");
  if (!normal || !python || !isAbsolute(python) || !existsSync(python)
      || !existsSync(resolve(backend, "tests/support/demo_session.py"))) {
    throw new Error("Configure isolated browser Python and a normal demo-owner login before this gate.");
  }
  const output = await new Promise<string>((resolveOutput, reject) => {
    const child = spawn(python, ["-m", "tests.support.demo_session"], {
      cwd: backend, env: { ...process.env, PYTHONUTF8: "1" }, windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"], timeout: 15_000,
    });
    let data = "";
    const fail = () => reject(new Error("The isolated demo-session issuer refused or failed."));
    child.on("error", fail); child.stdin.on("error", fail);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => { data += chunk; if (data.length > 16384) { child.kill(); fail(); } });
    child.on("close", code => code === 0 ? resolveOutput(data) : fail());
    child.stdin.end(JSON.stringify({ token: normal.value }));
  });
  try {
    const value = JSON.parse(output) as { token: string; expires: number; actor_id: string; center_id: string };
    if (typeof value.token !== "string" || !value.token || !Number.isSafeInteger(value.expires)
        || typeof value.actor_id !== "string" || typeof value.center_id !== "string") throw new Error();
    return value.token;
  } catch { throw new Error("Invalid isolated demo-session receipt."); }
}
