# Dashboard handoff — selected layout A

## Current state — 2026-09-28, after integration (read this first)

Layout A is now **the normal v2 page** (`v2/`), no longer a local-only prototype. The sections
further down ("Start here" onward) are the prototype-phase handoff: still useful background,
but where they conflict with this section, this section wins.

- Branch `feature/new-dashboard`, all work committed, **not pushed**. Nothing is deployed.
  Classic `/index.html` untouched. `.claude/` is untracked and belongs to the user's setup: leave it.
- How v2 works (URLs, CSV conventions, page sections, files, deploy): [`v2/README.md`](v2/README.md).
  Domain words: [`CONTEXT.md`](CONTEXT.md). History: [`PROGRESS.md`](PROGRESS.md).
- Run: `python -m http.server 8765 --bind 127.0.0.1` from the repo root, open
  `http://127.0.0.1:8765/v2/?PROJECT=01_cp,02_veA` (the browser reads the API directly).
- Prototype preserved on branch `prototype/overview-variants` (commit `cfafe66`, A/B/C + switcher).

### Decisions taken with the user during integration (2026-09-28)

1. **No preview until an option is clicked** (card, chart line, bar name, "Inspect"). When the
   previewed option gets filtered out, or belongs to another method after a method switch, the
   preview **closes** and a one-off note says why. (User request + choice.)
2. **"Best at what" (2% rule) and the shortlist (Compare, up to 4) are kept**, below the gallery
   after Compare methods. Scope: shortlist once it has 2+, else the matching options.
3. **"Better than average"** uses the average of the **method shown**: all options when
   "All methods" is selected, that study's own average when one method is selected. The sidebar
   shows the average used.
4. Kept from earlier v2: URL state + Copy link (method, order, option, mode, ranges, shortlist,
   inputs), 2% rule, legacy JSON + GLB 3D, "Best balance" label (card note + preview summary).
   Replaced by A (approved): old three-column layout, filmstrip, "How X compares" panel
   (now "Where this option stands"), Any/Better/Best-only segmented filters (now ranges).

### Verified in the browser (real 140 options, `?PROJECT=01_cp,02_veA`)

Loads 140 options with images, no console errors; preview hidden by default; card click opens
it in place (red chart line, outlined card); 02_veA tab → 100 lines, "Show inputs" appears,
open 01_cp option closes with note; "Better than average" on 02_veA → average 20, 46 of 100;
typed max → chart brush drawn; order by Summer (lowest first); shortlist of 3 → Best at what
scope "Shortlist · 3"; 3D model loads, Next keeps 3D mode; expand; ← → and Escape; a copied
link restores order, ranges, shortlist, option and mode. Desktop 1900 px screenshots checked;
narrow layout only checked in the small browser pane.

### Next

1. User feedback on the integrated page.
2. Share with colleagues = deploy to dev: add `v2/**` to the `frontend` paths filter in
   `.github/workflows/snapshot.yml` (otherwise a push with only v2 changes builds nothing),
   merge `feature/new-dashboard` into `WIP`, push → `branch-wip` image → Watchtower → live at
   `http://designexplorer.acpv.local/dev/v2/?PROJECT=01_cp,02_veA`. **Ask the user before
   pushing.** `WIP` had no new commits on 2026-09-28; the colleague branch
   `origin/feat/3d-analysis-layers` only touches classic `index.html` (no overlap).
3. Analysis for all options when the user sends GLBs + context GLB + legend PNGs
   (`analysis:<name>`, `context`, `legend:<name>` columns; see `v2/README.md`).

---

## Prototype-phase handoff (from the Codex session, kept as written)

Updated: 2026-09-28. User explicitly selected **A** and requested this handoff for another agent.

## Start here

