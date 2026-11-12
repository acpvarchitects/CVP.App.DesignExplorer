// A study with a dense 3D field (layers[] kind "analysis", dim "3d"), seen three ways:
//   "3d"       the model (model.glb, its own colours and edge lines) with the field on two section
//              planes, one horizontal and one vertical
//   "plan"     the field at one elevation, with the model cut at that height
//   "section"  the vertical cut along the section line, with the profile of terrain and buildings
// The field on a plane is a colour map sampled from the volume (volume.js): empty where the mask excludes.
//
// One serialisable object describes what is on screen (view()), the base for saved viewpoints:
//   { mode, scenario, z, a: [x, y], b: [x, y], h, v, cut, vx, camera: [px,py,pz, tx,ty,tz] | null, frame: [cx, cy, m/px] | null }
//   z, a, b in the volume's local metres (Z up); camera in the model's own coordinates (glTF, Y up);
//   h / v = the horizontal / vertical plane is shown in 3D; cut = the model is cut away in front of the planes;
//   vx = heights drawn 1, 2 or 4 times larger in the 2D section (a long site is a very thin strip at true scale).
import * as THREE from "three";
import { Viewer } from "./viewer.js?v=46";
import { loadVolume } from "./volume.js?v=1";
import { SliceView, KeyPlan, drawScaleBar, drawSectionLine } from "./slice2d.js?v=1";

const SOFT_LAYER = /plant|tree|veget/i; // canopies: drawn lighter than terrain and buildings
const CUT_LINE = { color: "#161616", width: 1.3 };
const SOFT_LINE = { color: "rgba(30, 90, 40, 0.75)", width: 0.8 };
const BELOW_LINE = { color: "rgba(0, 0, 0, 0.22)", width: 0.6 };
const FRAME_COLOR = 0x222222;
const INSIDE_GREY = 0.42; // inner faces of a cut solid (sRGB grey): the cut reads as solid, not as a hollow shell

// local metres (Rhino, Z up) -> the model's glTF coordinates (Y up)
const toGl = (x, y, z, out = new THREE.Vector3()) => out.set(x, z, -y);

export class VolumeView {
    // els: { pane3d, pane2d, key, overlay (the controls over the view: a 2D drawing is fitted below them) }; onChange() after any change of the view; onHover({ value, z } | null, event)
    constructor(els, { onChange, onHover, onStatus } = {}) {
        this.els = els;
        this.onChange = onChange || (() => {});
        this.onHover = onHover || (() => {});
        this.onStatus = onStatus || (() => {});
        this.state = { mode: "3d", scenario: "", z: 0, a: [0, 0], b: [1, 1], h: true, v: true, cut: false, vx: 1 };
        this.frames = { plan: null, section: null }; // pan / zoom of each 2D drawing
        this.dirty = { plan: true, section: true };
        this.means = {};
    }

    async load(base, layer, modelLayer, initial = {}) {
        this.layer = layer;
        this.viewer = new Viewer(this.els.pane3d, this.onStatus);
        this.viewer.renderer.localClippingEnabled = true;
        const modelUrl = modelLayer ? base + (modelLayer.file || modelLayer.file_pattern) : null;
        const [volume] = await Promise.all([
            loadVolume(base, layer.file || layer.file_pattern || "volume.json"),
            modelUrl ? this.viewer.compose([{ url: modelUrl, kind: "geometry" }]) : null,
        ]);
        this.volume = volume;
        const [lx, ly] = volume.size;
        this.model = modelUrl ? await this.viewer.load(modelUrl, "geometry").catch(() => null) : null;
        this.readModel();
        this.buildPlanes();

        // defaults: 3D, first scenario, a plan just above the ground, a section across the middle (south to north)
        const scenarios = this.scenarios();
        Object.assign(this.state, { scenario: scenarios[0].key, z: volume.defaultElevation(), a: [lx / 2, 0], b: [lx / 2, ly] });
        const s = { ...initial };
        if (!scenarios.some((sc) => sc.key === s.scenario)) delete s.scenario;
        if (!["3d", "plan", "section"].includes(s.mode)) delete s.mode;
        Object.assign(this.state, this.clean(s));

        this.slice = new SliceView(this.els.pane2d, {
            onHover: (p, e) => this.hover2d(p, e),
            onFrame: () => {
                this.frames[this.state.mode] = this.slice.moved ? [...this.slice.frame] : null;
                this.onChange();
            },
        });
        this.keyPlan = new KeyPlan(this.els.key, {
            bounds: [0, 0, lx, ly],
            onLine: (a, b, done) => this.set({ a, b }, { quiet: !done }),
        });
        if (initial.frame && this.state.mode !== "3d") this.frames[this.state.mode] = initial.frame;
        if (!this.viewer.centred) this.frameField();
        if (initial.camera) this.setCamera(initial.camera);
        this.viewer.controls.addEventListener("change", () => this.updateClip());
        this.viewer.controls.addEventListener("end", () => this.onChange());
        this.bindHover3d();
        this.applyMode();
        this.refresh();
    }

