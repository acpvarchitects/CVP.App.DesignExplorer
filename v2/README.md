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
| The analyses of one study (single option): 2D plans level by level, or a 3D field in 3D / plan / section | `/v2/analysis.html?PROJECT=STUDY` (optional `&an=<key>&level=<key>`) |
| Two full study analyses, with option tabs and a linked 3D comparison | `/v2/analysis.html?PROJECT=STUDY_A:Option 1,STUDY_B:Option 2&tab=compare` |

`?PROJECT=` loads `data.csv` and its files from the design-explorer API
(`.../v1/design-explorer/projects/<folder>/`, read only). On dev: `/dev/v2/?PROJECT=…`.

## Run locally

From the repo root:

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/v2/?PROJECT=STUDY`. `v2/_test/` is gitignored and excluded
from Docker (local test data).

For live API studies from localhost, use `py -3 scripts/serve-local.py --port 8124`.
This read-only development server proxies study assets on the same origin, avoiding API CORS
restrictions. It rewrites the API URL in the served JavaScript only; production files stay unchanged.

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
| `mix_<name>` | unit mix per option (`.json`, see "Unit mix" below), shown as **Table · Unit mix**, in the **Program** tab and in Compare options |
| `title` | optional short free text per option (e.g. `26.1, refined 26: T06/T08 6 m south`), shown beside the option's name in the preview header and under it on its card (full text on hover). Never an axis, filter, cluster input or measurement; an empty cell or no column shows nothing |

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
- **ⓘ next to an optional layer:** when its `layers.json` entry has a `description`, the ⓘ beside its
  checkbox opens the same "About" card as the analyses. For a `spacing_zones` layer described with
  the ZRCH rules of 10/11/2026 (its text names that date) the card adds the spacing-rule diagrams
  (long fronts and the gap(H) chart, gables, corners, rotated pairs, footprint with balconies, zone
  colours) unless the export already names its own figures; any other `spacing_zones` shows its text only.
- **Optional layers:** a geometry layer whose `layers.json` entry has `"toggle": true` (e.g.
  `spacing_zones`, the minimum spacing zones between buildings) gets a checkbox under **Layers**,
  top left of the **3D model** (never in 3D analysis, which keeps its legend clear and its
  analysis unobstructed). It is drawn only while ticked (`"default_visible": true`
  ticks it on load), with `"opacity"` (0-1) for a translucent overlay. The choice is kept while
  stepping through options and views, the comparison uses it when it next draws, and it is in the link
  (`layers=<col>,<col>`, `layers=none`; omitted when equal to the defaults).

### Program tab (`an_unit_mix` + `mix_units`)

When a study has both the unit-mix 3D (`an_unit_mix`) and a unit-mix table (`mix_units`, or the
first `mix_<name>` column), the 3D leaves the **3D analysis** list and gets its own tab,
**Program**, next to it. The tab shows the 3D coloured by apartment size with the **Tower × size**
table in a panel over it (bottom right); **Side panel** docks the table beside the 3D, **Float**
puts it back, the arrow folds it to its title bar in both layouts (docked: the 3D takes the full width again). The coloured size headers are the legend.

- **Table → 3D:** a click on a tower name selects the tower, on a size header that size in every
  tower, on a cell that tower × size; Ctrl / ⌘ adds to the selection. The selected apartments keep
  their colour, the other apartments turn plain light grey, or are hidden with **Isolate**
  (cores, roofs and base floors too). Moving over the table previews the same. **Floors** cuts every tower from the top, outlines included.
- **3D → table:** a click on an apartment selects its cell; the pointer on one names it
  (`T05 · floor 12 · 220 m²`).
- The count next to the title is the selection (apartments and m²), or the whole option.
- The link (`psel`, `pdock`) keeps the selection and the docked table.

No extra export data: the 3D file has one mesh per apartment in the order of the table's JSON
(tower by tower, floor by floor, along the typical floor). The viewer checks it (as many meshes as
apartments in the group named after the column; same floor = same base height, next floor =
higher); balcony slabs follow their nearest apartment. If the check fails the table still shows,
with a note that the selection cannot reach the 3D. Compare options still lists the unit-mix 3D.

### Unit mix (`mix_<name>`, `unit-mix.js`)

The cell holds one JSON per option: `{version: 1, towers: [{id, floors, base, height_m, plate,
length_m, cores, hotel, zone}]}`. `plate` lists the unit types of one typical residential floor in
plan order; it repeats `floors` times and the `base` floors carry no apartments. The view has
tiles (apartments, area, one per size with a meter against the target, parking) and two tables:
**By tower** (tower rows with plate chips, slab length, floors + base, height, apartments, m², %,
parking, then one row per size; rows fold and unfold) and
**Tower × size** (matrix tinted by value, totals, target and gap, apartments or m²). One table for
every tower: `hotel` and `zone` in the JSON are no longer shown. Compare options
shows each option's totals per size against the target. Settings come from the column's
`layers.json` `tables[]` entry, under `mix`:

| Field | Use |
|---|---|
| `types[]` | `{key, label, area_m2, rgb, parking}`: column order, chip colour, m² per apartment, parking spaces per apartment |
| `target` | `{<type key>: count}`: target mix (tiles, target and gap rows) |
| `client` | `{units, area_m2, note}`: the client's own figures, shown next to the target |
| `parking_client_per_unit` | client's parking assumption, shown on the parking tile |
| `zones[]` | `{key, label}`: zone order and names; each tower's `zone` picks one |

Without `mix` the types come from the data in size order, grey, with no target.

### `layers.json` (optional): descriptions and scores

Read from the study folder next to `data.csv`; a study without it works as before (no "About",
no score). Fields used:

| Field | Use |
|---|---|
| `layers[]` / `tables[]` `.key` | the `an_*` / `table_*` column it describes |
| `.value_column` | the `out:` column that is its score (links a chart axis to the description) |
| `.label` | title of the "About" card |
| `.score_label` | name of the score shown on the 3D analysis, e.g. `Average`, `Floor Efficiency` (default `Score`) |
| `.description` | `[{heading, text}]`; lines starting with `- ` are bullets. A section may add `figure`: one diagram name or a list of them, drawn under its text (names in `about-figures.js`; unknown names are skipped) |
| `.toggle` / `.default_visible` / `.opacity` | geometry layers only: optional overlay with its own checkbox, initial state, transparency (see Views above) |
| `.node_opacity` | `{glTF node name: opacity}`: overrides `.opacity` for those nodes of the layer, e.g. `{"spacing_zones_clash": 0.85}` keeps clash patches strong inside light zones |
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
the analysis changes (every level shares one plan frame); Reset view fits the level again. `?an=` / `?level=` keep the view in the address. Room numbers are shown on the plan by default (**Hide labels** / **Show labels**; they keep their screen size). **Copy link** copies the main link of the analysis on screen (`PROJECT` or `data`, without navigation state). **Export view** saves the current view (same zoom and pan) as a vector PDF on A3 landscape: rooms, score and legend on the left, the plan with a graphic scale on the right, and the room numbers when labels are shown.

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

**3D analyses on the same page** (`volumeview.js`, `volume.js`, `slice2d.js`): a layer with `kind: "analysis"`,
`dim: "3d"` is a dense field on a regular grid (first case: the ZRCH hotel road-noise study). The left
sidebar is the same (analysis menu, mean over the analysed points, legend, description, parameters) plus the
**scenarios** of the field. On the right a switch between three views of the same field:

- **3D**: the model (`model.glb`, its own colours and edge lines) with the field on a horizontal and a
  vertical section plane. The elevation slider moves the horizontal plane, the key plan places the
  vertical one. "Cut the model at the planes" removes the model between the eye and each plane (the inside
  of a cut solid is the dark grey of the cut geometry). Two more ways to read the field, each with its
  tick box: "Points in the whole volume" draws every analysed point as a dot of its colour; "Colours on
  terrain and buildings" spreads the field on the model's surfaces (read a little outside each surface;
  canopies turn translucent, what lies outside the analysed box is pale grey).
- **2D Plan**: the field at the chosen elevation, with the model cut at that height, the edges below it
  (light) and the section line.
- **2D Section**: the vertical cut along the section line, with the cut terrain and buildings, model
  elevations on the left and the plan's height as a dashed line. "Heights" draws them ×1, ×2 or ×4.

The field on a plane is a colour map sampled from the volume (trilinear between the valid nodes of each
cell, weights rescaled: the "filled" reading of `volume.js`), so it reaches the ground and the walls instead
of stopping one grid step before them with a stepped edge. The cut geometry is drawn over it, in plan, in
section and on the 3D planes: terrain, buildings and the rest as one dark grey, canopies as a light green.
It comes from the model (`meshcut.js`: the cut of each layer chained into closed outlines, filled as their
union without outlines; a surface that is not a closed solid stays a line). The coarse mask never defines
the solid silhouette. The dots use the strict values
of the nodes. Hovering reads the value at that point. The whole view is one
serialisable object (`VolumeView.view()`: mode, scenario, plan height, section line, planes, cut, points,
colours on surfaces, heights, camera or 2D frame), kept in the address (`mode`, `sc`, `z`, `sec`, `planes`
with a letter per tick box: `h`, `v`, `c` cut, `p` points, `s` surfaces; `vx`, `cam` / `frame`) and
restored by opening that address; it is the base for saved viewpoints and a PDF of them (not built yet: no
"Export view" on a 3D analysis). three.js is loaded only when a 3D analysis is opened.

**Two-study analysis dashboard** (`analysiscompare.js`, `analysiscompare-state.js`, `analysiscompare.css`):
give `analysis.html` exactly two comma-separated `PROJECT` entries (or `data` folder URLs), with optional
`:Label` suffixes. Each option tab retains its full analysis viewer and controls. Compare shows those
same viewers side by side (stacked on narrow screens); Expand returns to one full option. Analysis
details can be shown in the comparison. Link views is on by default, and only links while Compare is
open: camera, mode, scenario, elevation, section line, vertical scale, display toggles and 2D pan/zoom.
Local coordinates are translated through each volume's `worldOriginRhino_m`; without known origins
or matching scenarios the views stay independent. A section outside the target volume also stays
independent to preserve its distance axis; linked elevations are limited to the target's bounds.
Matching analysis keys, scenario keys and units use one colour scale
covering both legends, with the first option's palette. Different quantities retain their own scales
and show an explanation. The shared scenario selector changes both options even with view linking off.
Copy link opens the initial study selection, without tab, linking/details or saved view settings. The address bar still retains the current view.
Single-study links still open directly. This is a visual comparison; it does not subtract fields or rank
options by their whole-volume means, which can cover different outdoor points.

Files of a 3D study (written by the Grasshopper "EXPORT | Full noise volume + DesignExplorer assets" component):

| File | Content |
|---|---|
| `volume.json` | `grid { dimensions [nx, ny, nz], spacing_m }` (nodes at `(i*sx, j*sy, k*sz)` local metres, Z up, `index = i + nx*(j + ny*k)`), `buffers [{ key, file, dtype, byteOffset, byteLength }]` (float32 fields and a uint8 `mask`, 0 = valid), `coordinates.worldOriginRhino_m` (its Z turns local heights into model elevations) |
| `field.bin` | the buffers, little-endian |
| `model.glb` | the model in the same origin, glTF Y-up `(x, z, -y)`, one node per layer, vertex colours, edge lines as a second primitive |
| `layers.json` | a `kind: "geometry"` layer (`file: "model.glb"`) and one `kind: "analysis"`, `dim: "3d"` layer: `key`, `label`, `unit`, `better`, `file` (`volume.json`), `legend`, `score_label`, `scenarios [{ key (a buffer), label, unit?, better?, legend? }]`, `description`; root `parameters` and `about` as in a 2D study |

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
   - **Clustering** (`clustering.js`): choose up to as many clusters as base options (including URL values); build a fixed base from the methods selected when enabled,
     with one real representative per group. Subsequent method/batch, measurement and Pareto
     filters only hide representatives; no regrouping or replacement. Set the group count
     and choose closest to centroid (default), or best on a result. Goal arrows supply the
     better direction; a result without one has a higher/lower selector. The grouping uses
     generation vectors only: changing the ranking result does not change the groups.
     Five deterministic k-means++ starts, minimum inertia; exact duplicate vectors stay
     together, so fewer than the requested groups may result. Missing scores fall back to
     the nearest-centroid option with an explicit count. Missing/incompatible generation
     data disables this reduction, with a reason. Cluster size and representative are listed;
     hover lists the members. The URL retains the base methods, count, ranking result and direction.
     Turn clustering off and on to capture a different base method set. Changing k refits this
     base; changing the result changes representatives only. A hidden result can still define
     the fixed representative criterion, so hiding an axis does not silently change the selection.
   "Clear chart filters" clears every filter (ranges, batch bars, Pareto, clustering).
   **Hiding a result**: on hover, an axis's "↑ better" line under the plot becomes "✕ hide". A hidden result
   disappears everywhere (chart, Measurements, Pareto goals, Where this option stands, Compare,
   Order by) and its filter is dropped; the "Hidden results" section of the sidebar (with its rail icon) lists them to
   bring one back, or all.
   Kept in the URL (`?hide=`, positions among inputs + results). Index can be hidden from the
   chart too.
3. **Preview**, hidden until an option is clicked: one row with the option's name, Image / 3D model /
   3D analysis and, at the right, one group `← → ⤢ ✕` (previous, next, full height / compact, close);
   ← → and Escape on the keyboard. It opens at the full height of the centre card (compact: 420px).
   **3D analysis ▾** and **Table ▾** open their choices directly from the mode button. Once a
   choice is active, only its title appears in that same button (`Winter sun ▾`). The category
   remains available in the accessible label and full-text hover title.
   Switching to another mode restores the inactive button's neutral label while retaining the
   remembered layer. These two modes no longer show a separate view dropdown. Menus support
   arrow keys, Home/End, Enter/Space, Escape, Tab and outside-click dismissal, and stay within
   the viewport. Other modes retain their existing view selector when more than one view exists.
   Header wrapping reserves room for the entire controls row, including previous/next,
   compact/expand and close: the batch label moves above first, then Index joins it if needed.
   After wrapping, the remaining controls align left; only at still smaller widths may the
   controls row itself wrap. This follows the actual available width, including sidebar changes.
   "Where this option stands" can be collapsed to a narrow right rail; on smaller screens its
   content below the image can be folded with the same control. The choice survives option changes.
   **Section snapping** (`scroll-snap.js`, while the centre card scrolls inside itself): the card
   never rests with the edge between two sections (chart, open option, gallery, Compare options)
   inside the view. One wheel step that would show the next section goes all the way to it, any
   other scroll settles the same way when it stops; inside a section taller than the view the
   scroll is free. A wheel over the 3D still zooms. A 3D analysis made of whole floors (the unit mix: one mesh per apartment per floor) gets a
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
   One **View for all compared options** dropdown switches every slot together between
   the study's images (for example Plan / Axonometric), 3D model, each analysis and tables.
   This selection is independent of the main preview and gallery thumbnail, and is retained
   in `compareview` in the URL. Missing assets are reported in their slot. Interactive viewers
   survive ordinary filter redraws; removing a slot releases its WebGL context and observers,
   and offscreen viewers skip drawing.
   View-only changes update the existing slots directly (no section HTML rebuild).
   This avoids detaching active WebGL canvases, which could leave Chrome displaying an
   older analysis while its HTML legend changed. Compositions also commit a frame immediately;
   offscreen detection uses current bounds rather than observer state across reparenting.
   On desktop, comparison uses the centre card's measured viewport height, with the sidebar
   either expanded or collapsed. Previews follow that height instead of growing with their width.
   The compact header combines the title, shared view selector and back button; long strengths
   and expanded exact-value tables remain scrollable. Radar axis descriptions appear beside
   the vertices without extra numbering, at a fixed readable text size. Lines are balanced and
   units stay with the preceding word. The
   best-found explanation sits with the expanded exact values.
   Hover a slot letter A–D, its coloured top band or the outer contour of its radar region
   to preview it; click to keep
   that option coloured while the others become muted cards and thin grey radar outlines.
   Hovering another slot temporarily previews it, then restores the pinned option. Click the
   pinned option again, click anywhere outside the letters/bands/radar contours, or press Escape to restore
   all colours. The top line keeps its original 3px thickness with a larger invisible hit area
   for hover and clicking. The controls also work with
   Tab and Enter/Space. Emphasis follows the option across redraws and clears if it is removed;
   it never reloads the comparison media.
   Radar picking uses the nearest contour within 5 screen pixels, independently of fill and
   drawing order. Clicking inside a region away from its boundary clears the selection.

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
| `about-figures.js` | diagrams for the "About" cards (`figure` in a description section); the spacing-rule set for `spacing_zones` |
| `compare.js` | "about the same" and win rules |
| `comparison.js` | the Compare options section (radar, strengths, values table) |
| `comparison-focus.js` | hover preview and pinned option emphasis, without rebuilding media |
| `preview-mode-menus.js` | integrated analysis/table menus, current-title labels and keyboard navigation |
| `preview-header-layout.js` | measured header wrapping, preserving room for the complete navigation group |
| `comparison-media.js` | independent media and viewer lifecycle for the shared Compare view selector |
| `parallel.js` | parallel-coordinates chart (d3) |
| `viewer.js` | three.js viewer: layer composition, GLB + legacy JSON, colors, camera, picking and emphasis (Program tab). Draws a frame only when the camera moves or something changes; the pieces of a layer that share a material are merged at load into one mesh (a layer used to be one draw call per glTF primitive), and the Program tab draws the apartments in one mesh per state |
| `plan2d.js` | 2D plan viewer (SVG layers, pan / zoom by viewBox, room hover) and `legendColor()` |
| `analysis.html` / `analysis.js` | single-analysis page: the analyses of one study (2D plans level by level, 3D fields) |
| `volumeview.js` | a 3D analysis: the 3D scene (reuses `viewer.js`) with the two section planes, the 2D plan and section, the cuts through the model, the view state |
| `volume.js` | reader of `volume.json` + `field.bin`: mask-aware sampling (strict or filled) and colour-map slices |
| `meshcut.js` | cuts of the model by a plane, chained into closed outlines (the solid cut geometry of plans, sections and 3D planes) |
| `slice2d.js` | canvas drawing of a slice (image + line work, pan / zoom) and the key plan of the section line |
| `pdfexport.js` | "Export view" on the analysis page: vector PDF (A3 landscape) of the plan as framed, with legend, rooms, score and a graphic scale; loads jsPDF 2.5.1 + svg2pdf.js 2.2.3 from jsdelivr on first use |
| `style.css` | all styles; its colour/radius/font names are aliases of the `@acpvarchitects/ui` tokens |
| `theme/` | vendored `@acpvarchitects/ui` tokens (identical to 0.22.0, `scripts/check-theme-drift.mjs` verifies it) (`base.css`, `tertiary/coral.css`, `tokens/`) + local Inter font; see `theme/README.md`. `<body class="light-medium-contrast">` picks the contrast mode (as the library ThemeService does in the Angular apps); `<html class="acpv-density--2">` the density |

## Deploy (dev)

Push to `WIP` → `.github/workflows/snapshot.yml` builds the `branch-wip` image (the paths
filter includes `v2/**`) → the dev container updates → `/dev/v2/`.

### Analysis loading, sections and initial view

The analysis page shows a loading spinner from the initial HTML until its manifest, model,
field and first view are ready, including each frame in Compare. Errors dismiss the spinner.
New 3D views enable **Vertical plane** and **Colours on terrain and buildings**; explicit view parameters in
existing URLs still restore their settings. **Copy link** copies only `PROJECT` / `data`, in both
single and comparison pages, so the recipient opens the initial view.

Solid sections use the actual triangle-model cut, filled together with the non-zero rule in
`#282828`, without strokes. The coarse analysis mask no longer supplies a grey silhouette.
The key plan is a cached orthographic top view of the complete model in its original colours,
independent of the analysis, elevation, scenario and clipping planes; only the section line moves.

For ZRCH HotelNoise studies the default plan elevation is **+14 m** in model coordinates
(user instruction, 2026-11-13); it is converted to local grid height by subtracting the volume
origin. A layer can set `default_plan_elevation_m` explicitly. A saved URL elevation overrides
this default, and other studies keep their automatic initial elevation.

Plan elevation accepts a typed model quota (Enter or leaving the field); values outside the
volume clamp to its minimum/maximum, and an empty field restores the current quota.
The key plan supports wheel zoom around the pointer and right/middle drag to pan; its Refit
icon appears after navigating away from the fitted view and resets only the key-plan framing.
In 2D Section, **Hide/Show plan** toggles the draggable horizontal plan line. In 2D Plan,
**Hide/Show section** toggles the section line: drag the line to translate it or its endpoints
to rotate it. Both the plan and key plan snap within 8 degrees of either site axis;
In the key plan, dragging the existing line translates it; clicks away from the line and endpoints never create or move a section. Other drags still pan the drawing. Guide visibility is kept in the view address.
Plans and sections show the analysis, dark cut fill and exposed model edges only. Uncut
surfaces write depth to hide lines behind nearer geometry; their shading/colours are never
composited into the drawing. The separate key plan retains the model's original colours.
Section endpoints stay inset from the key-plan border so both handles remain reachable.
Orthogonal snapping is limited to 8 screen pixels as well as the angle threshold, so a long
section can still be freely rotated by an intentional drag.

Projection edges use the original light 22% black appearance. Cut tree canopies keep their
original translucent green fill and outline.
