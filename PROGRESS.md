# Design Explorer v2 — progress

Branch: `feature/new-dashboard` (from `WIP`)

## Goal
A redesigned dashboard built alongside the current one, so the current one keeps working.
Show it to colleagues first, and launch it only if it works well. Keep it simple, no over-engineering.

## Decisions
- Separate page (planned: `v2/index.html`). The current `index.html` is not touched.
- Static HTML + D3, same as now: no build step, same Docker/nginx image.
- Same CSV format as now (`in:` / `out:` / `img` / `threeD` columns). Everything is data-driven:
  labels, filters and comparisons come from column names (user rule: never rename dataset words).
  Extra columns: `img:<view>` (more image views), `analysis:<name>` (GLB analysis meshes).
  `out:` without an up/down arrow = no better/worse direction (e.g. `avrg`): shown, never ranked.
- The GLB analysis files will be delivered separately by the user.
- New feature: a 3D viewer that shows a colored (analysis) mesh, with a legend and a "color by" picker.
- Mesh format: GLB/glTF (vertex colors), loaded with three.js GLTFLoader.
- Reference project: `http://designexplorer.acpv.local/dev/?PROJECT=Export` (4 options, Path25-28;
  metrics: view to Bocca d'Arno up, avrg, summer solar radiation down, winter solar radiation up).
- UX direction (feedback 2026-09-25): less technical. Big preview (Image / 3D model / 3D analysis),
  filmstrip of all options in the SAME view/analysis to pick by eye, plain-language filters
  (Any / Better than avg / Best only), per-option comparison vs others (rank, % vs average),
  no complex sorting. Up/down arrows in CSV headers = direction of "better".

## Done
- [x] Branch created
- [x] Mockup 1 shown in chat (top bar, metric tiles, parallel coordinates, grid, detail panel)
- [x] Mockup 2 shown in chat, built on the Export project data (preview modes, filmstrip, filters, compare panel)
- [x] Agent skills config (CLAUDE.md, docs/agents/)
- [x] `v2/` first working version: `index.html`, `style.css`, `app.js` (data-driven UI),
      `viewer.js` (three.js 0.160 from jsdelivr: GLB + legacy JSON parser). Tested on Export:
      image, 3D model, filters, compare, URL state. Open: `/v2/?PROJECT=Export`

## Next
1. User feedback on `v2/` (localhost:8765/v2/?PROJECT=Export or after deploy /dev/v2/?PROJECT=Export)
2. Test analysis mode when the GLB files arrive (add `analysis:<name>` columns to data.csv)
3. Legend for analysis meshes (values/colors are baked in the GLB: legend source to decide)

## Open questions
- What is `out:avrg`? (If it has a better direction, add the arrow in the CSV header.)
- Analysis legend: where do the min/max values and colors come from?
