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
- Analysis in the same 3D window as a context model: `context` column (one GLB, same file on
  every row, loaded once). Must be exported from the same Rhino file/settings as the analysis GLBs.
- Legends (2026-09-25): Ladybug legend PNGs, one per analysis, shared by all options (same range).
  Planned column `legend:<analysis name>`, same file on every row; name must match `analysis:<name>`.
- Comparison design (grilling, see CONTEXT.md): shortlist up to 4, "about the same" = under 2% apart,
  wins counted only when >2% ahead, no-arrow results shown without verdict, one "Sort by" dropdown,
  keep "Best balance" with hover explanation.
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

- [x] Analysis mode tested with the user's Rhino GLB (`prova_path28_colori.glb`, Path 28) via
      local test copy `v2/_test/Export/` (gitignored, column `analysis:prova`).
      Open: `/v2/?data=/v2/_test/Export/&option=4&mode=analysis`
      Rhino GLB quirks handled in viewer.js: black base material, sRGB n/255 vertex colors.

- [x] Shortlist (up to 4, `?compare=`), one Sort by dropdown (`?sort=`), 2% rule everywhere (`v2/compare.js`)
- [x] "Best at what" section: prototype of 3 variants (A table, B option cards, C goal bars).
      Verdict 2026-09-25: user picked **C (goal bars)**, folded into `v2/app.js`.
      Prototype kept as primary source on branch `prototype/compare-variants` (commit 7dba5e5).

- [x] 2026-09-25/28: big studies (MPW_01, 140 options): top 5 bars + pinned selected option,
      three-column layout (filters left, "How X compares" right), multi-row filmstrip.
- [x] 2026-09-28: several studies at once: `?PROJECT=01_cp,02_veA` (any list). Study filter chips,
      "Best of each study" per goal + "By study: X wins N of M" (same 2% rule), color per study.
      01_cp (40) + 02_veA (100) = MPW_01 (140). Open: `/v2/?PROJECT=01_cp,02_veA`
- [x] 2026-09-28: parallel coordinates chart (boss likes the classic one): `v2/parallel.js` (d3 v7 CDN).
      Axes = inputs every option has + all results; "better" at the top (↓ goals flipped);
      lines colored by study; drag on an axis = filter (combined with sidebar filters, cleared by
      "Clear filters"); click a line = select; selected option = thick red line.

## Next
1. User feedback on `v2/`
2. Real analysis name + GLBs for all paths, uploaded to MinIO with an `analysis:<name>` column
3. Waiting for files: context GLB + legend PNGs (+ real analysis name)
4. Decide when/how to push the branch and deploy `/dev/v2/` (ask user first: push to WIP triggers deploy)

## Open questions
- MOX-gen01/02 use image columns `img_1`..`img_6` (v2 reads only `img` / `img:<view>`): not needed,
  user works on MPW (01_cp + 02_veA).
- What is `out:avrg`? (If it has a better direction, add the arrow in the CSV header.)
- Analysis GLB and threeD JSON use different coordinates (GLB x 403..570, JSON x -707..-183),
  so the context model can't be overlaid on the analysis yet.
