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

## Done
- [x] Branch created
- [x] Layout mockup shown in chat (top bar, metric tiles, parallel coordinates,
      design grid, detail panel with 2D/3D toggle + colored mesh + legend + attributes)

## Next
1. Get feedback on the mockup layout
2. Build the `v2/index.html` skeleton with the new layout
3. Wire up the CSV loading + parallel coordinates
4. 3D viewer for colored meshes (three.js)

## Open questions
- Mockup: what should change?
- Colored mesh file format: Spectacles `.json` (like now), `.glb`, `.ply`, `.obj`, other?
