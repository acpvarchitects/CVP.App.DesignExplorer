// "Unit mix" table view: apartments of one option by tower and unit size (mix_<name> column).
//
// The cell holds a JSON per option, written by the export:
//   { version: 1, towers: [{ id, floors, base, height_m, plate: ["220", "240", ...], length_m,
//                            cores, hotel, zone }] }
// `plate` is one typical residential floor (unit types in plan order), repeated `floors` times;
// base floors carry no apartments. Everything study-specific comes from the layers.json
// tables[] entry of that column, under "mix":
//   types: [{ key, label, area_m2, rgb: [r, g, b], parking }]   (order = column order)
//   target: { <type key>: count }, client: { units, area_m2, note }, parking_client_per_unit,
//   zones: [{ key, label }]   (order = zone order; tower.zone picks one)
// Two views (Cristiano, 10/11): A "By tower" (tower rows with their sizes) and C "Tower × size"
// (matrix with totals, target and gap). Compare shows the totals only. One table for every tower:
// no zone level and no hotel mark (Cristiano, 12/11); `hotel` and `zone` in the JSON are ignored.
// The Program tab (app.js) shows the matrix next to the unit-mix 3D, with selectable cells:
// programTableHtml() and mixUnits(), the apartments in the order of the 3D file.

const nf = (v) => Math.round(v).toLocaleString("en-GB");
const f1 = (v) => (Number.isFinite(v) ? v.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "–");
const pct = (a, b) => (b ? f1((100 * a) / b) + "%" : "–");
// Gaps are rounded before the sign and the colour: a float area gap of 0.3 m² reads "±0", on target.
const signed = (v) => {
    const r = Math.round(v);
    return (r > 0 ? "+" : r < 0 ? "−" : "±") + nf(Math.abs(r));
};
const gapClass = (v) => (Math.round(v) === 0 ? "mix-eq" : "mix-off");
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0); // JSON numbers never reach the HTML as text
const GREY = [150, 150, 150];

// The study's mix settings. Types of the data the settings do not list (or every type, without
// settings) are appended in size order, grey, so no apartment is ever left out of the totals.
export function mixConfig(entry, doc) {
    const cfg = entry?.mix || {};
    const types = (cfg.types || []).map((t) => ({ ...t, key: String(t.key), area_m2: num(t.area_m2), parking: num(t.parking) }));
    const known = new Set(types.map((t) => t.key));
    const extra = [...new Set((doc?.towers || []).flatMap((t) => (t.plate || []).map(String)))]
        .filter((k) => !known.has(k))
        .sort((a, b) => num(a) - num(b));
    // Unlisted: area guessed from the size name, no parking ratio; the view says so (mixHtml note).
    for (const key of extra) types.push({ key, label: `${key} m²`, area_m2: num(key), rgb: GREY, parking: 0, unlisted: true });
    const target = cfg.target || null;
    return {
        types,
        target,
        targetUnits: target ? types.reduce((s, t) => s + num(target[t.key]), 0) : null,
        targetArea: target ? types.reduce((s, t) => s + num(target[t.key]) * t.area_m2, 0) : null,
        client: cfg.client || null,
        clientParking: cfg.parking_client_per_unit != null ? num(cfg.parking_client_per_unit) : null,
        zones: cfg.zones || [],
    };
}

// Only three numbers reach the style attribute.
const colour = (t) => {
    const rgb = Array.isArray(t.rgb) && t.rgb.length === 3 ? t.rgb.map(num) : null;
    return rgb ? `rgb(${rgb.join(" ")})` : "var(--muted)";
};

// One row per tower and size present on its typical floor.
function rowsOf(doc, cfg) {
    const out = [];
    for (const tower of doc.towers || []) {
        for (const type of cfg.types) {
            const per = (tower.plate || []).filter((u) => String(u) === type.key).length;
            if (!per) continue;
            const units = per * num(tower.floors);
            out.push({ tower, type, per, units, area: units * (type.area_m2 || 0), park: units * (type.parking || 0) });
        }
    }
    return out;
}
const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);

