#!/usr/bin/env node
/**
 * i18n audit — finds user-visible strings that aren't wrapped in t()/tp().
 *
 * Heuristic (no full JSX parse): scans staff .tsx for
 *   - JSX text nodes with real words:  <span>Save changes</span>
 *   - hardcoded visible attributes:    placeholder=, aria-label=, title=, alt=
 * and skips anything already inside a {t(...)} / {tp(...)} expression.
 *
 * CI ratchet: files in BASELINE (known still-untranslated) may have violations;
 * any *other* staff file with a violation fails the build. Shrink BASELINE as
 * screens get localized — new code must use t() from day one.
 *
 *   node scripts/i18n-audit.mjs           # report + enforce ratchet (exit 1 on new)
 *   node scripts/i18n-audit.mjs --all     # list every violation, ignore baseline
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SCAN_DIRS = ["app/(app)", "components"];
// Localized-elsewhere or intentionally-English areas — not staff-app UI.
const SKIP = [
  "components/mini", "components/marketing", "components/brand",
  "app/(marketing)", "showcase", "/dev/", "components/ui/showcase",
];
// Files known to still need translation (the backlog). The ratchet fails only
// for staff files NOT listed here. Remove entries as they're localized.
const BASELINE = new Set([
  "components/calendar/calendar-client.tsx",
  "components/appointments/appointments-list.tsx",
  "components/appointments/new-appointment-modal.tsx",
  "components/appointments/edit-appointment-modal.tsx",
  "components/operations/operations-console.tsx",
  "components/operations/case-detail.tsx",
  "components/operations/conversation-pane.tsx",
  "components/customers/customer-screen.tsx",
  "components/customers/customers-list.tsx",
  "components/vehicles/vehicle-intelligence-center.tsx",
  "components/vehicles/vehicle-health-screen.tsx",
  "components/billing/billing-workspace.tsx",
  "components/billing/document-view.tsx",
  "components/billing/new-invoice-modal.tsx",
  "components/billing/public-invoice.tsx",
  "components/reports/reports-workspace.tsx",
  "components/inbox/inbox-workspace.tsx",
  "components/inbox/thread-view.tsx",
  "components/inbox/conversation-list.tsx",
  "components/inbox/queue-rail.tsx",
  "components/inbox/context-panel.tsx",
  "components/ui/confirm-dialog.tsx",
  // Leaf/layout files with residual strings (small; translate in the sweep).
  "app/(app)/calendar/error.tsx",
  "app/(app)/customers/error.tsx",
  "app/(app)/customers/loading.tsx",
  "app/(app)/dashboard/error.tsx",
  "app/(app)/vehicles/[id]/error.tsx",
  "app/(app)/vehicles/error.tsx",
  "app/(app)/vehicles/page.tsx",
  "components/layout/command-menu.tsx",
  "components/layout/notification-bell.tsx",
  "components/layout/sidebar.tsx",
  "components/layout/top-bar.tsx",
  "components/passport/passport-actions.tsx",
  "components/passport/passport-document.tsx",
  "components/passport/passport-verified.tsx",
  "components/reports/charts.tsx",
  "components/skeletons/calendar-skeleton.tsx",
  "components/skeletons/dashboard-skeleton.tsx",
  "components/skeletons/vehicle-health-skeleton.tsx",
  "components/skeletons/vehicles-skeleton.tsx",
]);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e);
    const rel = relative(ROOT, full).replace(/\\/g, "/");
    if (SKIP.some((s) => rel.includes(s))) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (e.endsWith(".tsx")) out.push(full);
  }
  return out;
}

// Words that look like copy (letters + a space, or a capitalized multi-char word).
const TEXT = />(\s*[A-Z][A-Za-z][^<>{}]*?[a-z][^<>{}]*?)</g;      // JSX text node
const ATTR = /\b(placeholder|aria-label|title|alt)=("([^"]*[A-Za-z]{3,}[^"]*)")/g;
const IGNORE_TEXT = /^(https?:|www\.|[0-9.,%$/·—–-]+$)/;

function violations(src) {
  const hits = [];
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    if (/\bt\(|\btp\(|eslint-disable/.test(line)) return; // line already localizes / opts out
    let m;
    TEXT.lastIndex = 0;
    while ((m = TEXT.exec(line))) {
      const txt = m[1].trim();
      if (txt.length < 3 || IGNORE_TEXT.test(txt) || !/[a-z]/.test(txt)) continue;
      hits.push({ line: i + 1, kind: "text", txt });
    }
    ATTR.lastIndex = 0;
    while ((m = ATTR.exec(line))) hits.push({ line: i + 1, kind: m[1], txt: m[3] });
  });
  return hits;
}

const all = process.argv.includes("--all");
const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
let baselineCount = 0;
const offenders = [];

for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, "/");
  const hits = violations(readFileSync(f, "utf8"));
  if (!hits.length) continue;
  const inBaseline = BASELINE.has(rel);
  if (inBaseline && !all) { baselineCount += hits.length; continue; }
  offenders.push({ rel, hits });
}

if (offenders.length) {
  console.log(all ? "\ni18n audit — ALL hardcoded strings:\n" : "\n✗ i18n audit — hardcoded strings in non-baseline files:\n");
  for (const o of offenders) {
    console.log(`  ${o.rel}`);
    for (const h of o.hits.slice(0, all ? 999 : 8)) console.log(`    ${h.line}: [${h.kind}] ${h.txt.slice(0, 70)}`);
    if (!all && o.hits.length > 8) console.log(`    …and ${o.hits.length - 8} more`);
  }
}

const total = offenders.reduce((s, o) => s + o.hits.length, 0);
console.log(`\n${offenders.length ? "✗" : "✓"} i18n audit: ${total} new violation(s) in ${offenders.length} file(s); ${baselineCount} in the baseline backlog (${BASELINE.size} files).`);
if (offenders.length && !all) {
  console.log("Wrap visible strings in t()/tp(), or (if a staff screen is next in the localization queue) add it to BASELINE in scripts/i18n-audit.mjs.");
  process.exit(1);
}
