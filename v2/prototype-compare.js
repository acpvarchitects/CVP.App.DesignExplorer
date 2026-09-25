// PROTOTYPE — throwaway. Question: what should the "Best at what" comparison look like?
// Three variants of the comparison section on /v2/, switchable via ?variant=A|B|C
// and the floating bar at the bottom (shown on localhost or when ?variant= is set).
// Once one wins, fold it into app.js and drop this file from the main branch.

const VARIANTS = [
    { key: "A", name: "Scoreboard table", render: variantA },
    { key: "B", name: "Option cards", render: variantB },
    { key: "C", name: "Goal bars", render: variantC },
];

const current = () => VARIANTS.find((v) => v.key === new URLSearchParams(location.search).get("variant")) || VARIANTS[0];

export function renderInsight(el, ctx) {
    el.innerHTML = current().render(ctx);
}

// ---- shared bits (verdict words only; layouts stay separate) ----

function verdict(ctx, result, option) {
    const row = result.rows.find((r) => r.option === option);
    if (!row) return { cls: "", icon: "", text: "" };
    if (result.winner === option) return { cls: "win", icon: "✓", text: "Best" };
    if (row.status !== "behind") return { cls: "same", icon: "≈", text: "About the same as best" };
    return { cls: "behind", icon: "↓", text: `${ctx.pct(row.behind)} behind best` };
}

function headline(ctx, result) {
    const e = ctx.esc;
    if (result.winner) {
        return `<strong>${e(result.winner.title)}</strong> <span class="muted">${ctx.pct(result.lead)} ahead of ${e(result.runnerUp.title)}</span>`;
    }
    const top = result.rows.filter((r) => r.status !== "behind").map((r) => e(r.option.title));
    return `<strong>About the same</strong> <span class="muted">${top.join(", ")}</span>`;
}

const winsText = (ctx, o) => `Wins ${ctx.winsOf(o)} of ${ctx.results.length}`;

// ---- A: goals as rows, options as columns, a "Best" column at the end ----

function variantA(ctx) {
    const e = ctx.esc;
    const head = ctx.options
        .map(
            (o) => `<th class="${o === ctx.selected ? "sel" : ""}">
                <button type="button" data-select="${o.index}" class="pa-opt">
                    ${ctx.thumbUrl(o) ? `<img src="${e(ctx.thumbUrl(o))}" alt="" />` : ""}
                    <span>${e(o.title)}</span>
                </button>
                <div class="pa-wins">${winsText(ctx, o)}</div>
            </th>`
        )
        .join("");
    const goalRows = ctx.results
        .map((r) => {
            const cells = ctx.options
                .map((o) => {
                    const v = verdict(ctx, r, o);
                    return `<td class="${v.cls}"><div class="pa-val">${ctx.fmt(o.values[r.goal.col])}</div><div class="pa-v">${v.icon} ${v.text}</div></td>`;
                })
                .join("");
            return `<tr><th>${e(r.goal.label)}<div class="hint">${ctx.directionHint(r.goal)}</div></th>${cells}<td class="pa-best">${headline(ctx, r)}</td></tr>`;
        })
        .join("");
    const otherRows = ctx.others
        .map(
            (m) => `<tr class="pa-other"><th>${e(m.label)}<div class="hint">no better or worse</div></th>${ctx.options
                .map((o) => `<td><div class="pa-val">${ctx.fmt(o.values[m.col])}</div></td>`)
                .join("")}<td class="pa-best muted">—</td></tr>`
        )
        .join("");
    return `<div class="pa-wrap"><table class="pa"><thead><tr><th></th>${head}<th>Best</th></tr></thead><tbody>${goalRows}${otherRows}</tbody></table></div>`;
}

// ---- B: one line per goal on top, then one card per option ----

