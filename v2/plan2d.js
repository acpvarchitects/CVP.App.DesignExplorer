// 2D plan viewer: SVG layers sharing one viewBox (metres), pan and zoom by viewBox so
// everything stays vector at any zoom. Lines in the files use non-scaling strokes.
//   const v = new PlanViewer(container, { onHover })
//   await v.show([{ url, className }])  // bottom to top, e.g. analysis then plan
//   v.reset(); v.zoomBy(1.5); v.highlight(roomLabel); v.setLabels(true)
// Groups with data-room / data-average in a layer report hover through onHover({ room, average, value }|null, event);
// value is the hovered cell's own data-value, null when the file has none.

const SVG_NS = "http://www.w3.org/2000/svg";
const cache = new Map(); // url -> Promise<Document>

function fetchSvg(url) {
    if (!cache.has(url)) {
        cache.set(
            url,
            fetch(url).then(async (r) => {
                if (!r.ok) throw new Error(`${url.split("/").pop().split("?")[0]}: ${r.status} ${r.statusText}`);
                const docSvg = new DOMParser().parseFromString(await r.text(), "image/svg+xml");
                if (docSvg.querySelector("parsererror")) throw new Error(`Invalid SVG: ${url}`);
                return docSvg;
            })
        );
        cache.get(url).catch(() => cache.delete(url));
    }
    return cache.get(url);
}

export class PlanViewer {
    constructor(container, { onHover } = {}) {
        this.container = container;
        this.onHover = onHover || (() => {});
        this.svg = document.createElementNS(SVG_NS, "svg");
        this.svg.classList.add("plan2d-svg");
        this.svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        container.append(this.svg);
        this.home = null; // [x, y, w, h] of the loaded files
        this.view = null; // current viewBox
        this.moved = false; // the user panned or zoomed since the last reset
        this.labelsOn = false; // room numbers over the plan
        this.labels = null; // <g> of the labels, rebuilt with each plan
        this.token = 0;
        this.bindEvents();
        this.resizeObserver = new ResizeObserver(() => this.apply());
        this.resizeObserver.observe(container);
    }

    dispose() {
        this.token++;
        this.resizeObserver.disconnect();
        if (this.frame) cancelAnimationFrame(this.frame);
        this.svg.remove();
    }

    async show(layers) {
        const token = ++this.token;
        const docs = await Promise.all(layers.map((l) => fetchSvg(l.url)));
        if (token !== this.token) return false; // a newer request won
        const first = docs[0].documentElement;
        const box = (first.getAttribute("viewBox") || "0 0 100 100").split(/[\s,]+/).map(Number);
        const groups = docs.map((d, i) => {
            const g = document.createElementNS(SVG_NS, "g");
            g.setAttribute("class", "plan2d-layer " + (layers[i].className || ""));
            for (const child of d.documentElement.childNodes) g.append(document.importNode(child, true));
            return g;
        });
        this.labels = labelLayer(groups);
        this.labels.style.display = this.labelsOn ? "" : "none";
        this.svg.replaceChildren(...groups, this.labels);
        this.home = box;
        // Every level of a study shares one plan frame, so a pan / zoom is kept from level to level
        // and from analysis to analysis; until the user moves, each level opens fitted.
        if (!this.moved || !this.view) this.view = [...box];
        this.apply();
        return true;
    }

