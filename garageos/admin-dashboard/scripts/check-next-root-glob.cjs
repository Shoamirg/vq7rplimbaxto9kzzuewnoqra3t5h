// Exercise the installed Next rule through ESLint, including monorepo root globs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { Linter } = require('eslint');
const next = require('@next/eslint-plugin-next');

const pluginRequire = createRequire(require.resolve('@next/eslint-plugin-next'));
const globPackage = pluginRequire('fast-glob/package.json');
assert.equal(globPackage.name, 'tinyglobby');
assert.equal(globPackage.version, '0.2.17');

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'garageos-next-rule-'));
try {
  const pages = path.join(fixture, 'apps', 'garage', 'pages');
  fs.mkdirSync(pages, { recursive: true });
  fs.writeFileSync(path.join(pages, 'contact.tsx'), 'export default function Contact() {}');
  // A file matching the wildcard must not be treated as an application directory.
  fs.writeFileSync(path.join(fixture, 'apps', 'not-an-app'), 'fixture');
  for (const rootDir of [
    path.join(fixture, 'apps', '*'),
    [path.join(fixture, 'apps', '{garage,missing}')],
    path.join(fixture, 'apps', '**', 'garage').replaceAll('/', '\\'),
  ]) {
    const linter = new Linter();
    linter.defineRule('next/no-html-link-for-pages', next.rules['no-html-link-for-pages']);
    const config = {
      parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
      settings: { next: { rootDir } },
      rules: { 'next/no-html-link-for-pages': 'error' },
    };
    const invalid = linter.verify('<a href="/contact">Contact</a>', config);
    assert.equal(invalid.length, 1, JSON.stringify(invalid));
    assert.equal(invalid[0].ruleId, 'next/no-html-link-for-pages');
    assert.equal(linter.verify('<Link href="/contact">Contact</Link>', config).length, 0);
    assert.equal(linter.verify('<a href="https://example.com">External</a>', config).length, 0);
  }
  console.log('Next internal-link rule retained: wildcard/brace/Windows roots and valid-link controls passed.');
} finally {
  // This exact temporary directory was created above, outside application data.
  assert.ok(path.resolve(fixture).startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(fixture).startsWith('garageos-next-rule-'));
  fs.rmSync(fixture, { recursive: true, force: true });
}
