#!/usr/bin/env node
// =============================================================================
// RADIUS GUARD — an app never (re)defines the library's corner-radius tokens
// =============================================================================
// Rule (acpv-frontend-libraries -> docs/reference/corner-radius.md, rule 2; the app template, AGENTS.md "Rule 7"):
// radii come only from the library's tokens (--acpv-sys-corner-* / --acpv-sys-radius-*, the MD3 scale
// 4 / 8 / 12 / 16 / 28 / full). An app stylesheet loads AFTER the library, so a local definition of
//   --app-radius-*   --acpv-sys-radius-*   --acpv-sys-corner-*
// also changes the library's own components (Booking redefined the old 6/10/24 scale and its
// acpv-card came out at 10px instead of 12). Using the tokens is fine; DEFINING them is what fails.
//
// Scans .css / .scss / .html / .ts / .json under the given roots. Comments are stripped first
// (block comments everywhere, `//` only in scss/ts, <!-- --> in html), so documentation that names
// a token stays licit. A definition is `--<name>:` where <name> starts with one of the three prefixes
// above; `var(--app-radius-md)` or `var(--app-radius-md, 12px)` are usages and pass.
// Fixtures run before every real scan, so CI re-validates the guard itself.
//
// Usage:
//   node scripts/check-radius-tokens.mjs <root> [<root>...]   (CI: src public; a missing root is skipped)
//   node scripts/check-radius-tokens.mjs --self-test
// =============================================================================

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";

// Definition forms: `--x: v` (css, scss, inline style, template literals, ngStyle `{'--x': v}`, also right after a `}`),
// Angular `[style.--x]` bindings, `@HostBinding('style.--x')`, `style.setProperty('--x', v)` and Renderer2
// `setStyle(el, '--x', v)`. A usage (`var(--x)`) or a read (`getPropertyValue`) is not one. This is a literal-form
// check, not a parser: a name built at runtime (`'--' + name`) is out of its reach, and so is code review.
const DEFINITION =
  /(^|[\s;{}"'`])--(?:app-radius|acpv-sys-radius|acpv-sys-corner)-[a-z0-9-]+["']?\s*:|\[style\.--(?:app-radius|acpv-sys-radius|acpv-sys-corner)-[a-z0-9-]+\]|["'`]style\.--(?:app-radius|acpv-sys-radius|acpv-sys-corner)-|style\.setProperty\(\s*["'`]--(?:app-radius|acpv-sys-radius|acpv-sys-corner)-|\.setStyle\([^)]*["'`]--(?:app-radius|acpv-sys-radius|acpv-sys-corner)-/;
const EXTENSIONS = new Set([".css", ".scss", ".html", ".ts", ".js", ".json"]);
// "theme" is skipped on purpose: v2/theme/ is the vendored copy of the library's own tokens, so it DEFINES
// --acpv-sys-radius-* / --acpv-sys-corner-* by design. Whether that copy still matches the library is the
// other check (scripts/check-theme-drift.mjs); this guard is about the app's own files (v2/style.css, ...).
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".angular", ".nx", "coverage", "build", "out", "theme"]);

function stripComments(text, ext) {
  if (ext === ".json") return text;
  // html: <!-- --> comments, and /* */ comments inside <style> blocks.
  if (ext === ".html") return text.replace(/<!--[\s\S]*?-->/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  let out = text.replace(/\/\*[\s\S]*?\*\//g, " ");
  if (ext === ".scss" || ext === ".ts" || ext === ".js") out = out.replace(/(^|[\s;{})])\/\/.*$/gm, "$1");
  return out;
}

function findDefinition(text, ext) {
  const flat = stripComments(text, ext).replace(/\s+/g, " ");
  const m = flat.match(DEFINITION);
  if (!m) return null;
  const start = Math.max(0, m.index - 40);
  return flat.slice(start, m.index + m[0].length + 40).trim();
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path);
    } else if (EXTENSIONS.has(extname(entry.name))) {
      yield path;
    }
  }
}

