/** Independent suspension/flight contract, prepared before the token correction.
 * Real normal-auth production HTTP and held genuine JSON only; unexecuted.
 */
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { queueLogin } from "./support/queue";
import { translate } from "../lib/i18n/dictionaries";

test.use({ trace: "off", screenshot: "off", video: "off" });
test.describe.configure({ retries: 0 });
const path = "/api/proxy/conversations", t = (key: string) => translate("en", key);
const form = (page: Page) => page.getByRole("dialog", { name: t("inbox.create.title"), exact: true });
const uncertain = (page: Page) => form(page).getByRole("alert").filter({ hasText: t("inbox.create.uncertain") });
type Probe = { postHeld: boolean; postReturned: boolean; createdId: string; checkHeld: boolean; checkReturned: boolean;
  checkIds: string[]; posts: number; checks: number; releasePost: () => void; releaseCheck: () => void; restore: () => void };
async function state(page: Page) {
  return page.evaluate(() => {
    const p = (window as unknown as { qaSuspendedCreation: Probe }).qaSuspendedCreation;
    return { postHeld: p.postHeld, postReturned: p.postReturned, createdId: p.createdId,
      checkHeld: p.checkHeld, checkReturned: p.checkReturned, checkIds: p.checkIds, posts: p.posts, checks: p.checks };
  });
}