function chips(plate, cfg, esc) {
    const byKey = new Map(cfg.types.map((t) => [t.key, t]));
    return `<span class="mix-plate">${(plate || [])
        .map((u) => `<span style="background:${colour(byKey.get(String(u)) || {})}">${esc(u)}</span>`)
        .join("")}</span>`;
}
const swatch = (t) => `<span class="mix-sw" style="background:${colour(t)}"></span>`;

function tiles(doc, cfg, rows, esc) {
    const U = sum(rows, "units");
    const A = sum(rows, "area");
    const tile = (k, v, d, extra = "") => `<div class="mix-tile"><div class="mix-k">${k}</div><div class="mix-v">${v}</div>${extra}<div class="mix-d">${d}</div></div>`;
    const client = cfg.client;
    let h = tile(
        "Apartments",
        nf(U),
        cfg.targetUnits != null
            ? `target ${nf(cfg.targetUnits)}${client?.units != null ? ` (client ${nf(num(client.units))})` : ""} · <span class="${gapClass(U - cfg.targetUnits)}">${signed(U - cfg.targetUnits)}</span>`
            : ""
    );
    const areaRef = client?.area_m2 != null ? num(client.area_m2) : cfg.targetArea;
    h += tile("Apartment area", `${nf(A)} m²`, areaRef != null ? `${client?.area_m2 != null ? "client ≈ " : "target "}${nf(areaRef)} · <span class="${gapClass(A - areaRef)}">${signed(A - areaRef)}</span>` : "");
    for (const t of cfg.types) {
        const u = sum(rows.filter((r) => r.type === t), "units");
        const goal = cfg.target ? num(cfg.target[t.key]) : null;
        const meter = goal > 0 ? `<div class="mix-meter"><i style="width:${Math.min(100, (100 * u) / goal)}%;background:${colour(t)}"></i></div>` : "";
        h += tile(`${swatch(t)}${esc(t.label)}`, nf(u), `${pct(u, U)}${goal != null ? ` · target ${nf(goal)} · <span class="${gapClass(u - goal)}">${signed(u - goal)}</span>` : ""}`, meter);
    }
    if (cfg.types.some((t) => t.parking)) {
        h += tile("Parking", nf(sum(rows, "park")), `norm${cfg.clientParking != null ? ` · client ${cfg.clientParking} per apartment = ${nf(U * cfg.clientParking)}` : ""}`);
    }
    return `<div class="mix-tiles">${h}</div>`;
}

// The key carries a tower id or zone key from the JSON: escaped like every other value.
const attr = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function group(key, cls, label, cells, closed) {
    const open = !closed.has(key);
    return `<tr class="${cls}" tabindex="0" data-mix-key="${attr(key)}" aria-expanded="${open}"><td class="mix-txt"><span class="mix-caret">${open ? "▾" : "▸"}</span>${label}</td>${cells}</tr>`;
}

function towerBlock(tower, rows, U, cfg, closed, esc) {
    const sub = rows.filter((r) => r.tower === tower);
    const su = sum(sub, "units");
    const key = "t:" + tower.id;
    const label = `${esc(tower.id)}${chips(tower.plate, cfg, esc)}${num(tower.length_m) ? `<span class="mix-meta">${f1(num(tower.length_m))} m</span>` : ""}`;
    let h = group(
        key,
        "mix-group",
        label,
        `<td>${sum(sub, "per")}</td><td>${num(tower.floors)}<span class="mix-dim">+${num(tower.base)}</span></td><td>${f1(num(tower.height_m))}</td>` +
            `<td>${nf(su)}</td><td>${nf(sum(sub, "area"))}</td><td>${pct(su, U)}</td><td>${nf(sum(sub, "park"))}</td>`,
        closed
    );
    if (!closed.has(key)) {
        for (const r of sub) {
            h += `<tr class="mix-child"><td class="mix-txt">${swatch(r.type)} ${esc(r.type.label)}</td><td>${r.per}</td><td>${num(tower.floors)}</td><td></td>` +
                `<td>${nf(r.units)}</td><td>${nf(r.area)}</td><td>${pct(r.units, U)}</td><td>${nf(r.park)}</td></tr>`;
        }
    }
    return h;
}