const FIXTURES = [
  // definitions -> must be flagged
  { name: "css :root redefines the deprecated alias (Booking)", ext: ".css", hit: true,
    text: `:root { --app-radius-md: 10px; }` },
  { name: "css redefines the canonical radius token", ext: ".css", hit: true,
    text: `:root{--acpv-sys-radius-lg:20px}` },
  { name: "scss redefines a corner role", ext: ".scss", hit: true,
    text: `.my-app {\n  --acpv-sys-corner-medium: 8px;\n}` },
  { name: "html style attribute", ext: ".html", hit: true,
    text: `<div style="--app-radius-sm: 3px">x</div>` },
  { name: "ts component styles", ext: ".ts", hit: true,
    text: "const styles = `:host { --acpv-sys-corner-large: 24px; }`;" },
  { name: "angular.json is not special, a definition anywhere counts", ext: ".json", hit: true,
    text: `{ "x": "{ --app-radius-xl: 24px }" }` },
  // usages and prose -> must stay licit
  { name: "usage with var()", ext: ".scss", hit: false,
    text: `.card { border-radius: var(--acpv-sys-corner-medium); }` },
  { name: "usage with var() and fallback", ext: ".css", hit: false,
    text: `.card { border-radius: var(--app-radius-md, 12px); }` },
  { name: "app-local alias of a token (--myapp-*)", ext: ".css", hit: false,
    text: `:root { --myapp-hero-radius: var(--acpv-sys-corner-extra-large); }` },
  { name: "css block comment naming a token", ext: ".css", hit: false,
    text: `/* never write --app-radius-md: 10px here */\n.a { top: 0; }` },
  { name: "scss line comment", ext: ".scss", hit: false,
    text: `// --acpv-sys-corner-medium: 8px would change acpv-card\n.a { top: 0; }` },
  { name: "html comment", ext: ".html", hit: false,
    text: `<!-- --app-radius-sm: 3px is banned -->\n<div>ok</div>` },
  { name: "css comment inside an html <style> block", ext: ".html", hit: false,
    text: `<style>/* --acpv-sys-corner-medium: 8px; */ .a { top: 0; }</style>` },
  { name: "ts line comment naming a definition", ext: ".ts", hit: false,
    text: "@Component({\n  // --acpv-sys-corner-large: 24px would change acpv-card\n  styles: [`:host { color: red; }`],\n})\nexport class B {}" },
  // runtime and no-space forms -> must be flagged
  { name: "css definition right after a closing brace", ext: ".css", hit: true,
    text: `.a{top:0}:root{--acpv-sys-corner-medium:8px}` },
  { name: "angular [style.--token] binding in a template", ext: ".html", hit: true,
    text: `<div [style.--acpv-sys-corner-medium]="radius">x</div>` },
  { name: "angular host binding of a token", ext: ".ts", hit: true,
    text: "@Component({ host: { '[style.--app-radius-md]': 'radius()' } })\nexport class C {}" },
  { name: "ngStyle object with a token key", ext: ".html", hit: true,
    text: `<div [ngStyle]="{'--app-radius-md': '10px'}">x</div>` },
  { name: "style.setProperty on a token", ext: ".ts", hit: true,
    text: "document.documentElement.style.setProperty('--acpv-sys-corner-medium', value);" },
  { name: "angular @HostBinding of a token", ext: ".ts", hit: true,
    text: "@HostBinding('style.--acpv-sys-corner-medium') radius = '8px';" },
  { name: "Renderer2.setStyle on a token", ext: ".ts", hit: true,
    text: "this.renderer.setStyle(document.documentElement, '--acpv-sys-corner-medium', value, RendererStyleFlags2.DashCase);" },
  { name: "a setProperty that is not the CSS one", ext: ".ts", hit: false,
    text: "config.setProperty('--acpv-sys-corner-medium', '12px');" },
  { name: "Renderer2.setStyle on a normal property", ext: ".ts", hit: false,
    text: "this.renderer.setStyle(el, 'width', '10px');" },
  { name: "plain javascript setProperty on a token (static apps)", ext: ".js", hit: true,
    text: "document.documentElement.style.setProperty('--acpv-sys-corner-medium', '8px');" },
  { name: "javascript line comment naming a token definition", ext: ".js", hit: false,
    text: "// --app-radius-md: 10px would change acpv-card\nconst a = 1;" },
  // reading a token or binding a normal property is fine
  { name: "reading a token with getPropertyValue", ext: ".ts", hit: false,
    text: "const r = getComputedStyle(el).getPropertyValue('--acpv-sys-corner-medium');" },
  { name: "angular binding of the real border-radius property", ext: ".html", hit: false,
    text: `<div [style.border-radius]="r">x</div>` },
  // the common Angular pattern and an html <style> block -> must be flagged
  { name: "ts template-literal style defining a token", ext: ".ts", hit: true,
    text: "@Component({ styles: [`:host { --acpv-sys-corner-large: 24px; }`] })\nexport class A {}" },
  { name: "html <style> block defining a token", ext: ".html", hit: true,
    text: `<style>:root { --app-radius-md: 3px; }</style>` },
];

function selfTest() {
  const failures = FIXTURES.filter((f) => (findDefinition(f.text, f.ext) !== null) !== f.hit);
  for (const f of failures) console.error(`self-test FAIL: "${f.name}" — expected ${f.hit ? "hit" : "no hit"}`);
  if (failures.length > 0) {
    console.error(`::error::Radius guard self-test failed (${failures.length}/${FIXTURES.length} fixtures) — fix scripts/check-radius-tokens.mjs before trusting its verdict.`);
    process.exit(1);
  }
  console.log(`self-test OK — ${FIXTURES.length}/${FIXTURES.length} fixtures pass.`);
}

const args = process.argv.slice(2);
selfTest();
if (args.includes("--self-test")) process.exit(0);

const roots = args.filter((a) => !a.startsWith("--"));
if (roots.length === 0) {
  console.error("usage: node scripts/check-radius-tokens.mjs <root> [<root>...] | --self-test");
  process.exit(2);
}

const hits = [];
for (const root of roots) {
  if (!existsSync(root)) {
    console.log(`skip — ${root} does not exist (not every app ships every asset root).`);
    continue;
  }
  for (const file of walk(root)) {
    const snippet = findDefinition(readFileSync(file, "utf8"), extname(file));
    if (snippet) hits.push(`${file}: …${snippet}…`);
  }
}

if (hits.length > 0) {
  for (const hit of hits) console.error(hit);
  console.error("::error::An app must not define --app-radius-*, --acpv-sys-radius-* or --acpv-sys-corner-*: it loads after the library and would also change the library's own components (acpv-card, ...). Use the tokens with var(); a radius the scale does not have is a deviation to register in acpv-frontend-libraries -> docs/reference/md3-deviations.md. See docs/reference/corner-radius.md.");
  process.exit(1);
}
console.log(`OK — no radius token definitions under: ${roots.join(", ")}.`);
