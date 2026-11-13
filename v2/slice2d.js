// 2D drawing of a slice of a volume study, on a canvas: a colour map (image) under line work,
// in metres with Y up, pan and zoom.
//   const v = new SliceView(container, { onHover(point|null, event), onFrame() })
//   v.show({ extent: [x0, y0, x1, y1],            // what "fit" frames
//            images: [{ canvas, rect: [x0, y0, x1, y1] }],
//            fills:  [{ loops: [{ p: Float32Array [x,y,…], holes: [{ p }] }], color, stroke, width, separate }],  // independent opaque solids or shared translucent fill
//            lines:  [{ segs: Float32Array [x1,y1,x2,y2,…], color, width, dash }],
//            clip:   [x0, y0, x1, y1] | null,      // lines are drawn inside it only
//            decorate(ctx, view) })                // screen-space extras; view.px(x, y) -> [px, py]
//   v.frame = [cx, cy, metres per pixel]  (serialisable; null = fitted)
// KeyPlan is the small plan where the section line is placed.

export class SliceView {
    constructor(container, { onHover, onFrame } = {}) {
        this.container = container;
        this.onHover = onHover || (() => {});
        this.onFrame = onFrame || (() => {});
        this.canvas = document.createElement("canvas");
        this.canvas.className = "slice2d-canvas";
        container.append(this.canvas);
        this.scene = null;
        this.frame = null; // [cx, cy, metres per pixel]; null until fitted
        this.moved = false;
        this.bind();
        new ResizeObserver(() => this.draw()).observe(container);
    }

    // keep: true keeps the current pan / zoom (same drawing, new content)
    show(scene, { keep = false } = {}) {
        this.scene = scene;
        if (!keep || !this.frame) this.fit();
        else this.draw();
    }

    fit() {
        this.moved = false;
        this.frame = this.fitted();
        this.draw();
    }

    // The frame showing the whole extent inside the padded area (room for the overlays).
    fitted() {
        const { clientWidth: W, clientHeight: H } = this.container;
        if (!this.scene || !W || !H) return null;
        const [x0, y0, x1, y1] = this.scene.extent;
        const [top, right, bottom, left] = this.scene.pad || [60, 60, 60, 60];
        const mpp = Math.max((x1 - x0) / Math.max(W - left - right, 50), (y1 - y0) / Math.max(H - top - bottom, 50));
        return [(x0 + x1) / 2 - ((left - right) / 2) * mpp, (y0 + y1) / 2 + ((top - bottom) / 2) * mpp, mpp];
    }

    setFrame(frame) {
        this.frame = frame ? [...frame] : null;
        this.moved = !!frame;
        if (!frame) this.fit();
        else this.draw();
    }

    px(x, y) {
        const { clientWidth: W, clientHeight: H } = this.container;
        const [cx, cy, mpp] = this.frame;
        return [W / 2 + (x - cx) / mpp, H / 2 - (y - cy) / mpp];
    }

    metres(px, py) {
        const { clientWidth: W, clientHeight: H } = this.container;
        const [cx, cy, mpp] = this.frame;
        return [cx + (px - W / 2) * mpp, cy - (py - H / 2) * mpp];
    }

    zoomBy(factor, clientX, clientY) {
        if (!this.frame) return;
        const rect = this.canvas.getBoundingClientRect();
        const px = clientX == null ? rect.width / 2 : clientX - rect.left;
        const py = clientY == null ? rect.height / 2 : clientY - rect.top;
        const [mx, my] = this.metres(px, py);
        const [x0, y0, x1, y1] = this.scene.extent;
        const mpp = Math.min(Math.max(this.frame[2] / factor, 0.01), (Math.max(x1 - x0, y1 - y0) * 4) / Math.max(rect.width, 1));
        this.frame = [mx - (px - rect.width / 2) * mpp, my + (py - rect.height / 2) * mpp, mpp];
        this.moved = true;
        this.draw();
        this.onFrame();
    }

    draw() {
        if (this.pending) return;
        this.pending = requestAnimationFrame(() => {
            this.pending = 0;
            this.paint();
        });
    }

