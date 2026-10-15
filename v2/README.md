# Design Explorer v2

A redesigned dashboard next to the classic one (`/index.html`, unchanged).
Static HTML + ES modules, no build step, served by the same nginx image.
Libraries load from jsdelivr: three.js 0.160 (import map in `index.html`), d3 v7, d3-dsv.

Words used below: a **study** is one project folder (one `data.csv`); an **option** is one row;
a **result** is an `out:` column; a **goal** is a result with a better direction (`↑` / `↓`);
when several studies are open, each is shown as a **method**.

## Open it

| What | URL |
|---|---|
| One study | `/v2/?PROJECT=STUDY` |
| Several studies (methods) together | `/v2/?PROJECT=STUDY_A,STUDY_B` |
| Short display names | `/v2/?PROJECT=FOLDER_A:Label A,FOLDER_B:Label B` |
| Local folder copy (tests) | `/v2/?data=/v2/_test/STUDY/` |
| The 2D analyses of one study (single option, level by level) | `/v2/analysis.html?PROJECT=STUDY` (optional `&an=<key>&level=<key>`) |

`?PROJECT=` loads `data.csv` and its files from the design-explorer API
(`.../v1/design-explorer/projects/<folder>/`, read only). On dev: `/dev/v2/?PROJECT=…`.

## Run locally

