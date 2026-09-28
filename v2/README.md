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
| `index.html` | markup for layout A, import map; bump `?v=` on `app.js` / `style.css` after edits |
| `app.js` | loading, state, filters, rendering, URL state, events |
| `compare.js` | 2% "about the same" and win rules (pure functions) |
| `parallel.js` | `ParallelChart` (d3): axes, brushes, lines; `scope` key triggers a rebuild |
| `viewer.js` | three.js viewer: GLB + legacy JSON; keeps the camera between options; fixes Rhino GLB black material and sRGB vertex colors |
| `style.css` | all styles (one file) |

Earlier designs are kept on branches: `prototype/compare-variants` (Best at what A/B/C),
`prototype/overview-variants` (overview layouts A/B/C, A approved).

## Deploy (dev)

Push to `WIP` → `.github/workflows/snapshot.yml` builds the `branch-wip` Docker image →
Watchtower updates the dev container → live at `/dev/v2/`. The build only runs when the changed
paths match the workflow filter, so `v2/**` must be in that filter. Pushing to `WIP` deploys:
ask the user first.

## Not done yet

- Analysis for all options: waiting for the user's GLBs per option, a shared context GLB
  (`context` column) and Ladybug legend PNGs (`legend:<analysis name>` column). Only Path 28
  of the old Export test has an analysis file (local test copy).
- The context GLB must be exported with the same Rhino settings as the analysis GLBs, or it
  won't line up.
