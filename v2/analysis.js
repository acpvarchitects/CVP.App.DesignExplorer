// Single-option analysis page: the 2D (plan) analyses of one study, level by level.
// Reads only the study's layers.json (no data.csv):
//   levels[]  { key, label, elevation_m, plan_file, viewbox }
//   layers[]  kind "analysis", dim "2d": { key, label, unit, better, file_pattern "<key>_<level>.svg",
//             score_label, legend { min, max, segments, colors[] }, scores { level: value },
//             rooms { level: [{ label, average, area_m2 }] }, levels [keys], description [{ heading, text }] }
//   parameters[] { label, value } used by every analysis of this study (layers[] may add their own)
//   about[]   notes common to every analysis (e.g. the model, the limits)
//   parameters rows are { label, value } or groups { label, items: [{ label, value }] }
// URL: ?PROJECT=<folder> (or ?data=<folder url>) [&an=<layer key>] [&level=<level key>]
import { PlanViewer, legendColor } from "./plan2d.js?v=5";
import { sectionsHtml } from "./about.js?v=2";
import { exportViewPdf } from "./pdfexport.js?v=8";

const API_BASE = "http://api-node.acpv.local/dev/v1/design-explorer";
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let study; // { name, base, manifest }
let viewer;
const state = { an: params.get("an") || "", level: params.get("level") || "" };