// A · By tower: tower rows (plate, length, floors + base, height, totals), then one row per size.
function byTower(doc, cfg, rows, ui, esc) {
    const U = sum(rows, "units");
    const towers = doc.towers || [];
    let h = `<thead><tr><th class="mix-txt">Tower / size</th><th>Per floor</th><th>Floors</th><th>H m</th><th>Apartments</th><th>Area m²</th><th>% apts</th><th>Parking</th></tr></thead><tbody>`;
    for (const t of towers) h += towerBlock(t, rows, U, cfg, ui.closed, esc);
    h += `</tbody><tfoot><tr class="mix-total"><td class="mix-txt">Option total</td><td>${sum(rows, "per")}</td><td></td><td></td><td>${nf(U)}</td><td>${nf(sum(rows, "area"))}</td><td>100.0%</td><td>${nf(sum(rows, "park"))}</td></tr>`;
    if (cfg.targetUnits != null) h += `<tr class="mix-target"><td class="mix-txt">Target</td><td></td><td></td><td></td><td>${nf(cfg.targetUnits)}</td><td>${nf(cfg.targetArea)}</td><td></td><td></td></tr>`;
    return h + "</tfoot>";
}

// C · Tower × size: one row per tower, cells tinted by value, totals, target and gap.
function matrix(doc, cfg, rows, ui, esc) {
    const m = ui.measure === "area" ? "area" : "units";
    const towers = doc.towers || [];
    const val = (t, type) => rows.find((r) => r.tower === t && r.type === type)?.[m] || 0;
    const max = Math.max(1, ...towers.flatMap((t) => cfg.types.map((type) => val(t, type))));
    let h = `<thead><tr><th class="mix-txt">Tower${m === "area" ? " (m²)" : ""}</th>${cfg.types.map((t) => `<th>${swatch(t)} ${esc(t.label)}</th>`).join("")}<th>Total</th><th>Floors</th><th class="mix-txt">Typical floor</th></tr></thead><tbody>`;
    for (const t of towers) {
        const total = cfg.types.reduce((a, type) => a + val(t, type), 0);
        h += `<tr><td class="mix-txt">${esc(t.id)}</td>` +
            cfg.types.map((type) => {
                const v = val(t, type);
                return `<td class="mix-cell" style="--c:${colour(type)};--o:${v ? (0.12 + (0.38 * v) / max).toFixed(2) : 0}">${v ? nf(v) : '<span class="mix-zero">·</span>'}</td>`;
            }).join("") +
            `<td>${nf(total)}</td><td>${num(t.floors)}<span class="mix-dim">+${num(t.base)}</span></td><td class="mix-txt">${chips(t.plate, cfg, esc)}</td></tr>`;
    }
    const col = (type) => sum(rows.filter((r) => r.type === type), m);
    const all = sum(rows, m);
    h += `</tbody><tfoot><tr class="mix-total"><td class="mix-txt">Total</td>${cfg.types.map((t) => `<td>${nf(col(t))}</td>`).join("")}<td>${nf(all)}</td><td></td><td></td></tr>`;
    if (cfg.target) {
        const goal = (t) => (cfg.target[t.key] || 0) * (m === "area" ? t.area_m2 || 0 : 1);
        const goalAll = cfg.types.reduce((a, t) => a + goal(t), 0);
        h += `<tr class="mix-target"><td class="mix-txt">Target</td>${cfg.types.map((t) => `<td>${nf(goal(t))}</td>`).join("")}<td>${nf(goalAll)}</td><td></td><td></td></tr>` +
            `<tr class="mix-target"><td class="mix-txt">Gap</td>${cfg.types.map((t) => `<td class="${gapClass(col(t) - goal(t))}">${signed(col(t) - goal(t))}</td>`).join("")}<td class="${gapClass(all - goalAll)}">${signed(all - goalAll)}</td><td></td><td></td></tr>`;
    }
    return h + "</tfoot>";
}

