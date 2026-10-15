import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("hero uses a loaded local high-resolution vehicle photograph", async ({ page }) => {
  await page.goto("/");
  const photo = page.getByTestId("hero-vehicle-photo");
  await expect(photo).toBeVisible();
  await expect(photo).toHaveAttribute("alt", /\S/);
  await expect.poll(() => photo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  const renderedSource = new URL(await photo.evaluate((image) => (image as HTMLImageElement).currentSrc));
  // Next may serve a smaller responsive rendition. Check the original local
  // raster's resolution without requiring a desktop-sized download on a phone.
  const originalSource = new URL(renderedSource.searchParams.get("url") ?? renderedSource.href, page.url());
  expect(originalSource.origin).toBe(new URL(page.url()).origin);
  expect(originalSource.pathname).toMatch(/\.(avif|jpe?g|png|webp)$/i);
  const intrinsicWidth = await page.evaluate((source) => new Promise<number>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth);
    image.onerror = () => reject(new Error("Hero photograph could not be loaded"));
    image.src = source;
  }), originalSource.href);
  expect(intrinsicWidth).toBeGreaterThanOrEqual(1000);
});

test("landing images load when scrolled into view and across screenshot roles", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("marketing-language").selectOption("en");
  const landingImages = page.getByTestId("marketing-landing").locator("img");
  await expect(landingImages).toHaveCount(3);

  for (const image of await landingImages.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element) => {
      const photo = element as HTMLImageElement;
      return photo.complete && photo.naturalWidth > 0;
    }), { message: `Landing image should decode: ${await image.getAttribute("alt")}` }).toBe(true);
  }

  for (const role of ["Owner", "Advisor", "Mechanic"]) {
    const tab = page.getByRole("tab", { name: role, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    const screenshot = page.getByRole("tabpanel").getByRole("img");
    await screenshot.scrollIntoViewIfNeeded();
    await expect.poll(() => screenshot.evaluate((element) => {
      const image = element as HTMLImageElement;
      return image.complete && image.naturalWidth > 0;
    }), { message: `${role} screenshot should decode` }).toBe(true);
  }
});

test("landing starts in Uzbek and remembers a visitor's language after reload", async ({ page }) => {
  await page.goto("/");
  const landing = page.getByTestId("marketing-landing");
  const language = page.getByTestId("marketing-language");
  const heading = page.getByRole("heading", { level: 1 });

  await expect(landing).toHaveAttribute("lang", "uz");
  await expect(language).toHaveValue("uz");
  const uzbekHeading = await heading.textContent();

  await language.selectOption("ru");
  await expect(landing).toHaveAttribute("lang", "ru");
  await expect(heading).toContainText(/[А-Яа-яЁё]/);
  const russianHeading = await heading.textContent();
  await page.reload();
  await expect(language).toHaveValue("ru");
  await expect(heading).toHaveText(russianHeading!);

  await language.selectOption("en");
  await expect(landing).toHaveAttribute("lang", "en");
  await expect(heading).not.toHaveText(uzbekHeading!);
  await expect(heading).not.toContainText(/[А-Яа-яЁё]/);
  const englishHeading = await heading.textContent();
  await page.reload();
  await expect(language).toHaveValue("en");
  await expect(heading).toHaveText(englishHeading!);
});

test("shop selection changes the sample work instead of only highlighting a chip", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("marketing-language").selectOption("en");
  const general = page.getByTestId("shop-type-general");
  const tires = page.getByTestId("shop-type-tires");
  const detailing = page.getByTestId("shop-type-detailing");
  const preview = page.getByTestId("shop-preview");

  await expect(general).toHaveAttribute("aria-pressed", "true");
  const generalPreview = await preview.textContent();
  await tires.click();
  await expect(tires).toHaveAttribute("aria-pressed", "true");
  await expect(general).toHaveAttribute("aria-pressed", "false");
  await expect(preview).not.toHaveText(generalPreview!);
  const tirePreview = await preview.textContent();

  await detailing.click();
  await expect(detailing).toHaveAttribute("aria-pressed", "true");
  await expect(preview).not.toHaveText(tirePreview!);
  await general.click();
  await expect(preview).toHaveText(generalPreview!);
});

test("role previews can be switched to mechanic with the keyboard", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("marketing-language").selectOption("en");
  const tabs = page.getByTestId("marketing-role-carousel");
  await tabs.getByRole("tab").first().focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");

  const mechanic = tabs.getByRole("tab", { name: "Mechanic", exact: true });
  await expect(mechanic).toBeFocused();
  await expect(mechanic).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/assigned/i);
  const previewImage = panel.getByRole("img");
  await expect.poll(() => previewImage.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  await page.keyboard.press("End");
  await expect(tabs.getByRole("tab").last()).toHaveAttribute("aria-selected", "true");
  await expect(panel).toContainText(/vehicle/i);
});

