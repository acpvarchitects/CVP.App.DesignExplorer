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

## Layout A integrated — 2026-09-28 (Claude, after the Codex prototype)
- Prototype snapshot committed (`cfafe66`) and kept on branch `prototype/overview-variants`.
- Layout A is now the normal `v2/` page (`28245ae`); B/C variants, switcher and
  `overview-prototype.*` removed from the feature branch. One consolidated `v2/style.css`.
- User decisions: preview hidden until an option is clicked, closes (with a note) when its option
  is filtered out / not in the method shown; "Best at what" + shortlist kept below the gallery;
  "Better than average" = average of the method shown.
- Docs for handoff: `HANDOFF-DASHBOARD.md` (current-state section on top), `v2/README.md` (new),
  `CONTEXT.md` (+ Method).
- Next: user feedback; deploy to dev needs `v2/**` in the snapshot.yml paths filter + merge to
  `WIP` + push (ask first); analysis files for all options still pending.
- 2026-09-28: layered 3D export from the exporter (study `MPW_TEST_01`, 4 options): `context`
  (shared), geometry layers (masses, floors, short_facades, pools, decks), `an_*` analyses.
  Viewer composes layers, fades context in analysis views, unlit analysis, byte sRGB colors to
  linear; view rules `GENERAL_ONLY`/`ANALYSIS_ONLY` in app.js until the planned manifest.json.
  Legend not exported yet (page says so). Module imports now versioned (`?v=`) for cache busting.
- 2026-09-28: analysis views showed white patches: the `floors` layer has vertical faces exactly
  on the analysis surfaces (6,038 coplanar triangles for Option25; masses 13,244 but masses are
  hidden there). Fix: analysis material uses a depth offset (polygonOffset) so it draws in front.
  User didn't want layer checkboxes (tried, removed).
- 2026-09-28: new analysis `an_pool_sun_hours` (study `MPW_TEST_02`, result `out:↑ Pool Summer
  Sun Hours`): picked up automatically as an `an_*` column; view rule `OVER_GENERAL` in app.js =
  general view with pools + decks replaced by the analysis, context not faded.
- 2026-09-29: four MPW collections wired together (280 options): MPW_260928_01_AI_Claude (40),
  MPW_260928_02_PD_Liberal (100), MPW_260928_02_PD_Strict (100), MPW_260929_02_AI_Claude (40).
  New: `folder:Label` display names in `?PROJECT=` (user: no "Claude" in the names shown);
  `legend_an_*` PNG legends shown in the analysis view; noise analysis `an_noise_from_pool_deck`
  (facade view, automatic); pool rule also for the renamed `an_pool_deck_sun_hours`.
  Legend PNG titles are cut off by the exporter ("Noise from p"): tell the exporter.
- 2026-09-29: MPW_260928_01_AI_Claude showed no legend: its CSV leaves `legend_an_*` cells empty
  although the PNGs are in the folder (identical to the other 3 collections). Viewer now falls
  back to `legend_an_<name>.png` in the option's folder. Exporter should fill the cells.
- 2026-09-29: methods are tick boxes (user request): tick 2+ to see and compare just those;
  scope, chart, averages ("Better than average"), Compare methods and Best at what "By method"
  follow the ticked set; `?methods=A,B` (old `?method=` links still load). Legend "missing"
  report was the blue collection's empty cells (fixed before, needs Ctrl+F5).

## Deployed to dev — 2026-09-29
- Pushed ONE clean commit `9dcbfb3` to `origin/WIP` (fast-forward from e2193e7): only `v2/` code,
  a generic public `v2/README.md`, `.gitignore`/`.dockerignore` lines and `v2/**` in the
  snapshot.yml paths filter. No private docs (HANDOFF, PROGRESS, CONTEXT, CLAUDE.md,
  docs/agents), no study/site names, no "Claude" (user request: no co-author line either),
  "Classic view" button removed (user request). Repo is PUBLIC.
- GitHub Actions run 36544118577: success (branch-wip image pushed). Live URL once Watchtower
  updates: `http://designexplorer.acpv.local/dev/v2/?PROJECT=…`.
- How to deploy later (keep private stuff out): on `WIP`, `git checkout feature/new-dashboard --
  v2/<code files>` (NOT v2/README.md: the public one lives on WIP), scan for private strings
  (claude, study names, usernames), commit without co-author line, push. `feature/new-dashboard`
  keeps the detailed README and private docs; its code is synced with WIP (`214b4f7`).
- 2026-09-29: folders renamed on MinIO (no "Claude"): MPW_260928_01_AI, MPW_260929_02_AI. Live link:
  `http://designexplorer.acpv.local/dev/v2/?PROJECT=MPW_260928_01_AI,MPW_260928_02_PD_Liberal,MPW_260928_02_PD_Strict,MPW_260929_02_AI`
  (office LAN or ACPV VPN only). Old *_Claude links no longer load.
- 2026-09-29: comparison prototype variant B made real (`v2/comparison.js`), replacing "Best at
  what" (user decision). Noise "about the same" = within 1 dB (user decision), in compare.js.
  Prototype (A/B/C + tweaks) kept on branch `prototype/comparison-variants`. Not deployed yet.
