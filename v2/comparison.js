// "Compare options": the shortlisted options (2 to 4) side by side.
// A radar of every goal, what each option does better, and the exact values with the best
// value found per result. The radar axes and the "best found" reference use all loaded
// options, independent of the filters, so the picture doesn't change while filtering.
// Close results use the rules in compare.js (2%, or 1 dB for noise).
import { aboutTheSame } from "./compare.js?v=37";

export const SLOT_COLORS = ["#176a83", "#bc6332", "#7655a2", "#448452"];
const slotName = (i) => String.fromCharCode(65 + i); // A, B, C, D

// ctx: { data, chosen: [option], esc, fmt, thumbUrl }. Returns the section's HTML.
export function comparisonHtml({ data, chosen, esc, fmt, thumbUrl, maxOptions }) {
    const all = data.options;
    const goals = data.schema.outputs.filter((m) => m.dir);
    const rows = data.schema.outputs.map((m) => resultRow(m, chosen, all));
    const label = (o) => o.name;

    const head = `<header class="cp-head">
        <div>
            <span class="eyebrow">Compare options</span>
            <h2>Which trade-offs work for you?</h2>
            <p class="muted small">${chosen.length} selected · reference: all ${all.length} options${
                data.studies.length > 1 ? ` across ${data.studies.length} methods` : ""
            }</p>
        </div>
        <button type="button" class="cp-primary" data-back>Back to options ↑</button>
    </header>`;

    const picks = `<div class="cp-picks">${chosen
        .map(
            (o, i) => `<article style="--option:${SLOT_COLORS[i]}">
                <img src="${esc(thumbUrl(o) || "")}" alt="${esc(label(o))}" />
                <div>
                    <b>${slotName(i)}</b>
                    <select data-slot="${i}" aria-label="Option ${slotName(i)}">${data.studies
                        .map(
                            (s) => `<optgroup label="${esc(s.name)}">${all
                                .filter((x) => x.study === s)
                                .map((x) => `<option value="${x.index}" ${x === o ? "selected" : ""}>${esc(label(x))}</option>`)
                                .join("")}</optgroup>`
                        )
                        .join("")}</select>
                    ${data.studies.length > 1 ? `<small>${esc(o.study.name)}</small>` : ""}
                    <button type="button" data-remove="${o.index}" aria-label="Remove ${esc(label(o))}">Remove</button>
                </div>
            </article>`
        )
        .join("")}${chosen.length < maxOptions ? `<button type="button" class="cp-add" data-add>Add option +</button>` : ""}</div>`;

    const strengths = chosen
        .map((o, i) => {
            const leads = rows.filter((r) => r.leaders.length === 1 && r.leaders[0] === o).map((r) => r.m.label);
            const close = rows.filter((r) => r.leaders.length > 1 && r.leaders.includes(o)).map((r) => r.m.label);
            return `<article class="cp-strength" style="--option:${SLOT_COLORS[i]}">
                <strong>${slotName(i)} · ${esc(label(o))}</strong>
                <p>${leads.length ? "Leads on " + leads.map(esc).join(", ") + "." : "No sole lead on these measurements."}</p>
                ${close.length ? `<small>Close to the lead: ${close.map(esc).join(", ")}.</small>` : ""}
            </article>`;
        })
        .join("");

    const table = `<div class="cp-table-wrap"><table class="cp-table">
        <thead><tr><th>Measurement</th>${chosen
            .map((o, i) => `<th style="color:${SLOT_COLORS[i]}">${slotName(i)} · ${esc(label(o))}</th>`)
            .join("")}<th class="cp-reference">Best found¹</th></tr></thead>
        <tbody>${rows
            .map(
                (r) => `<tr>
                    <th>${esc(r.m.label)}<small>${r.m.dir > 0 ? "Higher is better" : r.m.dir < 0 ? "Lower is better" : "No preferred direction"}</small></th>
                    ${chosen
                        .map((o) => `<td class="${r.leaders.includes(o) ? "cp-leading" : ""}"><b>${fmt(o.values[r.m.col])}</b><small>${badge(o, r) || gap(o, r, fmt)}</small></td>`)
                        .join("")}
                    <td class="cp-reference"><b>${r.m.dir ? fmt(r.best) : "—"}</b></td>
                </tr>`
            )
            .join("")}</tbody>
    </table></div>`;

    const body = `<div class="cp-radar-layout">
        <div class="cp-radar">
            ${radarSvg(goals, rows, chosen)}
            <p>Outward = better · dashed edge = best found¹</p>
            <ol>${goals.map((m) => `<li>${esc(m.label)}</li>`).join("")}</ol>
        </div>
        <div>
            <h3>What each option does better</h3>
            ${strengths}
            <p class="cp-note">Axes are scaled across all loaded options, from worst to best. Shape area is not an overall score.</p>
        </div>
    </div>
    <details><summary>See exact values and best-found reference</summary>${table}</details>`;

    const foot = `<footer class="cp-note">¹ Best found is the best value of each measurement across all loaded options: it is not one buildable option, and filters don't change it. Close results count as about the same: under 2% apart, or within 1 dB for noise.</footer>`;

    return head + picks + body + foot;
}

