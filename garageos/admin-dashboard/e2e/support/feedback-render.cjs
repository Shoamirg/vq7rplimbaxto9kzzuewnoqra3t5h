// Server rendering runs outside Playwright's component-test JSX transform.
// Compile repository TSX with the actual React automatic runtime; all imported
// components, context, dictionary and design-system modules remain real.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const dashboard = path.resolve(__dirname, "../..");
const designSystem = path.resolve(dashboard, "../packages/design-system");
const roots = [dashboard, designSystem];
const locale = process.argv[2];
if (!["en", "ru", "uz"].includes(locale)) throw new Error("Expected a supported locale");

const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  if (request.startsWith("@/")) request = path.join(dashboard, request.slice(2));
  return resolve.call(this, request, parent, ...args);
};
for (const ext of [".ts", ".tsx"]) {
  require.extensions[ext] = (module, filename) => {
    const relative = roots.map(root => path.relative(root, filename));
    if (!relative.some(value => value && !value.startsWith("..") && !path.isAbsolute(value)))
      throw new Error("Refusing to transpile source outside the repository UI");
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    module._compile(outputText, filename);
  };
}

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { I18nProvider } = require(path.join(dashboard, "lib/i18n/context.tsx"));
const render = child => renderToStaticMarkup(React.createElement(I18nProvider, { initialLocale: locale }, child));
const skeletons = [
  ["calendar", "CalendarSkeleton"], ["dashboard", "DashboardSkeleton"],
  ["vehicle-health", "VehicleHealthSkeleton"], ["vehicles", "VehiclesSkeleton"],
].map(([name, exported]) => render(React.createElement(require(path.join(dashboard, `components/skeletons/${name}-skeleton.tsx`))[exported])));
const errors = ["calendar", "dashboard"].map(name => render(React.createElement(
  require(path.join(dashboard, `app/(app)/${name}/error.tsx`)).default,
  { error: new Error("QA"), reset: () => {} },
)));
const { DocumentIssuer } = require(path.join(dashboard, "components/billing/document-issuer.tsx"));
const { translate } = require(path.join(dashboard, "lib/i18n/dictionaries.ts"));
const legacyIssuer = render(React.createElement(DocumentIssuer, {
  fallbackName: translate(locale, "public.garage"), accent: "#2563eb",
}));
process.stdout.write(JSON.stringify({ skeletons, errors, legacyIssuer }));