    // ---- State ----

    scenarios() {
        const list = this.layer.scenarios?.length ? this.layer.scenarios : Object.keys(this.volume.fields).map((key) => ({ key, label: key }));
        return list.filter((sc) => this.volume.fields[sc.key]);
    }

    // The current scenario read as a layer: its own label / unit / legend, or the layer's.
    reading() {
        const sc = this.scenarios().find((s) => s.key === this.state.scenario) || {};
        const { layer } = this;
        return { key: sc.key, label: sc.label || layer.label, unit: sc.unit ?? layer.unit, better: sc.better ?? layer.better, legend: sc.legend || layer.legend };
    }

    // Mean of a scenario over the analysed points.
    mean(key = this.state.scenario) {
        if (!(key in this.means)) {
            const f = this.volume.fields[key], { mask } = this.volume;
            let sum = 0, n = 0;
            for (let i = 0; i < f.length; i++) if (mask[i] === 0) (sum += f[i]), n++;
            this.means[key] = n ? sum / n : NaN;
        }
        return this.means[key];
    }

    clean(patch) {
        const [lx, ly, lz] = this.volume.size;
        const out = {};
        const point = (p) => (Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) ? [Math.min(Math.max(p[0], 0), lx), Math.min(Math.max(p[1], 0), ly)] : null);
        for (const [k, v] of Object.entries(patch)) {
            if (k === "z" && Number.isFinite(v)) out.z = Math.min(Math.max(v, 0), lz);
            else if ((k === "a" || k === "b") && point(v)) out[k] = point(v);
            else if (k === "h" || k === "v" || k === "cut") out[k] = !!v;
            else if (k === "vx" && [1, 2, 4].includes(v)) out.vx = v;
            else if (k === "mode" || k === "scenario") out[k] = v;
        }
        return out;
    }

    // quiet: no onChange (while dragging; the last call of a drag is not quiet)
    set(patch, { quiet = false } = {}) {
        const before = this.state;
        this.state = { ...before, ...this.clean(patch) };
        const s = this.state;
        if (s.scenario !== before.scenario) this.dirty.plan = this.dirty.section = true;
        if (s.z !== before.z) this.dirty.plan = true;
        if (s.vx !== before.vx) {
            this.frames.section = null; // another drawing
            if (s.mode === "section") this.sceneFor = null;
        }
        if (s.a !== before.a || s.b !== before.b) {
            this.dirty.section = true;
            this.frames.section = null; // a new line is a new drawing: fitted again
            if (s.mode === "section") this.sceneFor = null;
        }
        if (s.mode !== before.mode) this.applyMode();
        this.refresh();
        if (!quiet) this.onChange();
    }

    // What is on screen, as one serialisable object.
    view() {
        const s = this.state;
        const r = (v, d = 2) => +v.toFixed(d);
        const out = { mode: s.mode, scenario: s.scenario, z: r(s.z), a: s.a.map((v) => r(v, 1)), b: s.b.map((v) => r(v, 1)), h: s.h, v: s.v, cut: s.cut, vx: s.vx, camera: null, frame: null };
        if (s.mode === "3d") out.camera = this.getCamera();
        else if (this.frames[s.mode]) out.frame = this.frames[s.mode].map((v, i) => r(v, i === 2 ? 4 : 1));
        return out;
    }

    applyView(view) {
        if (view.frame && view.mode !== "3d") this.frames[view.mode] = [...view.frame];
        this.set(view, { quiet: true });
        if (view.camera) this.setCamera(view.camera);
        this.onChange();
    }

    getCamera() {
        const { camera, controls, root } = this.viewer;
        const p = camera.position.clone().sub(root.position), t = controls.target.clone().sub(root.position);
        return [p.x, p.y, p.z, t.x, t.y, t.z].map((v) => +v.toFixed(1));
    }

    setCamera(c) {
        if (!Array.isArray(c) || c.length !== 6 || !c.every(Number.isFinite)) return;
        const { camera, controls, root } = this.viewer;
        camera.position.set(c[0], c[1], c[2]).add(root.position);
        controls.target.set(c[3], c[4], c[5]).add(root.position);
        controls.update();
        this.viewer.dirty = true;
    }

    // ---- Mode, zoom ----

    applyMode() {
        const is3d = this.state.mode === "3d";
        this.els.pane3d.hidden = !is3d;
        this.els.pane2d.hidden = is3d;
        this.viewer.dirty = true;
        this.sceneFor = null; // the 2D drawing changes: frame taken from frames[mode]
        this.onHover(null);
    }

    zoomBy(factor) {
        if (this.state.mode !== "3d") return this.slice.zoomBy(factor);
        const { camera, controls } = this.viewer;
        camera.position.sub(controls.target).multiplyScalar(1 / factor).add(controls.target);
        controls.update();
        this.onChange();
    }

    reset() {
        if (this.state.mode !== "3d") {
            this.frames[this.state.mode] = null;
            this.slice.fit();
        } else if (this.viewer.shown.size) this.viewer.resetView();
        else this.frameField();
        this.onChange();
    }

    // Without a model: centre and frame the analysed box.
    frameField() {
        const { viewer } = this;
        if (!viewer.centred) viewer.centre([this.group]);
        const box = new THREE.Box3().setFromObject(this.group);
        const center = box.getCenter(new THREE.Vector3());
        const distance = box.getSize(new THREE.Vector3()).length() / 2 / Math.sin(THREE.MathUtils.degToRad(viewer.camera.fov / 2));
        viewer.camera.position.copy(center).addScaledVector(new THREE.Vector3(1, 0.9, 1).normalize(), distance * 0.62);
        viewer.camera.near = distance / 100;
        viewer.camera.far = distance * 20;
        viewer.camera.updateProjectionMatrix();
        viewer.controls.target.copy(center);
        viewer.controls.update();
        viewer.framed = viewer.dirty = true;
    }

    // ---- Redraw ----

    refresh() {
        if (this.pending) return;
        this.pending = requestAnimationFrame(() => {
            this.pending = 0;
            this.update();
        });
    }

    update() {
        const { volume, state: s } = this;
        const { legend } = this.reading();
        const [lx, ly, lz] = volume.size;
        if (this.dirty.plan) {
            this.planSlice = volume.plan(s.scenario, legend, s.z);
            this.planLines = null;
            this.dirty.plan = false;
            setTexture(this.hPlane, this.planSlice);
        }
        if (this.dirty.section) {
            this.sectionSlice = volume.section(s.scenario, legend, s.a, s.b);
            this.sectionLines = null;
            this.dirty.section = false;
            setTexture(this.vPlane, this.sectionSlice);
        }
        // the planes in the 3D scene
        setQuad(this.hPlane, [toGl(0, 0, s.z), toGl(lx, 0, s.z), toGl(lx, ly, s.z), toGl(0, ly, s.z)]);
        setQuad(this.vPlane, [toGl(s.a[0], s.a[1], 0), toGl(s.b[0], s.b[1], 0), toGl(s.b[0], s.b[1], lz), toGl(s.a[0], s.a[1], lz)]);
        this.hPlane.visible = s.h;
        this.vPlane.visible = s.v && this.sectionLength() > 0.5;
        this.updateClip();
        this.viewer.dirty = true; // the viewer draws on demand

        if (s.mode !== "3d") {
            this.slice.show(s.mode === "plan" ? this.planScene() : this.sectionScene(), { keep: true });
            // another drawing (the other mode, or a new section line): its own pan / zoom, or fitted
            if (this.sceneFor !== s.mode) this.slice.setFrame(this.frames[s.mode]);
            this.sceneFor = s.mode;
        }
        if (s.mode !== "plan") this.keyPlan.set({ images: this.planScene().images, lines: [{ segs: this.cutPlan().main, color: "#333", width: 0.7 }] }, s.a, s.b);
    }

    sectionLength() {
        const { a, b } = this.state;
        return Math.hypot(b[0] - a[0], b[1] - a[1]);
    }

    // ---- 2D drawings ----

    cutPlan() {
        if (!this.planLines) {
            const z = this.state.z;
            this.planLines = { ...cutModel(this.parts, [0, 0, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]), below: edgesBelow(this.edges, z) };
        }
        return this.planLines;
    }

    cutSection() {
        if (!this.sectionLines) {
            const { a, b } = this.state;
            const len = this.sectionLength() || 1;
            const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, 0];
            this.sectionLines = cutModel(this.parts, [a[0], a[1], 0], d, [0, 0, 1], [d[1], -d[0], 0]);
        }
        return this.sectionLines;
    }

    // Room left at the top of a fitted 2D drawing: the controls sit there.
    padTop() {
        const o = this.els.overlay;
        return o && o.offsetHeight ? o.offsetTop + o.offsetHeight + 28 : 64;
    }

    planScene() {
        const [lx, ly] = this.volume.size;
        const cut = this.cutPlan();
        return {
            extent: [0, 0, lx, ly],
            pad: [this.padTop(), 40, 56, 40],
            images: [{ canvas: this.planSlice.canvas, rect: [0, 0, lx, ly] }],
            lines: [{ segs: cut.below, ...BELOW_LINE }, { segs: cut.soft, ...SOFT_LINE }, { segs: cut.main, ...CUT_LINE }],
            decorate: (ctx, view) => {
                const [l, t] = view.px(0, ly), [r, b] = view.px(lx, 0);
                ctx.save();
                ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 3]);
                ctx.strokeRect(l, t, r - l, b - t); // the analysed area
                ctx.restore();
                if (this.sectionLength() > 0.5) drawSectionLine(ctx, view, this.state.a, this.state.b);
                drawScaleBar(ctx, view.frame[2], 16, view.container.clientHeight - 40);
            },
        };
    }

    // Drawn in metres along the line (x) and heights times vx (y).
    sectionScene() {
        const lz = this.volume.size[2], len = Math.max(this.sectionLength(), 1);
        const cut = this.cutSection();
        const world = this.volume.worldZ;
        const k = this.state.vx;
        const tall = (segs) => (k === 1 ? segs : segs.map((v, i) => (i & 1 ? v * k : v)));
        return {
            extent: [0, 0, len, lz * k],
            pad: [this.padTop(), 110, 70, 70],
            images: [{ canvas: this.sectionSlice.canvas, rect: [0, 0, len, lz * k] }],
            lines: [{ segs: tall(cut.soft), ...SOFT_LINE }, { segs: tall(cut.main), ...CUT_LINE }],
            clip: [0, -3 * k, len, (lz + 12) * k],
            decorate: (ctx, view) => {
                const [l, b] = view.px(0, 0), [r, t] = view.px(len, lz * k);
                const mpp = view.frame[2];
                ctx.save();
                ctx.font = "11px system-ui, sans-serif";
                ctx.fillStyle = "#333";
                ctx.strokeStyle = "#333";
                ctx.lineWidth = 1;
                // elevations of the model on the left
                const step = [1, 2, 5, 10, 20, 50].find((st) => (st * k) / mpp >= 26) || 100;
                ctx.textAlign = "right";
                ctx.textBaseline = "middle";
                ctx.beginPath();
                ctx.moveTo(l - 0.5, t);
                ctx.lineTo(l - 0.5, b);
                for (let e = Math.ceil(world / step) * step; e <= world + lz + 1e-6; e += step) {
                    const y = Math.round(view.px(0, (e - world) * k)[1]) + 0.5;
                    ctx.moveTo(l - 5, y);
                    ctx.lineTo(l, y);
                    ctx.fillText(elevationText(e, 0), l - 8, y);
                }
                ctx.stroke();
                // where the plan cuts
                const y = Math.round(view.px(0, this.state.z * k)[1]) + 0.5;
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
                ctx.beginPath();
                ctx.moveTo(l, y);
                ctx.lineTo(r + 6, y);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.textAlign = "left";
                ctx.fillText(`Plan ${elevationText(this.state.z + world)}`, r + 10, y);
                // the two ends
                ctx.font = "600 13px system-ui, sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "alphabetic";
                ctx.fillText("A", l, t - 10);
                ctx.fillText("B", r, t - 10);
                if (k !== 1) {
                    ctx.font = "11px system-ui, sans-serif";
                    ctx.textAlign = "left";
                    ctx.fillText(`Heights ×${k}`, l + 150, b + 34);
                }
                ctx.restore();
                drawScaleBar(ctx, mpp, l, b + 34);
            },
        };
    }

    hover2d(p, e) {
        if (!p) return this.onHover(null);
        const { a, b, z, mode, scenario } = this.state;
        let point;
        if (mode === "plan") point = [p[0], p[1], z];
        else {
            const len = this.sectionLength() || 1;
            point = [a[0] + ((b[0] - a[0]) * p[0]) / len, a[1] + ((b[1] - a[1]) * p[0]) / len, p[1] / this.state.vx];
            if (p[0] < 0 || p[0] > len) return this.onHover(null);
        }
        const value = this.volume.sample(scenario, ...point);
        this.onHover(Number.isNaN(value) ? null : { value, z: point[2] + this.volume.worldZ }, e);
    }

    // ---- 3D scene ----

    // The model as plain arrays in local metres: triangles for the cuts, edge lines for the plan.
    readModel() {
        this.parts = [];
        this.edges = new Float32Array(0);
        this.meshes = [];
        this.materials = new Set();
        if (!this.model) return;
        const root = this.viewer.root;
        root.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
        const m = new THREE.Matrix4(), p = new THREE.Vector3();
        const edges = [];
        this.model.traverse((node) => {
            if (!node.geometry) return;
            for (const mat of [node.material].flat()) this.materials.add(mat);
            const attr = node.geometry.getAttribute("position");
            m.multiplyMatrices(inv, node.matrixWorld);
            const pos = new Float32Array(attr.count * 3);
            for (let i = 0; i < attr.count; i++) {
                p.fromBufferAttribute(attr, i).applyMatrix4(m);
                pos[i * 3] = p.x;
                pos[i * 3 + 1] = -p.z;
                pos[i * 3 + 2] = p.y;
            }
            const index = node.geometry.index?.array || null;
            if (node.isMesh) {
                let name = "";
                for (let n = node; n && n !== this.model && !name; n = n.parent) name = n.userData.name || n.name || "";
                this.meshes.push(node);
                this.parts.push({ soft: SOFT_LAYER.test(name), pos, index, d: new Float32Array(attr.count) });
            } else if (node.isLineSegments) {
                if (!index) edges.push(pos);
                else {
                    const flat = new Float32Array(index.length * 3);
                    for (let i = 0; i < index.length; i++) flat.set(pos.subarray(index[i] * 3, index[i] * 3 + 3), i * 3);
                    edges.push(flat);
                }
            }
        });
        // While the model is cut, the faces seen from behind (the inside of a cut solid) are plain grey.
        this.inside = { value: 0 };
        for (const mat of this.materials) {
            if (!mat.isMeshLambertMaterial && !mat.isMeshStandardMaterial && !mat.isMeshBasicMaterial) continue;
            mat.onBeforeCompile = (shader) => {
                shader.uniforms.uInside = this.inside;
                const grey = `if ( uInside > 0.5 && ! gl_FrontFacing ) gl_FragColor.rgb = vec3( ${INSIDE_GREY} );`;
                shader.fragmentShader = "uniform float uInside;\n" + shader.fragmentShader.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n\t" + grey);
            };
            mat.needsUpdate = true;
        }
        this.edges = new Float32Array(edges.reduce((n, e) => n + e.length, 0));
        let o = 0;
        for (const e of edges) {
            this.edges.set(e, o);
            o += e.length;
        }
    }

    buildPlanes() {
        this.group = new THREE.Group();
        this.hPlane = makePlane();
        this.vPlane = makePlane();
        this.group.add(this.hPlane, this.vPlane);
        const [lx, ly, lz] = this.volume.size;
        setQuad(this.hPlane, [toGl(0, 0, 0), toGl(lx, 0, 0), toGl(lx, ly, lz), toGl(0, ly, lz)]); // the whole box, for framing
        this.viewer.root.add(this.group);
    }

    // "Cut model": the model between the eye and each shown plane is cut away, so the field is
    // never hidden behind a building or a slope. The side follows the camera.
    updateClip() {
        const s = this.state;
        const planes = [];
        if (s.cut && s.mode === "3d") {
            const { camera, root } = this.viewer;
            if (s.h) {
                const y = s.z + root.position.y;
                planes.push(camera.position.y > y ? new THREE.Plane(new THREE.Vector3(0, -1, 0), y) : new THREE.Plane(new THREE.Vector3(0, 1, 0), -y));
            }
            if (s.v && this.sectionLength() > 0.5) {
                const a = toGl(s.a[0], s.a[1], 0).add(root.position), b = toGl(s.b[0], s.b[1], 0).add(root.position);
                const n = new THREE.Vector3(b.z - a.z, 0, a.x - b.x).normalize();
                if (n.dot(camera.position.clone().sub(a)) > 0) n.negate(); // keep the far side
                planes.push(new THREE.Plane().setFromNormalAndCoplanarPoint(n, a));
            }
        }
        this.clipPlanes = planes;
        if (this.inside) this.inside.value = planes.length ? 1 : 0;
        for (const m of this.materials) m.clippingPlanes = planes;
    }

    // Value under the pointer on a section plane, once the pointer rests: the planes are tested
    // first, then the model, which may hide the point.
    bindHover3d() {
        const el = this.viewer.renderer.domElement;
        const ray = new THREE.Raycaster();
        let timer = 0, down = false;
        const probe = (e) => {
            const rect = el.getBoundingClientRect();
            const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
            ray.setFromCamera(ndc, this.viewer.camera);
            const root = this.viewer.root;
            for (const hit of ray.intersectObjects([this.hPlane, this.vPlane].filter((p) => p.visible), false)) {
                const p = hit.point.clone().sub(root.position);
                const value = this.volume.sample(this.state.scenario, p.x, -p.z, p.y);
                if (Number.isNaN(value)) continue; // an empty part of the plane: see through it
                const blocked = ray
                    .intersectObjects(this.meshes, false)
                    .some((h) => h.distance < hit.distance - 0.05 && !this.clipPlanes.some((pl) => pl.distanceToPoint(h.point) < 0));
                return this.onHover(blocked ? null : { value, z: p.y + this.volume.worldZ }, e);
            }
            this.onHover(null);
        };
        el.addEventListener("pointerdown", () => ((down = true), clearTimeout(timer), this.onHover(null)));
        addEventListener("pointerup", () => (down = false));
        el.addEventListener("pointermove", (e) => {
            clearTimeout(timer);
            if (!down) timer = setTimeout(() => probe(e), 70); // the last value stays until the next one: no flicker
        });
        el.addEventListener("pointerleave", () => (clearTimeout(timer), this.onHover(null)));
    }
}

