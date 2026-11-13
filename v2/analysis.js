// Single-option analysis page: the analyses of one study. A 2D analysis is a plan, level by level;
// a 3D analysis is a dense field seen in 3D, in plan or in section (volumeview.js).
// Reads only the study's layers.json (no data.csv):
//   levels[]  { key, label, elevation_m, plan_file, viewbox }
//   layers[]  kind "analysis", dim "2d": { key, label, unit, better, file_pattern "<key>_<level>.svg",
//             score_label, legend { min, max, segments, colors[] }, scores { level: value },
//             rooms { level: [{ label, average, area_m2 }] }, levels [keys], description [{ heading, text }] }
//   parameters[] { label, value } used by every analysis of this study (layers[] may add their own)
//   about[]   notes common to every analysis (e.g. the model, the limits)
//   parameters rows are { label, value } or groups { label, items: [{ label, value }] }
//   layers[]  kind "analysis", dim "3d": { key, label, unit, better, file "volume.json", legend, score_label,
//             scenarios [{ key, label, unit?, better?, legend? }], description }, with the model in a
//             layer kind "geometry" (file "model.glb")
// URL: ?PROJECT=<folder> (or ?data=<folder url>) [&an=<layer key>] [&level=<level key>]
//   a 3D analysis keeps its view in the address: mode (3d | plan | section), sc (scenario), z (plan height),
//   sec (ax,ay,bx,by of the section line), planes (h, v, c = cut, p = points, s = colours on the surfaces), vx (heights of the section × 1, 2, 4),
//   cam or frame (3D camera, 2D pan / zoom)
import { PlanViewer, legendColor } from "./plan2d.js?v=5";
import { sectionsHtml } from "./about.js?v=4";
import { exportViewPdf } from "./pdfexport.js?v=8";