function resolveStudy() {
    const first = (key) => (params.get(key) || "").split(",").map((s) => s.trim()).filter(Boolean)[0];
    const named = (entry) => {
        const m = entry.match(/^(.+?):(?!\/\/)([^/]+)$/);
        return m ? [m[1].trim(), m[2].trim()] : [entry, ""];
    };
    const project = first("PROJECT");
    if (project) {
        const [folder, label] = named(project);
        return { name: label || folder, base: `${API_BASE}/projects/${encodeURIComponent(folder)}/`, ref: { key: "PROJECT", entry: project } };
    }
    const data = first("data");
    if (!data) return null;
    const [folder, label] = named(data);
    const base = folder.replace(/\/*$/, "/");
    return { name: label || decodeURIComponent(base.split("/").filter(Boolean).pop()), base, ref: { key: "data", entry: data } };
}

const analyses = () => (study.manifest.layers || []).filter((l) => l.kind === "analysis" && l.dim === "2d");
const current = () => analyses().find((l) => l.key === state.an) || analyses()[0];
const levelsOf = (layer) => (study.manifest.levels || []).filter((lv) => (layer.levels || []).includes(lv.key));
const fmt = (v, unit) => (v == null || Number.isNaN(v) ? "–" : `${(+v).toFixed(Math.abs(v) >= 100 ? 0 : 1)}${unit ? " " + unit : ""}`);

function showMessage(html) {
    $("message").innerHTML = html;
    $("message").hidden = false;
}

function renderControls() {
    const layer = current();
    state.an = layer.key;
    $("analysisSelect").innerHTML = analyses()
        .map((l) => `<option value="${esc(l.key)}"${l.key === layer.key ? " selected" : ""}>${esc(l.label)}</option>`)
        .join("");
    const levels = levelsOf(layer);
    if (!levels.some((lv) => lv.key === state.level)) state.level = levels[0]?.key || "";
    // A vertical stack read like a section: highest level at the top.
    $("levelButtons").innerHTML = [...levels]
        .sort((a, b) => (b.elevation_m ?? 0) - (a.elevation_m ?? 0))
        .map((lv) => `<button type="button" data-level="${esc(lv.key)}" class="${lv.key === state.level ? "on" : ""}">${esc(lv.label || lv.key)}</button>`)
        .join("");
}

function renderLegend(layer) {
    const lg = layer.legend;
    if (!lg) {
        $("legend").innerHTML = "";
        return;
    }
    const n = Math.max(lg.segments || 11, 2);
    const stops = lg.colors.map((c, i) => `${c} ${((i / (lg.colors.length - 1)) * 100).toFixed(1)}%`).join(",");
    const ticks = Array.from({ length: n }, (_, i) => lg.min + ((lg.max - lg.min) * i) / (n - 1));
    const step = n > 6 ? 2 : 1; // label every other tick when dense
    $("legend").innerHTML = `
        <div class="an-legend-title">${esc(layer.label)}${layer.unit ? ` <span class="muted">[${esc(layer.unit)}]</span>` : ""}</div>
        <div class="an-legend-bar" style="background:linear-gradient(90deg,${stops})"></div>
        <div class="an-legend-ticks">${ticks
            .map((t, i) => `<span style="left:${(i / (n - 1)) * 100}%">${i % step ? "" : esc(+t.toFixed(2))}</span>`)
            .join("")}</div>
        ${layer.better ? `<p class="muted small">${layer.better === "higher" ? "↑ higher is better" : "↓ lower is better"}</p>` : ""}`;
}

function renderInfo() {
    const layer = current();
    const score = layer.scores?.[state.level];
    $("scoreLabel").textContent = `${layer.score_label || "Average"} · ${state.level}`;
    $("scoreValue").textContent = fmt(score, layer.unit);
    $("scoreHelp").textContent = "over the analysed rooms, weighted by area";
    renderLegend(layer);
    const rooms = [...(layer.rooms?.[state.level] || [])].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    $("roomCount").textContent = rooms.length ? ` ${rooms.length}` : "";
    $("roomList").innerHTML = rooms
        .map(
            (r) => `<li data-room="${esc(r.label)}">
                <span class="an-swatch" style="background:${layer.legend ? legendColor(layer.legend, r.average) : "#ccc"}"></span>
                <span class="an-room-name">${esc(r.label)}</span>
                <span class="an-room-value">${fmt(r.average, layer.unit)}</span>
            </li>`
        )
        .join("");
    // About this analysis: what it is (this analysis), then the notes every analysis shares
    // (the model, the limits). Parameters of this study: the values used here, grouped.
    $("description").innerHTML = sectionsHtml(layer.description || [], true) + sectionsHtml(study.manifest.about || [], true);
    const row = (r) =>
        r.items
            ? `<dt>${esc(r.label)}</dt><dd><ul>${r.items
                  .map((it) => `<li>${esc(it.label)}${it.value ? `: <span class="muted">${esc(it.value)}</span>` : ""}</li>`)
                  .join("")}</ul></dd>`
            : `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`;
    const rows = [...(study.manifest.parameters || []), ...(layer.parameters || [])];
    $("parameters").innerHTML = rows.length ? `<dl>${rows.map(row).join("")}</dl>` : `<p class="muted">Not given for this study.</p>`;
}

async function renderPlan() {
    const layer = current();
    const level = (study.manifest.levels || []).find((lv) => lv.key === state.level);
    if (!level) return;
    const file = (layer.file_pattern || layer.key + "_<level>.svg").replace("<level>", level.key);
    $("status").textContent = "Loading…";
    try {
        await viewer.show([
            { url: study.base + file, className: "plan2d-analysis" },
            { url: study.base + (level.plan_file || `plan_${level.key}.svg`), className: "plan2d-plan" },
        ]);
        $("status").textContent = "";
    } catch (e) {
        $("status").textContent = e.message;
    }
}

function writeUrl() {
    const p = new URLSearchParams(location.search);
    p.set("an", state.an);
    p.set("level", state.level);
    history.replaceState(null, "", "?" + p.toString().replace(/%2C/g, ",").replace(/%3A/g, ":").replace(/%2F/g, "/"));
}

function render() {
    renderControls();
    renderInfo();
    renderPlan();
    writeUrl();
}

function bind() {
    $("analysisSelect").addEventListener("change", (e) => {
        state.an = e.target.value;
        render();
    });
    $("levelButtons").addEventListener("click", (e) => {
        const b = e.target.closest("button[data-level]");
        if (!b) return;
        state.level = b.dataset.level;
        render();
    });
    $("labelsBtn").addEventListener("click", () => {
        viewer.setLabels(!viewer.labelsOn);
        $("labelsBtn").textContent = viewer.labelsOn ? "Hide labels" : "Show labels";
        $("labelsBtn").setAttribute("aria-pressed", String(viewer.labelsOn));
    });
    $("zoomIn").addEventListener("click", () => viewer.zoomBy(1.5));
    $("zoomOut").addEventListener("click", () => viewer.zoomBy(1 / 1.5));
    $("resetView").addEventListener("click", () => viewer.reset());
    const list = $("roomList");
    list.addEventListener("pointerover", (e) => viewer.highlight(e.target.closest("li")?.dataset.room ?? null));
    list.addEventListener("pointerleave", () => viewer.highlight(null));
    $("exportBtn").addEventListener("click", async () => {
        const btn = $("exportBtn");
        const layer = current();
        btn.disabled = true;
        btn.textContent = "Exporting…";
        try {
            await exportViewPdf({
                svg: viewer.svg,
                view: viewer.view,
                home: viewer.home,
                project: study.manifest.title || study.name,
                layer,
                level: (study.manifest.levels || []).find((lv) => lv.key === state.level)?.label || state.level,
                score: layer.scores?.[state.level],
                rooms: [...(layer.rooms?.[state.level] || [])].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
                legendColor,
                labels: viewer.labelsOn,
            });
        } catch (e) {
            $("status").textContent = `Export failed: ${e.message}`;
        } finally {
            btn.disabled = false;
            btn.textContent = "Export view";
        }
    });
    $("shareBtn").addEventListener("click", copyLink);
}

// "Copy link": the main link of the analysis on screen - the study (PROJECT or data) and the
// analysis, without level or zoom, so it always opens fitted. Same fallback as the dashboard.
async function copyLink() {
    const enc = (v) => encodeURI(v).replace(/[&#+]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
    const keep = ["PROJECT", "data"].filter((k) => params.has(k)).map((k) => `${k}=${enc(params.get(k))}`);
    const url = `${location.origin}${location.pathname}?${[...keep, `an=${enc(state.an)}`].join("&")}`;
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

function onHover(hit, e) {
    const tip = $("tooltip");
    viewer.highlight(hit?.room ?? null);
    if (!hit) {
        tip.hidden = true;
        return;
    }
    const box = $("plan").getBoundingClientRect();
    const unit = current().unit;
    tip.innerHTML =
        `<strong>${esc(hit.room)}</strong>` +
        (hit.value != null ? `<span><span class="muted">Point</span> ${fmt(hit.value, unit)}</span>` : "") +
        `<span><span class="muted">Room average</span> ${fmt(hit.average, unit)}</span>`;
    tip.style.left = `${e.clientX - box.left + 14}px`;
    tip.style.top = `${e.clientY - box.top + 14}px`;
    tip.hidden = false;
}

// "Explore": back to the dashboard of the same study, only when the study has a data.csv (a study
// that is only plans, like a daylight study, has nothing to explore).
async function offerExplore() {
    try {
        const r = await fetch(study.base + "data.csv?v=" + Date.now(), { method: "HEAD" });
        if (!r.ok) return;
    } catch (e) {
        return;
    }
    $("exploreLink").href = `index.html?${study.ref.key}=${encodeURIComponent(study.ref.entry)}`;
    $("exploreLink").hidden = false;
}

async function start() {
    study = resolveStudy();
    if (!study) {
        showMessage(`<h2>No project selected</h2><p>Add the project to the address, for example <code>?PROJECT=STUDY</code>.</p>`);
        return;
    }
    try {
        const r = await fetch(study.base + "layers.json?v=" + Date.now());
        if (!r.ok) throw new Error(`layers.json: ${r.status} ${r.statusText}`);
        study.manifest = await r.json();
    } catch (e) {
        showMessage(`<h2>Cannot load ${esc(study.name)}</h2><p>${esc(e.message)}</p>`);
        return;
    }
    if (!analyses().length) {
        showMessage(`<h2>${esc(study.name)}</h2><p>No 2D analysis in this study's layers.json.</p>`);
        return;
    }
    $("projectName").textContent = study.manifest.title || study.name;
    $("projectNote").textContent = `${analyses().length} ${analyses().length === 1 ? "analysis" : "analyses"} · ${(study.manifest.levels || []).length} levels`;
    document.title = `${study.manifest.title || study.name} · Design Explorer`;
    offerExplore();
    $("app").hidden = false;
    viewer = new PlanViewer($("plan"), { onHover });
    viewer.setLabels(true); // room numbers on by default
    bind();
    render();
}

start();
