// "About this analysis": descriptions written by the export into each study's layers.json.
//   layers[] / tables[]: { key, label, value_column, score_label, description: [{ heading, text }] }
//   about: [{ heading, text }]  (common to every analysis, shown folded at the bottom)
// In a text, lines starting with "- " are a bullet list; other lines are paragraphs.

const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const entriesOf = (study) => (study.manifest ? [...(study.manifest.layers || []), ...(study.manifest.tables || [])] : []);

// The manifest entry of one study for a view column (an_…, table_…) or for a result column.
export const entryForView = (study, col) => entriesOf(study).find((e) => e.key === col) || null;
export const entryForResult = (study, col) => entriesOf(study).find((e) => e.value_column === col) || null;

// [{ study, entry }] of the studies that describe it; `find(study)` returns the entry.
export function described(studies, find) {
    return studies.map((study) => ({ study, entry: find(study) })).filter((x) => x.entry?.description?.length);
}

function textHtml(text) {
    const out = [];
    let list = [];
    const flush = () => {
        if (list.length) out.push(`<ul>${list.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`);
        list = [];
    };
    for (const line of String(text || "").split("\n")) {
        if (line.startsWith("- ")) list.push(line.slice(2));
        else {
            flush();
            if (line.trim()) out.push(`<p>${esc(line)}</p>`);
        }
    }
    flush();
    return out.join("");
}

const sectionsHtml = (sections, headings) =>
    sections.map((s) => (headings ? `<h3>${esc(s.heading)}</h3>` : "") + textHtml(s.text)).join("");

// Same text in every study: shown once. Different (rare: e.g. one batch computed with
// reflections, one without): one block per group of studies, named with their colour dots.
function grouped(items, sectionsOf, headings = true) {
    const groups = new Map();
    for (const { study, sections } of items.map((x) => ({ study: x.study, sections: sectionsOf(x) }))) {
        if (!sections?.length) continue;
        const key = JSON.stringify(sections);
        if (!groups.has(key)) groups.set(key, { sections, studies: [] });
        groups.get(key).studies.push(study);
    }
    const list = [...groups.values()];
    if (list.length === 1) return sectionsHtml(list[0].sections, headings);
    return list
        .map(
            (g) => `<div class="about-batch">
                <p class="about-batch-name">${g.studies
                    .map((st) => `<span class="study-dot" style="background:${st.color}"></span>${esc(st.name)}`)
                    .join(" &nbsp; ")}</p>
                ${sectionsHtml(g.sections, headings)}
            </div>`
        )
        .join("");
}

// Body of the card: the description, then the common notes folded.
export function aboutHtml(items) {
    const body = grouped(items, (x) => x.entry.description);
    const common = grouped(items, (x) => x.study.manifest?.about, false); // its heading is the fold's title
    return body + (common ? `<details class="about-common"><summary>About these analyses</summary>${common}</details>` : "");
}
