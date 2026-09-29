# Design Explorer v2

A redesigned dashboard that lives next to the classic one (`/index.html`, untouched).
Static HTML + ES modules, no build step, served by the same nginx image.
Libraries load from jsdelivr: three.js 0.160 (import map in `index.html`), d3 v7, d3-dsv.

Domain words (study, option, input, result, goal, method, about the same, win, shortlist,
best balance) are defined in [`../CONTEXT.md`](../CONTEXT.md). Use them.

## Open it

| What | URL |
|---|---|
| Two methods together (real review study) | `/v2/?PROJECT=01_cp,02_veA` |
| One study | `/v2/?PROJECT=MPW_01` |
| Four methods with short display names (`folder:Label`) | `/v2/?PROJECT=MPW_260928_01_AI_Claude:260928_01_AI,MPW_260928_02_PD_Liberal:260928_02_PD_Liberal,MPW_260928_02_PD_Strict:260928_02_PD_Strict,MPW_260929_02_AI_Claude:260929_02_AI` |
| Local folder copy (for tests) | `/v2/?data=/v2/_test/Export/` |

Online (after a deploy, see below): `http://designexplorer.acpv.local/dev/v2/?PROJECT=01_cp,02_veA`.

`?PROJECT=` loads `data.csv` and its files from
`http://api-node.acpv.local/dev/v1/design-explorer/projects/<name>/` (read only).
The project list is at `.../design-explorer/projects`.

## Run locally

From the repo root:

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/v2/?PROJECT=01_cp,02_veA`. The browser reads the API directly
(it works from localhost). If a browser can't reach the API, `v2/_test/prototype_server.py`
(gitignored, port 8766) proxies `/_study/01_cp/` and `/_study/02_veA/` read-only:
`http://127.0.0.1:8766/v2/?data=/_study/01_cp/,/_study/02_veA/`.

`v2/_test/` is gitignored and excluded from Docker (test data, screenshots, helper).

## CSV conventions (everything is data-driven)

| Column | Meaning |
|---|---|
| `in:<name>` | input |
| `out:↑ <name>` / `out:↓ <name>` | goal: higher / lower is better |
| `out:<name>` | result without a better/worse direction (shown, never ranked) |
| `img`, `img:<view>` | image, one column per view |
| `threeD` | 3D model (`.json` legacy three.js format like the classic app, or `.glb`) |
| `analysis:<name>` | 3D analysis mesh with vertex colors (`.glb`) |

**Layered 3D export** (MPW, first study `MPW_TEST_01`, spec from the exporter 2026-09-28):

| Column | Meaning |
|---|---|
| `context` | shared site model (`context.glb`, same file on every row), loaded once |
| `an_<name>` | analysis layer; every column starting with `an_` is one (label: name with spaces) |
| `legend_an_<name>` | legend image (PNG) of that analysis, shown in its 3D analysis view. Empty cell: the viewer tries `legend_an_<name>.png` in the option's folder (MPW_260928_01_AI_Claude has the files but empty cells); if that fails, "legend not in this export yet" |
| any other column holding `.glb` files | geometry layer of the option (`masses`, `floors`, `short_facades`, `pools`, `decks`) |

All files share one origin (Y up, metres) and are overlaid as they are; the viewer shifts the
whole scene once by the context centre. Colors are vertex colors stored as **sRGB bytes**: the
viewer converts them to linear. Empty cells = no such layer for that option (skipped).
Views (`GENERAL_ONLY` / `ANALYSIS_ONLY` in `app.js`, until the planned `manifest.json`):
- **3D model** = general view: context + every layer except `floors`, `short_facades`.
- **3D analysis** = context faded + every layer except `masses` + the chosen `an_*` layer, unlit.
- Exceptions in `OVER_GENERAL` start from the general view instead (masses on, context not
  faded) and hide only the layers they replace: `an_pool_sun_hours` (MPW_TEST_02) and
  `an_pool_deck_sun_hours` (MPW_2609xx collections) replace `pools` + `decks`. A new flat
  analysis on another layer needs one entry there.
- The analysis material has a depth offset, so it draws in front of layers that share its
  surfaces (floors' vertical faces, the ground under decks).
No legend is exported yet: the page says so instead of inventing a scale.

Labels are the column names as written (arrow removed). Never rename dataset words in code.
File names are relative to the option's own study folder. Several studies (`?PROJECT=A,B`)
are merged by column name; each study is shown as a **method** with its own color.

## Page, top to bottom (layout A, approved 2026-09-28)

1. **Method tabs** (All methods / each study) and the **parallel-coordinates chart** (always on).
   Goals are drawn with "better" at the top (↓ goals flipped). Drag on an axis = range filter.
   "Show inputs" adds input axes only when every option in scope has that input as a number.
2. **Measurements** sidebar: min/max per result (empty = no limit) and "Better than average"
   (average of the method shown). Sidebar and chart share one range state.
3. **Preview**, hidden until an option is clicked (card, chart line, bar name, "Inspect").
   Image / 3D model / 3D analysis buttons, previous/next through matching options, expand,
   ← → keys, Escape closes. It closes by itself (with a note) when its option is filtered out
   or belongs to another method. "Where this option stands" = dots at actual value positions
   among the matching options (plain counts, not the 2% rule).
4. **Gallery** of matching options, ordered by one result ("Order by", preferred direction).
   "Compare" puts up to 4 options on the shortlist.
5. **Compare methods** (All methods only): per method, matching count/%, best and median on the
   "Order by" result.
6. **Best at what**: one block per goal with the **2% rule** (`compare.js`): about the same when
   under 2% apart, a win only when >2% ahead. Scope: the shortlist once it has 2+, else the
   matching options. With several methods: "Best of each method" and "By method: X wins N of M".
   Big scopes show the top 5 and pin the previewed option with its rank.

The URL keeps method, order, option, mode/layer, ranges, shortlist and "Show inputs", so
"Copy link" shares exactly the current view.

## Files

| File | Role |
|---|---|
| `index.html` | markup for layout A, import map. After edits bump every `?v=` (here and on the imports at the top of `app.js`): the server caches `.js` for 30 days |
| `app.js` | loading, state, filters, rendering, URL state, events |
| `compare.js` | 2% "about the same" and win rules (pure functions) |
| `parallel.js` | `ParallelChart` (d3): axes, brushes, lines; `scope` key triggers a rebuild |
| `viewer.js` | three.js viewer: `compose([{url, kind}])` with kinds context / geometry / analysis; GLB + legacy JSON; cache per file; keeps the camera between options; sRGB vertex colors (bytes or n/255 floats) to linear; unlit analysis |
| `style.css` | all styles (one file) |

Earlier designs are kept on branches: `prototype/compare-variants` (Best at what A/B/C),
`prototype/overview-variants` (overview layouts A/B/C, A approved).

## Deploy (dev)

Push to `WIP` → `.github/workflows/snapshot.yml` builds the `branch-wip` Docker image →
Watchtower updates the dev container → live at `/dev/v2/`. The build only runs when the changed
paths match the workflow filter, so `v2/**` must be in that filter. Pushing to `WIP` deploys:
ask the user first.

## Not done yet

- Legend for analyses: PNGs per analysis now come with the MPW_2609xx collections
  (`legend_an_*`); older exports have none. The exporter plans a `manifest.json` (layers, kinds,
  units, legend range and colors). When it exists, read views and legends from it instead of
  `GENERAL_ONLY` / `ANALYSIS_ONLY`.
- Only `MPW_TEST_01` (4 options) uses the layered export so far.
