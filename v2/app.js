// Design Explorer v2.
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
import { csvParse } from "https://cdn.jsdelivr.net/npm/d3-dsv@3/+esm";
import { Viewer } from "./viewer.js";

const API_BASE = "http://api-node.acpv.local/dev/v1/design-explorer";
const MAX_CHIPS = 12;
const MODES = [
    { key: "image", label: "Image", layers: "images", layerLabel: "View" },
    { key: "model", label: "3D model", layers: "models", layerLabel: "Model" },
    { key: "analysis", label: "3D analysis", layers: "analyses", layerLabel: "Analysis" },
];

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = { sel: 0, mode: "image", layer: { image: 0, model: 0, analysis: 0 }, filters: {} };
let data; // { source, schema, options, stats }
let viewer;

// ---- Reading the dataset ----

function resolveSource() {
    const project = params.get("PROJECT");
    if (project) {
        return { name: project, base: `${API_BASE}/projects/${encodeURIComponent(project)}/` };
    }
    const folder = params.get("data");
    if (folder) {
        const base = folder.replace(/\/*$/, "/");
        return { name: decodeURIComponent(base.split("/").filter(Boolean).pop()), base };
    }
    return null;
}

function readSchema(columns) {
    const schema = { inputs: [], outputs: [], images: [], models: [], analyses: [] };
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
        }
    }
    return schema;
}

function readOptions(rows, schema) {
    const single = schema.inputs.length === 1 ? schema.inputs[0] : null;
    return rows.map((row, index) => {
        const values = {};
        for (const m of schema.outputs) values[m.col] = parseFloat(row[m.col]);
        const title = single ? `${single.label} ${row[single.col]}` : `Option ${index + 1}`;
        return { index, row, values, title };
    });
}

function computeStats(options, outputs) {
    const stats = {};
    for (const m of outputs) {
        const vals = options.map((o) => o.values[m.col]).filter(Number.isFinite);
        stats[m.col] = {
            min: Math.min(...vals),
            max: Math.max(...vals),
            mean: vals.reduce((a, b) => a + b, 0) / vals.length,
        };
    }
    return stats;
}

// ---- Comparing options ----

const goals = () => data.schema.outputs.filter((m) => m.dir);
const varies = (m) => data.stats[m.col].max > data.stats[m.col].min;

function position(o, m) {
    const s = data.stats[m.col];
    const v = o.values[m.col];
    if (!Number.isFinite(v)) return null;
    return varies(m) ? (v - s.min) / (s.max - s.min) : 0.5;
}

function goodness(o, m) {
    const p = position(o, m);
    return p == null || m.dir >= 0 ? p : 1 - p;
}

function rank(o, m) {
    const v = o.values[m.col];
    return 1 + data.options.filter((p) => m.dir * (p.values[m.col] - v) > 0).length;
}

const bestAt = (o) => goals().filter((m) => varies(m) && rank(o, m) === 1);

function balance(o) {
    const g = goals()
        .map((m) => goodness(o, m))
        .filter((v) => v != null);
    return g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0;
}

function isBestBalance(o) {
    if (goals().length < 2) return false;
    const top = Math.max(...data.options.map(balance));
    return balance(o) === top;
}

function rankText(r, n) {
    if (r === 1) return `Best of ${n}`;
    if (r === n) return `Weakest of ${n}`;
    const suffix = r % 10 === 2 && r % 100 !== 12 ? "nd" : r % 10 === 3 && r % 100 !== 13 ? "rd" : "th";
    return `${r}${suffix} of ${n}`;
}

function matches(o) {
    for (const m of data.schema.outputs) {
        const f = state.filters[m.col] || "any";
        const v = o.values[m.col];
        const mean = data.stats[m.col].mean;
        if (f === "best" && !(varies(m) && rank(o, m) === 1)) return false;
        if (f === "better" && !(m.dir * (v - mean) > 0)) return false;
        if (f === "above" && !(v > mean)) return false;
        if (f === "below" && !(v < mean)) return false;
    }
    for (const m of data.schema.inputs) {
        const picked = state.filters[m.col];
        if (picked && picked.size && !picked.has(String(o.row[m.col]))) return false;
    }
    return true;
}

// ---- Helpers ----

function fmt(v) {
    if (!Number.isFinite(v)) return "";
    const a = Math.abs(v);
    return v.toLocaleString(undefined, { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 2 });
}

function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function assetUrl(name) {
    if (!name) return null;
    if (/^(https?:)?\/\//i.test(name) || name.startsWith("/")) return name;
    return data.source.base + name;
}

const modeInfo = () => MODES.find((m) => m.key === state.mode);
const layers = (mode = modeInfo()) => data.schema[mode.layers];
const currentLayer = () => layers()[state.layer[state.mode]];
const directionHint = (m) => (m.dir > 0 ? "↑ higher is better" : m.dir < 0 ? "↓ lower is better" : "");

function showMessage(html) {
    $("app").hidden = true;
    $("message").innerHTML = html;
    $("message").hidden = false;
}

function setStatus(text) {
    $("stageStatus").textContent = text;
}

// ---- Rendering ----

function render() {
    renderModes();
    renderStage();
    renderStrip();
    renderFilters();
    renderCompare();
    saveUrl();
}

function renderModes() {
    const available = MODES.filter((m) => layers(m).length);
    $("modeSeg").innerHTML = available
        .map((m) => `<button type="button" data-mode="${m.key}" class="${m.key === state.mode ? "on" : ""}">${m.label}</button>`)
        .join("");
    $("modeSeg").hidden = available.length < 2;

    const list = layers();
    $("subSeg").innerHTML =
        list.length > 1
            ? `<span class="muted">${modeInfo().layerLabel}</span><div class="seg">${list
                  .map((l, i) => `<button type="button" data-layer="${i}" class="${i === state.layer[state.mode] ? "on" : ""}">${esc(l.label)}</button>`)
                  .join("")}</div>`
            : "";
}

function renderStage() {
    const o = data.options[state.sel];
    $("optTitle").textContent = o.title;
    $("optSummary").textContent = summary(o);

    const layer = currentLayer();
    const url = layer && assetUrl(o.row[layer.col]);
    const is3d = state.mode !== "image";
    $("stageImg").hidden = is3d;
    $("stage3d").hidden = !is3d;
    $("resetViewBtn").hidden = !is3d;

    if (!is3d) {
        setStatus(url ? "" : "No image for this option.");
        $("stageImg").alt = `${o.title}, ${layer ? layer.label : ""}`;
        if (url) $("stageImg").src = url;
        else $("stageImg").removeAttribute("src");
        return;
    }
    if (!viewer) viewer = new Viewer($("stage3d"), setStatus);
    if (url) viewer.show(url);
    else {
        viewer.clear();
        setStatus("No 3D file for this option.");
    }
}

function summary(o) {
    const parts = [];
    if (isBestBalance(o)) parts.push("Best balance of all goals");
    const best = bestAt(o).map((m) => m.label);
    if (best.length) parts.push("Best for " + best.join(", "));
    if (!parts.length && goals().length) parts.push("Not the best for any single goal");
    return parts.join(" · ");
}

function renderStrip() {
    const strip = $("strip");
    if (!strip.children.length) {
        strip.innerHTML = data.options
            .map(
                (o) => `<button type="button" class="thumb" data-index="${o.index}">
                    <div class="thumb-img"><img loading="lazy" alt="" /></div>
                    <span class="thumb-name">${esc(o.title)}</span>
                    <span class="thumb-note"></span>
                </button>`
            )
            .join("");
    }
    // The strip always shows the image view picked in the preview, so options
    // can be compared by eye from the same point of view.
    const imageLayer = data.schema.images[state.layer.image];
    for (const el of strip.children) {
        const o = data.options[+el.dataset.index];
        const ok = matches(o);
        el.classList.toggle("on", o.index === state.sel);
        el.classList.toggle("out", !ok);
        const best = bestAt(o);
        el.querySelector(".thumb-note").textContent = !ok
            ? "Filtered out"
            : isBestBalance(o)
              ? "Best balance"
              : best.length
                ? "Best for " + best[0].label
                : "";
        const img = el.querySelector("img");
        const src = imageLayer ? assetUrl(o.row[imageLayer.col]) : null;
        if (src && img.getAttribute("src") !== src) img.src = src;
    }
}

function renderFilters() {
    const outputs = data.schema.outputs.map((m) => {
        const choices = m.dir
            ? [["any", "Any"], ["better", "Better than average"], ["best", "Best only"]]
            : [["any", "Any"], ["above", "Above average"], ["below", "Below average"]];
        const current = state.filters[m.col] || "any";
        return `<div class="filter">
            <div class="filter-label">${esc(m.label)} <span class="hint">${directionHint(m)}</span></div>
            <div class="seg">${choices
                .map(([k, label]) => `<button type="button" data-filter="${esc(m.col)}" data-value="${k}" class="${k === current ? "on" : ""}">${label}</button>`)
                .join("")}</div>
        </div>`;
    });
    const inputs = data.schema.inputs.map((m) => {
        const values = [...new Set(data.options.map((o) => String(o.row[m.col])))];
        if (values.length < 2 || values.length > MAX_CHIPS) return "";
        values.sort((a, b) => (parseFloat(a) - parseFloat(b)) || a.localeCompare(b));
        const picked = state.filters[m.col] || new Set();
        return `<div class="filter">
            <div class="filter-label">${esc(m.label)}</div>
            <div class="chips">${values
                .map((v) => `<button type="button" data-chip="${esc(m.col)}" data-value="${esc(v)}" class="${picked.has(v) ? "on" : ""}">${esc(v)}</button>`)
                .join("")}</div>
        </div>`;
    });
    $("filters").innerHTML = outputs.join("") + inputs.join("");
    const n = data.options.filter(matches).length;
    $("matchCount").textContent = `${n} of ${data.options.length} match`;
}

function renderCompare() {
    const o = data.options[state.sel];
    const n = data.options.length;
    $("compareTitle").textContent = `How ${o.title} compares`;

    const inputs =
        data.schema.inputs.length > 1
            ? `<div class="inputs-list">${data.schema.inputs
                  .map((m) => `<div><span class="muted">${esc(m.label)}</span> <strong>${esc(o.row[m.col])}</strong></div>`)
                  .join("")}</div>`
            : "";

    const metrics = data.schema.outputs.map((m) => {
        const v = o.values[m.col];
        const mean = data.stats[m.col].mean;
        const r = rank(o, m);
        let pill = "";
        if (m.dir && !varies(m)) pill = `<span class="pill">Same for all</span>`;
        else if (m.dir) pill = `<span class="pill ${r === 1 ? "good" : r === n ? "bad" : ""}">${rankText(r, n)}</span>`;

        const pct = mean ? Math.round(((v - mean) / Math.abs(mean)) * 100) : null;
        const vsAverage = pct == null ? "" : pct === 0 ? " · about average" : ` · ${Math.abs(pct)}% ${pct > 0 ? "more" : "less"} than average`;

        const dots = data.options
            .map((p) => {
                const x = m.dir ? goodness(p, m) : position(p, m);
                if (x == null) return "";
                return `<span class="dot ${p === o ? "me" : ""}" style="left:${(x * 100).toFixed(1)}%" title="${esc(p.title)}: ${fmt(p.values[m.col])}"></span>`;
            })
            .join("");

        return `<div class="metric">
            <div class="metric-label"><span>${esc(m.label)} <span class="hint">${directionHint(m)}</span></span>${pill}</div>
            <div class="dots">${dots}</div>
            <div class="metric-foot">
                <span>${m.dir ? "worse" : "lower"}</span>
                <span><strong>${fmt(v)}</strong>${vsAverage}</span>
                <span>${m.dir ? "better" : "higher"}</span>
            </div>
        </div>`;
    });
    $("compare").innerHTML = inputs + metrics.join("");
}

// ---- State in the URL (so "Copy link" shares exactly this view) ----

function saveUrl() {
    const p = new URLSearchParams(location.search);
    p.set("option", state.sel + 1);
    p.set("mode", state.mode);
    p.set("layer", state.layer[state.mode] + 1);
    history.replaceState(null, "", "?" + p.toString());
}

function loadUrlState() {
    const option = parseInt(params.get("option"), 10);
    if (option >= 1 && option <= data.options.length) state.sel = option - 1;
    const mode = MODES.find((m) => m.key === params.get("mode"));
    if (mode && layers(mode).length) state.mode = mode.key;
    const layer = parseInt(params.get("layer"), 10);
    if (layer >= 1 && layer <= layers().length) state.layer[state.mode] = layer - 1;
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

// ---- Events ----

function step(delta) {
    const list = data.options.filter(matches);
    const pool = list.length ? list : data.options;
    const at = pool.findIndex((o) => o.index === state.sel);
    const next = at < 0 ? 0 : (at + delta + pool.length) % pool.length;
    state.sel = pool[next].index;
    render();
}

function bindEvents() {
    $("modeSeg").addEventListener("click", (e) => {
        const b = e.target.closest("[data-mode]");
        if (!b) return;
        state.mode = b.dataset.mode;
        render();
    });
    $("subSeg").addEventListener("click", (e) => {
        const b = e.target.closest("[data-layer]");
        if (!b) return;
        state.layer[state.mode] = +b.dataset.layer;
        render();
    });
    $("strip").addEventListener("click", (e) => {
        const b = e.target.closest("[data-index]");
        if (!b) return;
        state.sel = +b.dataset.index;
        render();
    });
    $("filters").addEventListener("click", (e) => {
        const f = e.target.closest("[data-filter]");
        const c = e.target.closest("[data-chip]");
        if (f) state.filters[f.dataset.filter] = f.dataset.value;
        if (c) {
            const set = state.filters[c.dataset.chip] || new Set();
            set.has(c.dataset.value) ? set.delete(c.dataset.value) : set.add(c.dataset.value);
            state.filters[c.dataset.chip] = set;
        }
        if (f || c) render();
    });
    $("clearFilters").addEventListener("click", () => {
        state.filters = {};
        render();
    });
    $("prevBtn").addEventListener("click", () => step(-1));
    $("nextBtn").addEventListener("click", () => step(1));
    $("resetViewBtn").addEventListener("click", () => viewer && viewer.resetView());
    $("shareBtn").addEventListener("click", copyLink);
    document.addEventListener("keydown", (e) => {
        if (e.target.closest("input, textarea, select")) return;
        if (e.key === "ArrowLeft") step(-1);
        if (e.key === "ArrowRight") step(1);
    });
}

// ---- Start ----

async function init() {
    const source = resolveSource();
    if (!source) {
        showMessage(
            `<h2>No project selected</h2><p>Add the project name to the address, for example <code>?PROJECT=Export</code>.</p>`
        );
        return;
    }
    $("classicLink").href = "../?" + new URLSearchParams({ PROJECT: params.get("PROJECT") || "" }).toString();
    if (!params.get("PROJECT")) $("classicLink").href = "../";

    let rows;
    try {
        const response = await fetch(source.base + "data.csv?v=" + Date.now());
        if (!response.ok) throw new Error(response.status + " " + response.statusText);
        rows = csvParse((await response.text()).replace(/^﻿/, ""));
    } catch (err) {
        console.error(err);
        showMessage(`<h2>Couldn't load the project</h2><p><code>data.csv</code> for <strong>${esc(source.name)}</strong> didn't load. Check the project name.</p>`);
        return;
    }

    const schema = readSchema(rows.columns);
    const options = readOptions(
        rows.filter((r) => Object.values(r).some((v) => v !== "")),
        schema
    );
    if (!options.length) {
        showMessage(`<h2>Empty project</h2><p><code>data.csv</code> for <strong>${esc(source.name)}</strong> has no rows.</p>`);
        return;
    }
    data = { source, schema, options, stats: computeStats(options, schema.outputs) };
    state.mode = (MODES.find((m) => layers(m).length) || MODES[0]).key;
    loadUrlState();

    $("projectName").textContent = source.name;
    $("optionCount").textContent = `${options.length} options`;
    document.title = `${source.name} · Design Explorer`;
    $("app").hidden = false;
    bindEvents();
    render();
}

init();