test("Inbox retires suspended creation flight and ignores its late JSON while a fresh reconciliation remains held", async ({ page, baseURL }) => {
  const { owner } = await queueLogin(page, baseURL!, "en", 1280);
  const originalMe = await page.request.get("/api/proxy/auth/me"); expect(originalMe.status()).toBe(200);
  const originalActorId = (await originalMe.json()).id as string;
  const seed = await page.request.post(path, { data: { subject: `QA39 suspension anchor ${randomUUID()}` } });
  expect(seed.status()).toBe(201); const anchor = (await seed.json()).id as string;
  await page.goto(`/inbox?c=${anchor}`);
  await expect(page.getByRole("status").filter({ hasText: t("inbox.read.acknowledged") })).toBeVisible();
  const subject = `QA39 suspended committed creation ${randomUUID()}`;
  await page.evaluate(({ target, subject }) => {
    const original = window.fetch.bind(window);
    let releasePost!: () => void, releaseCheck!: () => void;
    const postGate = new Promise<void>(done => { releasePost = done; });
    const checkGate = new Promise<void>(done => { releaseCheck = done; });
    const p: Probe = { postHeld: false, postReturned: false, createdId: "", checkHeld: false, checkReturned: false,
      checkIds: [], posts: 0, checks: 0, releasePost, releaseCheck, restore: () => { window.fetch = original; } };
    (window as unknown as { qaSuspendedCreation: Probe }).qaSuspendedCreation = p;
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const ownPost = method === "POST" && url.pathname === target;
      const ownCheck = method === "GET" && url.pathname === target && url.searchParams.get("q") === subject;
      if (ownPost) p.posts++;
      if (ownCheck) p.checks++;
      const response = await original(input, init), json = response.json.bind(response);
      if (ownPost && response.status === 201) response.json = async () => {
        const data = await json(); p.createdId = data.id; p.postHeld = true;
        await postGate; p.postReturned = true; return data;
      };
      if (ownCheck && response.status === 200) response.json = async () => {
        const data = await json(); p.checkIds = data.items.map((item: { id: string }) => item.id); p.checkHeld = true;
        await checkGate; p.checkReturned = true; return data;
      };
      return response;
    };
  }, { target: path, subject });
  try {
    await page.getByRole("button", { name: t("inbox.create.title"), exact: true }).click();
    await form(page).getByRole("textbox", { name: t("inbox.create.subject"), exact: true }).fill(subject);
    await form(page).getByRole("button", { name: t("inbox.create.submit"), exact: true }).click();
    await expect.poll(async () => (await state(page)).postHeld).toBe(true);
    const initial = await state(page); expect(initial.posts).toBe(1); expect(initial.postReturned).toBe(false);
    const committed = await page.request.get(`${path}/${initial.createdId}`); expect(committed.status()).toBe(200);
    expect(await committed.json()).toMatchObject({ id: initial.createdId, subject });
    await expect(form(page).getByRole("status").filter({ hasText: t("inbox.create.pending") })).toBeVisible();
    await form(page).getByRole("button", { name: t("common.close"), exact: true }).click();

    // Arm before invalidation: any genuine owning Inbox list/detail/auth read
    // can correctly suspend the UI first and remove its Refresh control.
    const denied = page.waitForResponse(r => {
      const pathname = new URL(r.url()).pathname;
      return r.request().method() === "GET" && r.status() === 401
        && [path, `${path}/${anchor}`, "/api/proxy/auth/me"].includes(pathname);
    });
    await page.context().addCookies([{ name: "garageos_token", value: "QA39-invalidated-suspended-flight", url: baseURL! }]);
    expect((await page.request.get("/api/proxy/auth/me")).status()).toBe(401);
    const refresh = page.getByRole("button", { name: t("message.refresh"), exact: true });
    const verify = page.getByRole("button", { name: t("message.verify"), exact: true });
    if (!await verify.isVisible()) {
      try { await refresh.click(); }
      catch (error) { if (!await verify.isVisible() || await refresh.count() > 0) throw error; }
    }
    await denied;
    await expect(page.getByRole("button", { name: t("message.verify"), exact: true })).toBeVisible();
    expect((await state(page)).postReturned).toBe(false);
    expect((await page.request.post("/api/auth/login", { data: { email: owner.email, password: owner.password } })).status()).toBe(200);
    const me = await page.request.get("/api/proxy/auth/me"); expect(me.status()).toBe(200);
    const restoredActor = await me.json(); expect(restoredActor.id).toBe(originalActorId);
    expect(restoredActor.service_center_id).toBe(owner.center_id);
    await page.getByRole("button", { name: t("message.verify"), exact: true }).click();
    const opener = page.getByRole("button", { name: t("inbox.create.title"), exact: true });
    await expect.poll(async () => await form(page).isVisible() || await opener.count() > 0 && await opener.isEnabled()).toBe(true);
    if (!await form(page).isVisible()) await opener.click();
    await expect(form(page).getByRole("textbox", { name: t("inbox.create.subject"), exact: true })).toHaveValue(subject);
    await expect(uncertain(page)).toBeVisible();
    await expect(form(page).getByRole("button", { name: t("inbox.create.submit"), exact: true })).toBeDisabled();

    await form(page).getByRole("button", { name: t("inbox.create.reconcile"), exact: true }).click();
    await expect.poll(async () => (await state(page)).checkHeld).toBe(true);
    const fresh = await state(page); expect(fresh.checks).toBe(1); expect(fresh.checkIds).toContain(initial.createdId);
    expect(fresh.postReturned).toBe(false); expect(fresh.posts).toBe(1);
    await expect(form(page).getByRole("button", { name: t("inbox.create.checking"), exact: true })).toBeDisabled();
    await page.evaluate(() => (window as unknown as { qaSuspendedCreation: Probe }).qaSuspendedCreation.releasePost());
    await expect.poll(async () => (await state(page)).postReturned).toBe(true);
    await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    // The old genuine ACK must not acknowledge the restored form, end this
    // newer checking state, or enable another creation while its GET is held.
    await expect(uncertain(page)).toBeVisible();
    await expect(form(page).getByRole("status").filter({ hasText: t("inbox.create.acknowledged") })).toHaveCount(0);
    await expect(form(page).getByRole("button", { name: t("inbox.create.checking"), exact: true })).toBeDisabled();
    await expect(form(page).getByRole("checkbox", { name: t("inbox.create.acknowledge_risk"), exact: true })).toHaveCount(0);
    expect((await state(page)).checkReturned).toBe(false); expect((await state(page)).checks).toBe(1);
    await page.keyboard.press("Enter"); expect((await state(page)).posts).toBe(1);

    await page.evaluate(() => (window as unknown as { qaSuspendedCreation: Probe }).qaSuspendedCreation.releaseCheck());
    await expect.poll(async () => (await state(page)).checkReturned).toBe(true);
    await expect(form(page).getByText(initial.createdId, { exact: true })).toBeVisible();
    await expect(uncertain(page)).toBeVisible();
    await expect(form(page).getByRole("button", { name: t("inbox.create.create_again"), exact: true })).toBeDisabled();
    await expect(form(page).getByRole("checkbox", { name: t("inbox.create.acknowledge_risk"), exact: true })).not.toBeChecked();
    expect((await state(page)).posts).toBe(1); expect((await state(page)).checks).toBe(1);
    const found = await page.request.get(`${path}?view=all&q=${encodeURIComponent(subject)}`);
    expect(found.status()).toBe(200); const actual = await found.json(); expect(actual.total).toBe(1); expect(actual.items[0].id).toBe(initial.createdId);
  } finally {
    await page.evaluate(() => { const p = (window as unknown as { qaSuspendedCreation: Probe }).qaSuspendedCreation;
      p.releasePost(); p.releaseCheck(); p.restore(); });
    expect((await page.request.post("/api/auth/login", { data: { email: owner.email, password: owner.password } })).status()).toBe(200);
  }
});
