# Design Explorer v2 — progress

> Current continuation: read `HANDOFF-DASHBOARD.md`. User selected A; that document records the final approved layout and next implementation work. Earlier prototype descriptions below are historical.

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

## Overview prototype — 2026-09-28 (Codex handover)
- User clarified the primary workflow: overview of both folder/method studies, inspect separately or together, scan options quickly, filter by measurements, and find strongest performers.
- Added local-only `?variant=A|B|C` layouts on the existing v2 route: combined gallery, methods side by side, results table. Prototype source: `v2/overview-prototype.js` and `.css`; existing loader retained. No layout has been selected yet; capture/promote the winner only after feedback.
- Shared numeric ranges, measurement ordering, per-method matching counts/percentages and best/median, plus image/3D option dialog with previous/next through filtered results. Labels remain from the CSV. Prototype positions are raw numeric positions, not the original 2% win verdicts.
- Local run: `python v2/_test/prototype_server.py` then `http://127.0.0.1:8766/v2/?data=/_study/01_cp/,/_study/02_veA/&variant=A`. Gitignored preview helper forwards read-only requests for the two named studies to the API; binds only to loopback. Normal static preview remains on 8765.
- Browser verified real 140-option load with images; first measurement above-average shortcut gives 52 matches overall and 27 in 02_veA, retained across method/layout changes; lower-first summer radiation ordering and option detail opening work.
- Still a throwaway layout experiment: filters/sort are memory-only, no shortlist/parallel chart in the prototype. Existing v2 remains reachable using Current v2. No commit, push or deployment performed.

### A refinement — inline preview + chart
- User chose A (filter sidebar + gallery), requested preview above options and retained parallel-coordinates filtering for their boss.
- Preview now sits at the top of the results column with image/3D picker, previous/next, result positions and compact/expanded size. Cards update it in place; selection follows remaining options if filters exclude it.
- Added collapsed-by-default Filter on chart using the existing ParallelChart. Results shown by default, optional numeric inputs, selected-option highlight, explicit active ranges and clear action. Sidebar and chart share the same ranges.
- Browser verified sidebar-to-brush and brush-to-sidebar updates, reset to 140 options, and card selection updating inline preview (Path 7). Syntax and diff checks passed. This remains the local prototype for feedback, not deployed.

### Preview/readability refinement
- Restored Image / 3D model / 3D analysis buttons; unavailable modes disabled when the study has no files. Additional views use a secondary selector.
- Moved expandable chart into the top section beside the heading, initially open. Enlarged media with a narrow right-side results column.
- Added result-distribution dots (large selected dot), worse/better endpoints respecting direction, and explicit standing among current matching options. Ties, single result, missing result and directionless results handled without invented rankings.
- Compact Compare methods strip names the selected measurement and labels Best result / Typical result (median).
- Browser checked mode switching, standings scope changing to 52 filtered options, synchronized chart ranges, and desktop layout. Syntax and diff checks passed.
