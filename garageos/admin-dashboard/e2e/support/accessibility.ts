import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

export async function settleMotion(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
}

/** Measure the project's44px controls, including controls below the fold. */
export async function assertTargets(page: Page) {
  const small = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        'button,a,input,select,textarea,[role="button"]',
      ),
    )
      .filter((el) => {
        const s = getComputedStyle(el),
          r = el.getBoundingClientRect();
        return (
          !el.matches(':disabled,[aria-disabled="true"]') &&
          !el.closest('[inert],[aria-hidden="true"]') &&
          s.visibility !== "hidden" &&
          s.display !== "none" &&
          r.width > 0 &&
          r.height > 0
        );
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          name: el.getAttribute("aria-label") || el.innerText.slice(0, 60),
          width: r.width,
          height: r.height,
        };
      })
      .filter((r) => r.width < 44 || r.height < 44),
  );
  expect(
    small,
    "Every standalone visible control must meet the project44px target",
  ).toEqual([]);
}

export async function assertKeyboardFocus(page: Page, locator: Locator) {
  // Traverse the real keyboard order; a DOM focus() call cannot expose hidden
  // phone-navigation controls that incorrectly remain tabbable offscreen.
  for (let i = 0; i < 90; i++) {
    await page.keyboard.press("Tab");
    if (await locator.evaluate((el) => el === document.activeElement)) break;
    expect(
      await page.evaluate(() => {
        const e = document.activeElement as HTMLElement;
        if (e === document.body) return true; // the browser's cycle boundary
        const r = e.getBoundingClientRect();
        return (
          r.right > 0 &&
          r.left < innerWidth &&
          r.bottom > 0 &&
          r.top < innerHeight
        );
      }),
      "Keyboard focus must remain on a visible on-screen control",
    ).toBeTruthy();
  }
  await expect(locator).toBeFocused();
  await settleMotion(page);
  expect(
    await locator.evaluate((el) => {
      const s = getComputedStyle(el);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      const painted = (color: string) => {
        if (!CSS.supports("color", color)) return false;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return context.getImageData(0, 0, 1, 1).data[3] > 0;
      };
      const outline =
        !["none", "hidden"].includes(s.outlineStyle) &&
        parseFloat(s.outlineWidth) > 0 &&
        painted(s.outlineColor);
      const shadows = s.boxShadow.split(/,(?![^()]*\))/);
      const ring = shadows.some((shadow) => {
        if (shadow.includes("inset")) return false;
        const color = shadow.match(/(?:rgba?|color|oklch|oklab)\([^)]*\)/)?.[0];
        if (!color || !painted(color)) return false;
        const lengths = shadow
          .replace(color, "")
          .match(/-?[\d.]+px/g)
          ?.map(parseFloat);
        // A blur or an invisible offset shadow is not the outward focus ring.
        return lengths?.length === 4 && lengths[3] >= 2;
      });
      return (
        el.matches(":focus-visible") &&
        Number(s.opacity) > 0 &&
        (outline || ring)
      );
    }),
    "Settled keyboard focus must have a visible outline or ring",
  ).toBeTruthy();
}

export async function assertReducedMotion(locator: Locator) {
  const motion = await locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      animation: s.animationDuration.split(",").map(parseFloat),
      transition: s.transitionDuration.split(",").map(parseFloat),
    };
  });
  expect(Math.max(...motion.animation)).toBeLessThanOrEqual(0.01);
  expect(Math.max(...motion.transition)).toBeLessThanOrEqual(0.01);
}

/** Hold the real pointer down without activating the control's business action. */
export async function assertNoActiveScaling(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const before = await locator.evaluate((el) => {
    const style = getComputedStyle(el);
    return { transform: style.transform, scale: style.scale };
  });
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  try {
    await settleMotion(page);
    expect(
      await locator.evaluate((el) => {
        const style = getComputedStyle(el);
        return { transform: style.transform, scale: style.scale };
      }),
      "Reduced-motion pointer must not scale the control",
    ).toEqual(before);
  } finally {
    await page.mouse.move(0, 0);
    await page.mouse.up();
  }
}

