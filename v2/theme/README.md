# theme/ — copy of the ACPV design tokens

Vendored from `@acpvarchitects/ui` **0.17.1** (`projects/ui/theme/`): `base.css` (MD3 colour, 6 modes),
`tertiary/coral.css` (ACPV brand) and `tokens/*.css` (`--acpv-sys-*` foundation).
This app has no build step and no npm, so the files are copied, not installed. Do not edit them:
to update, re-copy the same files from a newer library release and bump `?v=` in `index.html`.

`fonts.css` is local: Inter Variable (latin + latin-ext) from `@fontsource-variable/inter`.

`style.css` maps its own names (`--bg`, `--card`, `--accent`…) onto `--md-sys-*` / `--acpv-sys-*`.
`<html class="light-medium-contrast">` selects the contrast mode the ACPV apps run in.

Shape/frame follow the library: shell = `surface-container`, cards flat on `surface-container-lowest`
(tone + radius only, no border), buttons pill (`corner-full`), fields `radius-xs`.

Layout follows `main-shell`: 8px shell gap on four sides, left panel fused with the shell (280px,
`--acpv-left-panel-width`), ONE center card, 16px panel/card gap. Scrollbar = `theme/custom-theme.scss`
(copied into `style.css`). Like the library, the window does not scroll: the left panel and the center
card scroll inside themselves (`scrollbar-gutter: stable`). Below 900px the layout is one column and the page
scrolls instead; `scroller()` in `app.js` picks the right one.

Right side sheet (`acpv-right-panel`, docked): 256px (`--acpv-sys-sidesheet-width`), a card like the center one,
16px from it, open only while an option is selected. It holds "Where this option stands". Below 1100px
the layout is one column and that block moves under the preview image (`placeStandings` in `app.js`).

App bar = `acpv-appbar` (app icon 40px + title-large on the left, the open study in the centre-side slot, a
32px icon button on the right, fused with the shell). Density: `<html class="acpv-density--2">`, the
library's indication for ACPV apps (docs/reference/density.md): app bar 56px, buttons 32px. The
`--acpv-density-*` values are copied from `theme/density.scss` (SCSS + Angular Material, not usable here).
