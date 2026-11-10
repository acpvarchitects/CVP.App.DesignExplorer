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
// Two views (Cristiano, 10/11): A "By tower" (tower rows with their sizes, optional zone level)
// and C "Tower × size" (matrix with totals, target and gap). Compare shows the totals only.

const nf = (v) => Math.round(v).toLocaleString("en-GB");
const f1 = (v) => (Number.isFinite(v) ? v.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "–");
const pct = (a, b) => (b ? f1((100 * a) / b) + "%" : "–");
const signed = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + nf(Math.abs(v));
const gapClass = (v) => (v === 0 ? "mix-eq" : "mix-off");

// The study's mix settings; without them, the types found in the data in size order, grey.
export function mixConfig(entry, doc) {
    const cfg = entry?.mix || {};
    let types = (cfg.types || []).map((t) => ({ ...t, key: String(t.key) }));
    if (!types.length) {
        const keys = [...new Set((doc?.towers || []).flatMap((t) => t.plate || []))].sort((a, b) => Number(a) - Number(b));
        types = keys.map((key) => ({ key, label: `${key} m²`, area_m2: Number(key) || 0, rgb: [150, 150, 150] }));
    }
    const target = cfg.target || null;
    return {
        types,
        target,
        targetUnits: target ? types.reduce((s, t) => s + (target[t.key] || 0), 0) : null,
        targetArea: target ? types.reduce((s, t) => s + (target[t.key] || 0) * (t.area_m2 || 0), 0) : null,
        client: cfg.client || null,
        clientParking: cfg.parking_client_per_unit ?? null,
        zones: cfg.zones || [],
    };
}

const colour = (t) => (t.rgb ? `rgb(${t.rgb.join(" ")})` : "var(--muted)");