function variantB(ctx) {
    const e = ctx.esc;
    const lines = ctx.results
        .map((r) => `<div class="pb-line"><span class="pb-goal">${e(r.goal.label)}</span><span>${headline(ctx, r)}</span></div>`)
        .join("");
    const cards = ctx.options
        .map((o) => {
            const items = ctx.results
                .map((r) => {
                    const v = verdict(ctx, r, o);
                    return `<li class="${v.cls}"><span class="pb-icon">${v.icon}</span><span class="pb-name">${e(r.goal.label)}</span><span class="pb-text">${v.text}</span></li>`;
                })
                .join("");
            const others = ctx.others
                .map((m) => `<li class="other"><span class="pb-icon">·</span><span class="pb-name">${e(m.label)}</span><span class="pb-text">${ctx.fmt(o.values[m.col])}</span></li>`)
                .join("");
            return `<div class="pb-card ${o === ctx.selected ? "sel" : ""}">
                <button type="button" data-select="${o.index}" class="pb-img">${ctx.thumbUrl(o) ? `<img src="${e(ctx.thumbUrl(o))}" alt="" />` : ""}</button>
                <div class="pb-title">${e(o.title)}</div>
                <div class="pb-wins">${winsText(ctx, o)}</div>
                <ul>${items}${others}</ul>
            </div>`;
        })
        .join("");
    return `<div class="pb-lines">${lines}</div><div class="pb-cards">${cards}</div>`;
}

// ---- C: one block per goal, options as bars from best to worst ----

function variantC(ctx) {
    const e = ctx.esc;
    const blocks = ctx.results
        .map((r) => {
            const vals = r.rows.map((x) => x.value);
            const best = r.goal.dir > 0 ? Math.max(...vals) : Math.min(...vals);
            const bars = r.rows
                .map((row) => {
                    const w = r.goal.dir > 0 ? row.value / best : best / row.value;
                    const v = verdict(ctx, r, row.option);
                    return `<div class="pc-row ${v.cls} ${row.option === ctx.selected ? "sel" : ""}">
                        <button type="button" data-select="${row.option.index}" class="pc-name">${e(row.option.title)}</button>
                        <div class="pc-track"><div class="pc-fill" style="width:${Math.max(2, Math.min(100, w * 100)).toFixed(1)}%"></div></div>
                        <span class="pc-val">${ctx.fmt(row.value)}</span>
                        <span class="pc-v">${v.text}</span>
                    </div>`;
                })
                .join("");
            return `<div class="pc-goal">
                <div class="pc-head">${e(r.goal.label)} <span class="hint">${ctx.directionHint(r.goal)}</span></div>
                <div class="pc-verdict">${headline(ctx, r)}</div>
                ${bars}
            </div>`;
        })
        .join("");
    const others = ctx.others.length
        ? `<div class="pc-goal pc-others"><div class="pc-head">No better or worse</div>${ctx.others
              .map((m) => `<div class="pc-other"><span>${e(m.label)}</span><span>${ctx.options.map((o) => `${e(o.title)} <strong>${ctx.fmt(o.values[m.col])}</strong>`).join(" · ")}</span></div>`)
              .join("")}</div>`
        : "";
    const wins = `<div class="pc-wins">${ctx.options.map((o) => `<span><strong>${e(o.title)}</strong> ${winsText(ctx, o).toLowerCase()}</span>`).join("")}</div>`;
    return `${wins}<div class="pc-grid">${blocks}${others}</div>`;
}

// ---- floating switcher ----

export function mountSwitcher(onChange) {
    const p = new URLSearchParams(location.search);
    if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !p.has("variant")) return;
    document.head.insertAdjacentHTML("beforeend", `<style>${CSS}</style>`);
    const bar = document.createElement("div");
    bar.className = "proto-bar";
    bar.innerHTML = `<button type="button" data-d="-1" aria-label="Previous variant">‹</button><span></span><button type="button" data-d="1" aria-label="Next variant">›</button>`;
    document.body.appendChild(bar);
    const label = () => (bar.querySelector("span").textContent = `Prototype ${current().key} · ${current().name}`);
    const go = (d) => {
        const i = VARIANTS.indexOf(current());
        const next = VARIANTS[(i + d + VARIANTS.length) % VARIANTS.length];
        const q = new URLSearchParams(location.search);
        q.set("variant", next.key);
        history.replaceState(null, "", "?" + q.toString());
        label();
        onChange();
    };
    bar.addEventListener("click", (e) => {
        const b = e.target.closest("[data-d]");
        if (b) go(+b.dataset.d);
    });
    // Arrow keys already switch options, so the prototype uses [ and ].
    document.addEventListener("keydown", (e) => {
        if (e.target.closest("input, textarea, select, [contenteditable]")) return;
        if (e.key === "[") go(-1);
        if (e.key === "]") go(1);
    });
    label();
}