    // The viewBox matches the container's aspect so a zoom never distorts.
    apply() {
        if (!this.view) return;
        const { clientWidth: W, clientHeight: H } = this.container;
        if (!W || !H) return;
        let [x, y, w, h] = this.view;
        const aspect = W / H;
        if (w / h < aspect) {
            const nw = h * aspect;
            x -= (nw - w) / 2;
            w = nw;
        } else {
            const nh = w / aspect;
            y -= (nh - h) / 2;
            h = nh;
        }
        this.view = [x, y, w, h];
        // One viewBox write per frame: a mouse sends several wheel / move events per frame, and
        // each write repaints every cell of the plan.
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = 0;
            this.svg.setAttribute("viewBox", this.view.map((v) => v.toFixed(4)).join(" "));
            this.scaleLabels();
        });
    }

    // Labels keep their screen size: each one is scaled by plan units per screen pixel.
    scaleLabels() {
        if (!this.labels || !this.labelsOn || !this.view) return;
        const s = this.view[2] / (this.container.clientWidth || 1);
        for (const g of this.labels.children) g.setAttribute("transform", `translate(${g.dataset.x} ${g.dataset.y}) scale(${s})`);
    }

    setLabels(on) {
        this.labelsOn = !!on;
        if (this.labels) this.labels.style.display = this.labelsOn ? "" : "none";
        this.scaleLabels();
    }

    reset() {
        if (!this.home) return;
        this.moved = false;
        this.view = [...this.home];
        this.apply();
    }

    // factor > 1 zooms in, around a point in client coordinates (default: the centre).
    zoomBy(factor, clientX, clientY) {
        if (!this.view) return;
        const rect = this.svg.getBoundingClientRect();
        const fx = clientX == null ? 0.5 : (clientX - rect.left) / rect.width;
        const fy = clientY == null ? 0.5 : (clientY - rect.top) / rect.height;
        const [x, y, w, h] = this.view;
        const max = Math.max(this.home[2], this.home[3]) * 4;
        const nw = Math.min(Math.max(w / factor, 0.5), max);
        const nh = (nw / w) * h;
        this.view = [x + (w - nw) * fx, y + (h - nh) * fy, nw, nh];
        this.moved = true;
        this.apply();
    }

    highlight(room) {
        for (const g of this.svg.querySelectorAll("g.room")) g.classList.toggle("dim", room != null && g.dataset.room !== room);
    }

    bindEvents() {
        const svg = this.svg;
        svg.addEventListener(
            "wheel",
            (e) => {
                e.preventDefault();
                this.zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
            },
            { passive: false }
        );
        let drag = null;
        svg.addEventListener("pointerdown", (e) => {
            if (e.button !== 0 || !this.view) return;
            drag = { x: e.clientX, y: e.clientY, view: [...this.view] };
            svg.setPointerCapture(e.pointerId);
            svg.classList.add("dragging");
        });
        svg.addEventListener("pointermove", (e) => {
            if (drag) {
                const rect = svg.getBoundingClientRect();
                const [x, y, w, h] = drag.view;
                this.view = [x - ((e.clientX - drag.x) / rect.width) * w, y - ((e.clientY - drag.y) / rect.height) * h, w, h];
                this.moved = true;
                this.apply();
                return;
            }
            const g = e.target.closest?.("g.room");
            // data-value on a cell path = the value at that point (exports from 2026-10 on).
            const v = e.target.closest?.("path[data-value]")?.dataset.value;
            this.onHover(g ? { room: g.dataset.room, average: Number(g.dataset.average), value: v == null ? null : Number(v) } : null, e);
        });
        const end = (e) => {
            if (!drag) return;
            drag = null;
            svg.classList.remove("dragging");
            if (svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId);
        };
        svg.addEventListener("pointerup", end);
        svg.addEventListener("pointercancel", end);
        svg.addEventListener("pointerleave", () => this.onHover(null));
        svg.addEventListener("dblclick", () => this.reset());
    }
}

// One label point per room (plan units): the analysis cell closest to the mean of the room's
// cells, so it always falls inside the room, even an L-shaped one. Shared with the PDF export.
export function roomAnchors(root) {
    const out = [];
    for (const g of root.querySelectorAll("g.room")) {
        const cells = [];
        for (const path of g.querySelectorAll("path")) {
            for (const sub of (path.getAttribute("d") || "").split(/[Zz]/)) {
                const n = sub.replace(/[MLml]/g, " ").trim().split(/[\s,]+/).map(Number).filter((v) => !Number.isNaN(v));
                if (n.length < 6) continue;
                let sx = 0, sy = 0;
                for (let i = 0; i + 1 < n.length; i += 2) {
                    sx += n[i];
                    sy += n[i + 1];
                }
                cells.push([sx / (n.length / 2), sy / (n.length / 2)]);
            }
        }
        if (!cells.length) continue;
        const mx = cells.reduce((a, c) => a + c[0], 0) / cells.length;
        const my = cells.reduce((a, c) => a + c[1], 0) / cells.length;
        let best = cells[0], bd = Infinity;
        for (const c of cells) {
            const d = (c[0] - mx) ** 2 + (c[1] - my) ** 2;
            if (d < bd) [best, bd] = [c, d];
        }
        out.push({ label: g.dataset.room || "", number: (g.dataset.room || "").split("|")[0].trim(), x: best[0], y: best[1] });
    }
    return out;
}

// Room numbers as an SVG layer drawn in screen pixels (scaled by scaleLabels()).
function labelLayer(groups) {
    const layer = document.createElementNS(SVG_NS, "g");
    layer.setAttribute("class", "plan2d-labels");
    for (const g of groups) for (const a of roomAnchors(g)) {
        if (!a.number) continue;
        const item = document.createElementNS(SVG_NS, "g");
        item.setAttribute("class", "plan2d-label");
        item.dataset.x = a.x;
        item.dataset.y = a.y;
        const w = 7 * a.number.length + 8;
        const rect = document.createElementNS(SVG_NS, "rect");
        [["x", -w / 2], ["y", -8], ["width", w], ["height", 16], ["rx", 3]].forEach(([k, v]) => rect.setAttribute(k, v));
        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("y", 4);
        text.textContent = a.number;
        item.append(rect, text);
        layer.append(item);
    }
    return layer;
}

// Colour of a value on a legend { min, max, colors } (linear interpolation, clamped).
export function legendColor(legend, value) {
    const cols = legend.colors.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
    const t = Math.min(Math.max((value - legend.min) / (legend.max - legend.min || 1), 0), 1) * (cols.length - 1);
    const i = Math.min(Math.floor(t), cols.length - 2);
    const f = t - i;
    const c = cols[i].map((v, k) => Math.round(v + (cols[i + 1][k] - v) * f));
    return `rgb(${c.join(",")})`;
}
