#!/usr/bin/env node
// =============================================================================
// check-theme-drift — are the vendored files in v2/theme/ still the library's?
// =============================================================================
// v2 has no npm and no build, so the design tokens are COPIED from @acpvarchitects/ui
// (see v2/theme/README.md). A copy is frozen: when the library changes a token, nothing here
// notices. This script compares every file under v2/theme/ with the library's source, lists the library's token folder too (a new or a deleted file is drift), and
// reports which are identical, different or missing. It never writes anything.
//
// Source of truth: acpv-frontend-libraries, packages/ui/projects/ui/theme/<same relative path>.
// By default it reads that repository through the GitHub CLI (`gh`, already authenticated for
// ACPV); `--local <dir>` compares against a local checkout instead (the `theme` folder).
//
// Not compared on purpose: fonts.css and fonts/ (local Inter from @fontsource-variable/inter, not
// a copy of the library's) and README.md (ours). The scrollbar and the app-frame rules in
// v2/style.css are copied by hand from custom-theme.scss / scrollbars.scss / main-shell and
// side-nav CSS: they are listed at the end as a reminder, not compared.
//
// Usage:
//   node scripts/check-theme-drift.mjs                    # against acpv-frontend-libraries@WIP
//   node scripts/check-theme-drift.mjs --ref ui-v0.22.0   # against a tag or branch
//   node scripts/check-theme-drift.mjs --local ../acpv-frontend-libraries/packages/ui/projects/ui/theme
// Exit code: 0 all identical, 1 drift found, 2 usage / access error.
// =============================================================================

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "acpvarchitects/acpv-frontend-libraries";
const LIB_THEME = "packages/ui/projects/ui/theme";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const THEME_DIR = join(HERE, "..", "v2", "theme");
const SKIP = new Set(["README.md", "fonts.css"]);
const SKIP_DIRS = new Set(["fonts"]);

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const local = valueOf("--local");
const ref = valueOf("--ref") ?? "WIP";

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path);
    } else if (!SKIP.has(entry.name)) {
      yield path;
    }
  }
}

const normalize = (text) => text.replace(/\r\n/g, "\n");

function libraryFile(rel) {
  if (local) {
    const p = join(local, rel);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  }
  try {
    return execFileSync(
      "gh",
      ["api", `repos/${REPO}/contents/${LIB_THEME}/${rel}?ref=${ref}`, "-H", "Accept: application/vnd.github.raw"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (error) {
    const message = String(error.stderr ?? error.message);
    if (message.includes("404")) return null;
    console.error(`cannot read ${rel} from ${REPO}@${ref}: ${message.trim()}`);
    process.exit(2);
  }
}

// Names of the .css files the library has in a directory (the other side of the comparison).
function libraryDirCss(relDir) {
  if (local) {
    const dir = join(local, relDir);
    return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".css")) : [];
  }
  try {
    const json = execFileSync(
      "gh",
      ["api", `repos/${REPO}/contents/${LIB_THEME}/${relDir}?ref=${ref}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return JSON.parse(json).filter((e) => e.type === "file" && e.name.endsWith(".css")).map((e) => e.name);
  } catch (error) {
    console.error(`cannot list ${relDir} in ${REPO}@${ref}: ${String(error.stderr ?? error.message).trim()}`);
    process.exit(2);
  }
}

// What v2/theme must contain, whatever is on disk: the two fixed files, and every .css of the token
// folders (a token file the library adds, or one deleted here, must show up as drift, not vanish).
const FIXED_FILES = ["base.css", "tertiary/coral.css"];
const TOKEN_DIRS = ["tokens"];
// Library files this app deliberately does NOT vendor: tokens/fonts.css loads the library's own Inter
// (@fontsource-variable); v2 ships its own theme/fonts.css, so the library's copy must not be pulled in.
const NOT_VENDORED_ON_PURPOSE = new Set(["tokens/fonts.css"]);

const wanted = new Set(FIXED_FILES);
for (const file of walk(THEME_DIR)) wanted.add(relative(THEME_DIR, file).split(sep).join("/"));
for (const dir of TOKEN_DIRS) {
  for (const name of libraryDirCss(dir)) {
    if (!NOT_VENDORED_ON_PURPOSE.has(`${dir}/${name}`)) wanted.add(`${dir}/${name}`);
  }
}

const rows = [];
for (const rel of [...wanted].sort()) {
  const path = join(THEME_DIR, ...rel.split("/"));
  const theirs = libraryFile(rel);
  if (!existsSync(path)) {
    rows.push({ rel, status: "not-vendored" }); // in the library (or required) but absent here
  } else if (theirs === null) {
    rows.push({ rel, status: "missing" }); // vendored here but gone from the library
  } else {
    rows.push({ rel, status: normalize(theirs) === normalize(readFileSync(path, "utf8")) ? "identical" : "different" });
  }
}

const source = local ? `local ${local}` : `${REPO}@${ref}`;
console.log(`Vendored theme (v2/theme) vs ${source}\n`);
for (const { rel, status } of rows) console.log(`${status.padEnd(9)} ${rel}`);

const drift = rows.filter((r) => r.status !== "identical");
console.log(
  `\n${rows.length - drift.length}/${rows.length} identical.` +
    (drift.length
      ? ` ${drift.length} to re-copy (then bump ?v= on every theme <link> in index.html and analysis.html).`
      : " No drift."),
);
console.log(
  "\nNot compared (copied into v2/style.css by hand): the global scrollbar (theme/scrollbars.scss), the " +
    "app-frame card scrollbar (main-shell.component.css) and the side-nav bar (side-nav.component.css).",
);
process.exit(drift.length ? 1 : 0);