From the repo root:

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/v2/?PROJECT=STUDY`. `v2/_test/` is gitignored and excluded
from Docker (local test data).

## CSV conventions (everything is data-driven)

| Column | Meaning |
|---|---|
| `in:<name>` | input |
| `out:↑ <name>` / `out:↓ <name>` | goal: higher / lower is better |
| `out:<name>` | result without a better/worse direction (shown, never ranked) |
| `img`, `img:<view>` | image, one column per view |
| `threeD` | 3D model (`.json` legacy three.js format like the classic app, or `.glb`) |
| `analysis:<name>` | 3D analysis mesh with vertex colors (`.glb`), or a 2D plan analysis (`.svg`, see below) |
| `target:<result>` | optional target of the `out:` column with that name (arrow optional), e.g. `target:SUL (75% GFA) [m²]`; drawn as a red dot with its value on that result's axis in the parallel chart and on its bar in "Where this option stands", plus "% of target" |
| `table_<name>` | small table per option (`.csv`, first row = header) shown in the **Table** view; numbers are formatted, a first cell `Total` marks the totals row |

Labels are the column names as written (arrow removed). File names are relative to the
option's own study folder. Several studies are merged by column name.

### Layered 3D export

| Column | Meaning |
|---|---|
| `context` | shared site model (same file on every row), loaded once |
| `an_<name>` | analysis layer; every column starting with `an_` is one |
| `legend_an_<name>` | legend image (PNG) of that analysis; an empty cell falls back to `legend_an_<name>.png` in the study folder |
| any other column holding `.glb` files | geometry layer of the option (e.g. `masses`, `floors`, `short_facades`, `pools`, `decks`) |

All files share one origin (Y up, metres) and are overlaid as they are; the viewer shifts the
whole scene once by the context centre. Vertex colors stored as sRGB (bytes, or n/255 floats)
are converted to linear. Empty cells = no such layer for that option.

Views (`GENERAL_ONLY`, `ANALYSIS_ONLY`, `OVER_GENERAL` in `app.js`):
- **3D model** = general view: context + every layer except `floors`, `short_facades`.
- **3D analysis** = context faded + every layer except `masses` + the chosen `an_*` layer, unlit.
- Analyses listed in `OVER_GENERAL` start from the general view and hide only the layers they
  replace (pool / deck sun hours replace `pools` + `decks`).
- The analysis material has a depth offset, so it draws in front of layers sharing its surfaces.

### `layers.json` (optional): descriptions and scores

Read from the study folder next to `data.csv`; a study without it works as before (no "About",
no score). Fields used:

| Field | Use |
|---|---|
| `layers[]` / `tables[]` `.key` | the `an_*` / `table_*` column it describes |
| `.value_column` | the `out:` column that is its score (links a chart axis to the description) |
| `.label` | title of the "About" card |
| `.score_label` | name of the score shown on the 3D analysis, e.g. `Average`, `Floor Efficiency` (default `Score`) |
| `.description` | `[{heading, text}]`; lines starting with `- ` are bullets |
| `about` | `[{heading, text}]` common to all analyses, folded at the bottom of every card |

Same text in every open study: shown once. Different texts (e.g. one batch computed with noise
reflections, one without): one block per group of studies, with their colour dots.

### 2D analyses (plans)

An analysis is either 3D (`.glb`) or 2D (`.svg`). A 2D analysis is a vector plan: an SVG whose
`viewBox` is in metres in the plan view's own frame (x right, y down), shown by `plan2d.js` with
pan (drag), zoom (wheel, around the cursor; `+` / `−`) and Reset view (or double click). The view
changes the `viewBox`, so it stays sharp at any zoom; lines use `vector-effect="non-scaling-stroke"`
and keep their screen width. In the dashboard an `an_*` / `analysis:` cell holding an `.svg` is
shown that way in the preview (no level picker yet: one file per cell).

**Single-analysis page** (`analysis.html` + `analysis.js`): the 2D analyses of ONE study, no
`data.csv`, only `layers.json` and the SVGs in the study folder. Left sidebar: analysis menu,
the level's score, a vector legend, the rooms with their averages (hover = highlight
in the plan) and the description, always visible. Right: the plan, with the level buttons over it top right
(highest first); hovering a room shows its name, the value at that point and the room average. Pan and zoom are kept when the level or
the analysis changes (every level shares one plan frame); Reset view fits the level again. `?an=` / `?level=` keep the view in the address. Room numbers are shown on the plan by default (**Hide labels** / **Show labels**; they keep their screen size). **Copy link** copies the main link of the analysis on screen (`PROJECT` or `data` + `an`, no level or zoom). **Export view** saves the current view (same zoom and pan) as a vector PDF on A3 landscape: rooms, score and legend on the left, the plan with a graphic scale on the right, and the room numbers when labels are shown.

**Getting there and back**: the dashboard sidebar has a **Pages** group (drawer rows, rail icons): *Explore* (this page, the active
destination) and *Analysis*, a group that opens on a list of studies. The list holds the open studies whose `layers.json` has 2D
analyses, then every other study of the same place that has some: the first time the group is opened the app asks the folder that
holds the studies for its list (a JSON `[{ name }]`, the API's `/projects`, in practice ~40 small `layers.json` requests, kept for 10
minutes in `sessionStorage`) and keeps the studies with 2D analyses. A row opens `analysis.html` of that study (`PROJECT` or `data`,
as the dashboard was opened). On the analysis page an **Explore** button in the app bar goes back to the dashboard of the same study,
only when the study has a `data.csv` (a plans-only study, e.g. a daylight study, has nothing to explore).
The other way round, opening the dashboard on a plans-only study (no `data.csv`, 2D analyses in `layers.json`) opens its analysis page; with
several plans-only studies it lists their analysis pages; mixed with studies that have data, the dashboard explores those and the
plans-only ones stay in the *Analysis* list.

Files of a 2D study (written by the Grasshopper "EXPORT | Daylight 2D (SVG)" component):

| File | Content |
|---|---|
| `plan_<level>.svg` | the drawing: black poche (`fill-rule` even-odd), cut lines and thin lines, shared by every analysis of that level |
| `<key>_<level>.svg` | the analysis cells only, one `<g class="room" data-room="…" data-average="…">` per room, one `<path>` per colour with `data-value` (the value of those cells, for the point readout; optional); drawn under the plan |
| `layers.json` | `dim: "2d"`, `levels[]` and one entry per analysis (below) |

`layers.json` of a 2D study:

| Field | Use |
|---|---|
| `title` | optional page title (default: the folder name) |
| `levels[]` | `{ key, label, elevation_m, plan_file, viewbox }`, lowest first |
| `layers[]` with `kind: "analysis"`, `dim: "2d"` | `key`, `label`, `unit`, `better` (`higher` / `lower`), `file_pattern` (`<key>_<level>.svg`), `levels` (keys that exist), `score_label`, `scores` `{ level: value }`, `rooms` `{ level: [{ label, average, area_m2 }] }`, `legend` `{ min, max, segments, colors[] }` (colours spread evenly from min to max), `description` `[{ heading, text }]` |
| `parameters` | rows used by every analysis of the study (weather station, climate data, source models, grid, analysis plane, apertures, opaque surfaces...); a layer's own `parameters` (method, thresholds, hours...) follow. A row is `{ label, value }` or a group `{ label, items: [{ label, value }] }` (shown as a list). Shown in the folding section "Parameters of this study" |
| `about` | `[{ heading, text }]` shared by every analysis (e.g. The model, Limits), shown after the analysis' own description in "About this analysis" |

## Page, top to bottom

1. **Method tick boxes** ("All methods" ticks every method; untick some to leave them out, the last
   one stays ticked) and the
   **parallel-coordinates chart** (goals drawn with "better" at the top; drag on an axis to filter;
   a title with ⓘ opens its "About" card, closed with ✕ or a click outside it). A single input
   (e.g. Index) is always an axis; with several, "Show inputs" adds them. With several methods an input axis
   is split per method, top to bottom with a gap, each with a coloured bar: hover names the method,
   every click switches that method off or on, like the method ticks (no filter = every bar on);
   switched-off methods stay as pale lines, like any filter. The last bar on stays on; every bar
   on again, or "Clear chart filters", means no filter (no drag filter on that axis). Pale lines
   are not clickable.
2. **Filters** sidebar, one expandable section per way of filtering (badge = active):
   Header of a section: a small count when it is active and × to clear just that section.
   - **Measurements**: the same three rows per result (name with arrow, min – max, "Better than
     average" + the average of the methods shown), so every result has the same height. Sidebar and chart share one range state. "Reset" clears these ranges only.
   - **Pareto front** (`pareto.js`): "Only options on the front" keeps the options that no other
     option beats on every ticked goal (at least as good on all, better on one); the rest stay as
     pale lines. Computed over the methods shown, on the first 3 goals by default; the other
     filters don't change the front. With many goals almost every option is on it.
   "Clear chart filters" clears every filter (ranges, batch bars, Pareto).
   **Hiding a result**: on hover, an axis's "↑ better" line under the plot becomes "✕ hide". A hidden result
   disappears everywhere (chart, Measurements, Pareto goals, Where this option stands, Compare,
   Order by) and its filter is dropped; the "Hidden results" section of the sidebar (with its rail icon) lists them to
   bring one back, or all.
   Kept in the URL (`?hide=`, positions among inputs + results). Index can be hidden from the
   chart too.
3. **Preview**, hidden until an option is clicked: Image / 3D model / 3D analysis, previous/next,
   expand, ← → and Escape. A 3D analysis made of whole floors (the unit mix: one mesh per apartment per floor) gets a
   level picker on the right: "All" or one level at a time (L00 = lowest), every other surface of
   the option is hidden and the other levels stay as one halftone outer outline each (the boundary of all their
   pieces together: apartments, cores and corridors); the chosen level stays from option to option.
   A 3D analysis shows its score for the option top right (`score_label`
   + value + unit) and, like the Table view, an "ⓘ About" button. "Where this option stands" shows actual value positions among the
   matching options, in the right side sheet (under the preview below 1100px).
4. **Gallery** of matching options ("Order by" one result or Index; Index by default when the study
   has it, each batch together); "Compare" builds a shortlist of up to 4.
5. **Compare methods** (2+ methods shown): matching count, best and median per method.
6. **Compare options** (2 to 4 shortlisted options): slots A–D, a radar of all goals (axes
   scaled worst→best over all loaded options), "What each option does better" and the exact
   values with the best value found per result. Close results are "about the same": under 2%
   apart, or within 1 dB for noise (`compare.js`). "See comparison ↓" (shortlist line, and a
   pop-up for a few seconds after Compare) and "Back to options ↑" scroll there and back.

The URL keeps ticked methods, order, option, mode/layer, ranges, batch filter, shortlist and
"Show inputs", so the address bar shares the current view. "Copy link" copies the home page
instead: only `PROJECT` / `data` (which studies are open), none of the current state.

## Files

| File | Role |
|---|---|
| `index.html` | markup and import map. After edits bump every `?v=` (here and on the imports at the top of `app.js`): the server caches `.js` for 30 days |
| `app.js` | loading, state, filters, rendering, URL state, events |
| `pareto.js` | Pareto front of a set of options on chosen goals |
| `about.js` | "About" card content from `layers.json` (one block per study when texts differ) |
| `compare.js` | "about the same" and win rules |
| `comparison.js` | the Compare options section (radar, strengths, values table) |
| `parallel.js` | parallel-coordinates chart (d3) |
| `viewer.js` | three.js viewer: layer composition, GLB + legacy JSON, colors, camera |
| `plan2d.js` | 2D plan viewer (SVG layers, pan / zoom by viewBox, room hover) and `legendColor()` |
| `analysis.html` / `analysis.js` | single-analysis page: the 2D analyses of one study, level by level |
| `pdfexport.js` | "Export view" on the analysis page: vector PDF (A3 landscape) of the plan as framed, with legend, rooms, score and a graphic scale; loads jsPDF 2.5.1 + svg2pdf.js 2.2.3 from jsdelivr on first use |
| `style.css` | all styles; its colour/radius/font names are aliases of the `@acpvarchitects/ui` tokens |
| `theme/` | vendored `@acpvarchitects/ui` tokens (identical to 0.22.0, `scripts/check-theme-drift.mjs` verifies it) (`base.css`, `tertiary/coral.css`, `tokens/`) + local Inter font; see `theme/README.md`. `<body class="light-medium-contrast">` picks the contrast mode (as the library ThemeService does in the Angular apps); `<html class="acpv-density--2">` the density |

## Deploy (dev)

Push to `WIP` → `.github/workflows/snapshot.yml` builds the `branch-wip` image (the paths
filter includes `v2/**`) → the dev container updates → `/dev/v2/`.