    paint() {
        const { clientWidth: W, clientHeight: H } = this.container;
        if (!W || !H || !this.scene) return;
        if (!this.frame || !this.moved) this.frame = this.fitted(); // not moved by the user: stays fitted through a resize
        if (!this.frame) return;
        const dpr = window.devicePixelRatio || 1;
        const c = this.canvas;
        if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
            c.width = Math.round(W * dpr);
            c.height = Math.round(H * dpr);
        }
        const ctx = c.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        paintScene(ctx, this.scene, this);
    }

    bind() {
        const c = this.canvas;
        c.addEventListener(
            "wheel",
            (e) => {
                e.preventDefault();
                this.zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
            },
            { passive: false }
        );
        let drag = null;
        c.addEventListener("pointerdown", (e) => {
            if (e.button !== 0 || !this.frame) return;
            const rect = c.getBoundingClientRect();
            const interaction = this.scene.pick?.(this.metres(e.clientX - rect.left, e.clientY - rect.top), this);
            drag = interaction ? { interaction } : { x: e.clientX, y: e.clientY, frame: [...this.frame] };
            this.onHover(null);
            c.setPointerCapture(e.pointerId);
            c.classList.add("dragging");
        });
        c.addEventListener("pointermove", (e) => {
            if (!this.frame) return;
            if (drag?.interaction) {
                const rect = c.getBoundingClientRect();
                drag.interaction.move(this.metres(e.clientX - rect.left, e.clientY - rect.top));
                return;
            }
            if (drag) {
                const mpp = drag.frame[2];
                this.frame = [drag.frame[0] - (e.clientX - drag.x) * mpp, drag.frame[1] + (e.clientY - drag.y) * mpp, mpp];
                this.moved = true;
                this.draw();
                return;
            }
            const rect = c.getBoundingClientRect();
            const point = this.metres(e.clientX - rect.left, e.clientY - rect.top);
            c.style.cursor = this.scene.pick?.(point, this)?.cursor || "grab";
            this.onHover(point, e);
        });
        const end = (e) => {
            if (!drag) return;
            const interaction = drag.interaction;
            drag = null;
            c.classList.remove("dragging");
            if (c.hasPointerCapture?.(e.pointerId)) c.releasePointerCapture(e.pointerId);
            if (interaction) interaction.end();
            else this.onFrame();
        };
        c.addEventListener("pointerup", end);
        c.addEventListener("pointercancel", end);
        c.addEventListener("pointerleave", () => this.onHover(null));
        c.addEventListener("dblclick", () => {
            this.fit();
            this.onFrame();
        });
    }
}

// Draws a scene through any view exposing px(x, y) and frame[2] (metres per pixel).
export function paintScene(ctx, scene, view) {
    const mpp = view.frame[2];
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    for (const im of scene.images || []) {
        const [x0, y0, x1, y1] = im.rect;
        const [l, t] = view.px(x0, y1);
        ctx.drawImage(im.canvas, l, t, (x1 - x0) / mpp, (y1 - y0) / mpp);
    }
    ctx.save();
    if (scene.clip) {
        const [x0, y0, x1, y1] = scene.clip;
        const [l, t] = view.px(x0, y1);
        ctx.beginPath();
        ctx.rect(l, t, (x1 - x0) / mpp, (y1 - y0) / mpp);
        ctx.clip();
    }
    const [ox, oy] = view.px(0, 0);
    for (const fill of scene.fills || []) drawLoops(ctx, fill, 1 / mpp, ox, -1 / mpp, oy);
    ctx.lineCap = "round";
    for (const line of scene.lines || []) {
        const s = line.segs;
        if (!s || !s.length) continue;
        ctx.beginPath();
        for (let i = 0; i + 3 < s.length; i += 4) {
            ctx.moveTo(ox + s[i] / mpp, oy - s[i + 1] / mpp);
            ctx.lineTo(ox + s[i + 2] / mpp, oy - s[i + 3] / mpp);
        }
        ctx.strokeStyle = line.color || "#222";
        ctx.lineWidth = line.width || 1;
        ctx.setLineDash(line.dash || []);
        ctx.stroke();
    }
    ctx.restore();
    scene.decorate?.(ctx, view);
}

// Solid contours may be painted independently: overlapping dark shapes stay filled regardless
// of the winding of neighbouring contours, and each keeps its own holes (a patio stays open).
// Translucent canopies retain their shared fill, holes included.
// A point (x, y) is drawn at (ox + x * kx, oy + y * ky).
export function drawLoops(ctx, { loops, color, stroke, width, separate = false }, kx, ox, ky, oy) {
    if (!loops || !loops.length) return;
    const trace = p => {
        ctx.moveTo(ox + p[0] * kx, oy + p[1] * ky);
        for (let i = 2; i < p.length; i += 2) ctx.lineTo(ox + p[i] * kx, oy + p[i + 1] * ky);
        ctx.closePath();
    };
    // a hole runs against its outline (both are stored the same way round), so the non-zero fill
    // leaves it open while a contour overlapping itself stays filled
    const carve = p => {
        ctx.moveTo(ox + p[p.length - 2] * kx, oy + p[p.length - 1] * ky);
        for (let i = p.length - 4; i >= 0; i -= 2) ctx.lineTo(ox + p[i] * kx, oy + p[i + 1] * ky);
        ctx.closePath();
    };
    if (color) ctx.fillStyle = color;
    if (separate && color) {
        for (const { p, holes } of loops) {
            ctx.beginPath();
            trace(p);
            for (const hole of holes || []) carve(hole.p);
            ctx.fill("nonzero");
        }
    }
    if (!separate || stroke) {
        ctx.beginPath();
        for (const { p, holes } of loops) {
            trace(p);
            for (const hole of holes || []) trace(hole.p);
        }
        if (!separate && color) ctx.fill("nonzero");
        if (stroke) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = width || 1;
            ctx.setLineDash([]);
            ctx.lineJoin = "round";
            ctx.stroke();
        }
    }
}