const seg = (name, value, options) =>
    `<span class="mix-seg" role="group">${options
        .map(([v, label]) => `<button type="button" data-mix-${name}="${v}" aria-pressed="${String(v === value)}">${label}</button>`)
        .join("")}</span>`;

// The whole view. ui: { view: "tower" | "matrix", measure: "units" | "area", closed: Set }.
export function mixHtml(doc, cfg, ui, esc) {
    const rows = rowsOf(doc, cfg);
    if (!rows.length) return `<p class="mix-empty">No apartments in this option.</p>`;
    const controls =
        seg("view", ui.view, [["tower", "By tower"], ["matrix", "Tower × size"]]) +
        (ui.view === "tower"
            ? `<button type="button" class="mix-fold" data-mix-fold>${ui.closed.size ? "Unfold all" : "Fold all"}</button>`
            : seg("measure", ui.measure, [["units", "Apartments"], ["area", "m²"]]));
    const unlisted = cfg.types.filter((t) => t.unlisted && rows.some((r) => r.type === t));
    const note =
        (unlisted.length
            ? `<p class="mix-note mix-off">${unlisted.map((t) => esc(t.key)).join(", ")}: not in the study's mix settings. Counted in grey, with the area taken from the size name and no parking ratio, so area and parking may be understated.</p>`
            : "") + (cfg.client?.note ? `<p class="mix-note">${esc(cfg.client.note)}</p>` : "");
    return `${tiles(doc, cfg, rows, esc)}<div class="mix-controls">${controls}</div>
        <table class="mix-table">${ui.view === "matrix" ? matrix(doc, cfg, rows, ui, esc) : byTower(doc, cfg, rows, ui, esc)}</table>${note}`;
}

// Keys of every foldable row of the current view (for "Fold all").
export function mixGroupKeys(doc) {
    return (doc.towers || []).map((t) => "t:" + t.id);
}

// ---- Program tab: the matrix with selectable cells, linked to the unit-mix 3D ----

// Every apartment of the option, in the order the export writes them in the 3D file: tower by
// tower, floor by floor (0 = first residential floor), then along the typical floor.
export function mixUnits(doc) {
    const out = [];
    for (const tower of doc.towers || []) {
        for (let floor = 0; floor < num(tower.floors); floor++) {
            for (const u of tower.plate || []) out.push({ tower: String(tower.id), floor, type: String(u) });
        }
    }
    return out;
}

// A selection key: a whole tower ["t", id], a size everywhere ["s", type] or one cell ["c", id, type].
export const programKey = (kind, a, b) => JSON.stringify(b == null ? [kind, String(a)] : [kind, String(a), String(b)]);
export const programMatch = (key, unit) => {
    const [kind, a, b] = JSON.parse(key);
    return kind === "t" ? unit.tower === a : kind === "s" ? unit.type === a : unit.tower === a && unit.type === b;
};

