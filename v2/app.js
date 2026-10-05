// Design Explorer v2 — layout A: filters on the left, one combined gallery on the right.
// Every label, filter and comparison is read from the CSV columns, so a new
// dataset (or a new parameter in an existing one) needs no code change.
//
// Column conventions:
//   in:<name>          input parameter
//   out:↑ <name>       result, higher is better
//   out:↓ <name>       result, lower is better
//   out:<name>         result with no better/worse direction
//   img, img:<view>    image of the option, one column per view
//   threeD             3D model (.json like the classic app, or .glb)
//   analysis:<name>    3D analysis mesh with vertex colors (.glb)
//   target:<result>    optional target of the out: column with that name (arrow optional),
//                      drawn as a red dot on the result's chart axis and bar
//   table_<name>       small table per option (.csv, first row = header), "Table" view
// Layered 3D export (see v2/README.md):
//   context            shared site model, same file on every row
//   an_<name>          analysis layer (any column starting with an_)
//   legend_an_<name>   legend image (PNG) of that analysis
//   <name>             any other column holding .glb files is a geometry layer
//                      (masses, floors, short_facades, pools, decks…)
//
// Page sections, top to bottom: method tabs + chart, measurement filters,
// preview (only after clicking an option), gallery, Compare methods, Compare options.
import { csvParse } from "https://cdn.jsdelivr.net/npm/d3-dsv@3/+esm";
import { Viewer } from "./viewer.js?v=29";
import { rankGoals } from "./compare.js?v=37";
import { comparisonHtml } from "./comparison.js?v=37";
import { ParallelChart } from "./parallel.js?v=27";
import { aboutHtml, described, entryForResult, entryForView } from "./about.js?v=1";

const API_BASE = "http://api-node.acpv.local/dev/v1/design-explorer";
const MAX_SHORTLIST = 4;
// One color per method (study), in load order; enough for 8 methods before repeating.
const STUDY_COLORS = ["#185fa5", "#ba7517", "#0f6e56", "#993556", "#6f42c1", "#d1495b", "#4a5a6a", "#8b5e34"];
const BEST_BALANCE_HELP = "Best average position across all goals, among the matching options";
// Layered export without a manifest yet: which geometry layers each 3D view shows.
// "3D model" = the general view; "3D analysis" hides the masses so they don't cover the
// colored facades. Layers not listed appear in both views.
const GENERAL_ONLY = new Set(["masses"]);
const ANALYSIS_ONLY = new Set(["floors", "short_facades"]);
// Analyses shown on top of the general view instead (masses on, context not faded),
// each hiding the layers it replaces: analysis column -> replaced layers.
const OVER_GENERAL = { an_pool_sun_hours: ["pools", "decks"], an_pool_deck_sun_hours: ["pools", "decks"] };
const MODES = [
    { key: "image", label: "Image", layers: "images" },
    { key: "model", label: "3D model", layers: "models" },
    { key: "analysis", label: "3D analysis", layers: "analyses" },
    { key: "table", label: "Table", layers: "tables" },
];

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = {
    methods: new Set(), // ticked study names; empty = all methods
    ranges: {}, // column -> [low, high]; either end may be ±Infinity (no limit)
    batch: "", // study kept by a click on its Index bar (a filter: the others stay as pale lines); "" = none
    showInputs: false, // input axes on the chart
    order: "", // result column that orders the gallery
    sel: null, // option index shown in the preview; null = preview closed
    mode: "image",
    layer: { image: 0, model: 0, analysis: 0, table: 0 },
    expanded: false,
    shortlist: [], // option indexes, in the order they were picked
    notice: "", // one-off message, e.g. why the preview closed
};
let data; // { studies, schema, options, stats }
let viewer;
let chart;
let mediaKey = null; // what the preview media currently shows, to avoid reloading 3D
let lastView = null; // the view of the latest render (for chart callbacks)
const cards = new Map(); // option index -> gallery card element

// ---- Reading the dataset ----