// One row per tower and size present on its typical floor.
function rowsOf(doc, cfg) {
    const out = [];
    for (const tower of doc.towers || []) {
        for (const type of cfg.types) {
            const per = (tower.plate || []).filter((u) => String(u) === type.key).length;
            if (!per) continue;
            const units = per * tower.floors;
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
const hotelPill = (t) => (t.hotel ? `<span class="mix-pill">hotel</span>` : "");

function tiles(doc, cfg, rows, esc) {
    const U = sum(rows, "units");
    const A = sum(rows, "area");
    const tile = (k, v, d, extra = "") => `<div class="mix-tile"><div class="mix-k">${k}</div><div class="mix-v">${v}</div>${extra}<div class="mix-d">${d}</div></div>`;
    const client = cfg.client;
    let h = tile(
        "Apartments",
        nf(U),
        cfg.targetUnits != null
            ? `target ${nf(cfg.targetUnits)}${client?.units ? ` (client ${nf(client.units)})` : ""} · <span class="${gapClass(U - cfg.targetUnits)}">${signed(U - cfg.targetUnits)}</span>`
            : ""
    );
    const areaRef = client?.area_m2 ?? cfg.targetArea;
    h += tile("Apartment area", `${nf(A)} m²`, areaRef ? `${client?.area_m2 ? "client ≈ " : "target "}${nf(areaRef)} · ${signed(A - areaRef)}` : "");
    for (const t of cfg.types) {
        const u = sum(rows.filter((r) => r.type === t), "units");
        const goal = cfg.target?.[t.key];
        const meter = goal ? `<div class="mix-meter"><i style="width:${Math.min(100, (100 * u) / goal)}%;background:${colour(t)}"></i></div>` : "";
        h += tile(`${swatch(t)}${esc(t.label)}`, nf(u), `${pct(u, U)}${goal != null ? ` · target ${nf(goal)} · <span class="${gapClass(u - goal)}">${signed(u - goal)}</span>` : ""}`, meter);
    }
    if (cfg.types.some((t) => t.parking)) {
        h += tile("Parking", nf(sum(rows, "park")), `norm${cfg.clientParking != null ? ` · client ${cfg.clientParking} per apartment = ${nf(U * cfg.clientParking)}` : ""}`);
    }
    return `<div class="mix-tiles">${h}</div>`;
}

function group(key, cls, label, cells, closed) {
    const open = !closed.has(key);
    return `<tr class="${cls}" tabindex="0" data-mix-key="${key}" aria-expanded="${open}"><td class="mix-txt"><span class="mix-caret">${open ? "▾" : "▸"}</span>${label}</td>${cells}</tr>`;
}

function towerBlock(tower, rows, U, cfg, closed, esc) {
    const sub = rows.filter((r) => r.tower === tower);
    const su = sum(sub, "units");
    const key = "t:" + tower.id;
    const label = `${esc(tower.id)}${hotelPill(tower)}${chips(tower.plate, cfg, esc)}${tower.length_m ? `<span class="mix-meta">${f1(tower.length_m)} m</span>` : ""}`;
    let h = group(
        key,
        "mix-group",
        label,
        `<td>${sum(sub, "per")}</td><td>${tower.floors}<span class="mix-dim">+${tower.base}</span></td><td>${f1(tower.height_m)}</td>` +
            `<td>${nf(su)}</td><td>${nf(sum(sub, "area"))}</td><td>${pct(su, U)}</td><td>${nf(sum(sub, "park"))}</td>`,
        closed
    );
    if (!closed.has(key)) {
        for (const r of sub) {
            h += `<tr class="mix-child"><td class="mix-txt">${swatch(r.type)} ${esc(r.type.label)}</td><td>${r.per}</td><td>${tower.floors}</td><td></td>` +
                `<td>${nf(r.units)}</td><td>${nf(r.area)}</td><td>${pct(r.units, U)}</td><td>${nf(r.park)}</td></tr>`;
        }
    }
    return h;
}

// A · By tower: tower rows (plate, length, floors + base, height, totals), then one row per size.
function byTower(doc, cfg, rows, ui, esc) {
    const U = sum(rows, "units");
    const towers = doc.towers || [];
    let h = `<thead><tr><th class="mix-txt">${ui.zones ? "Zone / tower / size" : "Tower / size"}</th><th>Per floor</th><th>Floors</th><th>H m</th><th>Apartments</th><th>Area m²</th><th>% apts</th><th>Parking</th></tr></thead><tbody>`;
    if (ui.zones) {
        const known = cfg.zones.map((z) => z.key);
        const keys = [...new Set([...known, ...towers.map((t) => t.zone)])].filter((k) => towers.some((t) => t.zone === k));
        for (const z of keys) {
            const ts = towers.filter((t) => t.zone === z);
            const zr = rows.filter((r) => ts.includes(r.tower));
            const key = "z:" + z;
            const label = esc(cfg.zones.find((x) => x.key === z)?.label || z || "Other");
            h += group(
                key,
                "mix-zone",
                `${label} <span class="mix-dim">(${ts.length})</span>`,
                `<td>${sum(zr, "per")}</td><td></td><td></td><td>${nf(sum(zr, "units"))}</td><td>${nf(sum(zr, "area"))}</td><td>${pct(sum(zr, "units"), U)}</td><td>${nf(sum(zr, "park"))}</td>`,
                ui.closed
            );
            if (!ui.closed.has(key)) for (const t of ts) h += towerBlock(t, rows, U, cfg, ui.closed, esc);
        }
    } else for (const t of towers) h += towerBlock(t, rows, U, cfg, ui.closed, esc);
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
        h += `<tr><td class="mix-txt">${esc(t.id)}${hotelPill(t)}</td>` +
            cfg.types.map((type) => {
                const v = val(t, type);
                return `<td class="mix-cell" style="--c:${colour(type)};--o:${v ? (0.12 + (0.38 * v) / max).toFixed(2) : 0}">${v ? nf(v) : '<span class="mix-zero">·</span>'}</td>`;
            }).join("") +
            `<td>${nf(total)}</td><td>${t.floors}<span class="mix-dim">+${t.base}</span></td><td class="mix-txt">${chips(t.plate, cfg, esc)}</td></tr>`;
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

// The whole view. ui: { view: "tower" | "matrix", zones: bool, measure: "units" | "area", closed: Set }.
export function mixHtml(doc, cfg, ui, esc) {
    const rows = rowsOf(doc, cfg);
    if (!rows.length) return `<p class="mix-empty">No apartments in this option.</p>`;
    const controls =
        seg("view", ui.view, [["tower", "By tower"], ["matrix", "Tower × size"]]) +
        (ui.view === "tower"
            ? seg("zones", ui.zones ? "on" : "off", [["off", "Towers"], ["on", "Zones › towers"]]) + `<button type="button" class="mix-fold" data-mix-fold>${ui.closed.size ? "Unfold all" : "Fold all"}</button>`
            : seg("measure", ui.measure, [["units", "Apartments"], ["area", "m²"]]));
    const note = cfg.client?.note ? `<p class="mix-note">${esc(cfg.client.note)}</p>` : "";
    return `${tiles(doc, cfg, rows, esc)}<div class="mix-controls">${controls}</div>
        <table class="mix-table">${ui.view === "matrix" ? matrix(doc, cfg, rows, ui, esc) : byTower(doc, cfg, rows, ui, esc)}</table>${note}`;
}

// Keys of every foldable row of the current view (for "Fold all").
export function mixGroupKeys(doc, cfg, ui) {
    const towers = doc.towers || [];
    return [...(ui.zones ? [...new Set(towers.map((t) => "z:" + t.zone))] : []), ...towers.map((t) => "t:" + t.id)];
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
