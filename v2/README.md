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
| `analysis:<name>` | 3D analysis mesh with vertex colors (`.glb`) |
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
3. **Preview**, hidden until an option is clicked: Image / 3D model / 3D analysis, previous/next,
   expand, ← → and Escape. A 3D analysis shows its score for the option top right (`score_label`
   + value + unit) and, like the Table view, an "ⓘ About" button. "Where this option stands" shows actual value positions among the
   matching options.
4. **Gallery** of matching options ("Order by" one result); "Compare" builds a shortlist of up to 4.
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
| `style.css` | all styles |

## Deploy (dev)

Push to `WIP` → `.github/workflows/snapshot.yml` builds the `branch-wip` image (the paths
filter includes `v2/**`) → the dev container updates → `/dev/v2/`.
