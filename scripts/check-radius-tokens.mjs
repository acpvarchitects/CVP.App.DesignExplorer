#!/usr/bin/env node
// =============================================================================
// RADIUS GUARD — an app never (re)defines the corner-radius tokens, and never writes a radius in pixels
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
//
// Second check, same scan: no PIXEL radius. `border-radius: 14px` is a missing token: it cannot follow a change
// of the scale and, off the scale (6 / 10 / 14 / 18...), it is an unregistered deviation. The check reads
// `border-radius` / `border-*-radius` declarations (css, scss, inline `style="..."`, component styles in ts) across
// line breaks and flags a positive pixel length outside var(): `var(--acpv-sys-corner-medium, 12px)` is fine (the
// px is only a fallback), `0`, `50%` and `inherit` pass. A line (or the line before it) carrying
// `radius-guard-allow: <reason>` is exempt: use it only for a gap registered in the library's
// docs/reference/corner-radius.md, and say why.
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

// --- pixel literals ----------------------------------------------------------
const DECL = /(?:^|[\s;{"'`])(border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius)\s*:\s*([^;}"'`]+)/g;
const PX = /(?<![\w-])(?:0*[1-9]\d*|\d*\.\d*[1-9]\d*)(?:\.\d+)?px/;
const ALLOW = "\u0001ALLOW\u0001"; // marks a comment that carried `radius-guard-allow`

function stripForLiterals(text, ext) {
  // Newlines survive (also inside a removed comment) so line numbers stay right.
  const nl = (m) => m.replace(/[^\n]/g, "");
  const keep = (m) => (/radius-guard-allow/.test(m) ? ALLOW + nl(m) : m.replace(/[^\n]/g, " "));
  let out = text;
  if (ext === ".html") out = out.replace(/<!--[\s\S]*?-->/g, keep);
  out = out.replace(/\/\*[\s\S]*?\*\//g, keep);
  if (ext === ".scss" || ext === ".ts" || ext === ".js") {
    out = out.replace(/(^|[\s;{})])\/\/(.*)$/gm, (m, pre, rest) =>
      /radius-guard-allow/.test(rest) ? `${pre}${ALLOW}` : pre + " ".repeat(rest.length + 2));
  }
  return out;
}

/** Returns [{ line, value }] of pixel radii that are not exempt. Declarations may span several lines. */
function findLiterals(text, ext) {
  if (ext === ".json") return [];
  const clean = stripForLiterals(text, ext);
  const lines = clean.split("\n");
  const hits = [];
  DECL.lastIndex = 0;
  let m;
  while ((m = DECL.exec(clean)) !== null) {
    // The part of the value outside var(...): a px inside var(--x, 12px) is a fallback, not a literal.
    const outside = m[2].replace(/var\((?:[^()]|\([^()]*\))*\)/g, " ");
    if (!PX.test(outside)) continue;
    const propertyAt = m.index + m[0].indexOf(m[1]);
    const i = clean.slice(0, propertyAt).split("\n").length - 1; // 0-based line of the property name
    const exempt = lines[i].includes(ALLOW) || (i > 0 && lines[i - 1].includes(ALLOW));
    if (!exempt) hits.push({ line: i + 1, value: `${m[1]}: ${m[2].trim().replace(/\s+/g, " ")}` });
  }
  return hits;
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

const LITERAL_FIXTURES = [
  // pixel literals -> flagged
  { name: "px in scss", ext: ".scss", hit: true, text: `.a { border-radius: 14px; }` },
  { name: "off-scale px in css", ext: ".css", hit: true, text: `.a{border-radius:10px}` },
  { name: "on-scale px is still a literal", ext: ".css", hit: true, text: `.a { border-radius: 12px; }` },
  { name: "px with !important", ext: ".css", hit: true, text: `.a { border-radius: 16px !important; }` },
  { name: "multi-value shorthand", ext: ".scss", hit: true, text: `.a { border-radius: 12px 12px 0 0; }` },
  { name: "single-corner longhand", ext: ".scss", hit: true, text: `.a { border-top-left-radius: 8px; }` },
  { name: "logical longhand", ext: ".css", hit: true, text: `.a { border-start-start-radius: 8px; }` },
  { name: "px next to a var() fallback is still caught", ext: ".css", hit: true, text: `.a { border-radius: var(--x, 4px) 8px; }` },
  { name: "px on the line after the colon", ext: ".scss", hit: true, text: `.a {\n  border-radius:\n    14px;\n}` },
  { name: "inline style attribute", ext: ".html", hit: true, text: `<div style="border-radius: 8px">x</div>` },
  { name: "component styles in ts", ext: ".ts", hit: true, text: "@Component({ styles: [`.a { border-radius: 10px; }`] })\nexport class A {}" },
  { name: "cssText string in ts", ext: ".ts", hit: true, text: "el.style.cssText = ['color:red', 'border-radius:4px'].join(';');" },
  // fine
  { name: "token", ext: ".scss", hit: false, text: `.a { border-radius: var(--acpv-sys-corner-medium); }` },
  { name: "token with px fallback", ext: ".css", hit: false, text: `.a { border-radius: var(--acpv-sys-corner-medium, 12px); }` },
  { name: "nested var fallback", ext: ".css", hit: false, text: `.a { border-radius: var(--a, var(--b, 8px)); }` },
  { name: "zero", ext: ".css", hit: false, text: `.a { border-radius: 0; }` },
  { name: "percentage", ext: ".css", hit: false, text: `.a { border-radius: 50%; }` },
  { name: "inherit", ext: ".css", hit: false, text: `.a { border-radius: inherit; }` },
  { name: "custom property holding a radius is not a border-radius declaration", ext: ".css", hit: false, text: `:host { --my-radius: 14px; }` },
  { name: "block comment", ext: ".css", hit: false, text: `/* was border-radius: 14px */\n.a { top: 0; }` },
  { name: "scss line comment", ext: ".scss", hit: false, text: `// border-radius: 14px is gone\n.a { top: 0; }` },
  { name: "html comment", ext: ".html", hit: false, text: `<!-- border-radius: 14px -->\n<div>ok</div>` },
  { name: "token in an inline style", ext: ".html", hit: false, text: `<div style="border-radius: var(--acpv-sys-corner-medium)">x</div>` },
  { name: "allow marker on the previous line", ext: ".css", hit: false, text: `/* radius-guard-allow: registered gap */\n.a { border-radius: 12px !important; }` },
  { name: "allow marker as a scss line comment", ext: ".scss", hit: false, text: `.a { border-radius: 12px; // radius-guard-allow: registered gap\n}` },
  { name: "allow marker in an html comment", ext: ".html", hit: false, text: `<!-- radius-guard-allow: registered gap -->\n<div style="border-radius: 8px">x</div>` },
];

function selfTest() {
  const failures = [
    ...FIXTURES.filter((f) => (findDefinition(f.text, f.ext) !== null) !== f.hit),
    ...LITERAL_FIXTURES.filter((f) => (findLiterals(f.text, f.ext).length > 0) !== f.hit),
  ];
  const total = FIXTURES.length + LITERAL_FIXTURES.length;
  for (const f of failures) console.error(`self-test FAIL: "${f.name}" — expected ${f.hit ? "hit" : "no hit"}`);
  if (failures.length > 0) {
    console.error(`::error::Radius guard self-test failed (${failures.length}/${total} fixtures) — fix scripts/check-radius-tokens.mjs before trusting its verdict.`);
    process.exit(1);
  }
  console.log(`self-test OK — ${total}/${total} fixtures pass.`);
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
const pixelHits = [];
for (const root of roots) {
  if (!existsSync(root)) {
    console.log(`skip — ${root} does not exist (not every app ships every asset root).`);
    continue;
  }
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");
    const snippet = findDefinition(text, extname(file));
    if (snippet) hits.push(`${file}: …${snippet}…`);
    for (const hit of findLiterals(text, extname(file))) pixelHits.push(`${file}:${hit.line}: ${hit.value}`);
  }
}

if (hits.length > 0) {
  for (const hit of hits) console.error(hit);
  console.error("::error::An app must not define --app-radius-*, --acpv-sys-radius-* or --acpv-sys-corner-*: it loads after the library and would also change the library's own components (acpv-card, ...). Use the tokens with var(); a radius the scale does not have is a deviation to register in acpv-frontend-libraries -> docs/reference/md3-deviations.md. See docs/reference/corner-radius.md.");
}
if (pixelHits.length > 0) {
  for (const hit of pixelHits) console.error(hit);
  console.error("::error::Pixel border-radius found. Use the library tokens (var(--acpv-sys-corner-extra-small|small|medium|large|extra-large|full)): a literal cannot follow the MD3 scale and an off-scale value is an unregistered deviation. A gap registered in the library may carry `radius-guard-allow: <reason>`. See docs/reference/corner-radius.md.");
}
if (hits.length > 0 || pixelHits.length > 0) process.exit(1);
console.log(`OK — no radius token definitions and no pixel radii under: ${roots.join(", ")}.`);