// One result across the chosen options: ranking, leaders (best plus anything about the
// same as it), best value and range across all loaded options.
function resultRow(m, chosen, all) {
    const ranked = chosen
        .filter((o) => Number.isFinite(o.values[m.col]))
        .sort((a, b) => (m.dir || 1) * (b.values[m.col] - a.values[m.col]));
    const pool = all.map((o) => o.values[m.col]).filter(Number.isFinite);
    const best = pool.length ? (m.dir < 0 ? Math.min(...pool) : Math.max(...pool)) : NaN;
    const top = ranked[0]?.values[m.col];
    const leaders = m.dir && ranked.length ? ranked.filter((o) => aboutTheSame(m, o.values[m.col], top)) : [];
    return { m, best, leaders, min: Math.min(...pool), max: Math.max(...pool) };
}

function badge(o, r) {
    if (!r.leaders.includes(o)) return "";
    return r.leaders.length > 1 ? "About the same" : "Best of selected";
}

// Distance from the best value found, in the result's own unit ("[%]" → percentage points).
function gap(o, r, fmt) {
    const v = o.values[r.m.col];
    if (!Number.isFinite(v) || !Number.isFinite(r.best)) return "—";
    if (!r.m.dir) return "No preferred direction";
    const d = Math.abs(v - r.best);
    if (d < 1e-9) return "Matches best found";
    const unit = r.m.label.match(/\[([^\]]+)\]/)?.[1];
    return `${fmt(d)} ${unit === "%" ? "percentage points" : unit || "units"} from best`;
}

// Radar: one axis per goal, worst (centre) to best (edge) across all loaded options.
function radarSvg(goals, rows, chosen) {
    if (goals.length < 3) return `<p class="muted">The radar needs at least three results with a better direction.</p>`;
    const n = goals.length;
    const cx = 240;
    const cy = 215;
    const R = 155;
    const point = (i, f) => [cx + Math.cos((i * 2 * Math.PI) / n - Math.PI / 2) * R * f, cy + Math.sin((i * 2 * Math.PI) / n - Math.PI / 2) * R * f];
    const ring = (f) => goals.map((m, i) => point(i, f).join(",")).join(" ");
    const goalRows = rows.filter((r) => r.m.dir);
    const score = (o, r) => {
        const v = o.values[r.m.col];
        if (!Number.isFinite(v)) return 0;
        if (r.max === r.min) return 1;
        return r.m.dir < 0 ? (r.max - v) / (r.max - r.min) : (v - r.min) / (r.max - r.min);
    };
    const rings = [0.25, 0.5, 0.75, 1]
        .map((f) => `<polygon points="${ring(f)}" fill="none" stroke="#dce4dd" ${f === 1 ? 'stroke-dasharray="5 4"' : ""}/>`)
        .join("");
    const axes = goals
        .map((m, i) => {
            const p = point(i, 1);
            const t = point(i, 1.16);
            return `<line x1="${cx}" y1="${cy}" x2="${p[0]}" y2="${p[1]}" stroke="#e1e7e1"/><text x="${t[0]}" y="${t[1]}" text-anchor="middle" font-size="12" fill="#516054">${i + 1}</text>`;
        })
        .join("");
    const shapes = chosen
        .map(
            (o, j) =>
                `<polygon points="${goalRows.map((r, i) => point(i, score(o, r)).join(",")).join(" ")}" fill="${SLOT_COLORS[j]}" fill-opacity=".06" stroke="${SLOT_COLORS[j]}" stroke-width="2.5"/>`
        )
        .join("");
    return `<svg viewBox="0 0 480 440" role="img" aria-label="Radar chart: the outer edge is the best found for each measurement, the centre the worst.">${rings}${axes}${shapes}</svg>`;
}
