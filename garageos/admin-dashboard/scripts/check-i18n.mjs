#!/usr/bin/env node
// Translation-coverage guard for CI. Fails when a key exists in English but is
// missing from Russian or Uzbek (or vice-versa), so partial translations can't
// silently ship. Parses the two dictionary files by locale block.
//
//   node scripts/check-i18n.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["lib/i18n/dictionaries.ts", "lib/i18n/mini-dictionary.ts", "lib/i18n/staff-dictionary.ts", "lib/i18n/daily-dictionary.ts", "lib/i18n/accounts-dictionary.ts", "lib/i18n/platform-dictionary.ts", "lib/i18n/calendar-dictionary.ts"];
const LOCALES = ["en", "ru", "uz"];
// Plural keys legitimately differ per locale (ru has few/many, en/uz don't),
// so compare their base name, not the exact form.
const PLURAL_SUFFIX = /\.(one|few|many|other)$/;

/** Extract { locale: Set<key> } from a dictionary source file. */
function parse(src) {
  const lines = src.split("\n");
  const out = Object.fromEntries(LOCALES.map((l) => [l, new Set()]));
  let current = null;
  for (const line of lines) {
    const loc = line.match(/^\s{2}(en|ru|uz):\s*\{/);
    if (loc) {
      current = loc[1];
      continue;
    }
    if (!current) continue;
    for (const key of line.matchAll(/(?:^\s*|,\s*)["']([^"']+)["']\s*:/g)) {
      out[current].add(key[1].replace(PLURAL_SUFFIX, ""));
    }
  }
  return out;
}

const totals = Object.fromEntries(LOCALES.map((l) => [l, new Set()]));
for (const file of FILES) {
  const parsed = parse(readFileSync(join(root, file), "utf8"));
  for (const l of LOCALES) for (const k of parsed[l]) totals[l].add(k);
}

let missing = 0;
for (const l of LOCALES.filter((x) => x !== "en")) {
  const gaps = [...totals.en].filter((k) => !totals[l].has(k)).sort();
  if (gaps.length) {
    missing += gaps.length;
    console.error(`\n✖ ${gaps.length} key(s) present in EN but missing in ${l.toUpperCase()}:`);
    for (const k of gaps) console.error(`    ${k}`);
  }
  // Also flag keys that exist in a locale but not in English (orphans).
  const orphans = [...totals[l]].filter((k) => !totals.en.has(k)).sort();
  if (orphans.length) {
    missing += orphans.length;
    console.error(`\n✖ ${orphans.length} key(s) in ${l.toUpperCase()} not present in EN:`);
    for (const k of orphans) console.error(`    ${k}`);
  }
}

if (missing) {
  console.error(`\ni18n coverage check FAILED — ${missing} gap(s). EN keys: ${totals.en.size}\n`);
  process.exit(1);
}
console.log(`✓ i18n coverage OK — ${totals.en.size} keys across ${LOCALES.join("/")}.`);
