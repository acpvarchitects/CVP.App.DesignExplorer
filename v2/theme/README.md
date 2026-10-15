# theme/ — copy of the ACPV design tokens

Vendored from `@acpvarchitects/ui` (`projects/ui/theme/`), **identical to ui 0.22.0** (checked 2026-10-15; first copied at 0.17.1, the token files did not change in between): `base.css` (MD3 colour, 6 modes),
`tertiary/coral.css` (ACPV brand) and `tokens/*.css` (`--acpv-sys-*` foundation).
This app has no build step and no npm, so the files are copied, not installed. Do not edit them:
to update, re-copy the same files from a newer library release and bump `?v=` on **every** theme `<link>` in
`index.html` and `analysis.html` (nginx serves CSS with a 30-day `immutable` cache, so an unchanged URL keeps
the old file). The token files are linked one by one on purpose: `tokens/acpv-sys.css` is only an aggregate of
`@import url('./x.css')`, and the browser resolves those child URLs without the parent's `?v=`, so bumping
the aggregate would not refresh them. The aggregate stays in the folder (it is part of the copy) but is not linked.

**Drift check.** A copy is frozen: when the library changes a token nothing here notices. Run
`node scripts/check-theme-drift.mjs` (needs the GitHub CLI, already logged in for ACPV): it compares every file in
this folder with the library's source and lists the library's `tokens/` too, prints `identical` / `different` / `missing` (vendored here, gone from the library) / `not-vendored` (in the library, absent here: a new token file, or one deleted by mistake), and exits 1 on drift. `tokens/fonts.css` is skipped on purpose (v2 has its own `fonts.css`)
(`--ref ui-v0.22.0` for a tag, `--local <path to packages/ui/projects/ui/theme>` for a checkout). Run it when the
library releases, and after re-copying, bump `?v=` on every theme `<link>`. It does **not** compare what is copied into
`style.css` by hand (global scrollbar, app-frame card scrollbar, side-nav bar): re-read `scrollbars.scss`,
`main-shell.component.css` and `side-nav.component.css` of the new release.

`fonts.css` is local: Inter Variable (latin + latin-ext) from `@fontsource-variable/inter`.

`style.css` maps its own names (`--bg`, `--card`, `--accent`…) onto `--md-sys-*` / `--acpv-sys-*`.
**Contrast mode: `light-medium-contrast`, the default of every ACPV app.** In the Angular apps the
library's `ThemeService` (started by `acpv-appbar`) adds that class to `<body>` at boot, so an app
built on the library gets it without declaring anything. This page has no Angular, so it does the
same by hand: `<body class="light-medium-contrast">`. The density class (`acpv-density--2`) stays on
`<html>`, as in the apps. The colour roles (`--md-sys-color-*`) only exist from `<body>` down, so
the aliases in `style.css` are declared on `body`, not on `:root`: read from `<html>` you would see
the plain light values (shell 238) instead of the real ones (shell 232).

Shape/frame follow the library: shell = `surface-container`, cards flat on `surface-container-lowest`
(tone + radius only, no border), buttons pill (`corner-full`), fields `radius-xs`.

Layout follows `main-shell`: 8px shell gap on four sides, left panel fused with the shell (280px,
`--acpv-left-panel-width`), ONE center card, 16px panel/card gap. Scrollbars follow ui **0.21.3**:
the theme's native thin bar (`* { scrollbar-width: thin }` of `theme/scrollbars.scss`, split out of `custom-theme.scss` in ui 0.21.x, copied into
`style.css`) on the center card, moved 22px in from the card's edge by a 22px transparent right border
(`main-shell.component.css`), and the side-nav's own 8px bar, no arrows, round thumb, on the left panel
(`side-nav.component.css`). Like the library, the window does not scroll: the left panel and the center
card scroll inside themselves. Below 900px the layout is one column and the page
scrolls instead; `scroller()` in `app.js` picks the right one.

Right side sheet (`acpv-right-panel`, docked): 256px (`--acpv-sys-sidesheet-width`), a card like the center one,
16px from it, open only while an option is selected. It holds "Where this option stands". Below 1100px
the layout is one column and that block moves under the preview image (`placeStandings` in `app.js`).

App bar = `acpv-appbar` (app icon 40px + title-large on the left, the open study in the centre-side slot, a
32px icon button on the right, fused with the shell). Density: `<html class="acpv-density--2">`, the
library's indication for ACPV apps (docs/reference/density.md): app bar 56px, buttons 32px. The
`--acpv-density-*` values are copied from `theme/density.scss` (SCSS + Angular Material, not usable here).

Sidebar (library side-nav model, §1-quater): the hamburger in the app bar corner cell toggles `nav-collapsed` on
`<html>`: drawer 280px (the filters) <-> rail 80px (one icon per filter section, with the active-filter badge).
The choice is kept in localStorage. Below 1100px the side sheet goes away (its content moves under the preview). Below 839px (the library's compact breakpoint) the sidebar is an overlay drawer: fixed, full height, over a scrim, closed with the scrim, Escape or the hamburger; the drawer is `inert` while closed and the card is `inert` while it is open (Tab stays in the drawer and the app bar); focus goes to the first section on open and back to the hamburger on close.
The methods (which studies are compared) live on top of the center card, so they stay visible when the
sidebar is closed. To go back to the previous layout, revert the two commits "refactor(v2): methods on top of
the center card" and "feat(v2): sidebar with hamburger".