/** Independently resolve axe's inconclusive text backgrounds in this gate. */
async function contrastEvidence(locator: Locator) {
  return locator.evaluate((el) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    const rgba = (color: string) => {
      if (!CSS.supports("color", color))
        throw new Error("Unknown contrast color");
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).map((v, i) =>
        i === 3 ? v / 255 : v,
      );
    };
    const mix = (fg: number[], bg: number[]) =>
      [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
    const luminance = (color: number[]) =>
      color
        .slice(0, 3)
        .map((v) => {
          const n = v / 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        })
        .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
    const contrast = (bg: number[], fg: number[]) => {
      const a = luminance(bg),
        b = luminance(mix(fg, bg));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const style = getComputedStyle(el),
      fg = rgba(style.color);
    const ancestors: Element[] = [];
    for (let node: Element | null = el; node; node = node.parentElement)
      ancestors.unshift(node);
    let bg = [255, 255, 255, 1];
    let gradient: CSSStyleDeclaration | undefined;
    for (const node of ancestors) {
      const s = getComputedStyle(node);
      bg = mix(rgba(s.backgroundColor), bg);
      if (s.backgroundImage !== "none") gradient = s;
    }
    if (gradient) {
      if (
        !gradient.backgroundImage.startsWith("linear-gradient(") ||
        !gradient
          .getPropertyValue("--tw-gradient-position")
          .includes("in oklab") ||
        gradient.getPropertyValue("--tw-gradient-via-stops").trim()
      )
        throw new Error("Review new gradient interpolation");
      const from = gradient.getPropertyValue("--tw-gradient-from").trim(),
        to = gradient.getPropertyValue("--tw-gradient-to").trim();
      const ratios = Array.from({ length: 21 }, (_, i) =>
        contrast(rgba(`color-mix(in oklab, ${from} ${i * 5}%, ${to})`), fg),
      );
      return {
        kind: "computed-oklab-gradient",
        ratio: Math.min(...ratios),
        samples: ratios.length,
      };
    }
    const nearbySvg = el.parentElement?.querySelector("svg");
    // A heading/control can contain both an icon and text. Its union element
    // rectangle overlaps the icon even when no glyph is painted above it.
    // Measure actual text ranges; retain the element fallback for non-text
    // controls rather than assuming an unknown overlap is safe.
    const textRects: DOMRect[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim() || node.parentElement?.closest("svg")) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      textRects.push(...Array.from(range.getClientRects()));
    }
    if (!textRects.length) textRects.push(el.getBoundingClientRect());
    const nearbyRect = nearbySvg?.getBoundingClientRect();
    // An adjacent icon cannot form the text background. An opaque badge also
    // paints over it. Only overlapping transparent text needs an SVG review.
    const svg =
      nearbyRect &&
      rgba(style.backgroundColor)[3] < 1 &&
      textRects.some(textRect => textRect.left < nearbyRect.right &&
        textRect.right > nearbyRect.left && textRect.top < nearbyRect.bottom &&
        textRect.bottom > nearbyRect.top)
        ? nearbySvg
        : null;
    if (svg) {
      const circle = svg.querySelector("circle");
      if (!circle) throw new Error("Review new SVG background");
      const rect = el.getBoundingClientRect(),
        svgRect = svg.getBoundingClientRect();
      const cx = svgRect.left + Number(circle.getAttribute("cx")),
        cy = svgRect.top + Number(circle.getAttribute("cy"));
      const inner =
        Number(circle.getAttribute("r")) -
        Number(circle.getAttribute("stroke-width")) / 2;
      if (
        [
          [rect.left, rect.top],
          [rect.right, rect.top],
          [rect.left, rect.bottom],
          [rect.right, rect.bottom],
        ].some(([x, y]) => Math.hypot(x - cx, y - cy) >= inner)
      )
        throw new Error("Text overlaps the SVG health stroke");
    }
    return {
      kind: svg ? "text-inside-empty-health-ring" : "computed-solid-text",
      ratio: contrast(bg, fg),
    };
  });
}

export async function assertAccessible(
  page: Page,
  info: TestInfo,
  state: string,
) {
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    scan.violations.map((v) => ({
      rule: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
    state,
  ).toEqual([]);
  const evidence: unknown[] = [];
  for (const rule of scan.incomplete) {
    expect(
      ["color-contrast", "aria-hidden-focus"],
      "New inconclusive rule needs an explicit review",
    ).toContain(rule.id);
    for (const node of rule.nodes) {
      if (rule.id === "aria-hidden-focus") {
        expect(["staff-dialog", "queue-invoice"]).toContain(state);
        await expect(page.getByRole("dialog")).toBeVisible();
        evidence.push({
          rule: rule.id,
          target: node.target,
          method: "real dialog Tab/ShiftTab trap checked separately",
        });
        continue;
      }
      expect(node.target).toHaveLength(1);
      expect(typeof node.target[0]).toBe("string");
      const locator = page.locator(node.target[0] as string);
      await expect(locator).toHaveCount(1);
      const result = await contrastEvidence(locator);
      expect(
        result.ratio,
        "Inconclusive text contrast must independently meet4.5:1",
      ).toBeGreaterThanOrEqual(4.5);
      evidence.push({ rule: rule.id, target: node.target, ...result });
    }
  }
  const file = info.outputPath(state + "-accessibility-review.json");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify({ violations: 0, inconclusive: evidence }, null, 2),
  );
  await info.attach(state + "-accessibility-review", {
    contentType: "application/json",
    path: file,
  });
}