1. Read this document, then `CONTEXT.md` for dataset/domain conventions. `PROGRESS.md` contains earlier history; this handoff supersedes conflicting layout descriptions there.
2. Inspect the current working tree before editing. Branch at handoff: `feature/new-dashboard`. The latest prototype work is **uncommitted**, including untracked source files. Preserve it and the pre-existing untracked `.claude/` directory.
3. Open the actual 140-option study using the local instructions below. Use **variant=A**, even if a currently open browser tab says B.
4. Continue from the approved design below. The next implementation task is to turn the selected prototype into maintainable v2 code, preserving the approved interactions. This handoff itself does not authorize publishing/deployment.

The user prefers discussing code/design questions before implementation unless they explicitly ask for a change. They have already selected A; do not restart the A/B/C choice.

## Purpose and approved design

People need to quickly scan many architectural options, filter by several measurements, find strong performers, and inspect a selected option. Each folder represents a different generation method. Users must see both methods together or inspect either separately.

**A means filters on the left, one combined gallery/results area on the right.** It does not mean one gallery column per method (that was B).

Current approved arrangement:

- Top left: short introduction and `All methods / 01_cp / 02_veA` controls, preserving folder names.
- Top right: compact parallel-coordinates chart, always visible. **No “Filter on chart” title, disclosure arrow, or collapsible behavior.** Keep concise drag/click guidance and clear-filter control. The boss values this chart; retain it.
- Below: measurement filter sidebar on the left. Shared ranges apply across methods.
- Right column begins with a large selected-option preview and a narrower results panel on its right. Clicking an option updates this preview **in place**, without a modal.
- Preview has **Image / 3D model / 3D analysis buttons**, not a primary dropdown. Additional image/analysis layers may use a secondary selector. Unavailable modes are disabled. Previous/next traverses matching options; expand/compact enlarges the preview.
- Results panel: each measurement’s value, a worse-to-better distribution of small dots, and a larger dot for the selected option. Plain wording such as “Better than 37 of 139 other options”; explicitly identify comparison scope. Lower-is-better results must point toward “Better” correctly. Directionless results say lower/higher without a performance verdict. These dots show actual value positions, not equally spaced ranks.
- Count and Order by control above the image gallery. Method colors/labels remain visible on cards. Ordering follows each measurement’s preferred direction.
- **Compare methods belongs below the entire gallery**, not between preview and gallery. It is secondary. Keep it compact, identify the measurement being compared, and use Best result / Typical result (median), plus matching count/percentage per method.

## Data and chart inputs

Real review study: `01_cp` has 40 options, `02_veA` has 100. Both share four results: View To Bocca D'arno, Horizontal View, Summer Solar Radiation, Winter Solar Radiation. Use actual CSV labels, never invented replacements or units.

Their inputs differ: `in:Path` versus `in:MASTER | Catalogue Seed`. Originally “Show inputs” did nothing because the prototype required inputs common to every option across both folders.

Current behavior:

- Combined view: four result axes. Hide Show inputs when there are no common numeric inputs.
- Single method: Show inputs is available and adds that method's numeric input axis.
- Changing method removes ranges for inputs unavailable in the new scope. Result ranges persist.
- Sidebar and chart use one range state: dragging updates sidebar bounds and matching cards; typing bounds/using shortcuts updates the chart brush.
- Chart lines use method colors, with selected option highlighted. Clearing chart filters currently clears all shared numeric ranges, but retains the chosen method.

## Files and current implementation state

| File | Role |
| --- | --- |
| `v2/overview-prototype.js` | Current approved visual/interaction reference; also retains obsolete B/C variants and switcher |
| `v2/overview-prototype.css` | Prototype styling; several iterative overrides, needs consolidation |
| `v2/app.js` | Original v2 data loading and implementation; local-only dynamic import of prototype when `variant` is present |
| `v2/parallel.js` | Existing D3 chart reused by prototype |
| `v2/viewer.js` | Existing three.js viewer reused by prototype; GLB + legacy JSON support |
| `v2/compare.js` | Original comparison/win rules, including 2% tolerance |
| `v2/index.html` | Existing page and import map |
| `v2/_test/prototype_server.py` | Gitignored local read-only preview proxy; important for reproducing this session |
| `.claude/launch.json` | Existing static-server launch configuration; not created by this session |