const API_BASE = "http://api-node.acpv.local/dev/v1/design-explorer";
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let study; // { name, base, manifest }
let viewer; // PlanViewer of the 2D analyses
let vol = null; // VolumeView of the 3D analysis on screen (null while it loads)
let volumeModule = null; // volumeview.js, loaded with the first 3D analysis (it brings three.js)
const volumes = new Map(); // layer key -> { view, els, ready }
const VIEW_KEYS = ["mode", "sc", "z", "sec", "planes", "vx", "cam", "frame"]; // address of a 3D view
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
        return { name: label || folder, base: `${API_BASE}/projects/${encodeURIComponent(folder)}/` };
    }
    const data = first("data");
    if (!data) return null;
    const [folder, label] = named(data);
    const base = folder.replace(/\/*$/, "/");
    return { name: label || decodeURIComponent(base.split("/").filter(Boolean).pop()), base };
}

const analyses = () => (study.manifest.layers || []).filter((l) => l.kind === "analysis" && (l.dim === "2d" || l.dim === "3d"));
const is3d = (layer) => layer.dim === "3d";
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
    $("view").dataset.dim = layer.dim;
    $("roomsBlock").hidden = $("exportBtn").hidden = is3d(layer);
    $("scenarioBlock").hidden = !is3d(layer);
    if (is3d(layer)) return;
    delete $("view").dataset.mode;
    $("hint").textContent = "Scroll to zoom · drag to move · double-click to reset";
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
    renderTexts(layer);
}

// About this analysis: what it is (this analysis), then the notes every analysis shares
// (the model, the limits). Parameters of this study: the values used here, grouped.
function renderTexts(layer) {
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
    for (const k of ["level", ...VIEW_KEYS]) p.delete(k);
    if (!is3d(current())) p.set("level", state.level);
    else if (vol) for (const [k, v] of Object.entries(viewParams(vol.view()))) p.set(k, v);
    history.replaceState(null, "", "?" + p.toString().replace(/%2C/g, ",").replace(/%3A/g, ":").replace(/%2F/g, "/"));
}

function render() {
    renderControls();
    if (is3d(current())) return showVolume(current());
    vol = null;
    renderInfo();
    renderPlan();
    writeUrl();
}

// ---- 3D analyses ----

// A view (VolumeView.view()) as address parameters, and back.
function viewParams(v) {
    const out = { mode: v.mode, sc: v.scenario, z: v.z, sec: [...v.a, ...v.b].join(","), planes: (v.h ? "h" : "") + (v.v ? "v" : "") + (v.cut ? "c" : "") + (v.dots ? "p" : "") + (v.drape ? "s" : "") || "0" };
    if (v.vx !== 1) out.vx = v.vx;
    if (v.camera) out.cam = v.camera.join(",");
    if (v.frame) out.frame = v.frame.join(",");
    return out;
}

function viewFromParams() {
    const list = (k, n) => {
        const v = (params.get(k) || "").split(",").map(Number);
        return params.has(k) && v.length === n && v.every(Number.isFinite) ? v : undefined;
    };
    const sec = list("sec", 4);
    const planes = params.get("planes");
    return {
        mode: params.get("mode") || undefined,
        scenario: params.get("sc") || undefined,
        z: list("z", 1)?.[0],
        ...(sec ? { a: sec.slice(0, 2), b: sec.slice(2) } : {}),
        ...(planes != null ? { h: planes.includes("h"), v: planes.includes("v"), cut: planes.includes("c"), dots: planes.includes("p"), drape: planes.includes("s") } : {}),
        vx: list("vx", 1)?.[0],
        camera: list("cam", 6),
        frame: list("frame", 3),
    };
}

// Shows a 3D analysis: its panes are created at the first visit and kept (camera, planes, zoom).
async function showVolume(layer) {
    vol = null;
    $("tooltip").hidden = true;
    renderVolumeInfo(layer, null);
    let entry = volumes.get(layer.key);
    for (const e of volumes.values()) for (const el of [e.els.pane3d, e.els.pane2d, e.els.key]) el.style.display = e === entry ? "" : "none";
    if (!entry) {
        $("status").textContent = "Loading…";
        try {
            volumeModule ||= await import("./volumeview.js?v=2");
        } catch (e) {
            $("status").textContent = `Cannot load the 3D view: ${e.message}`;
            return;
        }
        entry = volumes.get(layer.key); // asked twice while the module was loading: one view only
    }
    if (!entry) {
        const pane = (parent, cls) => $(parent).appendChild(Object.assign(document.createElement("div"), { className: cls }));
        const els = { pane3d: pane("vol", "an-vol-pane"), pane2d: pane("vol", "an-vol-pane"), key: pane("volKey", "an-vol-key"), overlay: $("volPanel") };
        const view = new volumeModule.VolumeView(els, {
            onChange: () => vol === view && volumeChanged(),
            onHover: (hit, e) => vol === view && volumeHover(hit, e),
            onStatus: (text) => current() === layer && ($("status").textContent = text),
        });
        const model = (study.manifest.layers || []).find((l) => l.kind === "geometry" && /\.(glb|gltf)$/i.test(l.file || l.file_pattern || ""));
        // the view in the address belongs to the analysis it was copied from
        entry = { view, els, ready: view.load(study.base, layer, model, !params.has("an") || params.get("an") === layer.key ? viewFromParams() : {}) };
        volumes.set(layer.key, entry);
    }
    try {
        await entry.ready;
    } catch (e) {
        volumes.delete(layer.key);
        for (const el of [entry.els.pane3d, entry.els.pane2d, entry.els.key]) el.remove();
        if (current() === layer) $("status").textContent = e.message;
        return;
    }
    if (current() !== layer) return; // another analysis was picked meanwhile
    vol = entry.view;
    $("volElev").max = vol.volume.size[2].toFixed(2);
    volumeChanged();
}

// After any change of the 3D view: the controls, the texts and the address follow it.
function volumeChanged() {
    const s = vol.state;
    $("view").dataset.mode = s.mode;
    for (const b of $("volModes").children) b.classList.toggle("on", b.dataset.mode === s.mode);
    $("volElev").value = s.z;
    $("volElevValue").textContent = volumeModule.elevationText(s.z + vol.volume.worldZ);
    $("volElevLabel").textContent = s.mode === "3d" ? "Horizontal plane" : "Plan elevation";
    $("volH").checked = s.h;
    $("volV").checked = s.v;
    $("volCut").checked = s.cut;
    $("volDots").checked = s.dots;
    $("volDrape").checked = s.drape;
    for (const b of $("volHeights").children) b.classList.toggle("on", +b.dataset.vx === s.vx);
    $("hint").textContent = s.mode === "3d" ? "Drag to orbit · right-drag to move · scroll to zoom" : "Scroll to zoom · drag to move · double-click to reset";
    $("scenarioButtons").innerHTML = vol
        .scenarios()
        .map((sc) => `<button type="button" data-scenario="${esc(sc.key)}" class="${sc.key === s.scenario ? "on" : ""}">${esc(sc.label || sc.key)}</button>`)
        .join("");
    renderVolumeInfo(current(), vol);
    writeUrl();
}

// Left side of a 3D analysis: the mean over the analysed points, the legend of the scenario, the texts.
function renderVolumeInfo(layer, view) {
    const reading = view ? view.reading() : { label: layer.label, unit: layer.unit, better: layer.better, legend: layer.legend };
    const first = !view || view.scenarios()[0]?.key === reading.key;
    $("scoreLabel").textContent = first ? layer.score_label || "Mean" : `Mean · ${reading.label}`;
    $("scoreValue").textContent = fmt(view ? view.mean() : layer.score, reading.unit);
    $("scoreHelp").textContent = "over the analysed points";
    // a scenario with its own legend is another quantity: the legend takes its name
    const own = view && reading.legend !== layer.legend;
    renderLegend({ ...reading, label: own ? reading.label : layer.label });
    renderTexts(layer);
}

function volumeHover(hit, e) {
    const tip = $("tooltip");
    if (!hit || !e) {
        tip.hidden = true;
        return;
    }
    const box = $("view").getBoundingClientRect();
    tip.innerHTML = `<strong>${fmt(hit.value, vol.reading().unit)}</strong><span><span class="muted">Elevation</span> ${volumeModule.elevationText(hit.z)}</span>`;
    tip.style.left = `${e.clientX - box.left + 14}px`;
    tip.style.top = `${e.clientY - box.top + 14}px`;
    tip.hidden = false;
}

function bindVolume() {
    $("volModes").addEventListener("click", (e) => {
        const b = e.target.closest("button[data-mode]");
        if (b && vol) vol.set({ mode: b.dataset.mode });
    });
    $("volHeights").addEventListener("click", (e) => {
        const b = e.target.closest("button[data-vx]");
        if (b && vol) vol.set({ vx: +b.dataset.vx });
    });
    $("scenarioButtons").addEventListener("click", (e) => {
        const b = e.target.closest("button[data-scenario]");
        if (b && vol) vol.set({ scenario: b.dataset.scenario });
    });
    // while dragging only the plane and its height follow; the rest (address, texts) at the release
    $("volElev").addEventListener("input", (e) => {
        if (!vol) return;
        vol.set({ z: +e.target.value }, { quiet: true });
        $("volElevValue").textContent = volumeModule.elevationText(vol.state.z + vol.volume.worldZ);
    });
    $("volElev").addEventListener("change", () => vol && volumeChanged());
    for (const [id, key] of [["volH", "h"], ["volV", "v"], ["volCut", "cut"], ["volDots", "dots"], ["volDrape", "drape"]]) {
        $(id).addEventListener("change", (e) => vol && vol.set({ [key]: e.target.checked }));
    }
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
    // zoom and reset act on what is shown: the plan of a 2D analysis, or the view of a 3D one
    const shown = () => (is3d(current()) ? vol : viewer);
    $("zoomIn").addEventListener("click", () => shown()?.zoomBy(1.5));
    $("zoomOut").addEventListener("click", () => shown()?.zoomBy(1 / 1.5));
    $("resetView").addEventListener("click", () => shown()?.reset());
    bindVolume();
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
// analysis, without level or zoom, so it always opens fitted. A 3D analysis adds its view (mode,
// scenario, planes, camera): there the link is what is on screen. Same fallback as the dashboard.
async function copyLink() {
    const enc = (v) => encodeURI(v).replace(/[&#+]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
    const keep = ["PROJECT", "data"].filter((k) => params.has(k)).map((k) => `${k}=${enc(params.get(k))}`);
    const view = is3d(current()) && vol ? Object.entries(viewParams(vol.view())).map(([k, v]) => `${k}=${enc(String(v))}`) : [];
    const url = `${location.origin}${location.pathname}?${[...keep, `an=${enc(state.an)}`, ...view].join("&")}`;
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
        showMessage(`<h2>${esc(study.name)}</h2><p>No analysis in this study's layers.json.</p>`);
        return;
    }
    $("projectName").textContent = study.manifest.title || study.name;
    const levels = (study.manifest.levels || []).length;
    $("projectNote").textContent = `${analyses().length} ${analyses().length === 1 ? "analysis" : "analyses"}${levels ? ` · ${levels} levels` : ""}`;
    document.title = `${study.manifest.title || study.name} · Design Explorer`;
    $("app").hidden = false;
    viewer = new PlanViewer($("plan"), { onHover });
    viewer.setLabels(true); // room numbers on by default
    bind();
    render();
}

start();
