// Diagrams for the "About" cards. A layers.json description section may name one or more of them:
//   { heading, text, figure: "spacing-long-front" }  or  figure: ["spacing-gable", "spacing-corner"]
// Unknown names are ignored. Drawn to scale where a number is shown (the gap chart uses the real
// formula); colours come from the dashboard theme, except the blue/red of the spacing zones, which
// are the colours of the 3D layer itself.

// gap(H) of the 10/11/2026 rules: max(24 + 0.2 H, 32.4) up to 50 m, then 29 + 0.1 H.
const gap = (h) => (h <= 50 ? Math.max(24 + 0.2 * h, 32.4) : 29 + 0.1 * h);

const svg = (w, h, body, label) =>
    `<svg class="fig" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

// Dimension line with arrow ticks between two points and a label at its middle.
function dim(x1, y1, x2, y2, text, dx = 0, dy = 0, anchor = "middle") {
    const mx = (x1 + x2) / 2 + dx;
    const my = (y1 + y2) / 2 + dy;
    return `<line class="fig-dim" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-start="url(#fig-arrow)" marker-end="url(#fig-arrow)"/>
        <text class="fig-dim-text" x="${mx}" y="${my}" text-anchor="${anchor}">${text}</text>`;
}

const ARROW = `<defs><marker id="fig-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,1 L9,5 L0,9" class="fig-arrow"/></marker></defs>`;

const bld = (x, y, w, h, name, extra = "") =>
    `<rect class="fig-bld" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"${extra}/>` +
    (name ? `<text class="fig-txt" x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle">${name}</text>` : "");

const north = (x, y) => `<text class="fig-note" x="${x}" y="${y}" text-anchor="middle">N ↑</text>`;

function gapChart() {
    // x: H 20..80 m -> 60..500; y: gap 31..38 m -> 190..30
    const X = (h) => 60 + ((h - 20) / 60) * 440;
    const Y = (g) => 190 - ((g - 31) / 7) * 160;
    const pts = [];
    for (let h = 20; h <= 80; h += 0.5) pts.push(`${X(h).toFixed(1)},${Y(gap(h)).toFixed(1)}`);
    let grid = "";
    for (let h = 20; h <= 80; h += 10)
        grid += `<line class="fig-grid" x1="${X(h)}" y1="30" x2="${X(h)}" y2="190"/><text class="fig-axis" x="${X(h)}" y="206" text-anchor="middle">${h}</text>`;
    for (let g = 32; g <= 38; g += 2)
        grid += `<line class="fig-grid" x1="60" y1="${Y(g)}" x2="500" y2="${Y(g)}"/><text class="fig-axis" x="52" y="${Y(g) + 4}" text-anchor="end">${g}</text>`;
    const mark = (h, text, dy = -10, anchor = "middle") =>
        `<circle class="fig-point" cx="${X(h)}" cy="${Y(gap(h))}" r="3.5"/><text class="fig-note" x="${X(h)}" y="${Y(gap(h)) + dy}" text-anchor="${anchor}">${text}</text>`;
    return svg(
        520,
        236,
        `${grid}<polyline class="fig-curve" points="${pts.join(" ")}"/>
        ${mark(26.4, "8 floors · 32.4 m", -12)}
        ${mark(50, "50 m · 34 m", -12)}
        ${mark(79.2, "24 floors · 36.9 m", 18, "end")}
        <text class="fig-axis" x="280" y="230" text-anchor="middle">H, total height of the southern building [m]</text>
        <text class="fig-axis" x="14" y="110" text-anchor="middle" transform="rotate(-90 14 110)">gap [m]</text>`,
        "Required gap between facing long fronts as a function of the southern building's height"
    );
}