// A round length (1, 2, 5 × 10^n metres) close to `target` pixels on screen.
export function niceLength(mpp, target = 110) {
    const raw = target * mpp;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / p;
    return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * p;
}

// Graphic scale, bottom left at (x, y) in pixels.
export function drawScaleBar(ctx, mpp, x, y) {
    const len = niceLength(mpp);
    const w = len / mpp;
    ctx.save();
    ctx.strokeStyle = "#222";
    ctx.fillStyle = "#222";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y - 5);
    ctx.stroke();
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${len} m`, x + w / 2, y - 6);
    ctx.restore();
}

// The section line with its two ends, on a plan drawn through `view`.
export function drawSectionLine(ctx, view, a, b, { handles = false, color = "#111" } = {}) {
    const [ax, ay] = view.px(a[0], a[1]);
    const [bx, by] = view.px(b[0], b[1]);
    ctx.save();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke(); // white halo: readable over any colour
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(handles ? [] : [8, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const len = Math.hypot(bx - ax, by - ay) || 1;
    for (const [x, y, label, dir] of [[ax, ay, "A", -1], [bx, by, "B", 1]]) {
        if (handles) {
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fillStyle = "#fff";
            ctx.fill();
            ctx.stroke();
        }
        const lx = x + (dir * (bx - ax) * 13) / len, ly = y + (dir * (by - ay) * 13) / len;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#fff";
        ctx.strokeText(label, lx, ly);
        ctx.fillStyle = color;
        ctx.fillText(label, lx, ly);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
    }
    ctx.restore();
}

// Key plan: wheel zooms at the pointer; right/middle drag pans. Drag the line to translate it, or its endpoints to rotate it. onLine(a, b, done) while and after dragging.
export class KeyPlan {
    constructor(container, { bounds, onLine }) {
        this.container = container;
        this.bounds = bounds; // [x0, y0, x1, y1] the line stays inside
        this.onLine = onLine;
        this.canvas = document.createElement("canvas");
        this.canvas.className = "slice2d-key";
        container.append(this.canvas);
        this.scene = null;
        this.a = [0, 0];
        this.b = [1, 1];
        this.frame = [0, 0, 1];
        this.zoom = 1;
        this.center = null;
        this.refit = document.createElement("button");
        this.refit.type = "button";
        this.refit.className = "keyplan-refit";
        this.refit.hidden = true;
        this.refit.title = "Refit key plan";
        this.refit.setAttribute("aria-label", "Refit key plan");
        this.refit.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>';
        this.refit.onclick = () => { this.zoom = 1; this.center = null; this.draw(); };
        container.append(this.refit);
        this.bind();
        new ResizeObserver(() => this.draw()).observe(container);
    }

    set(scene, a, b) {
        if (scene) this.scene = scene;
        this.a = a;
        this.b = b;
        this.draw();
    }

    px(x, y) {
        const [cx, cy, mpp] = this.frame;
        return [this.w / 2 + (x - cx) / mpp, this.h / 2 - (y - cy) / mpp];
    }

    metres(px, py) {
        const [cx, cy, mpp] = this.frame;
        const [x0, y0, x1, y1] = this.bounds;
        return [Math.min(Math.max(cx + (px - this.w / 2) * mpp, x0), x1), Math.min(Math.max(cy - (py - this.h / 2) * mpp, y0), y1)];
    }

    draw() {
        if (this.pending) return;
        this.pending = requestAnimationFrame(() => {
            this.pending = 0;
            const W = this.container.clientWidth;
            if (!W || !this.scene) return;
            const [x0, y0, x1, y1] = this.bounds;
            const H = Math.round((W * (y1 - y0)) / (x1 - x0));
            const dpr = window.devicePixelRatio || 1;
            const c = this.canvas;
            if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
                c.width = Math.round(W * dpr);
                c.height = Math.round(H * dpr);
                c.style.height = H + "px";
            }
            this.w = W;
            this.h = H;
            const center = this.center || [(x0 + x1) / 2, (y0 + y1) / 2];
            this.fitMpp = Math.max((x1 - x0) / Math.max(W - 16, 1), (y1 - y0) / Math.max(H - 16, 1));
            this.frame = [...center, this.fitMpp / this.zoom];
            this.refit.hidden = Math.abs(this.zoom - 1) < 1e-6 && !this.center;
            const ctx = c.getContext("2d");
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, W, H);
            paintScene(ctx, { ...this.scene, decorate: null }, this);
            drawSectionLine(ctx, this, this.a, this.b, { handles: true });
        });
    }

    bind() {
        const c = this.canvas;
        let drag = null;
        const at = (e) => {
            const r = c.getBoundingClientRect();
            return [e.clientX - r.left, e.clientY - r.top];
        };
        c.addEventListener("contextmenu", e => e.preventDefault());
        c.addEventListener("wheel", e => {
            if (!this.scene || !this.w || drag) return;
            e.preventDefault();
            const [x, y] = at(e);
            const [cx, cy, mpp] = this.frame;
            const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.h : 1);
            const zoom = Math.max(0.25, Math.min(16, this.zoom * Math.exp(-delta * 0.002)));
            const next = this.fitMpp / zoom;
            this.center = [cx + (x - this.w / 2) * (mpp - next), cy - (y - this.h / 2) * (mpp - next)];
            this.zoom = zoom;
            this.frame = [...this.center, next];
            this.draw();
        }, { passive: false });
        c.addEventListener("pointerdown", (e) => {
            if (!this.scene) return;
            if (e.button === 1 || e.button === 2) {
                drag = { kind: "pan", from: at(e), center: this.frame.slice(0, 2), mpp: this.frame[2] };
                c.setPointerCapture(e.pointerId);
                e.preventDefault();
                return;
            }
            if (e.button !== 0) return;
            const [x, y] = at(e);
            const pa = this.px(...this.a), pb = this.px(...this.b);
            const near = (p) => Math.hypot(p[0] - x, p[1] - y) < 11;
            if (near(pa)) drag = { kind: "a" };
            else if (near(pb)) drag = { kind: "b" };
            else if (distanceToLine([x, y], pa, pb) < 7) drag = { kind: "move", from: this.metres(x, y), a: [...this.a], b: [...this.b] };
            else return;
            c.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        c.addEventListener("pointermove", (e) => {
            if (!drag) {
                const [x, y] = at(e);
                const pa = this.px(...this.a), pb = this.px(...this.b);
                const near = Math.hypot(pa[0] - x, pa[1] - y) < 11 || Math.hypot(pb[0] - x, pb[1] - y) < 11;
                c.style.cursor = near ? "grab" : distanceToLine([x, y], pa, pb) < 7 ? "move" : "default";
                return;
            }
            if (drag.kind === "pan") {
                const [x, y] = at(e);
                this.center = [drag.center[0] - (x - drag.from[0]) * drag.mpp, drag.center[1] + (y - drag.from[1]) * drag.mpp];
                this.draw();
                return;
            }
            const m = this.metres(...at(e));
            if (drag.kind === "a") this.a = snapSectionEnd(m, this.b, this.bounds, 8 * this.frame[2]);
            else if (drag.kind === "b") this.b = snapSectionEnd(m, this.a, this.bounds, 8 * this.frame[2]);
            else if (drag.kind === "move") {
                const shift = m.map((n, i) => Math.max(this.bounds[i] - Math.min(drag.a[i], drag.b[i]), Math.min(this.bounds[i + 2] - Math.max(drag.a[i], drag.b[i]), n - drag.from[i])));
                this.a = drag.a.map((n, i) => n + shift[i]);
                this.b = drag.b.map((n, i) => n + shift[i]);
            }
            this.draw();
            this.onLine(this.a, this.b, false);
        });
        const end = (e) => {
            if (!drag) return;
            const pan = drag.kind === "pan";
            drag = null;
            if (c.hasPointerCapture?.(e.pointerId)) c.releasePointerCapture(e.pointerId);
            if (!pan) this.onLine(this.a, this.b, true);
        };
        c.addEventListener("pointerup", end);
        c.addEventListener("pointercancel", end);
    }
}

// Prefer the site's longitudinal/transverse axes within 8 degrees, leaving oblique cuts possible.
export function snapSectionEnd(point, anchor, bounds, radius = Infinity) {
    const p = point.map((n, i) => Math.max(bounds[i], Math.min(bounds[i + 2], n)));
    const dx = Math.abs(p[0] - anchor[0]), dy = Math.abs(p[1] - anchor[1]);
    const tolerance = Math.tan(8 * Math.PI / 180);
    if (dx <= dy * tolerance && dx <= radius) p[0] = anchor[0];
    else if (dy <= dx * tolerance && dy <= radius) p[1] = anchor[1];
    return p;
}

function distanceToLine(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