export const elevationText = (e, digits = 1) => `${e < 0 ? "−" : "+"}${Math.abs(e).toFixed(digits)} m`;

// ---- Section planes ----

function makePlane() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), 2)); // texture row 0 = far edge
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    // unlit, so the colours match the legend; in front of a surface lying exactly on the plane
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(geometry, material);
    const outline = new THREE.BufferGeometry();
    outline.setAttribute("position", geometry.getAttribute("position"));
    const frame = new THREE.LineLoop(outline, new THREE.LineBasicMaterial({ color: FRAME_COLOR }));
    mesh.add(frame);
    mesh.frustumCulled = frame.frustumCulled = false;
    return mesh;
}

function setQuad(mesh, corners) {
    const pos = mesh.geometry.getAttribute("position");
    corners.forEach((c, i) => pos.setXYZ(i, c.x, c.y, c.z));
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.computeBoundingBox();
}

function setTexture(mesh, slice) {
    mesh.material.map?.dispose();
    const texture = new THREE.DataTexture(slice.pixels, slice.w, slice.h, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
}

// ---- Cuts through the model ----

// Where the plane through `o` with normal `n` crosses the model's triangles: line segments in
// the plane's own 2D coordinates (along e1 and e2), canopies apart from the rest.
function cutModel(parts, o, e1, e2, n) {
    const main = [], soft = [];
    const no = n[0] * o[0] + n[1] * o[1] + n[2] * o[2];
    for (const part of parts) {
        const { pos, index, d } = part;
        const out = part.soft ? soft : main;
        let any = 0;
        for (let v = 0, i = 0; v < d.length; v++, i += 3) {
            d[v] = pos[i] * n[0] + pos[i + 1] * n[1] + pos[i + 2] * n[2] - no;
            any |= d[v] >= 0 ? 1 : 2;
        }
        if (any !== 3) continue; // the whole layer is on one side
        const count = index ? index.length : d.length;
        for (let t = 0; t + 2 < count; t += 3) {
            const i0 = index ? index[t] : t, i1 = index ? index[t + 1] : t + 1, i2 = index ? index[t + 2] : t + 2;
            const s0 = d[i0] >= 0, s1 = d[i1] >= 0, s2 = d[i2] >= 0;
            if (s0 === s1 && s1 === s2) continue;
            if (s0 !== s1) cross(pos, d, i0, i1, o, e1, e2, out);
            if (s1 !== s2) cross(pos, d, i1, i2, o, e1, e2, out);
            if (s2 !== s0) cross(pos, d, i2, i0, o, e1, e2, out);
        }
    }
    return { main: new Float32Array(main), soft: new Float32Array(soft) };
}

function cross(pos, d, a, b, o, e1, e2, out) {
    const t = d[a] / (d[a] - d[b]);
    const x = pos[a * 3] + (pos[b * 3] - pos[a * 3]) * t - o[0];
    const y = pos[a * 3 + 1] + (pos[b * 3 + 1] - pos[a * 3 + 1]) * t - o[1];
    const z = pos[a * 3 + 2] + (pos[b * 3 + 2] - pos[a * 3 + 2]) * t - o[2];
    out.push(x * e1[0] + y * e1[1] + z * e1[2], x * e2[0] + y * e2[1] + z * e2[2]);
}

// The model's edge lines lying below a plan's height, seen from above.
function edgesBelow(edges, z) {
    const out = [];
    for (let i = 0; i + 5 < edges.length; i += 6) {
        if (edges[i + 2] > z || edges[i + 5] > z) continue;
        out.push(edges[i], edges[i + 1], edges[i + 3], edges[i + 4]);
    }
    return new Float32Array(out);
}
