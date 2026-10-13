// "Export view": the plan exactly as framed on screen, as a vector PDF (A3 landscape).
// Left column: project, analysis, level, score, legend and the rooms with their values;
// right: the plan (analysis cells under the drawing) with the room numbers when they are shown in the app, a graphic scale and the scale at A3.
// jsPDF + svg2pdf.js are loaded on the first export only.
//   await exportViewPdf({ svg, view, home, project, layer, level, score, rooms, legendColor, labels, note })
import { roomAnchors } from "./plan2d.js?v=5";

const LIBS = [
    "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
    "https://cdn.jsdelivr.net/npm/svg2pdf.js@2.2.3/dist/svg2pdf.umd.min.js",
];
const SVG_NS = "http://www.w3.org/2000/svg";
const MM_PER_PX = 25.4 / 96; // a CSS pixel on paper
const PAGE = { w: 420, h: 297, margin: 12, side: 104, gap: 10 }; // A3 landscape, mm

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Cannot load ${src.split("/").pop()}`));
        document.head.append(s);
    });
}

async function pdfLib() {
    if (!window.jspdf) await loadScript(LIBS[0]);
    if (!window.jspdf.jsPDF.API.svg) await loadScript(LIBS[1]);
    return window.jspdf.jsPDF;
}

// "rgb(r,g,b)" or "#rrggbb" -> [r, g, b]
function rgbOf(c) {
    const m = String(c).match(/\d+(\.\d+)?/g);
    if (String(c).startsWith("#")) return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
}

// A copy of the on-screen plan for svg2pdf: the current view, clipped to it, and the
// on-screen line widths (non-scaling, in px) turned into plan units at the print scale.
function planForPrint(source, view, mmPerUnit) {
    const svg = source.cloneNode(true);
    svg.removeAttribute("class");
    svg.removeAttribute("style");
    svg.setAttribute("xmlns", SVG_NS);
    svg.setAttribute("viewBox", view.join(" "));
    const unitsPerPx = MM_PER_PX / mmPerUnit;
    for (const el of svg.querySelectorAll("[vector-effect]")) {
        const w = parseFloat(el.getAttribute("stroke-width") || "1");
        el.setAttribute("stroke-width", String(w * unitsPerPx));
        el.removeAttribute("vector-effect");
    }
    for (const g of svg.querySelectorAll(".dim")) g.classList.remove("dim");
    for (const g of svg.querySelectorAll(".plan2d-labels")) g.remove(); // drawn as PDF text instead
    const defs = document.createElementNS(SVG_NS, "defs");
    const clip = document.createElementNS(SVG_NS, "clipPath");
    clip.id = "viewClip";
    const rect = document.createElementNS(SVG_NS, "rect");
    [["x", view[0]], ["y", view[1]], ["width", view[2]], ["height", view[3]]].forEach(([k, v]) => rect.setAttribute(k, v));
    clip.append(rect);
    defs.append(clip);
    const body = document.createElementNS(SVG_NS, "g");
    body.setAttribute("clip-path", "url(#viewClip)");
    body.append(...svg.childNodes);
    svg.append(defs, body);
    return svg;
}

// Room numbers on the plan, on a light backing (only when they are shown in the app).
function drawRoomLabels(doc, source, view, k, px, py) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    for (const a of roomAnchors(source)) {
        if (a.x < view[0] || a.x > view[0] + view[2] || a.y < view[1] || a.y > view[1] + view[3]) continue;
        const num = a.number;
        if (!num) continue;
        const X = px + (a.x - view[0]) * k, Y = py + (a.y - view[1]) * k;
        const bw = doc.getTextWidth(num) + 2.6, bh = 4.6;
        doc.setGState(new doc.GState({ opacity: 0.5 }));
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(X - bw / 2, Y - bh / 2, bw, bh, 0.8, 0.8, "F");
        doc.setGState(new doc.GState({ opacity: 1 }));
        doc.setTextColor(0);
        doc.text(num, X, Y + 1.1, { align: "center" });
    }
}

// A round length (m) whose bar is close to target mm.
function niceLength(mmPerUnit, targetMm) {
    const raw = targetMm / mmPerUnit;
    const p = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map((f) => f * p).reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
}

// The view to print: what is on screen without the empty bands the screen adds around the
// drawing (the screen is much wider than the sheet), then widened to the frame's proportions.
// The reset view thus fills the frame; a zoomed view keeps what is seen, extended to fit.
function printView(view, home, aspect) {
    // Crop a box [x0, y0, x1, y1] to the drawing's extents (when they overlap).
    const crop = (b) => {
        if (!home) return b;
        const h = [home[0], home[1], home[0] + home[2], home[1] + home[3]];
        const c = [Math.max(b[0], h[0]), Math.max(b[1], h[1]), Math.min(b[2], h[2]), Math.min(b[3], h[3])];
        return c[2] > c[0] && c[3] > c[1] ? c : b;
    };
    const [x0, y0, x1, y1] = crop([view[0], view[1], view[0] + view[2], view[1] + view[3]]);
    let w = x1 - x0, h = y1 - y0;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (w / h < aspect) w = h * aspect;
    else h = w / aspect;
    // Widening may reach past the drawing again: crop once more, so no empty band is printed.
    const [a0, b0, a1, b1] = crop([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]);
    return [a0, b0, a1 - a0, b1 - b0];
}

const num = (v, unit) => (v == null || Number.isNaN(+v) ? "–" : `${(+v).toFixed(Math.abs(v) >= 100 ? 0 : 1)}${unit ? " " + unit : ""}`);

export async function exportViewPdf({ svg, view: screenView, home, project, layer, level, score, rooms, legendColor, labels, note }) {
    const JsPDF = await pdfLib();
    const doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    const { w: W, h: H, margin: M, side: S, gap: G } = PAGE;
    const unit = layer.unit || "";

    // Plan area and print scale (plan units are metres).
    const area = { x: M + S + G, y: M, w: W - 2 * M - S - G, h: H - 2 * M - 14 };
    const view = printView(screenView, home, area.w / area.h);
    const k = Math.min(area.w / view[2], area.h / view[3]); // mm per metre
    const dw = view[2] * k, dh = view[3] * k;
    // Top-aligned; the frame and the scale bar follow the printed plan, not the whole area.
    const px = area.x + (area.w - dw) / 2, py = area.y;

    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-10000px;top:0;width:10px;height:10px;overflow:hidden";
    const print = planForPrint(svg, view, k);
    holder.append(print);
    document.body.append(holder);
    try {
        await doc.svg(print, { x: px, y: py, width: dw, height: dh });
    } finally {
        holder.remove();
    }
    if (labels) drawRoomLabels(doc, svg, view, k, px, py);
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.rect(px, py, dw, dh);

    // Graphic scale, bottom left of the plan area.
    const len = niceLength(k, Math.min(70, area.w / 4));
    const barMm = len * k, bx = px, by = py + dh + 6;
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    for (let i = 0; i < 4; i++) {
        doc.setFillColor(i % 2 ? 255 : 0);
        doc.rect(bx + (i * barMm) / 4, by, barMm / 4, 2, "FD");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text("0", bx, by + 5.6, { align: "center" });
    doc.text(String(+(len / 2).toPrecision(3)), bx + barMm / 2, by + 5.6, { align: "center" });
    doc.text(`${+len.toPrecision(3)} m`, bx + barMm, by + 5.6, { align: "center" });
    doc.text(`Scale 1:${Math.round(1000 / k)} on A3`, bx + barMm + 10, by + 2);

    // Left column.
    let y = M + 4;
    const x = M;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(doc.splitTextToSize(project || "", S), x, y);
    y += 10;
    doc.setFontSize(15);
    doc.text(doc.splitTextToSize(layer.label || layer.key, S), x, y);
    y += 7.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(90);
    doc.text(`Level ${level}`, x, y);
    y += 12;

    doc.setTextColor(90);
    doc.setFontSize(10);
    doc.text(`${layer.score_label || "Average"} over the analysed rooms, weighted by area`, x, y);
    y += 11;
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    doc.text(num(score, unit), x, y);
    y += 10;

    // Legend: a fine strip of solid steps (vector, no gradient support needed) + ticks.
    const lg = layer.legend;
    if (lg) {
        const steps = 80, lw = S;
        for (let i = 0; i < steps; i++) {
            const v = lg.min + ((lg.max - lg.min) * (i + 0.5)) / steps;
            doc.setFillColor(...rgbOf(legendColor(lg, v)));
            doc.rect(x + (i * lw) / steps, y, lw / steps + 0.05, 5, "F");
        }
        doc.setDrawColor(120);
        doc.setLineWidth(0.1);
        doc.rect(x, y, lw, 5);
        const n = Math.max(lg.segments || 11, 2), every = n > 6 ? 2 : 1;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        for (let i = 0; i < n; i += every) {
            const t = lg.min + ((lg.max - lg.min) * i) / (n - 1);
            doc.text(String(+t.toFixed(2)), x + (lw * i) / (n - 1), y + 9.5, { align: i === 0 ? "left" : i === n - 1 ? "right" : "center" });
        }
        y += 14;
        doc.setTextColor(90);
        doc.text(`${layer.label}${unit ? ` [${unit}]` : ""}${layer.better ? (layer.better === "higher" ? " · higher is better" : " · lower is better") : ""}`, x, y);
        y += 12;
        doc.setTextColor(0);
    }

    // Rooms.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`ROOMS (${rooms.length})`, x, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    for (const r of rooms) {
        if (y > H - M - 10) {
            doc.text("…", x, y);
            break;
        }
        if (lg) {
            doc.setFillColor(...rgbOf(legendColor(lg, r.average)));
            doc.rect(x, y - 3, 3.6, 3.6, "F");
        }
        const name = doc.splitTextToSize(r.label, S - 28)[0];
        doc.text(name, x + 6, y);
        doc.text(num(r.average, unit), x + S, y, { align: "right" });
        y += 6.5;
    }

    // Footer.
    doc.setFontSize(8);
    doc.setTextColor(120);
    const stamp = new Date().toISOString().slice(0, 10);
    doc.text(`Design Explorer · ${project} · ${layer.label} · ${level} · exported ${stamp}${note ? " · " + note : ""}`, M, H - M + 4);

    const safe = (s) => String(s || "").replace(/[^\w.-]+/g, "_");
    doc.save(`${safe(project)}_${safe(layer.key)}_${safe(level)}.pdf`);
}
