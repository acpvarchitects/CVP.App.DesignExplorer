# Design Explorer v2 — progress

Branch: `feature/new-dashboard` (from `WIP`)

## Goal
A redesigned dashboard built alongside the current one, so the current one keeps working.
Show it to colleagues first, and launch it only if it works well. Keep it simple, no over-engineering.

## Decisions
- Separate page (planned: `v2/index.html`). The current `index.html` is not touched.
- Static HTML + D3, same as now: no build step, same Docker/nginx image.
- Same CSV format as now (`in:` / `out:` / `img` / `threeD` columns).
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

## Next
1. Get feedback on the mockup layout
2. Build the `v2/index.html` skeleton with the new layout
3. Wire up the CSV loading + parallel coordinates
4. 3D viewer for colored meshes (three.js)

## Open questions
- Mockup 2 feedback
- What is `out:avrg`, and is higher better?
- CSV columns for several views/analyses: proposed `img:Axo`, `img:Top`, `model` (.glb),
  `analysis:<name>` (.glb): needs confirmation
