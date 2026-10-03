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
| `target:<result>` | optional target of the `out:` column with that name (arrow optional), e.g. `target:SUL (75% GFA) [m²]`; drawn as a red dot with its value on that result's bar in "Where this option stands", plus "% of target" |
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

## Page, top to bottom

1. **Method tick boxes** ("All methods", or tick 2+ to compare those) and the
   **parallel-coordinates chart** (goals drawn with "better" at the top; drag on an axis to filter).
2. **Measurements** sidebar: min/max per result and "Better than average" (average of the
   methods shown). Sidebar and chart share one range state.
3. **Preview**, hidden until an option is clicked: Image / 3D model / 3D analysis, previous/next,
   expand, ← → and Escape. "Where this option stands" shows actual value positions among the
   matching options.
4. **Gallery** of matching options ("Order by" one result); "Compare" builds a shortlist of up to 4.
5. **Compare methods** (2+ methods shown): matching count, best and median per method.
6. **Compare options** (2 to 4 shortlisted options): slots A–D, a radar of all goals (axes
   scaled worst→best over all loaded options), "What each option does better" and the exact
   values with the best value found per result. Close results are "about the same": under 2%
   apart, or within 1 dB for noise (`compare.js`). "See comparison ↓" (shortlist line, and a
   pop-up for a few seconds after Compare) and "Back to options ↑" scroll there and back.

The URL keeps ticked methods, order, option, mode/layer, ranges, shortlist and "Show inputs",
so "Copy link" shares the current view.

## Files

| File | Role |
|---|---|
| `index.html` | markup and import map. After edits bump every `?v=` (here and on the imports at the top of `app.js`): the server caches `.js` for 30 days |
| `app.js` | loading, state, filters, rendering, URL state, events |
| `compare.js` | "about the same" and win rules |
| `comparison.js` | the Compare options section (radar, strengths, values table) |
| `parallel.js` | parallel-coordinates chart (d3) |
| `viewer.js` | three.js viewer: layer composition, GLB + legacy JSON, colors, camera |
| `style.css` | all styles |

## Deploy (dev)

Push to `WIP` → `.github/workflows/snapshot.yml` builds the `branch-wip` image (the paths
filter includes `v2/**`) → the dev container updates → `/dev/v2/`.