// Prototype styles live here so the whole throwaway stays in one file.
const CSS = `
.proto-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:50;display:flex;align-items:center;gap:10px;padding:6px 8px;background:#1f1f1d;color:#fff;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.25);font-size:13px}
.proto-bar button{background:#3a3a37;color:#fff;border:0;border-radius:50%;width:28px;height:28px;padding:0;font-size:18px;line-height:1}
.proto-bar button:hover{background:#55554f}
.proto-bar span{padding:0 6px;white-space:nowrap}
.pa-wrap{overflow-x:auto}
.pa{width:100%;border-collapse:collapse;font-size:13px}
.pa th,.pa td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.pa thead th{border-bottom:2px solid var(--line-strong)}
.pa thead th.sel{background:var(--accent-soft)}
.pa-opt{display:flex;align-items:center;gap:8px;padding:0;border:0;background:none;font-weight:600}
.pa-opt img{width:40px;height:40px;object-fit:cover;border-radius:6px}
.pa-wins{font-size:12px;color:var(--muted);margin-top:4px;font-weight:400}
.pa-val{font-weight:600}
.pa-v{font-size:12px;color:var(--muted)}
.pa td.win{background:var(--good-soft)}
.pa td.win .pa-v{color:var(--good);font-weight:600}
.pa td.same .pa-v{color:var(--good)}
.pa-best{min-width:180px}
.pa-other th,.pa-other td{color:var(--muted)}
.pb-lines{display:grid;gap:6px;margin-bottom:16px}
.pb-line{display:flex;gap:12px;align-items:baseline;padding:8px 12px;background:var(--soft);border-radius:var(--radius)}
.pb-goal{min-width:220px;color:var(--muted)}
.pb-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.pb-card{border:1px solid var(--line);border-radius:var(--radius-lg);padding:10px}
.pb-card.sel{border:2px solid var(--accent);padding:9px}
.pb-img{display:block;width:100%;padding:0;border:0;background:none}
.pb-img img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius);display:block}
.pb-title{font-weight:600;font-size:15px;margin-top:8px}
.pb-wins{display:inline-block;margin:4px 0 8px;padding:2px 10px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-size:12px;font-weight:600}
.pb-card ul{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:13px}
.pb-card li{display:grid;grid-template-columns:18px 1fr;column-gap:6px}
.pb-text{grid-column:2;font-size:12px;color:var(--muted)}
.pb-card li.win .pb-icon,.pb-card li.win .pb-text{color:var(--good);font-weight:600}
.pb-card li.same .pb-icon,.pb-card li.same .pb-text{color:var(--good)}
.pb-card li.behind .pb-icon{color:var(--bad)}
.pb-card li.other{color:var(--muted)}
.pc-wins{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:14px;font-size:13px}
.pc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px}
.pc-goal{background:var(--soft);border-radius:var(--radius);padding:12px 14px}
.pc-head{font-weight:600}
.pc-verdict{margin:2px 0 10px;font-size:13px}
.pc-row{display:grid;grid-template-columns:80px 1fr 48px;align-items:center;column-gap:8px;margin-bottom:6px;font-size:13px}
.pc-name{padding:0;border:0;background:none;text-align:left;font-weight:600}
.pc-track{height:12px;background:var(--card);border-radius:6px;overflow:hidden}
.pc-fill{height:100%;background:var(--faint);border-radius:6px}
.pc-row.win .pc-fill{background:var(--good)}
.pc-row.same .pc-fill{background:#97c459}
.pc-row.sel .pc-name{color:var(--accent)}
.pc-val{text-align:right}
.pc-v{grid-column:2 / 4;font-size:11px;color:var(--muted)}
.pc-other{display:flex;flex-direction:column;gap:2px;font-size:13px;margin-top:6px}
`;