// Tower × size with totals, target and gap. Tower names, size headers and filled cells carry
// data-prog-key and act as buttons; the coloured headers are the legend of the 3D.
export function programTableHtml(doc, cfg, measure, esc) {
    const rows = rowsOf(doc, cfg);
    if (!rows.length) return `<p class="mix-empty">No apartments in this option.</p>`;
    const m = measure === "area" ? "area" : "units";
    const towers = doc.towers || [];
    const val = (t, type) => rows.find((r) => r.tower === t && r.type === type)?.[m] || 0;
    const max = Math.max(1, ...towers.flatMap((t) => cfg.types.map((type) => val(t, type))));
    const pick = (key, label) => `tabindex="0" role="button" aria-pressed="false" data-prog-key="${attr(key)}" title="${attr(label)}"`;
    let h = `<table class="mix-table prog-table"><thead><tr><th class="mix-txt">Tower${m === "area" ? " (m²)" : ""}</th>${cfg.types
        .map((t) => `<th ${pick(programKey("s", t.key), `Every ${t.label} apartment`)}>${swatch(t)} ${esc(t.label)}</th>`)
        .join("")}<th>Total</th><th>Floors</th></tr></thead><tbody>`;
    for (const t of towers) {
        const total = cfg.types.reduce((a, type) => a + val(t, type), 0);
        h += `<tr><td class="mix-txt" ${pick(programKey("t", t.id), `Tower ${t.id}`)}>${esc(t.id)}</td>` +
            cfg.types.map((type) => {
                const v = val(t, type);
                return v
                    ? `<td class="mix-cell" style="--c:${colour(type)};--o:${(0.12 + (0.38 * v) / max).toFixed(2)}" ${pick(programKey("c", t.id, type.key), `${t.id}, ${type.label}`)}>${nf(v)}</td>`
                    : `<td class="mix-cell"><span class="mix-zero">·</span></td>`;
            }).join("") +
            `<td>${nf(total)}</td><td>${num(t.floors)}<span class="mix-dim">+${num(t.base)}</span></td></tr>`;
    }
    const col = (type) => sum(rows.filter((r) => r.type === type), m);
    const all = sum(rows, m);
    h += `</tbody><tfoot><tr class="mix-total"><td class="mix-txt">Total</td>${cfg.types.map((t) => `<td>${nf(col(t))}</td>`).join("")}<td>${nf(all)}</td><td></td></tr>`;
    if (cfg.target) {
        const goal = (t) => (cfg.target[t.key] || 0) * (m === "area" ? t.area_m2 || 0 : 1);
        const goalAll = cfg.types.reduce((a, t) => a + goal(t), 0);
        h += `<tr class="mix-target"><td class="mix-txt">Target</td>${cfg.types.map((t) => `<td>${nf(goal(t))}</td>`).join("")}<td>${nf(goalAll)}</td><td></td></tr>` +
            `<tr class="mix-target"><td class="mix-txt">Gap</td>${cfg.types.map((t) => `<td class="${gapClass(col(t) - goal(t))}">${signed(col(t) - goal(t))}</td>`).join("")}<td class="${gapClass(all - goalAll)}">${signed(all - goalAll)}</td><td></td></tr>`;
    }
    return h + "</tfoot></table>";
}

// "64 apartments · 14,080 m²" for a list of mixUnits() items.
export function programCount(units, cfg) {
    const area = new Map(cfg.types.map((t) => [t.key, t.area_m2 || 0]));
    return `${nf(units.length)} apartment${units.length === 1 ? "" : "s"} · ${nf(units.reduce((a, u) => a + (area.get(u.type) || 0), 0))} m²`;
}

// Compare options: the totals of one option (count and gap per size, total, area, parking).
export function mixCompareHtml(doc, cfg, esc) {
    const rows = rowsOf(doc, cfg);
    const U = sum(rows, "units");
    const line = (label, v, goal) =>
        `<tr><td class="mix-txt">${label}</td><td>${nf(v)}</td><td>${goal != null ? `<span class="${gapClass(v - goal)}">${signed(v - goal)}</span>` : ""}</td></tr>`;
    let h = `<table class="mix-table mix-compare"><thead><tr><th class="mix-txt">Size</th><th>Apts</th><th>${cfg.target ? "Gap" : ""}</th></tr></thead><tbody>`;
    for (const t of cfg.types) h += line(`${swatch(t)} ${esc(t.label)}`, sum(rows.filter((r) => r.type === t), "units"), cfg.target ? cfg.target[t.key] || 0 : null);
    h += `</tbody><tfoot>${line("Total", U, cfg.targetUnits)}`;
    h += `<tr><td class="mix-txt">Area m²</td><td>${nf(sum(rows, "area"))}</td><td></td></tr>`;
    if (cfg.types.some((t) => t.parking)) h += `<tr><td class="mix-txt">Parking</td><td>${nf(sum(rows, "park"))}</td><td></td></tr>`;
    return h + `</tfoot></table>`;
}