const FIGURES = {
    "spacing-long-front": {
        caption:
            "Facing long fronts: the gap is measured between the full footprints and depends on H, the total height of the southern building (base floors included), the one that shades the other.",
        html: () =>
            svg(
                520,
                200,
                `${ARROW}${north(490, 24)}
                ${bld(70, 24, 300, 40, "North building")}
                ${bld(130, 136, 300, 40, "South building · height H")}
                ${dim(250, 64, 250, 136, "gap(H)", 10, 4, "start")}`,
                "Two buildings with facing long fronts and the gap between them"
            ),
    },
    "spacing-gap-chart": {
        caption: "gap(H) = max(24 + 0.2 H, 32.4 m) up to 50 m, then 29 + 0.1 H. Below 42 m the minimum of 32.4 m applies.",
        html: gapChart,
    },
    "spacing-gable": {
        caption: "Facing gables (short ends in line): at least 14 m, whatever the heights.",
        html: () =>
            svg(
                520,
                120,
                `${ARROW}${north(490, 24)}
                ${bld(30, 40, 200, 40, "A")}
                ${bld(290, 40, 200, 40, "B")}
                ${dim(230, 60, 290, 60, "14 m", 0, -10)}`,
                "Two buildings end to end with 14 m between the gables"
            ),
    },
    "spacing-corner": {
        caption: "Non-facing corners (the buildings overlap in neither direction): at least 4 m between the closest corners.",
        html: () =>
            svg(
                520,
                170,
                `${ARROW}${north(490, 24)}
                ${bld(40, 20, 220, 40, "A")}
                ${bld(290, 100, 200, 40, "B")}
                ${dim(260, 60, 290, 100, "4 m", 10, 0, "start")}`,
                "Two buildings offset diagonally with 4 m between the closest corners"
            ),
    },
    "spacing-ambiguous": {
        caption:
            "Rotated buildings whose fronts face only partly: the pair is checked with the gap of the taller of the two.",
        html: () =>
            svg(
                520,
                190,
                `${ARROW}${north(490, 24)}
                <g transform="rotate(-6 200 50)">${bld(60, 30, 280, 40, "A · taller")}</g>
                <g transform="rotate(5 330 140)">${bld(200, 120, 260, 40, "B")}</g>
                ${dim(285, 78, 285, 121, "gap(H of A)", 10, 4, "start")}`,
                "Two rotated buildings, partly facing, checked with the gap of the taller one"
            ),
    },
    "spacing-footprint": {
        caption:
            "Every distance is taken on the full footprint, balconies included. The footprint must stay inside the residential boundary; touching it is allowed.",
        html: () =>
            svg(
                520,
                150,
                `<rect class="fig-boundary" x="10" y="10" width="500" height="130" rx="2"/>
                <text class="fig-note" x="20" y="28">residential boundary</text>
                <rect class="fig-balc" x="110" y="44" width="80" height="10"/>
                <rect class="fig-balc" x="300" y="44" width="80" height="10"/>
                <rect class="fig-balc" x="170" y="106" width="90" height="12"/>
                <rect class="fig-balc" x="330" y="106" width="90" height="12"/>
                ${bld(90, 54, 340, 52, "apartments + core")}
                <rect class="fig-outline" x="90" y="44" width="340" height="74"/>
                <text class="fig-note" x="90" y="134">dashed: full footprint, balconies included</text>`,
                "A building footprint with its balconies inside the residential boundary"
            ),
    },
    "spacing-zones-colours": {
        caption:
            "In the 3D view: blue is the no-build zone of each building (deeper where two zones overlap, darker outline per building); red is a zone another building enters, the overlap itself in solid red.",
        html: () =>
            svg(
                520,
                170,
                `<rect class="fig-zone" x="30" y="20" width="250" height="130"/>
                <rect class="fig-zone-line" x="30" y="20" width="250" height="130"/>
                ${bld(80, 70, 150, 30, "A")}
                <rect class="fig-zone" x="250" y="40" width="240" height="110"/>
                <rect class="fig-clash-line" x="250" y="40" width="240" height="110"/>
                <rect class="fig-clash" x="250" y="40" width="30" height="110"/>
                ${bld(300, 80, 150, 30, "B")}
                <text class="fig-note" x="40" y="164">zone of A</text>
                <text class="fig-note" x="490" y="164" text-anchor="end">zone of B, entered by A's zone</text>`,
                "Blue no-build zones and a red overlap where one zone enters the other"
            ),
    },
};

// The spacing zones of an export written before figures existed: show every spacing diagram.
const SPACING_DEFAULT = ["spacing-long-front", "spacing-gap-chart", "spacing-gable", "spacing-corner", "spacing-ambiguous", "spacing-footprint", "spacing-zones-colours"];

export function figureHtml(names) {
    return [].concat(names || [])
        .filter((n) => FIGURES[n])
        .map((n) => `<figure class="about-fig">${FIGURES[n].html()}<figcaption>${FIGURES[n].caption}</figcaption></figure>`)
        .join("");
}

// The sections to show for a manifest entry: its own, plus the spacing diagrams when an older
// export described the spacing zones without naming any figure.
export function withFigures(entry) {
    const sections = entry?.description || [];
    if (entry?.key !== "spacing_zones" || sections.some((s) => s.figure)) return sections;
    return [...sections, { heading: "The rules in diagrams", text: "", figure: SPACING_DEFAULT }];
}