// One study per project folder; ?PROJECT=A,B opens several studies together.
// "folder:Label" shows Label instead of the folder name (e.g. ?PROJECT=FOLDER_A:Label).
function resolveStudies() {
    const list = (key) => (params.get(key) || "").split(",").map((s) => s.trim()).filter(Boolean);
    // The label follows the last ":" that isn't part of "://" and contains no "/".
    const named = (entry) => {
        const m = entry.match(/^(.+?):(?!\/\/)([^/]+)$/);
        return m ? [m[1].trim(), m[2].trim()] : [entry, ""];
    };
    const projects = list("PROJECT");
    if (projects.length) {
        return projects.map((entry) => {
            const [folder, label] = named(entry);
            return { name: label || folder, base: `${API_BASE}/projects/${encodeURIComponent(folder)}/` };
        });
    }
    return list("data").map((entry) => {
        const [folder, label] = named(entry);
        const base = folder.replace(/\/*$/, "/");
        return { name: label || decodeURIComponent(base.split("/").filter(Boolean).pop()), base };
    });
}

// `rows` (optional) tells which unprefixed columns hold 3D files (geometry layers).
function readSchema(columns, rows = []) {
    const schema = { inputs: [], outputs: [], images: [], models: [], analyses: [], layers: [], tables: [], context: null };
    const holds3d = (col) => rows.some((r) => /\.(glb|gltf)$/i.test((r[col] || "").trim()));
    const targets = new Map(); // result name (arrow removed) -> target column
    const bare = (name) => name.replace(/^[↑↓]/, "").trim();
    for (const col of columns) {
        const sep = col.indexOf(":");
        const prefix = (sep < 0 ? col : col.slice(0, sep)).trim().toLowerCase();
        const name = sep < 0 ? "" : col.slice(sep + 1).trim();
        if (prefix === "in" && name) {
            schema.inputs.push({ col, label: name });
        } else if (prefix === "out" && name) {
            const dir = name.startsWith("↑") ? 1 : name.startsWith("↓") ? -1 : 0;
            schema.outputs.push({ col, label: dir ? name.slice(1).trim() : name, dir });
        } else if (prefix === "img") {
            schema.images.push({ col, label: name || "Image" });
        } else if (prefix === "threed") {
            schema.models.push({ col, label: name || "3D model" });
        } else if (prefix === "analysis" && name) {
            schema.analyses.push({ col, label: name });
        } else if (prefix === "target" && name) {
            targets.set(bare(name), col);
        } else if (sep < 0 && prefix.startsWith("table_")) {
            schema.tables.push({ col, label: col.slice(6).replace(/_/g, " ") });
        } else if (sep < 0 && prefix === "context") {
            schema.context = { col };
        } else if (sep < 0 && prefix.startsWith("an_")) {
            schema.analyses.push({ col, label: col.slice(3).replace(/_/g, " "), composed: true });
        } else if (sep < 0 && holds3d(col)) {
            schema.layers.push({ col, label: col.replace(/_/g, " ") });
        }
    }
    for (const m of schema.outputs) m.targetCol = targets.get(bare(m.col.slice(m.col.indexOf(":") + 1)));
    // Legend images: legend_<analysis column> (layered export) or legend:<analysis name>.
    for (const col of columns) {
        const key = col.trim().toLowerCase();
        const a = key.startsWith("legend_")
            ? schema.analyses.find((x) => x.col.toLowerCase() === key.slice(7))
            : key.startsWith("legend:")
              ? schema.analyses.find((x) => x.label.toLowerCase() === key.slice(7).trim())
              : null;
        if (a) a.legendCol = col;
    }
    // Layered export: "3D model" shows the general view made of the geometry layers.
    if (schema.layers.length) schema.models.push({ col: null, label: "General view", composed: true });
    return schema;
}

// `first` is the index of the study's first option in the combined list.
// `name` is the option's own name; `title` adds the study when several are open.
function readOptions(rows, study, first, prefixed) {
    const schema = readSchema(rows.columns, rows);
    const single = schema.inputs.length === 1 ? schema.inputs[0] : null;
    return rows.map((row, i) => {
        const values = {};
        const targets = {};
        for (const m of schema.outputs) {
            values[m.col] = parseFloat(row[m.col]);
            if (m.targetCol) targets[m.col] = parseFloat(row[m.targetCol]);
        }
        const name = single ? `${single.label} ${row[single.col]}` : `Option ${i + 1}`;
        return { index: first + i, row, values, targets, study, name, title: prefixed ? `${study.name} · ${name}` : name };
    });
}

function computeStats(options, outputs) {
    const stats = {};
    for (const m of outputs) {
        const vals = options.map((o) => o.values[m.col]).filter(Number.isFinite);
        stats[m.col] = {
            min: vals.length ? Math.min(...vals) : NaN,
            max: vals.length ? Math.max(...vals) : NaN,
            mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN,
        };
    }
    return stats;
}

async function loadStudy(study) {
    const response = await fetch(study.base + "data.csv?v=" + Date.now());
    if (!response.ok) throw new Error(`${study.name}: ${response.status} ${response.statusText}`);
    const parsed = csvParse((await response.text()).replace(/^﻿/, ""));
    const rows = parsed.filter((r) => Object.values(r).some((v) => v !== ""));
    rows.columns = parsed.columns;
    return rows;
}

// layers.json (optional): descriptions, score names and settings of the analyses. A study
// without one simply shows no "About" and no score.
async function loadManifest(study) {
    try {
        const response = await fetch(study.base + "layers.json?v=" + Date.now());
        study.manifest = response.ok ? await response.json() : null;
    } catch (e) {
        study.manifest = null;
    }
}

// ---- Scope, filters and order ----

const goals = () => data.schema.outputs.filter((m) => m.dir);
const inMethod = (o) => !state.methods.size || state.methods.has(o.study.name);

// How the current method choice reads in sentences: "all methods", "A", "A + B".
function scopeLabel() {
    if (data.studies.length < 2) return "all options";
    if (!state.methods.size) return "all methods";
    return data.studies.filter((s) => state.methods.has(s.name)).map((s) => s.name).join(" + ");
}
const valueOf = (o, col) => (col in o.values ? o.values[col] : parseFloat(o.row[col]));
const outputByCol = (col) => data.schema.outputs.find((m) => m.col === col);
// "Order by" also offers the inputs (e.g. the option Index), above the results, lowest first.
const inputByCol = (col) => data.schema.inputs.find((m) => m.col === col);
const orderBy = (col) => outputByCol(col) || (inputByCol(col) && { ...inputByCol(col), dir: 0, input: true });

// Inputs that every option in the scope has as a number (only those can be chart axes).
const inputAxesFor = (scope) =>
    data.schema.inputs.filter((m) => scope.length && scope.every((o) => Number.isFinite(parseFloat(o.row[m.col]))));

function passes(o) {
    if (state.batch && o.study.name !== state.batch) return false;
    for (const [col, [lo, hi]] of Object.entries(state.ranges)) {
        const v = valueOf(o, col);
        if (!(v >= lo && v <= hi)) return false;
    }
    return true;
}

// Order by: goals best first (↓ goals lowest first), other results high to low.
function ordered(list) {
    const m = orderBy(state.order);
    if (!m) return list;
    const dir = m.input ? -1 : m.dir || 1;
    // An input (e.g. Index) is not a ranking: keep each loaded batch (study) together, in load order.
    const batch = (o) => data.studies.indexOf(o.study);
    return [...list].sort((a, b) => {
        if (m.input && a.study !== b.study) return batch(a) - batch(b);
        const va = valueOf(a, m.col);
        const vb = valueOf(b, m.col);
        if (!Number.isFinite(va)) return 1;
        if (!Number.isFinite(vb)) return -1;
        return dir * (vb - va);
    });
}

// Everything the page shows is computed from this once per render.
function computeView() {
    const scope = data.options.filter(inMethod);
    const visible = ordered(scope.filter(passes));
    return {
        scope,
        visible,
        visibleSet: new Set(visible),
        stats: computeStats(visible, data.schema.outputs),
        results: rankGoals(visible, goals()), // wins among the matching options (2% rule)
    };
}

// ---- Comparing options (raw positions, separate from the 2% win rule) ----

function goodness(o, m, stats) {
    const s = stats[m.col];
    const v = o.values[m.col];
    if (!Number.isFinite(v)) return null;
    const p = s.max > s.min ? (v - s.min) / (s.max - s.min) : 0.5;
    return m.dir < 0 ? 1 - p : p;
}

function balance(o, view) {
    const g = goals()
        .map((m) => goodness(o, m, view.stats))
        .filter((v) => v != null);
    return g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0;
}

function isBestBalance(o, view) {
    if (goals().length < 2 || view.visible.length < 2) return false;
    return balance(o, view) === Math.max(...view.visible.map((p) => balance(p, view)));
}

const bestAt = (o, view) => view.results.filter((r) => r.winner === o).map((r) => r.goal);

function median(vals) {
    const s = vals.filter(Number.isFinite).sort((a, b) => a - b);
    if (!s.length) return NaN;
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ---- Helpers ----

function fmt(v) {
    if (!Number.isFinite(v)) return "—";
    const a = Math.abs(v);
    return v.toLocaleString(undefined, { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 2 });
}


function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// File names in the CSV are relative to the option's own study folder.
function assetUrl(o, name) {
    if (!name) return null;
    if (/^(https?:)?\/\//i.test(name) || name.startsWith("/")) return name;
    return o.study.base + name;
}

const modeInfo = (key = state.mode) => MODES.find((m) => m.key === key);
const layersOf = (key = state.mode) => data.schema[modeInfo(key).layers];
const directionText = (m) => (m.dir > 0 ? "Higher is better" : m.dir < 0 ? "Lower is better" : "No preferred direction");
const arrow = (m) => (m.dir > 0 ? " ↑" : m.dir < 0 ? " ↓" : "");
const methodLabel = (o) => `<span class="method-label" style="--method:${o.study.color}">${esc(o.study.name)}</span>`;
const thumbUrl = (o) => {
    const img = data.schema.images[state.layer.image] || data.schema.images[0];
    return img ? assetUrl(o, o.row[img.col]) : null;
};

function showMessage(html) {
    $("app").hidden = true;
    $("message").innerHTML = html;
    $("message").hidden = false;
}

// ---- Rendering ----

// syncChart: the ranges changed outside the chart (sidebar, method, reset),
// so the chart's drag handles must be redrawn.
function render({ syncChart = false } = {}) {
    const view = computeView();
    lastView = view;
    if (state.sel != null && !view.visibleSet.has(data.options[state.sel])) {
        const o = data.options[state.sel];
        state.notice = inMethod(o)
            ? `${o.title} is filtered out, so its preview closed.`
            : `${o.title} belongs to ${o.study.name}, so its preview closed.`;
        state.sel = null;
    }
    const notice = state.notice; // shown once, until the next change
    state.notice = "";
    renderMethodTabs();
    renderChart(view, syncChart);
    renderFilters(view);
    renderPreview(view);
    renderToolbar(view, notice);
    renderShortlistBar();
    renderGallery(view);
    renderMethodSummary(view);
    renderComparison();
    saveUrl();
}

// "All methods" plus one tick box per method: tick two or more to compare them.
function renderMethodTabs() {
    const tabs = $("methodTabs");
    tabs.hidden = data.studies.length < 2;
    $("methodHint").hidden = tabs.hidden;
    if (tabs.hidden) return;
    const all = `<button type="button" data-all-methods aria-pressed="${!state.methods.size}">All methods <span class="count">${data.options.length}</span></button>`;
    const ticks = data.studies.map((st) => {
        const on = !state.methods.size || state.methods.has(st.name); // "All methods" = every method ticked
        const n = data.options.filter((o) => o.study === st).length;
        return `<button type="button" role="checkbox" aria-checked="${on}" data-method="${esc(st.name)}" class="method-tick ${on ? "on" : ""}" style="--method:${st.color}"><span class="tick">${on ? "✓" : ""}</span>${esc(st.name)} <span class="count">${n}</span></button>`;
    });
    tabs.innerHTML = all + ticks.join("");
}

function renderChart(view, syncChart) {
    if (!chart) {
        chart = new ParallelChart($("pcChart"), {
            onBrush: () => {
                state.ranges = Object.fromEntries(chart.ranges);
                render();
            },
            onSelect: (index) => {
                if (lastView.visibleSet.has(data.options[index])) openOption(index, true);
            },
            onInfo: (col) => openAbout(described(shownStudies(), (st) => entryForResult(st, col))),
            // Index bar of a batch: filter to that batch (the others stay pale); the same bar again clears it.
            onGroup: (name) => {
                state.batch = state.batch === name ? "" : name;
                render();
            },
        });
    }
    const inputAxes = inputAxesFor(view.scope);
    $("inputsToggle").hidden = !inputAxes.length;
    $("inputsLabel").textContent = inputAxes.length === 1 ? `Show ${inputAxes[0].label.toLowerCase()}` : "Show inputs";
    // Several batches: an input axis is split per batch (gap + coloured bar), so their
    // index ranges don't overlap; the bars filter, so these axes keep no drag range.
    const grouped = data.studies.length > 1;
    if (grouped) for (const m of inputAxes) delete state.ranges[m.col];
    const groupsOf = (m) =>
        data.studies
            .filter((st) => inMethod({ study: st }))
            .map((st) => {
                const vals = data.options.filter((o) => o.study === st).map((o) => parseFloat(o.row[m.col])).filter(Number.isFinite);
                const on = !state.batch || state.batch === st.name;
                return { key: st.name, color: st.color, on, count: vals.length, domain: [Math.min(...vals), Math.max(...vals)] };
            })
            .filter((g) => g.count);
    const axes = [
        ...(state.showInputs
            ? inputAxes.map((m) => ({
                  col: m.col,
                  label: m.label,
                  dir: 0,
                  value: (o) => parseFloat(o.row[m.col]),
                  ...(grouped ? { groups: groupsOf(m), groupOf: (o) => o.study.name } : {}),
              }))
            : []),
        ...data.schema.outputs.map((m) => {
            const target = view.scope.map((o) => o.targets?.[m.col]).find(Number.isFinite);
            return {
                col: m.col,
                label: m.label,
                dir: m.dir,
                value: (o) => o.values[m.col],
                info: described(shownStudies(), (st) => entryForResult(st, m.col)).length > 0,
                target,
                targetText: Number.isFinite(target) ? fmt(target) : "",
            };
        }),
    ];
    const model = {
        scope: `${[...state.methods].sort()}|${state.showInputs}|${state.batch}`,
        options: view.scope,
        axes,
        selected: state.sel != null ? data.options[state.sel] : null,
        matches: (o) => view.visibleSet.has(o),
        colorOf: (o) => o.study.color,
        shortlist: state.shortlist,
    };
    if (syncChart) {
        chart.ranges = new Map(Object.entries(state.ranges));
        if (chart.model) {
            chart.model = model;
            chart.build();
        } else chart.update(model);
    } else chart.update(model);

    const labelOf = (col) => (outputByCol(col) || data.schema.inputs.find((m) => m.col === col) || { label: col }).label;
    $("activeRanges").innerHTML =
        (state.batch ? `<span>Batch: ${esc(state.batch)}</span>` : "") +
        Object.entries(state.ranges)
            .map(([col, [lo, hi]]) => {
                const text = lo === -Infinity ? `≤ ${fmt(hi)}` : hi === Infinity ? `≥ ${fmt(lo)}` : `${fmt(lo)} – ${fmt(hi)}`;
                return `<span>${esc(labelOf(col))}: ${text}</span>`;
            })
            .join("");
    const studies = data.studies.length > 1
        ? data.studies
              .filter((st) => !state.methods.size || state.methods.has(st.name))
              .map((st) => `<span class="study-dot" style="background:${st.color}"></span>${esc(st.name)}`)
              .join(" &nbsp; ") + " &nbsp;·&nbsp; "
        : "";
    $("chartLegend").innerHTML = `${studies}dark red: inspected option · pale lines: filtered out`;
}

// The sidebar is built once; later renders only update values, so typing isn't interrupted.
function renderFilters(view) {
    const box = $("rangeFilters");
    if (!box.children.length) {
        box.innerHTML = data.schema.outputs
            .map(
                (m) => `<fieldset data-col="${esc(m.col)}">
                    <legend>${esc(m.label)}</legend>
                    <small class="muted">${directionText(m)}</small>
                    <div class="range-inputs">
                        <label>Min<input type="number" step="any" data-bound="0" aria-label="${esc(m.label)} minimum" /></label>
                        <span>–</span>
                        <label>Max<input type="number" step="any" data-bound="1" aria-label="${esc(m.label)} maximum" /></label>
                    </div>
                    ${m.dir ? `<button type="button" class="quick-filter" data-better="${esc(m.col)}">Better than average</button><small class="avg-note muted"></small>` : ""}
                </fieldset>`
            )
            .join("");
    }
    const scopeStats = computeStats(view.scope, data.schema.outputs);
    const scopeName = scopeLabel();
    for (const fs of box.querySelectorAll("fieldset")) {
        const col = fs.dataset.col;
        const s = scopeStats[col];
        const range = state.ranges[col];
        fs.classList.toggle("active", !!range);
        fs.querySelectorAll("input").forEach((input) => {
            const bound = +input.dataset.bound;
            input.placeholder = fmt(bound ? s.max : s.min);
            if (document.activeElement === input) return;
            const v = range ? range[bound] : NaN;
            input.value = Number.isFinite(v) ? +v.toFixed(4) : "";
        });
        const note = fs.querySelector(".avg-note");
        if (note) note.textContent = `Average of ${scopeName}: ${fmt(s.mean)}`;
    }
}

function renderToolbar(view, notice) {
    const filters = Object.keys(state.ranges).length;
    $("resultCount").textContent = `${view.visible.length} of ${view.scope.length} options`;
    const scope = scopeLabel().replace(/^a/, "A");
    $("scopeNote").textContent = [
        scope,
        state.batch ? `Batch ${state.batch} only` : "",
        filters ? `${filters} measurement filter${filters > 1 ? "s" : ""}` : "No measurement filters",
        state.sel == null && !notice ? "Click an option to preview it" : "",
        notice,
    ]
        .filter(Boolean)
        .join(" · ");

    const select = $("orderSelect");
    if (!select.options.length) {
        select.innerHTML = [...data.schema.inputs, ...data.schema.outputs]
            .map((m) => `<option value="${esc(m.col)}">${esc(m.label)}${arrow(m)}</option>`)
            .join("");
    }
    select.value = state.order;
    const m = orderBy(state.order);
    $("orderDirection").textContent = !m
        ? ""
        : m.input
          ? "Input · lowest first"
          : m.dir < 0
            ? "Lower is better · lowest first"
            : m.dir > 0
              ? "Higher is better · highest first"
              : "High to low · no preferred direction";
}

function renderShortlistBar() {
    const n = state.shortlist.length;
    $("shortlistBar").innerHTML =
        n === 0
            ? `<span class="muted">Use <strong>Compare</strong> on up to ${MAX_SHORTLIST} options to put them side by side.</span>`
            : `<span><strong>Shortlist:</strong> ${state.shortlist.map((i) => esc(data.options[i].title)).join(", ")}${
                  n === 1 ? ` <span class="muted">· pick one more to compare</span>` : ""
              }</span> <button type="button" data-clear-shortlist>Clear</button>${
                  n >= 2 ? ` <button type="button" class="cp-primary" data-see>See comparison ↓</button>` : ""
              }`;
}

// Cards are built once and then only reordered, shown or hidden (no image flicker).
function renderGallery(view) {
    const gallery = $("gallery");
    if (!cards.size) {
        for (const o of data.options) {
            const el = document.createElement("div");
            el.className = "option-card";
            el.style.setProperty("--method", o.study.color);
            el.innerHTML = `<button type="button" class="card-main" data-open="${o.index}">
                    <div class="option-image"><img loading="lazy" alt="${esc(o.name)}" /></div>
                    <div class="option-body">
                        ${data.studies.length > 1 ? methodLabel(o) : ""}
                        <h3>${esc(o.name)}</h3>
                        <div class="card-value"><strong></strong><span></span></div>
                        <span class="card-note"></span>
                    </div>
                </button>
                <button type="button" class="pick" data-pick="${o.index}">Compare</button>`;
            cards.set(o.index, el);
        }
    }
    const m = orderBy(state.order);
    for (const o of data.options) {
        const el = cards.get(o.index);
        el.hidden = !view.visibleSet.has(o);
        if (el.hidden) continue;
        const img = el.querySelector("img");
        const src = thumbUrl(o);
        if (src && img.getAttribute("src") !== src) img.src = src;
        el.querySelector(".card-value strong").textContent = m ? fmt(valueOf(o, m.col)) : "";
        el.querySelector(".card-value span").textContent = m ? m.label : "";
        const best = bestAt(o, view);
        const note = el.querySelector(".card-note");
        note.textContent = isBestBalance(o, view) ? "Best balance" : best.length ? "Best for " + best[0].label : "";
        note.title = isBestBalance(o, view) ? BEST_BALANCE_HELP : "";
        el.classList.toggle("selected", o.index === state.sel);
        const picked = state.shortlist.includes(o.index);
        el.classList.toggle("picked", picked);
        const pick = el.querySelector(".pick");
        pick.textContent = picked ? "✓ In shortlist" : "Compare";
        pick.setAttribute("aria-pressed", picked);
    }
    const empty = view.visible.length
        ? null
        : Object.assign(document.createElement("div"), {
              className: "empty",
              innerHTML: "<h2>No options match these ranges</h2><p>Widen a measurement range or use Reset to see all options again.</p>",
          });
    gallery.replaceChildren(...(empty ? [empty] : view.visible.map((o) => cards.get(o.index))));
}

function renderPreview(view) {
    const o = state.sel != null ? data.options[state.sel] : null;
    $("preview").hidden = !o;
    if (!o) {
        if (viewer) viewer.clear();
        mediaKey = null;
        return;
    }
    $("previewMethod").outerHTML = `<span id="previewMethod">${data.studies.length > 1 ? methodLabel(o) : ""}</span>`;
    $("previewTitle").textContent = o.name;
    const best = bestAt(o, view).map((m) => m.label);
    $("previewSummary").textContent = [
        isBestBalance(o, view) ? "Best balance of all goals" : "",
        best.length ? "Best for " + best.join(", ") : "",
    ]
        .filter(Boolean)
        .join(" · ");
    $("previewSummary").title = isBestBalance(o, view) ? BEST_BALANCE_HELP : "";
    $("preview").classList.toggle("expanded", state.expanded);
    $("expandPreview").textContent = state.expanded ? "Compact preview" : "Expand preview";
    $("expandPreview").setAttribute("aria-expanded", state.expanded);

    $("modeButtons").innerHTML = MODES.map((m) => {
        const has = layersOf(m.key).length > 0;
        return `<button type="button" data-mode="${m.key}" class="${m.key === state.mode ? "on" : ""}" aria-pressed="${m.key === state.mode}" ${
            has ? "" : `disabled title="No ${m.label.toLowerCase()} files in this study"`
        }>${m.label}</button>`;
    }).join("");
    const list = layersOf();
    $("layerSelect").hidden = list.length < 2;
    $("layerSelect").innerHTML = list.map((l, i) => `<option value="${i}">${esc(l.label)}</option>`).join("");
    $("layerSelect").value = String(state.layer[state.mode]);

    const at = view.visible.indexOf(o);
    $("prevOption").disabled = at <= 0;
    $("nextOption").disabled = at >= view.visible.length - 1;

    renderStandings(o, view);
    renderViewInfo(o);
    showMedia(o);
}

// ---- About this analysis (texts from layers.json, see about.js) and the view's score ----

const shownStudies = () => data.studies.filter((st) => !state.methods.size || state.methods.has(st.name));
const unitOf = (m) => (m.label.match(/\[([^\]]+)\]\s*$/) || [])[1] || "";

// The manifest entry of the 3D analysis / table shown for option `o`, if the export described it.
function viewEntry(o) {
    const layer = layersOf()[state.layer[state.mode]];
    if (!layer?.col || (state.mode !== "analysis" && state.mode !== "table")) return null;
    return entryForView(o.study, layer.col);
}

// Top right of the 3D analysis: its score for this option ("Average 41.2 dB(A)") and "About".
function renderViewInfo(o) {
    const entry = viewEntry(o);
    $("aboutView").hidden = !entry?.description?.length;
    const m = state.mode === "analysis" && entry?.value_column ? outputByCol(entry.value_column) : null;
    const v = m ? o.values[m.col] : NaN;
    const score = $("viewScore");
    score.hidden = !Number.isFinite(v);
    if (score.hidden) return;
    const unit = unitOf(m);
    score.innerHTML = `<span>${esc(entry.score_label || "Score")}</span> <strong>${fmt(v)}${unit ? " " + esc(unit) : ""}</strong>`;
    score.title = `${m.label} · ${directionText(m)}`;
}

let aboutReturn = null; // focused before the card opened, focused again on close

// items: [{ study, entry }] from described(). One card; closes with ✕ or a click outside it.
function openAbout(items) {
    if (!items.length) return;
    const e = items[0].entry;
    const m = e.value_column ? outputByCol(e.value_column) : null;
    $("aboutTitle").textContent = e.label || m?.label || e.key;
    $("aboutSub").textContent = m ? `${m.label} · ${directionText(m)}` : "";
    $("aboutBody").innerHTML = aboutHtml(items);
    aboutReturn = document.activeElement;
    $("aboutOverlay").hidden = false;
    $("aboutBody").scrollTop = 0;
    $("aboutClose").focus();
}

function closeAbout() {
    if ($("aboutOverlay").hidden) return;
    $("aboutOverlay").hidden = true;
    if (aboutReturn?.focus) aboutReturn.focus();
}

function showMedia(o) {
    const key = `${o.index}|${state.mode}|${state.layer[state.mode]}`;
    if (key === mediaKey) return; // unrelated redraw: keep the loaded image / 3D model
    mediaKey = key;
    const layer = layersOf()[state.layer[state.mode]];
    const isTable = state.mode === "table";
    const is3d = state.mode === "model" || state.mode === "analysis";
    const parts = is3d && layer ? partsFor(o, layer) : null;
    const src = is3d ? parts : layer ? assetUrl(o, (o.row[layer.col] || "").trim()) : null;
    $("previewImage").hidden = is3d || isTable;
    $("preview3d").hidden = !is3d;
    $("previewTable").hidden = !isTable;
    $("resetView").hidden = !is3d;
    $("mediaStatus").textContent = src ? "" : "No file for this view.";
    // Legend: the CSV cell, or (cell left empty by the export) the standard file name
    // legend_an_<name>.png in the option's own folder. If neither exists, say so.
    const noLegend = state.mode === "analysis" && layer?.composed ? "Colour legend not in this export yet" : "";
    const legendFile = layer?.legendCol ? (o.row[layer.legendCol] || "").trim() || `${layer.legendCol}.png` : "";
    const legend = state.mode === "analysis" && legendFile ? assetUrl(o, legendFile) : null;
    const img = $("legendImg");
    img.hidden = !legend;
    img.onerror = () => {
        img.hidden = true;
        $("mediaNote").textContent = noLegend;
    };
    if (legend) img.src = legend;
    $("mediaNote").textContent = legend ? "" : noLegend;
    if (isTable) {
        if (viewer) viewer.clear();
        showTable(src, key);
        return;
    }
    if (!is3d) {
        if (viewer) viewer.clear();
        $("previewImage").alt = `${o.title}, ${layer ? layer.label : ""}`;
        if (src) $("previewImage").src = src;
        else $("previewImage").removeAttribute("src");
        return;
    }
    if (!viewer) viewer = new Viewer($("preview3d"), (text) => ($("mediaStatus").textContent = text));
    if (parts) viewer.compose(parts, { fadeContext: state.mode === "analysis" && !OVER_GENERAL[layer.col] });
    else viewer.clear();
}

// Table view: a small CSV per option (first row = header). Numeric cells are formatted like
// every other value; a first cell reading "Total" marks the totals row.
async function showTable(url, key) {
    const box = $("previewTable");
    box.replaceChildren();
    if (!url) return;
    let rows;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(response.status + " " + response.statusText);
        rows = csvParse((await response.text()).replace(/^﻿/, ""));
    } catch (e) {
        if (mediaKey === key) $("mediaStatus").textContent = "The table didn't load.";
        return;
    }
    if (mediaKey !== key) return; // another option or view was opened meanwhile
    const cell = (v) => {
        const n = Number(v);
        return v !== "" && Number.isFinite(n) ? `<td class="num">${fmt(n)}</td>` : `<td>${esc(v)}</td>`;
    };
    box.innerHTML = `<table>
        <thead><tr>${rows.columns.map((c, i) => `<th${i ? ' class="num"' : ""}>${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>${rows
            .map((r) => {
                const total = /^total/i.test(String(r[rows.columns[0]] ?? "").trim());
                return `<tr${total ? ' class="total"' : ""}>${rows.columns.map((c) => cell(r[c] ?? "")).join("")}</tr>`;
            })
            .join("")}</tbody>
    </table>`;
}

// The 3D layers of one view for one option, or null when the option has no file for it.
// Empty cells mean "no such layer for this option" (for example no pools) and are skipped.
function partsFor(o, layer) {
    const file = (col) => (col ? assetUrl(o, (o.row[col] || "").trim()) : null);
    const analysisView = state.mode === "analysis";
    const own = [];
    if (!layer.composed) {
        const url = file(layer.col);
        if (url) own.push({ url, kind: analysisView ? "analysis" : "geometry" });
    } else {
        const replaced = analysisView ? OVER_GENERAL[layer.col] : null;
        for (const g of data.schema.layers) {
            if (replaced) {
                if (ANALYSIS_ONLY.has(g.col) || replaced.includes(g.col)) continue; // general view minus replaced layers
            } else if (analysisView ? GENERAL_ONLY.has(g.col) : ANALYSIS_ONLY.has(g.col)) continue;
            const url = file(g.col);
            if (url) own.push({ url, kind: "geometry" });
        }
        if (analysisView) {
            const url = file(layer.col);
            if (!url) return null; // the analysis itself is missing
            own.push({ url, kind: "analysis" });
        }
    }
    if (!own.length) return null;
    const context = data.schema.context && file(data.schema.context.col);
    return context ? [{ url: context, kind: "context" }, ...own] : own;
}

// "Where this option stands": actual value positions among the matching options.
// Plain counts only; the 2% "about the same" rule lives in Best at what.
function renderStandings(o, view) {
    const scope = scopeLabel();
    const rows = data.schema.outputs.map((m) => {
        const others = view.visible.filter((p) => Number.isFinite(p.values[m.col]));
        const v = o.values[m.col];
        if (!Number.isFinite(v) || !others.length) {
            return `<div class="standing"><div class="standing-heading"><span>${esc(m.label)}</span><strong>—</strong></div><small class="standing-verdict">No result available</small></div>`;
        }
        // The target (optional) widens the bar so the red dot always fits on it.
        const target = o.targets?.[m.col];
        const hasTarget = Number.isFinite(target);
        const vals = others.map((p) => p.values[m.col]).concat(hasTarget ? [target] : []);
        const lo = Math.min(...vals);
        const hi = Math.max(...vals);
        const pos = (n) => (hi === lo ? 50 : 100 * (m.dir < 0 ? (hi - n) / (hi - lo) : (n - lo) / (hi - lo)));
        const worse = others.filter((p) => m.dir * (v - p.values[m.col]) > 0).length;
        const better = others.filter((p) => m.dir * (p.values[m.col] - v) > 0).length;
        const n = others.length;
        const verdict = !m.dir
            ? "No preferred direction"
            : n === 1
              ? "Only matching option"
              : hi === lo
                ? "All matching options have the same value"
                : better === 0
                  ? "Best result" + (n - worse > 1 ? " · shared" : "")
                  : worse === 0
                    ? "Lowest performance in this group"
                    : `Better than ${worse} of ${n - 1} other options`;
        const dots = others
            .filter((p) => p !== o)
            .map((p) => `<i class="other-dot" style="left:${pos(p.values[m.col]).toFixed(1)}%;--method:${p.study.color}"></i>`)
            .join("");
        const tPos = hasTarget ? pos(target) : 0;
        const targetMark = hasTarget
            ? `<i class="target-dot" style="left:${tPos.toFixed(1)}%"></i><span class="target-label${
                  tPos < 15 ? " at-start" : tPos > 85 ? " at-end" : ""
              }" style="left:${tPos.toFixed(1)}%">target ${fmt(target)}</span>`
            : "";
        const toTarget = hasTarget && target ? ` · ${fmt((100 * v) / target)}% of target` : "";
        return `<div class="standing">
            <div class="standing-heading"><span>${esc(m.label)}</span><strong>${fmt(v)}</strong></div>
            <div class="standing-track${hasTarget ? " has-target" : ""}" role="img" aria-label="${esc(
                `${m.label}: ${fmt(v)}. ${verdict}${hasTarget ? `. Target ${fmt(target)}` : ""}`
            )}">${dots}${targetMark}<i class="selected-dot" style="left:${pos(v).toFixed(1)}%"></i></div>
            <div class="standing-ends"><span>${m.dir ? "Worse" : "Lower"}</span><span>${m.dir ? "Better" : "Higher"}</span></div>
            <small class="standing-verdict">${verdict}${toTarget}</small>
        </div>`;
    });
    $("standings").innerHTML = `<h3>Where this option stands</h3>
        <p class="standing-scope">Among ${view.visible.length} matching options · ${esc(scope)}</p>
        ${rows.join("")}
        <p class="dot-key">● Large dot: this option · small dots: the others</p>`;
}

// Compare methods: per method, the matching options on the "Order by" result.
function renderMethodSummary(view) {
    const box = $("methodSummary");
    const shown = data.studies.filter((st) => !state.methods.size || state.methods.has(st.name));
    box.hidden = shown.length < 2;
    if (box.hidden) return;
    const m = orderBy(state.order);
    const parts = shown.map((s) => {
        const total = data.options.filter((o) => o.study === s).length;
        const rows = view.visible.filter((o) => o.study === s);
        const best = rows.find((o) => Number.isFinite(valueOf(o, m.col))); // visible is already ordered best first
        return `<article class="method-card" style="--method:${s.color}">
            <div class="method-card-head"><strong>${esc(s.name)}</strong><span class="muted">${rows.length}/${total} match · ${Math.round((rows.length / total) * 100)}%</span></div>
            <div class="summary-values">
                <span>${m.input ? "Lowest" : m.dir ? "Best result" : "Highest result"} <b>${fmt(best ? valueOf(best, m.col) : NaN)}</b></span>
                <span>Typical ${m.input ? "value" : "result"} <small>(median)</small> <b>${fmt(median(rows.map((o) => valueOf(o, m.col))))}</b></span>
            </div>
            ${best ? `<button type="button" class="link" data-open="${best.index}">Inspect ${esc(best.name)} ↗</button>` : `<span class="muted small">No matching options</span>`}
        </article>`;
    });
    box.innerHTML = `<div class="method-summary-label"><strong>Compare methods</strong><span class="muted">${esc(m.label)} · matching options only</span></div>${parts.join("")}`;
}

// "Compare options" below the gallery: the shortlist (2 or more) side by side, see comparison.js.
function renderComparison() {
    const box = $("comparison");
    const chosen = state.shortlist.map((i) => data.options[i]);
    const detailsOpen = box.querySelector("details")?.open; // keep "exact values" open across redraws
    box.hidden = chosen.length < 2;
    box.innerHTML = box.hidden ? "" : comparisonHtml({ data, chosen, esc, fmt, thumbUrl, maxOptions: MAX_SHORTLIST });
    if (detailsOpen && box.querySelector("details")) box.querySelector("details").open = true;
    renderPopup();
}

// The shortlist pop-up at the bottom: shown for a few seconds after Compare on a card,
// not all the time (it stays while the pointer is on it).
const POPUP_MS = 5000;
let popupTimer = null;

function renderPopup() {
    const n = state.shortlist.length;
    $("shortlistPopup").innerHTML = `<strong>${n} selected</strong><span>${
        n === 0 ? "Use Compare on gallery cards" : n === 1 ? "Select one more option" : ""
    }</span><button type="button" data-see ${n < 2 ? "disabled" : ""}>See comparison ↓</button>${
        n ? `<button type="button" class="ghost" data-clear-shortlist>Clear</button>` : ""
    }<button type="button" class="ghost" data-back>Back to options ↑</button>`;
    if (!n) $("shortlistPopup").hidden = true;
}

function popUp(ms = POPUP_MS) {
    if (!state.shortlist.length) return;
    $("shortlistPopup").hidden = false;
    clearTimeout(popupTimer);
    popupTimer = setTimeout(() => ($("shortlistPopup").hidden = true), ms);
}

// Slow smooth scroll (1.3 to 2.6 s) so you can follow where the page goes. A wheel, touch or
// key press stops it; with "reduce motion" it jumps straight there.
let cancelScroll = null;
let returnTo = null; // where "Back to options" goes after "See comparison"

function scrollPage(top, arrival) {
    cancelScroll?.();
    const start = window.scrollY;
    const target = Math.max(0, Math.min(top, document.documentElement.scrollHeight - window.innerHeight));
    const arrive = () => {
        if (!arrival) return;
        arrival.classList.remove("arrived");
        void arrival.offsetWidth; // restart the highlight animation
        arrival.classList.add("arrived");
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        window.scrollTo({ top: target, behavior: "instant" });
        arrive();
        return;
    }
    const duration = Math.min(2600, Math.max(1300, Math.abs(target - start) * 0.3));
    let frame;
    let began;
    const stop = () => {
        cancelAnimationFrame(frame);
        ["wheel", "touchstart", "keydown"].forEach((t) => window.removeEventListener(t, stop));
        cancelScroll = null;
    };
    cancelScroll = stop;
    ["wheel", "touchstart", "keydown"].forEach((t) => window.addEventListener(t, stop, { passive: true }));
    const tick = (now) => {
        began ??= now;
        const t = Math.min(1, (now - began) / duration);
        window.scrollTo({ top: start + (target - start) * (-(Math.cos(Math.PI * t) - 1) / 2), behavior: "instant" });
        if (t < 1) frame = requestAnimationFrame(tick);
        else {
            stop();
            arrive();
        }
    };
    frame = requestAnimationFrame(tick);
}

function seeComparison() {
    if (state.shortlist.length < 2) return;
    returnTo = window.scrollY;
    $("shortlistPopup").hidden = true;
    scrollPage(window.scrollY + $("comparison").getBoundingClientRect().top - 20, $("comparison"));
}

function backToOptions() {
    scrollPage(returnTo ?? window.scrollY + $("gallery").getBoundingClientRect().top - 20);
    returnTo = null;
}

// "Add option +": the first matching option (in gallery order) that isn't compared yet.
function addToComparison() {
    if (state.shortlist.length >= MAX_SHORTLIST) return;
    const taken = new Set(state.shortlist);
    const next = (lastView?.visible || []).find((o) => !taken.has(o.index)) || data.options.find((o) => !taken.has(o.index));
    if (!next) return;
    state.shortlist.push(next.index);
    render();
}

// ---- State in the URL (so "Copy link" shares exactly this view) ----

function saveUrl() {
    const p = new URLSearchParams(location.search);
    const set = (key, value) => (value === "" || value == null ? p.delete(key) : p.set(key, value));
    set("methods", [...state.methods].join(","));
    p.delete("method"); // single-method links from earlier versions
    set("order", state.order);
    set("option", state.sel != null ? state.sel + 1 : "");
    set("mode", state.sel != null ? state.mode : "");
    set("layer", state.sel != null && state.layer[state.mode] ? state.layer[state.mode] + 1 : "");
    set("compare", state.shortlist.map((i) => i + 1).join(","));
    set("inputs", state.showInputs ? "1" : "");
    set("batch", state.batch);
    const ranges = Object.entries(state.ranges).map(([col, [lo, hi]]) => [col, Number.isFinite(lo) ? lo : null, Number.isFinite(hi) ? hi : null]);
    set("ranges", ranges.length ? JSON.stringify(ranges) : "");
    ["variant", "sort", "prototype"].forEach((k) => p.delete(k)); // from earlier versions
    history.replaceState(null, "", "?" + p.toString());
}

function loadUrlState() {
    const picked = (params.get("methods") || params.get("method") || "").split(",").filter((n) => data.studies.some((s) => s.name === n));
    state.methods = new Set(picked.length === data.studies.length ? [] : picked);
    const order = params.get("order") || params.get("sort");
    state.order = orderBy(order) ? order : data.schema.outputs[0]?.col || "";
    const option = parseInt(params.get("option"), 10);
    if (option >= 1 && option <= data.options.length) state.sel = option - 1;
    const mode = modeInfo(params.get("mode") || "");
    if (mode && layersOf(mode.key).length) state.mode = mode.key;
    const layer = parseInt(params.get("layer"), 10);
    if (layer >= 1 && layer <= layersOf().length) state.layer[state.mode] = layer - 1;
    state.shortlist = (params.get("compare") || "")
        .split(",")
        .map((n) => parseInt(n, 10) - 1)
        .filter((i, k, all) => i >= 0 && i < data.options.length && all.indexOf(i) === k)
        .slice(0, MAX_SHORTLIST);
    state.showInputs = params.get("inputs") === "1";
    const batch = params.get("batch") || "";
    state.batch = data.studies.length > 1 && data.studies.some((s) => s.name === batch) && inMethod({ study: { name: batch } }) ? batch : "";
    try {
        for (const [col, lo, hi] of JSON.parse(params.get("ranges") || "[]")) {
            state.ranges[col] = [lo ?? -Infinity, hi ?? Infinity];
        }
    } catch {
        state.ranges = {};
    }
}

async function copyLink() {
    const url = location.href;
    try {
        await navigator.clipboard.writeText(url);
    } catch {
        // http pages on the LAN have no clipboard API: fall back to execCommand
        const t = document.createElement("textarea");
        t.value = url;
        document.body.appendChild(t);
        t.select();
        document.execCommand("copy");
        t.remove();
    }
    $("shareBtn").textContent = "Copied";
    setTimeout(() => ($("shareBtn").textContent = "Copy link"), 1500);
}

// ---- Actions ----

function openOption(index, scroll) {
    state.sel = index;
    render();
    const box = $("preview").getBoundingClientRect();
    if (scroll && (box.top < 0 || box.top > window.innerHeight * 0.6)) {
        $("preview").scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

function step(delta) {
    const view = computeView();
    const at = view.visible.findIndex((o) => o.index === state.sel);
    const next = view.visible[at + delta];
    if (next) openOption(next.index, false);
}

// Tick / untick one method; unticking the last one, or ticking all, means all methods.
function setMethods(names) {
    state.methods = new Set(names.length === data.studies.length ? [] : names);
    if (state.batch && !inMethod({ study: { name: state.batch } })) state.batch = ""; // its method was unticked
    // Input ranges only make sense where every option has that input.
    const inputs = inputAxesFor(data.options.filter(inMethod)).map((m) => m.col);
    for (const col of Object.keys(state.ranges)) {
        if (!outputByCol(col) && !inputs.includes(col)) delete state.ranges[col];
    }
    render({ syncChart: true });
}

function setBound(col, bound, value) {
    const range = state.ranges[col] || [-Infinity, Infinity];
    range[bound] = Number.isFinite(value) ? value : bound ? Infinity : -Infinity;
    if (range[0] === -Infinity && range[1] === Infinity) delete state.ranges[col];
    else state.ranges[col] = range;
    render({ syncChart: true });
}

// "Better than average": the average of the options in the method shown.
function betterThanAverage(col) {
    const m = outputByCol(col);
    const mean = computeStats(data.options.filter(inMethod), [m])[col].mean;
    state.ranges[col] = m.dir > 0 ? [mean, Infinity] : [-Infinity, mean];
    render({ syncChart: true });
}

function togglePick(index) {
    const at = state.shortlist.indexOf(index);
    if (at >= 0) state.shortlist.splice(at, 1);
    else if (state.shortlist.length < MAX_SHORTLIST) state.shortlist.push(index);
    else {
        $("shortlistBar").insertAdjacentHTML("beforeend", ` <span class="warn">The shortlist holds ${MAX_SHORTLIST}. Remove one first.</span>`);
        return;
    }
    render();
    popUp();
}

function bindEvents() {
    $("methodTabs").addEventListener("click", (e) => {
        const b = e.target.closest("[data-method]");
        if (e.target.closest("[data-all-methods]")) setMethods([]);
        if (!b) return;
        // Start from what is ticked (all, under "All methods"); the last ticked method stays ticked.
        const next = new Set(state.methods.size ? state.methods : data.studies.map((st) => st.name));
        next.has(b.dataset.method) ? next.delete(b.dataset.method) : next.add(b.dataset.method);
        if (next.size) setMethods([...next]);
    });
    $("rangeFilters").addEventListener("change", (e) => {
        const input = e.target.closest("input[data-bound]");
        if (input) setBound(input.closest("fieldset").dataset.col, +input.dataset.bound, input.valueAsNumber);
    });
    $("rangeFilters").addEventListener("click", (e) => {
        const b = e.target.closest("[data-better]");
        if (b) betterThanAverage(b.dataset.better);
    });
    const clearRanges = () => {
        state.ranges = {};
        state.batch = "";
        render({ syncChart: true });
    };
    $("resetFilters").addEventListener("click", clearRanges);
    $("clearChart").addEventListener("click", clearRanges);
    $("showInputs").addEventListener("change", (e) => {
        state.showInputs = e.target.checked;
        if (!state.showInputs) for (const m of data.schema.inputs) delete state.ranges[m.col];
        render({ syncChart: true });
    });
    $("orderSelect").addEventListener("change", (e) => {
        state.order = e.target.value;
        render();
    });
    // Any [data-open] button opens that option; [data-pick] toggles the shortlist.
    $("app").addEventListener("click", (e) => {
        const pick = e.target.closest("[data-pick]");
        const open = e.target.closest("[data-open]");
        const remove = e.target.closest("[data-remove]");
        if (pick) togglePick(+pick.dataset.pick);
        else if (open) openOption(+open.dataset.open, true);
        else if (e.target.closest("[data-see]")) seeComparison();
        else if (e.target.closest("[data-back]")) backToOptions();
        else if (e.target.closest("[data-add]")) addToComparison();
        else if (remove) {
            state.shortlist = state.shortlist.filter((i) => i !== +remove.dataset.remove);
            render();
        } else if (e.target.closest("[data-clear-shortlist]")) {
            state.shortlist = [];
            render();
        }
    });
    // Compare options: pick another option in a slot (A to D).
    $("comparison").addEventListener("change", (e) => {
        const slot = e.target.closest("[data-slot]");
        if (!slot) return;
        const ids = [...state.shortlist];
        ids[+slot.dataset.slot] = +slot.value;
        state.shortlist = [...new Set(ids)];
        render();
    });
    $("shortlistPopup").addEventListener("mouseenter", () => clearTimeout(popupTimer));
    $("shortlistPopup").addEventListener("mouseleave", () => popUp(1500));
    $("closePreview").addEventListener("click", () => {
        state.sel = null;
        render();
    });
    $("expandPreview").addEventListener("click", () => {
        state.expanded = !state.expanded;
        render();
    });
    $("prevOption").addEventListener("click", () => step(-1));
    $("nextOption").addEventListener("click", () => step(1));
    $("modeButtons").addEventListener("click", (e) => {
        const b = e.target.closest("[data-mode]");
        if (!b || b.disabled) return;
        state.mode = b.dataset.mode;
        render();
    });
    $("layerSelect").addEventListener("change", (e) => {
        state.layer[state.mode] = +e.target.value;
        render();
    });
    $("resetView").addEventListener("click", () => viewer && viewer.resetView());
    $("shareBtn").addEventListener("click", copyLink);
    $("aboutView").addEventListener("click", () => {
        const o = state.sel != null ? data.options[state.sel] : null;
        if (o) openAbout(described([o.study], () => viewEntry(o)));
    });
    $("aboutClose").addEventListener("click", closeAbout);
    $("aboutOverlay").addEventListener("click", (e) => e.target === e.currentTarget && closeAbout());
    document.addEventListener("keydown", (e) => {
        if (!$("aboutOverlay").hidden) return; // keys don't act on the page behind the card
        if (state.sel == null || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
        if (e.key === "ArrowLeft") step(-1);
        if (e.key === "ArrowRight") step(1);
        if (e.key === "Escape") {
            state.sel = null;
            render();
        }
    });
}

// ---- Start ----

async function init() {
    const studies = resolveStudies();
    if (!studies.length) {
        showMessage(
            `<h2>No project selected</h2><p>Add the project name to the address, for example <code>?PROJECT=STUDY</code>, or several: <code>?PROJECT=STUDY_A,STUDY_B</code>.</p>`
        );
        return;
    }

    studies.forEach((st, i) => (st.color = STUDY_COLORS[i % STUDY_COLORS.length]));
    const [loaded] = await Promise.all([Promise.allSettled(studies.map(loadStudy)), Promise.all(studies.map(loadManifest))]);
    const failed = studies.filter((s, i) => loaded[i].status === "rejected");
    if (failed.length) {
        loaded.forEach((l) => l.status === "rejected" && console.error(l.reason));
        showMessage(
            `<h2>Couldn't load the project</h2><p><code>data.csv</code> for <strong>${failed.map((s) => esc(s.name)).join(", ")}</strong> didn't load. Check the project name.</p>`
        );
        return;
    }

    // One combined list: columns are matched by name across studies.
    const columns = [...new Set(loaded.flatMap((l) => l.value.columns))];
    const schema = readSchema(columns, loaded.flatMap((l) => l.value));
    const options = [];
    studies.forEach((study, i) => options.push(...readOptions(loaded[i].value, study, options.length, studies.length > 1)));
    if (!options.length) {
        showMessage(`<h2>Empty project</h2><p><code>data.csv</code> for <strong>${studies.map((s) => esc(s.name)).join(", ")}</strong> has no rows.</p>`);
        return;
    }
    data = { studies, schema, options, stats: computeStats(options, schema.outputs) };
    state.mode = (MODES.find((m) => layersOf(m.key).length) || MODES[0]).key;
    loadUrlState();

    const name = studies.map((s) => s.name).join(" + ");
    $("projectName").textContent = name;
    $("optionCount").textContent = `${options.length} options`;
    document.title = `${name} · Design Explorer`;
    $("introText").textContent =
        studies.length > 1
            ? `Explore ${studies.length === 2 ? "both" : "all"} methods together, or focus on one. Filters apply across methods.`
            : "Filter by measurements, order the gallery, and click an option to look closer.";
    $("showInputs").checked = state.showInputs;
    $("app").hidden = false;
    bindEvents();
    render({ syncChart: true });
}

init();
