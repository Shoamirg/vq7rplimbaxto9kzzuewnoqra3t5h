// A noncredential browser reset epoch. It never grants API permissions.
export const MESSAGE_RESET_COOKIE = "garageos_message_reset";
export const MESSAGE_LOGOUT_EVENT = "garageos:message-logout";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
let generation = 0;
let failedResetCookie: string | null | undefined;

function cookie(): string | null {
  if (typeof document === "undefined") return "nonbrowser-storage-test";
  const values = document.cookie.split(";").map(part => part.trim()).filter(part => part.startsWith(MESSAGE_RESET_COOKIE + "="));
  return values.length === 1 ? values[0].slice(MESSAGE_RESET_COOKIE.length + 1) : null;
}
function writeCookie(value: string) {
  document.cookie = `${MESSAGE_RESET_COOKIE}=${value}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  if (cookie() !== value) throw new Error("Message reset epoch unavailable");
}
export function requireMessageResetEpoch(): string {
  if (failedResetCookie !== undefined) throw new Error("Message logout reset unavailable");
  let value = cookie();
  if (typeof document !== "undefined" && (!value || !UUID.test(value))) {
    value = crypto.randomUUID(); writeCookie(value);
  }
  if (!value) throw new Error("Message reset epoch unavailable");
  return value;
}
export function messageSessionEpoch(): string { return `${generation}:${cookie() ?? "missing"}`; }
export function revokeMessageSession() {
  generation++;
  try { writeCookie(crypto.randomUUID()); failedResetCookie = undefined; }
  catch { failedResetCookie = cookie(); /* HTTP logout still runs; only its fresh response can repair the failed reset. */ }
  window.dispatchEvent(new Event(MESSAGE_LOGOUT_EVENT));
}
export function completeMessageLogout() {
  if (failedResetCookie === undefined) return;
  const value = cookie();
  if (!value || !UUID.test(value) || value === failedResetCookie) throw new Error("Message logout reset unavailable");
  failedResetCookie = undefined;
}
