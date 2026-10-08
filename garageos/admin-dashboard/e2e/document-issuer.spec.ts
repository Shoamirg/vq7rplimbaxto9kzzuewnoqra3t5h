import { expect, test, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
import { settleMotion } from "./support/accessibility";

test.use({ trace: "off" }); // Private QA credentials and session cookies stay out of traces.
type Profile = {
  email: string; password: string;
  issuer: { name: string; tagline: string | null; monogram: string; phone: string | null; address: string | null };
  documents: { id: string; code: string; kind: "invoice" | "estimate" }[];
};
const labels = {
  en: { invoice: "INVOICE", estimate: "ESTIMATE", estimates: "Estimates", quantity: "1.5", vat: "12.5", month: "Aug" },
  ru: { invoice: "СЧЁТ", estimate: "СМЕТА", estimates: "Сметы", quantity: "1,5", vat: "12,5", month: "авг" },
  uz: { invoice: "HISOB-FAKTURA", estimate: "SMETA", estimates: "Smetalar", quantity: "1,5", vat: "12,5", month: "avg" },
} as const;

async function assertIssuer(root: Locator, profile: Profile) {
  const issuer = root.locator("[data-document-issuer]");
  await expect(issuer).toContainText(profile.issuer.name);
  await expect(issuer).toContainText(profile.issuer.monogram);
  await expect(issuer.locator("avtoservis")).toHaveCount(0); // Stored <Avtoservis> is escaped text.
  if (profile.issuer.tagline) await expect(issuer).toContainText(profile.issuer.tagline);
  if (profile.issuer.address) await expect(issuer).toContainText(profile.issuer.address);
  if (profile.issuer.phone) {
    const phone = issuer.getByRole("link", { name: profile.issuer.phone, exact: true });
    await expect(phone).toHaveAttribute("href", `tel:${profile.issuer.phone.replace(/[^\d+]/g, "")}`);
    const target = (await phone.boundingBox())!;
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(target.width).toBeGreaterThanOrEqual(44);
  } else {
    await expect(issuer.getByRole("link")).toHaveCount(0);
    await expect(issuer).not.toContainText("+998");
    await expect(issuer).not.toContainText("Toshkent");
  }
  await expect(root).not.toContainText("GarageOS Demo Workshop");
  await expect(root).not.toContainText("Precision Auto Care");
  await expect(root).not.toContainText("+998 71 200 7000");
  const bounds = await issuer.evaluate(el => {
    const box = el.getBoundingClientRect();
    return { left: box.left, right: box.right, viewport: document.documentElement.clientWidth, width: el.clientWidth, content: el.scrollWidth };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewport + 1);
  expect(bounds.content).toBeLessThanOrEqual(bounds.width + 1);
}

async function printDocument(page: import("@playwright/test").Page, root: Locator, profile: Profile, path: string) {
  // Print layout uses a paper viewport, independently of the phone screen.
  // Checking a 360px print-media viewport would misrepresent A4 column widths.
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.emulateMedia({ media: "print" });
  await assertIssuer(root, profile);
  expect(await root.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: path + ".png", fullPage: true });
  const pdf = await page.pdf({ path: path + ".pdf", format: "A4", printBackground: true });
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  // These one-line synthetic documents must fit one actual PDF page.
  expect((pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(1);
}

for (const locale of ["en", "ru", "uz"] as const)
  for (const width of [360, 1280]) {
    test(`owning document issuer ${locale} ${width}`, async ({ page, context, baseURL }, info) => {
      test.setTimeout(120_000);
      const fixturePath = process.env.GARAGEOS_BROWSER_FIXTURE;
      if (!fixturePath) throw new Error("Prepare the private isolated browser fixture before this gate");
      let profiles: Profile[];
      try {
        const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
        const origin = new URL(baseURL!);
        if (fixture.qa_only !== true || fixture.base_origin !== origin.origin
          || origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname)
          || !Array.isArray(fixture.issuer_profiles) || fixture.issuer_profiles.length !== 2) throw new Error();
        profiles = fixture.issuer_profiles;
      } catch {
        // Parsing/asserting a whole private object could expose passwords in a
        // failure report. Report only a safe setup error and scalar counts.
        throw new Error("Prepare the private isolated issuer browser fixture before this gate");
      }
      await page.setViewportSize({ width, height: 900 });
      for (const [index, profile] of profiles.entries()) {
        // Use actual BFF login/API and persisted documents, with no route mocks.
        const login = await page.request.post("/api/auth/login", { data: { email: profile.email, password: profile.password } });
        expect(login.ok()).toBeTruthy();
        await context.addCookies([{ name: "garageos_locale", value: locale, url: baseURL! }]);
        for (const doc of profile.documents) {
          await page.emulateMedia({ media: "screen" });
          await page.setViewportSize({ width, height: 900 });
          await page.goto("/billing");
          if (doc.kind === "estimate") {
            // Workspace has separate estimate/invoice queues.
            const response = await page.request.get(`/api/proxy/invoices/${doc.id}`);
            expect(response.ok()).toBeTruthy();
            expect((await response.json()).issuer).toEqual(profile.issuer);
            await page.locator('nav button[aria-pressed]').filter({ hasText: labels[locale].estimates }).click();
          }
          await page.getByRole("button", { name: new RegExp(doc.code) }).click();
          const staff = page.locator("#print-invoice");
          await expect(staff).toContainText(doc.code);
          await settleMotion(page);
          await assertIssuer(staff, profile);
          await expect(staff).toContainText(labels[locale][doc.kind]);
          await printDocument(page, staff, profile, info.outputPath(`staff-${index}-${doc.kind}-print`));

          await page.emulateMedia({ media: "screen" });
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`/invoice/${doc.id}`);
          const shared = page.locator("#print-invoice");
          await expect(shared).toContainText(doc.code);
          await assertIssuer(shared, profile);
          await expect(shared).toContainText(labels[locale][doc.kind]);
          await expect(shared).toContainText(labels[locale].quantity);
          await expect(shared).toContainText(`${labels[locale].vat}%`);
          if (doc.kind === "estimate") await expect(shared).toContainText(labels[locale].month);
          await expect(shared).not.toContainText("M08");
          await expect(shared).not.toContainText("NaN");
          await expect(page).toHaveTitle(new RegExp(`${labels[locale][doc.kind]} ${doc.code}`));
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
          await page.screenshot({ path: info.outputPath(`public-${index}-${doc.kind}-screen.png`), fullPage: true });
          await printDocument(page, shared, profile, info.outputPath(`public-${index}-${doc.kind}-print`));
        }
      }
    });
  }
