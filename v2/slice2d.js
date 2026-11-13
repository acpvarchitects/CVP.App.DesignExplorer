// 2D drawing of a slice of a volume study, on a canvas: a colour map (image) under line work,
// in metres with Y up, pan and zoom.
//   const v = new SliceView(container, { onHover(point|null, event), onFrame() })
//   v.show({ extent: [x0, y0, x1, y1],            // what "fit" frames
//            images: [{ canvas, rect: [x0, y0, x1, y1] }],
//            fills:  [{ loops: [{ p: Float32Array [x,y,…] }], color, stroke, width }],  // closed outlines, filled as one area
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
            drag = { x: e.clientX, y: e.clientY, frame: [...this.frame] };
            c.setPointerCapture(e.pointerId);
            c.classList.add("dragging");
        });
        c.addEventListener("pointermove", (e) => {
            if (!this.frame) return;
            if (drag) {
                const mpp = drag.frame[2];
                this.frame = [drag.frame[0] - (e.clientX - drag.x) * mpp, drag.frame[1] + (e.clientY - drag.y) * mpp, mpp];
                this.moved = true;
                this.draw();
                return;
            }
            const rect = c.getBoundingClientRect();
            this.onHover(this.metres(e.clientX - rect.left, e.clientY - rect.top), e);
        });
        const end = (e) => {
            if (!drag) return;
            drag = null;
            c.classList.remove("dragging");
            if (c.hasPointerCapture?.(e.pointerId)) c.releasePointerCapture(e.pointerId);
            this.onFrame();
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

// Closed outlines (all turning the same way, see meshcut.js) filled as their union, then
// outlined. A point (x, y) is drawn at (ox + x * kx, oy + y * ky).
export function drawLoops(ctx, { loops, color, stroke, width }, kx, ox, ky, oy) {
    if (!loops || !loops.length) return;
    ctx.beginPath();
    for (const { p } of loops) {
        ctx.moveTo(ox + p[0] * kx, oy + p[1] * ky);
        for (let i = 2; i < p.length; i += 2) ctx.lineTo(ox + p[i] * kx, oy + p[i + 1] * ky);
        ctx.closePath();
    }
    if (color) {
        ctx.fillStyle = color;
        ctx.fill("nonzero");
    }
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width || 1;
        ctx.setLineDash([]);
        ctx.lineJoin = "round";
        ctx.stroke();
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

// Small fixed plan (no pan / zoom): drag an end to move it, drag the line to shift it,
// drag anywhere else to draw a new line. onLine(a, b, done) while and after dragging.
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
            this.frame = [(x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / W];
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
        c.addEventListener("pointerdown", (e) => {
            if (e.button !== 0 || !this.scene) return;
            const [x, y] = at(e);
            const pa = this.px(...this.a), pb = this.px(...this.b);
            const near = (p) => Math.hypot(p[0] - x, p[1] - y) < 11;
            const m = this.metres(x, y);
            if (near(pa)) drag = { kind: "a" };
            else if (near(pb)) drag = { kind: "b" };
            else if (distToSegment([x, y], pa, pb) < 7) drag = { kind: "move", from: m, a: [...this.a], b: [...this.b] };
            else {
                drag = { kind: "b" };
                this.a = m;
                this.b = m;
            }
            c.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        c.addEventListener("pointermove", (e) => {
            if (!drag) {
                const [x, y] = at(e);
                const pa = this.px(...this.a), pb = this.px(...this.b);
                const near = Math.hypot(pa[0] - x, pa[1] - y) < 11 || Math.hypot(pb[0] - x, pb[1] - y) < 11;
                c.style.cursor = near ? "grab" : distToSegment([x, y], pa, pb) < 7 ? "move" : "crosshair";
                return;
            }
            const m = this.metres(...at(e));
            if (drag.kind === "a") this.a = m;
            else if (drag.kind === "b") this.b = m;
            else {
                // shift both ends, stopping when either reaches the bounds
                const [x0, y0, x1, y1] = this.bounds;
                let dx = m[0] - drag.from[0], dy = m[1] - drag.from[1];
                for (const p of [drag.a, drag.b]) {
                    dx = Math.min(Math.max(dx, x0 - p[0]), x1 - p[0]);
                    dy = Math.min(Math.max(dy, y0 - p[1]), y1 - p[1]);
                }
                this.a = [drag.a[0] + dx, drag.a[1] + dy];
                this.b = [drag.b[0] + dx, drag.b[1] + dy];
            }
            this.draw();
            this.onLine(this.a, this.b, false);
        });
        const end = (e) => {
            if (!drag) return;
            drag = null;
            if (c.hasPointerCapture?.(e.pointerId)) c.releasePointerCapture(e.pointerId);
            this.onLine(this.a, this.b, true);
        };
        c.addEventListener("pointerup", end);
        c.addEventListener("pointercancel", end);
    }
}

function distToSegment(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.min(Math.max(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0), 1) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
