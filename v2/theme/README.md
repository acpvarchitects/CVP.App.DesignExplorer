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
