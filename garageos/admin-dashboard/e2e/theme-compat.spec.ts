import { expect, test } from "@playwright/test";

for (const width of [390, 1280]) {
  test(`shared controls retain light/dark appearance at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const externalFonts: string[] = [];
    page.on("request", (request) => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) externalFonts.push(request.url());
    });
    const login = await page.request.post("/api/auth/login", {
      data: { email: "admin@demo.garageos.app", password: "parol12345" },
    });
    expect(login.ok()).toBeTruthy();
    await page.goto("/dev/components");
    await page.evaluate(() => document.fonts.ready);
    const primary = page.locator("#button").getByRole("button", { name: "Primary", exact: true });
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await expect(primary).toHaveCSS("background-color", "rgb(17, 19, 21)");
    await expect.poll(() => primary.evaluate(element => parseFloat(getComputedStyle(element).borderRadius) >= element.getBoundingClientRect().height / 2)).toBe(true);
    expect(await primary.evaluate((element) => getComputedStyle(element).fontFamily)).toMatch(/Plus[_ ]Jakarta[_ ]Sans/);
    await expect(page.getByRole("button", { name: "Save Changes", exact: true })).toBeDisabled();
    await page.locator("#button").screenshot({ path: info.outputPath("controls-light.png") });

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expect(primary).toHaveCSS("background-color", "rgb(246, 247, 249)");
    await primary.focus();
    expect(await primary.evaluate((element) => getComputedStyle(element).boxShadow)).toContain("2px");
    await page.locator("#button").screenshot({ path: info.outputPath("controls-dark.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    expect(externalFonts).toEqual([]);
  });
}