test("sample estimate approval can be tried and reset without writing to the backend", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && new URL(request.url()).pathname.startsWith("/api/")) {
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });
  await page.goto("/");
  await page.getByTestId("marketing-language").selectOption("en");
  const approve = page.getByTestId("estimate-toggle");
  const status = page.getByTestId("estimate-status");
  const initialStatus = await status.textContent();

  await expect(approve).toHaveAttribute("aria-pressed", "false");
  await approve.click();
  await expect(approve).toHaveAttribute("aria-pressed", "true");
  await expect(status).not.toHaveText(initialStatus!);
  await expect(status).toContainText(/approved/i);
  await approve.click();
  await expect(approve).toHaveAttribute("aria-pressed", "false");
  await expect(status).toHaveText(initialStatus!);
  expect(writes).toEqual([]);
});

test("currency choice is carried into the pricing enquiry", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("marketing-language").selectOption("en");
  const pricing = page.locator("#pricing");
  const enquiry = page.getByTestId("pricing-enquiry").first();

  await expect(pricing.getByRole("button", { name: "UZS", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(enquiry).toHaveAttribute("href", /UZS/);
  await pricing.getByRole("button", { name: "USD", exact: true }).click();
  await expect(pricing.getByRole("button", { name: "USD", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(enquiry).toHaveAttribute("href", /USD/);
  await expect(enquiry).toHaveAttribute("href", /^mailto:/);
  await pricing.getByRole("button", { name: "UZS", exact: true }).click();
  await expect(enquiry).toHaveAttribute("href", /UZS/);
});

for (const width of [320, 390]) {
  test(`mobile landing fits ${width}px with two-column tiles, swipe rows, and a reachable footer`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const tiles = page.getByTestId("marketing-kpi-grid").locator(":scope > *");
    await expect(tiles).toHaveCount(6);
    const firstTile = await tiles.nth(0).boundingBox();
    const secondTile = await tiles.nth(1).boundingBox();
    const thirdTile = await tiles.nth(2).boundingBox();
    expect(firstTile).not.toBeNull();
    expect(secondTile!.x).toBeGreaterThan(firstTile!.x + firstTile!.width);
    expect(Math.abs(firstTile!.y - secondTile!.y)).toBeLessThanOrEqual(1);
    expect(thirdTile!.y).toBeGreaterThan(firstTile!.y + firstTile!.height);

    for (const testId of ["marketing-shop-carousel", "marketing-role-carousel", "marketing-pricing-carousel"]) {
      const carousel = page.getByTestId(testId);
      const geometry = await carousel.evaluate((element) => ({
        content: element.scrollWidth,
        visible: element.clientWidth,
        overflow: getComputedStyle(element).overflowX,
        snapping: getComputedStyle(element).scrollSnapType,
      }));
      expect(geometry.content, `${testId} has more content to swipe`).toBeGreaterThan(geometry.visible);
      expect(geometry.overflow).toMatch(/auto|scroll/);
      expect(geometry.snapping).toContain("x");
      await carousel.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
      await expect.poll(() => carousel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    }

    const sticky = page.getByTestId("marketing-mobile-cta");
    await expect(sticky).toBeVisible();
    await expect(sticky.getByRole("link")).toHaveAttribute("href", /^mailto:/);
    const trialRequest = decodeURIComponent((await sticky.getByRole("link").getAttribute("href"))!);
    expect(trialRequest).toContain("14-day trial request");
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    const footerLink = page.getByRole("contentinfo").getByRole("link").last();
    const linkBounds = await footerLink.boundingBox();
    const stickyBounds = await sticky.boundingBox();
    expect(linkBounds!.y + linkBounds!.height, "fixed enquiry bar must not cover the last footer link").toBeLessThanOrEqual(stickyBounds!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    await page.setViewportSize({ width: 1024, height: 844 });
    await expect(sticky).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  });
}

for (const locale of ["uz", "ru", "en"]) {
  test(`landing ${locale} stays readable across phone, tablet, and desktop widths`, async ({ page }, testInfo) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });
    await page.goto("/");
    await page.getByTestId("marketing-language").selectOption(locale);
    await expect(page.getByTestId("marketing-landing")).toHaveAttribute("lang", locale);

    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      if (width === 390 || width === 1440) {
        await page.screenshot({ path: testInfo.outputPath(`landing-${locale}-${width}.png`), fullPage: true });
        await page.screenshot({ path: testInfo.outputPath(`landing-${locale}-${width}-viewport.png`) });
      }
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth), `${locale} viewport at ${width}px`).toBeLessThanOrEqual(width);

      const clippedLabels = await page.getByTestId("marketing-kpi-grid").locator("p, h3").evaluateAll((labels) => labels
        .filter((label) => label.scrollWidth > label.clientWidth + 1)
        .map((label) => ({ text: label.textContent, content: label.scrollWidth, available: label.clientWidth })));
      expect.soft(clippedLabels, `${locale} card text must fit inside each tile at ${width}px`).toEqual([]);

      if (width === 390) {
        const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        expect.soft(accessibility.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
        }))).toEqual([]);
      }
    }
    expect(runtimeErrors).toEqual([]);
  });
}