The prototype is enabled only on localhost/127.0.0.1 with `?variant=`. Normal v2 and classic root page still exist. There is no production integration, commit, push, or deployment from this session. A fresh clone will not include untracked files or the ignored preview helper unless explicitly preserved.

## Run locally

From the repository root:

```powershell
python v2/_test/prototype_server.py
```

Open:

```text
http://127.0.0.1:8766/v2/?data=/_study/01_cp/,/_study/02_veA/&variant=A
```

The helper binds to loopback only and forwards read-only GETs for these two study folders to:

```text
http://api-node.acpv.local/dev/v1/design-explorer/projects/<folder>/<asset>
```

It uses a direct connection without environment proxies. Initial browser requests to the internal API failed, while direct shell HTTP requests succeeded; this local helper made CSVs, images and models available on the same origin. The exact browser failure was not established. This is a preview workaround, not a production API change. It requires the internal service to be reachable.

Port 8766 may still be running; reuse it if healthy rather than starting another process. The original static preview may still run on 8765 (`python -m http.server 8765 --bind 127.0.0.1`).

For the four-option local analysis sample:

```text
http://127.0.0.1:8765/v2/?data=/v2/_test/Export/
```

The test directory, sample assets and screenshots are gitignored. Real analysis GLBs for all options, shared context model, and legends remain pending; consult the earlier progress notes. The user has not provided those files in this continuation.

## Next implementation work

1. Preserve a recoverable copy of the full prototype before removing B/C and the floating variant switcher. The chosen A design should become the normal v2 experience, not remain behind a local-only query gate. Leave the classic page intact.
2. Refactor the prototype into the existing static HTML/JS/CSS structure. Consolidate CSS overrides, separate media controls, filtering, chart synchronization and result display enough to make them maintainable. Reuse the viewer/chart rather than creating duplicate implementations.
3. Account explicitly for earlier v2 features during integration: URL state/copy link, shortlist up to four, comparison tolerance and legacy media support. They were not all carried into the prototype; their absence is not a user decision to delete them. Discuss any visible trade-off before dropping them.
4. Keep raw dot standings separate from the existing **2% “about the same” / win rule**. The prototype's “Best result” is a numeric extremum, not proof of a decisive win. Avoid implying a new win rule during integration.
5. Verify numeric edge cases and method transitions. The above-average shortcut currently uses the original combined-study mean even in single-method view; clarify its displayed scope or discuss a change rather than silently changing the baseline. Preserve selection/camera where appropriate, handle zero matches and missing media cleanly, and avoid reloading 3D on every unrelated filter redraw.
6. Verify desktop and narrow layouts, keyboard operation and the real study workflow below. Update progress with the final implementation state and any remaining limitations.

## Verification already performed / repeat after integration

- Real 140 options and images load through the preview helper.
- First result's above-average shortcut yields 52 matches overall; selecting 02_veA preserves that result filter and yields 27 of its 100 options (for the data read this session).
- Lower-first summer-radiation sorting works.
- Chart-to-sidebar and sidebar-to-chart ranges update; clear restores all 140 when All methods is selected.
- Cards update inline preview; image/3D buttons switch media; standings use the current matching group.
- Input toggle adds Path for 01_cp and MASTER | Catalogue Seed for 02_veA; combined view has four result axes and hides the unavailable toggle.
- Compare methods follows the gallery in DOM order.
- `node --check v2/overview-prototype.js` and `git diff --check` passed during edits. Browser checks were targeted manual interactions, not a comprehensive automated suite. Full analysis-mode/legend/context integration was not tested in this prototype.

## Boundaries

Preserve dataset names and the direction arrows from the CSV schema. No build-system migration is requested. Push/deployment is not authorized: the earlier handover says pushing WIP triggers deployment, so confirm the target before publishing. For cross-repository/organizational questions, follow the user's instruction to consult the read-only local ACPV wiki mirror, starting at `C:\Users\v.erikhova\.codex\acpv-wiki-dev\wiki\_INDEX.md`.
