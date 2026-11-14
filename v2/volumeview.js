// A study with a dense 3D field (layers[] kind "analysis", dim "3d"), seen three ways:
//   "3d"       the model (model.glb, its own colours and edge lines) with the field on two section
//              planes, one horizontal and one vertical; optionally also as dots at every analysed
//              point, or spread on terrain and buildings
//   "plan"     the field at one elevation, with the model cut at that height
//   "section"  the vertical cut along the section line, with the cut terrain and buildings and,
//              within the view depth, the edge lines of the model beyond the plane (uniformly light)
// The field on a plane is a colour map sampled from the volume (volume.js, "filled" reading): it
// reaches the cut geometry, which is drawn over it as a solid dark grey (canopies apart, lighter).
//
// One serialisable object describes what is on screen (view()), the base for saved viewpoints:
//   { mode, scenario, z, a: [x, y], b: [x, y], h, v, cut, dots, drape, vx, camera: [px,py,pz, tx,ty,tz] | null, frame: [cx, cy, m/px] | null }
//   z, a, b in the volume's local metres (Z up); camera in the model's own coordinates (glTF, Y up);
//   h / v = the horizontal / vertical plane is shown in 3D; cut = the model is cut away in front of the planes;
//   dots = every analysed point is a dot in 3D; drape = terrain and buildings take the colour of the field at their surface;
//   vx = heights drawn 1, 2 or 4 times larger in the 2D section (a long site is a very thin strip at true scale);
//   viewDepth / viewDepthM = the 2D section shows the model's edge lines up to that many metres beyond the plane.
import * as THREE from "three";
import { Viewer } from "./viewer.js?v=46";
import { loadVolume, colourLut, texturePixels } from "./volume.js?v=3";
import { SliceView, KeyPlan, drawLoops, drawScaleBar, drawSectionLine, snapSectionEnd } from "./slice2d.js?v=8";
import { cutModel, insideLoops, tallLoops } from "./meshcut.js?v=5";

const SOFT_LAYER = /plant|tree|veget/i; // canopies: not solid for the analysis, drawn apart from terrain and buildings
// Cut geometry, in 2D and on the 3D planes: solids are one dark grey, canopies a light green.
const SOLID_GREY = 0x28;
// The outline in the fill's own colour closes the light seam antialiasing leaves between two solids that touch.
const SOLID = { color: `rgb(${SOLID_GREY}, ${SOLID_GREY}, ${SOLID_GREY})`, stroke: `rgb(${SOLID_GREY}, ${SOLID_GREY}, ${SOLID_GREY})`, width: 1, separate: true };
const CANOPY = { color: "rgba(96, 150, 96, 0.4)", stroke: "rgba(30, 90, 40, 0.85)", width: 0.8 };
const OPEN_LINE = { color: "#1c1c1c", width: 1.3 }; // a cut surface that is not a closed solid
const SOFT_LINE = { color: "rgba(30, 90, 40, 0.85)", width: 0.8 };
const FRAME_COLOR = 0x222222;
const VOID_PX = 0.1; // the excluded space of a slice is resolved to this many metres per pixel, at its finest
const VOID_MAX = 4e6; // and to this many pixels at most
const TEXTURE_SCALE = 2; // a plane's texture, in pixels per pixel of the field slice: sharper cut geometry
const DOT_SIZE = 0.4; // dot diameter, in grid steps
const CANOPY_OPACITY = 0.28; // canopies while the colours are on the surfaces
const PROJECTION_OPACITY = 0.22; // edge lines beyond a section: one light tone, whatever their distance
const VIEW_DEPTH = [1, 500]; // metres

// local metres (Rhino, Z up) -> the model's glTF coordinates (Y up)
const toGl = (x, y, z, out = new THREE.Vector3()) => out.set(x, z, -y);

export class VolumeView {
    // els: { pane3d, pane2d, key, overlay (the controls over the view: a 2D drawing is fitted below them) }; onChange() after any change of the view; onHover({ value, z } | null, event)
    constructor(els, { onChange, onHover, onStatus, onNavigate } = {}) {
        this.els = els;
        this.onChange = onChange || (() => {});
        this.onHover = onHover || (() => {});
        this.onStatus = onStatus || (() => {});
        this.onNavigate = onNavigate || (() => {});
        this.state = { mode: "3d", scenario: "", z: 0, a: [0, 0], b: [1, 1], h: false, v: true, cut: false, dots: false, drape: true, planGuide: true, sectionGuide: true, vx: 1, viewDepth: true, viewDepthM: 15 };
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
        this.buildPlanes();
        if (!this.viewer.centred) this.frameField();
        this.keyPlanScene = this.modelPlan();
        this.readModel();

        // defaults: 3D, first scenario, a plan just above the ground, a section across the middle (south to north)
        const scenarios = this.scenarios();
        // Model elevations are absolute; slider state is local to the volume origin.
        // ZRCH HotelNoise default requested on 2026-11-13. Other studies retain automatic fitting.
        const elevation = layer.default_plan_elevation_m ?? (/\/ZRCH_[^/]*HotelNoise[^/]*\//i.test(base) ? 14 : null);
        const z = Number.isFinite(elevation) ? Math.max(0, Math.min(volume.size[2], elevation - volume.worldZ)) : volume.defaultElevation();
        Object.assign(this.state, { scenario: scenarios[0].key, z, a: [lx / 2, 0], b: [lx / 2, ly] });
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
        if (initial.camera) this.setCamera(initial.camera);
        this.viewer.controls.addEventListener("change", () => { this.updateClip(); this.onNavigate(); });
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
        const reading = this.nativeReading();
        return this.legendOverride ? { ...reading, legend: this.legendOverride } : reading;
    }

    nativeReading() {
        const sc = this.scenarios().find((s) => s.key === this.state.scenario) || {};
        const { layer } = this;
        return { key: sc.key, label: sc.label || layer.label, unit: sc.unit ?? layer.unit, better: sc.better ?? layer.better, legend: sc.legend || layer.legend };
    }

    setLegend(legend) {
        if (JSON.stringify(this.legendOverride || null) === JSON.stringify(legend || null)) return;
        this.legendOverride = legend;
        this.dirty.plan = this.dirty.section = true;
        this.dotsFor = null;
        this.refresh();
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
            else if (["h", "v", "cut", "dots", "drape", "planGuide", "sectionGuide", "viewDepth"].includes(k) && v != null) out[k] = !!v;
            else if (k === "viewDepthM" && Number.isFinite(v)) out.viewDepthM = Math.min(Math.max(v, VIEW_DEPTH[0]), VIEW_DEPTH[1]);
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
        if (s.a.some((n, i) => n !== before.a[i]) || s.b.some((n, i) => n !== before.b[i])) {
            this.dirty.section = true;
            this.frames.section = null; // a new line is a new drawing: fitted again
            if (s.mode === "section") this.sceneFor = null;
        }
        if (s.mode !== before.mode) this.applyMode();
        this.refresh();
        if (quiet) this.onNavigate();
        if (!quiet) this.onChange();
    }

    // What is on screen, as one serialisable object.
    view() {
        const s = this.state;
        const r = (v, d = 2) => +v.toFixed(d);
        const out = {
            mode: s.mode, scenario: s.scenario, z: r(s.z), a: s.a.map((v) => r(v, 1)), b: s.b.map((v) => r(v, 1)),
            planGuide: s.planGuide, sectionGuide: s.sectionGuide, h: s.h, v: s.v, cut: s.cut, dots: s.dots, drape: s.drape, vx: s.vx,
            viewDepth: s.viewDepth, viewDepthM: s.viewDepthM, camera: null, frame: null,
        };
        if (s.mode === "3d") out.camera = this.getCamera();
        else if (this.frames[s.mode]) out.frame = this.frames[s.mode].map((v, i) => r(v, i === 2 ? 4 : 1));
        return out;
    }

    applyView(view) {
        this.set(view, { quiet: true });
        // set() may reset a section frame when its line or vertical scale changes.
        if (view.mode !== "3d") {
            this.frames[this.state.mode] = view.frame ? [...view.frame] : null;
            this.sceneFor = null;
            this.refresh();
        }
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
        const len = Math.max(this.sectionLength(), 1);
        // Only what is on screen is computed: a slice when its drawing or its plane is shown, a
        // plane's texture when that plane is shown in 3D. The rest waits until it is asked for.
        const in3d = s.mode === "3d";
        const showH = in3d && s.h, showV = in3d && s.v && this.sectionLength() > 0.5;
        if (this.dirty.plan && (s.mode === "plan" || showH)) {
            // The model cut defines the solid boundaries; the space the analysis excludes (inside a
            // building, below the ground) is filled up to them, never left empty.
            this.planCut = null;
            this.planSlice = this.sealVoids(volume.plan(s.scenario, legend, s.z), lx, ly, this.cutPlan());
            this.dirty.plan = false;
            this.planTextureFor = null;
        }
        if (showH && this.planTextureFor !== this.planSlice) {
            setTexture(this.hPlane, this.planeTexture(this.planSlice, lx, ly, this.cutPlan()));
            this.planTextureFor = this.planSlice;
        }
        if (this.dirty.section && (s.mode === "section" || showV)) {
            this.sectionCut = null;
            this.sectionSlice = this.sealVoids(volume.section(s.scenario, legend, s.a, s.b), len, lz, this.cutSection());
            this.dirty.section = false;
            this.sectionTextureFor = null;
        }
        if (showV && this.sectionTextureFor !== this.sectionSlice) {
            setTexture(this.vPlane, this.planeTexture(this.sectionSlice, len, lz, this.cutSection()));
            this.sectionTextureFor = this.sectionSlice;
        }
        // the 3D scene: planes, dots, colours on the surfaces
        setQuad(this.hPlane, [toGl(0, 0, s.z), toGl(lx, 0, s.z), toGl(lx, ly, s.z), toGl(0, ly, s.z)]);
        setQuad(this.vPlane, [toGl(s.a[0], s.a[1], 0), toGl(s.b[0], s.b[1], 0), toGl(s.b[0], s.b[1], lz), toGl(s.a[0], s.a[1], lz)]);
        this.hPlane.visible = s.h;
        this.vPlane.visible = s.v && this.sectionLength() > 0.5;
        this.updateDots(legend);
        this.updateDrape(legend);
        this.updateClip();
        this.viewer.dirty = true; // the viewer draws on demand

        if (s.mode !== "3d") {
            this.slice.show(s.mode === "plan" ? this.planScene() : this.sectionScene(), { keep: true });
            // another drawing (the other mode, or a new section line): its own pan / zoom, or fitted
            if (this.sceneFor !== s.mode) this.slice.setFrame(this.frames[s.mode]);
            this.sceneFor = s.mode;
        }
        if (s.mode !== "plan") {
            this.keyPlan.set(this.keyPlanScene, s.a, s.b);
        }
    }

    // An independent, uncut top view of the model, captured before analysis shaders are added.
    // A render target leaves the interactive camera and its canvas untouched.
    modelPlan(mode = "key") {
        const [lx, ly] = this.volume.size;
        if (!this.model) return { images: [], edges: [] };
        if (!this.drawingScene) {
            this.drawingScene = new THREE.Scene();
            for (const light of this.viewer.scene.children.filter(node => node.isLight)) this.drawingScene.add(light.clone());
            this.viewer.root.updateMatrixWorld(true);
            const model = this.model.clone(true);
            model.matrixAutoUpdate = false;
            model.matrix.copy(new THREE.Matrix4().copy(this.viewer.root.matrixWorld).invert().multiply(this.model.matrixWorld));
            this.drawingMaterials = new Set();
            const copies = new Map();
            model.traverse(node => {
                if (!node.material) return;
                const copy = material => {
                    if (!copies.has(material)) copies.set(material, material.clone());
                    const result = copies.get(material);
                    this.drawingMaterials.add(result);
                    return result;
                };
                node.material = Array.isArray(node.material) ? node.material.map(copy) : copy(node.material);
            });
            this.drawingScene.add(model);
            this.drawingBox = new THREE.Box3().setFromObject(model);
        }
        const scene = this.drawingScene, box = this.drawingBox;
        const section = mode === "section", lz = this.volume.size[2];
        const len = section ? Math.max(this.sectionLength(), 1) : lx;
        const height = section ? lz : ly;
        const depth = box.getSize(new THREE.Vector3()).length() + 20;
        const camera = new THREE.OrthographicCamera(-len / 2, len / 2, height / 2, -height / 2, 0.1, depth * 2);
        const planes = [];
        if (section) {
            // Seen from in front of the plane: only what lies behind it, up to the view depth.
            const { a, b, viewDepthM } = this.state;
            const normal = new THREE.Vector3((b[1] - a[1]) / len, 0, (b[0] - a[0]) / len);
            const center = toGl((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, lz / 2);
            camera.position.copy(center).addScaledVector(normal, depth);
            camera.lookAt(center);
            planes.push(new THREE.Plane(normal.clone().negate(), normal.dot(center)), new THREE.Plane(normal.clone(), viewDepthM - normal.dot(center)));
        } else {
            camera.position.set(lx / 2, box.max.y + 10, -ly / 2);
            camera.up.set(0, 0, -1);
            camera.lookAt(lx / 2, box.min.y, -ly / 2);
            if (mode === "plan") planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), this.state.z));
        }
        for (const material of this.drawingMaterials) {
            material.clippingPlanes = planes.length ? planes : null;
            material.needsUpdate = true;
        }
        const w = 1536, h = Math.min(2048, Math.max(1, Math.round(w * height / len)));
        const target = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
        target.texture.colorSpace = THREE.SRGBColorSpace;
        const renderer = this.viewer.renderer, previous = renderer.getRenderTarget();
        const alpha = renderer.getClearAlpha();
        const capture = () => {
            // Pixel readback binds the resolved framebuffer; rebind the multisample target for each pass.
            renderer.setRenderTarget(null);
            renderer.setRenderTarget(target);
            renderer.render(scene, camera);
            const pixels = new Uint8Array(w * h * 4);
            renderer.readRenderTargetPixels(target, 0, 0, w, h, pixels);
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d"), image = ctx.createImageData(w, h);
            for (let y = 0; y < h; y++) image.data.set(pixels.subarray((h - y - 1) * w * 4, (h - y) * w * 4), y * w * 4);
            ctx.putImageData(image, 0, 0);
            return { canvas, rect: [0, 0, len, height] };
        };
        const lineStyles = new Map([...this.drawingMaterials].filter(material => material.isLineBasicMaterial).map(material => [material, { color: material.color.clone(), opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite, blending: material.blending }]));
        const offsets = new Map([...this.drawingMaterials].map(material => [material, [material.polygonOffset, material.polygonOffsetFactor, material.polygonOffsetUnits]]));
        try {
            renderer.setClearAlpha(0);
            renderer.setRenderTarget(target);
            const images = mode === "key" ? [capture()] : [];
            const edges = [];
            if (mode !== "key") {
                // Invisible surfaces still write depth: only exposed edges survive over the field.
                // Drawing every projected edge here would turn the plan into a wireframe.
                for (const material of this.drawingMaterials) {
                    material.colorWrite = !!material.isLineBasicMaterial;
                    if (material.isLineBasicMaterial) {
                        material.color.set(0x000000);
                        material.opacity = section ? PROJECTION_OPACITY : 0.22;
                        material.transparent = true;
                        material.depthWrite = false;
                        if (section) {
                            // The projection keeps the darkest line of each pixel instead of adding them up:
                            // many edges behind one another (a facade seen edge-on) stay as light as one.
                            material.blending = THREE.CustomBlending;
                            material.blendEquation = material.blendEquationAlpha = THREE.MaxEquation;
                            material.blendSrc = material.blendDst = material.blendSrcAlpha = material.blendDstAlpha = THREE.OneFactor;
                        }
                    }
                    if (!material.isLineBasicMaterial) {
                        material.polygonOffset = true;
                        material.polygonOffsetFactor = 1;
                        material.polygonOffsetUnits = 1;
                    }
                }
                edges.push(capture());
            }
            return { images, edges };
        } finally {
            for (const material of this.drawingMaterials) {
                material.colorWrite = true;
                if (lineStyles.has(material)) {
                    const style = lineStyles.get(material);
                    material.color.copy(style.color);
                    material.opacity = style.opacity;
                    material.transparent = style.transparent;
                    material.depthWrite = style.depthWrite;
                    material.blending = style.blending;
                }
                [material.polygonOffset, material.polygonOffsetFactor, material.polygonOffsetUnits] = offsets.get(material);
            }
            renderer.setRenderTarget(previous);
            renderer.setClearAlpha(alpha);
            target.dispose();
        }
    }

    sectionLength() {
        const { a, b } = this.state;
        return Math.hypot(b[0] - a[0], b[1] - a[1]);
    }

    // ---- Cuts and 2D drawings ----

    cutPlan() {
        if (!this.planCut) {
            const z = this.state.z;
            this.planCut = cutModel(this.parts, [0, 0, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
        }
        return this.planCut;
    }

    // In metres along the line (x) and local height (y).
    cutSection() {
        if (!this.sectionCut) {
            const { a, b } = this.state;
            const len = this.sectionLength() || 1;
            const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, 0];
            this.sectionCut = cutModel(this.parts, [a[0], a[1], 0], d, [0, 0, 1], [d[1], -d[0], 0]);
        }
        return this.sectionCut;
    }

    // The slice with the space the analysis excludes painted as solid. The mask of the volume is
    // coarse (one grid step) and the field is read a little past it, so a room cut by the plane
    // would show a stepped hole with a rim of colour inside its walls. The excluded pixels grow
    // by one grid step instead, stopped by the cut geometry: the solid ends on the faces of the
    // model wherever it has any, and on the mask only where it has none.
    // The slice covers [0, w] x [0, h] metres, row 0 at the top. `solid` >= 2 marks those pixels.
    sealVoids(slice, w, h, cut) {
        const fit = n => Math.max(1, Math.round(n / VOID_PX));
        let kx = fit(w / slice.w), ky = fit(h / slice.h);
        while (slice.w * kx * slice.h * ky > VOID_MAX && (kx > 1 || ky > 1)) kx >= ky ? kx-- : ky--;
        const W = slice.w * kx, H = slice.h * ky;
        const scratch = (this.voidScratch ||= document.createElement("canvas"));
        scratch.width = W;
        scratch.height = H;
        const ctx = scratch.getContext("2d", { willReadFrequently: true });
        const sx = W / w, sy = H / h;
        drawLoops(ctx, { loops: cut.main.loops, color: "#000", stroke: "#000", width: 1, separate: true }, sx, 0, -sy, H);
        const open = cut.main.open;
        ctx.beginPath();
        for (let i = 0; i + 3 < open.length; i += 4) {
            ctx.moveTo(open[i] * sx, H - open[i + 1] * sy);
            ctx.lineTo(open[i + 2] * sx, H - open[i + 3] * sy);
        }
        ctx.stroke();
        const image = ctx.getImageData(0, 0, W, H), px = image.data;
        // 0 = open air, 1 = cut geometry, 2 = excluded space, 3 = cut geometry bounding it
        const solid = new Uint8Array(W * H);
        let front = [];
        for (let y = 0, i = 0; y < H; y++) {
            const row = ((y / ky) | 0) * slice.w;
            for (let x = 0; x < W; x++, i++) {
                if (px[i * 4 + 3]) solid[i] = 1;
                else if (slice.excluded[row + ((x / kx) | 0)]) {
                    solid[i] = 2;
                    front.push(i);
                }
            }
        }
        const steps = Math.ceil(Math.max(this.volume.sx, this.volume.sy, this.volume.sz) / Math.min(w / W, h / H)) + 1;
        for (let step = 0; step < steps && front.length; step++) {
            const next = [];
            const reach = (j) => {
                if (solid[j] === 0) {
                    solid[j] = 2;
                    next.push(j);
                } else if (solid[j] === 1) solid[j] = 3; // painted, not crossed
            };
            const wall = (j) => solid[j] === 1 || solid[j] === 3;
            for (const i of front) {
                const x = i % W, y = (i - x) / W;
                const l = x > 0, r = x < W - 1, u = y > 0, d = y < H - 1;
                if (l) reach(i - 1);
                if (r) reach(i + 1);
                if (u) reach(i - W);
                if (d) reach(i + W);
                // diagonally only through a real gap, never between two pixels of a thin wall
                if (l && u && !wall(i - 1) && !wall(i - W)) reach(i - W - 1);
                if (r && u && !wall(i + 1) && !wall(i - W)) reach(i - W + 1);
                if (l && d && !wall(i - 1) && !wall(i + W)) reach(i + W - 1);
                if (r && d && !wall(i + 1) && !wall(i + W)) reach(i + W + 1);
            }
            front = next;
        }
        for (let i = 0, o = 0; i < solid.length; i++, o += 4) {
            px[o] = px[o + 1] = px[o + 2] = SOLID_GREY;
            px[o + 3] = solid[i] >= 2 ? 255 : 0;
        }
        ctx.putImageData(image, 0, 0);
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const out = canvas.getContext("2d");
        out.imageSmoothingEnabled = true;
        out.imageSmoothingQuality = "high";
        out.drawImage(slice.canvas, 0, 0, W, H);
        out.drawImage(scratch, 0, 0);
        return { w: slice.w, h: slice.h, canvas, solid, sw: W, sh: H };
    }

    // A plane of the 3D scene: the field slice with the cut geometry drawn over it, as texture
    // pixels. The slice covers [0, w] x [0, h] metres, row 0 at the top.
    planeTexture(slice, w, h, cut) {
        const W = slice.w * TEXTURE_SCALE, H = slice.h * TEXTURE_SCALE;
        const canvas = (this.scratch ||= document.createElement("canvas"));
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(slice.canvas, 0, 0, W, H);
        const kx = W / w, ky = -H / h;
        drawLoops(ctx, { loops: cut.main.loops, ...SOLID }, kx, 0, ky, H);
        drawLoops(ctx, { loops: cut.soft.loops, ...CANOPY }, kx, 0, ky, H);
        return { w: W, h: H, pixels: texturePixels(ctx.getImageData(0, 0, W, H).data, W, H) };
    }

    // Room left at the top of a fitted 2D drawing: the controls sit there.
    padTop() {
        const o = this.els.overlay;
        return o && o.offsetHeight ? o.offsetTop + o.offsetHeight + 28 : 64;
    }

    pickGuide(point, view) {
        const s = this.state, tolerance = 9 * view.frame[2];
        if (s.mode === "section") {
            if (!s.planGuide || point[0] < 0 || point[0] > this.sectionLength() + 90 * view.frame[2] || Math.abs(point[1] - s.z * s.vx) > tolerance) return null;
            return { cursor: "ns-resize", move: p => this.set({ z: p[1] / s.vx }, { quiet: true }), end: () => this.onChange() };
        }
        if (s.mode !== "plan" || !s.sectionGuide) return null;
        const near = p => Math.hypot(p[0] - point[0], p[1] - point[1]) <= tolerance;
        const end = near(s.a) ? "a" : near(s.b) ? "b" : null;
        if (end) return { cursor: "crosshair", move: p => this.set({ [end]: snapSectionEnd(p, s[end === "a" ? "b" : "a"], [0, 0, ...this.volume.size.slice(0, 2)], 8 * view.frame[2]) }, { quiet: true }), end: () => this.onChange() };
        const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1];
        const t = Math.max(0, Math.min(1, ((point[0] - s.a[0]) * dx + (point[1] - s.a[1]) * dy) / (dx * dx + dy * dy || 1)));
        if (Math.hypot(point[0] - s.a[0] - t * dx, point[1] - s.a[1] - t * dy) > tolerance) return null;
        return { cursor: "move", move: p => {
            const shift = p.map((n, i) => Math.max(-Math.min(s.a[i], s.b[i]), Math.min(this.volume.size[i] - Math.max(s.a[i], s.b[i]), n - point[i])));
            this.set({ a: s.a.map((n, i) => n + shift[i]), b: s.b.map((n, i) => n + shift[i]) }, { quiet: true });
        }, end: () => this.onChange() };
    }

    planScene() {
        const [lx, ly] = this.volume.size;
        const cut = this.cutPlan();
        if (this.planDrawingZ !== this.state.z) {
            this.planDrawing = this.modelPlan("plan");
            this.planDrawingZ = this.state.z;
        }
        return {
            pick: (point, view) => this.pickGuide(point, view),
            extent: [0, 0, lx, ly],
            pad: [this.padTop(), 40, 56, 40],
            images: [{ canvas: this.planSlice.canvas, rect: [0, 0, lx, ly] }, ...this.planDrawing.edges],
            fills: [{ loops: cut.main.loops, ...SOLID }, { loops: cut.soft.loops, ...CANOPY }],
            lines: [{ segs: cut.soft.open, ...SOFT_LINE }, { segs: cut.main.open, ...OPEN_LINE }],
            decorate: (ctx, view) => {
                const [l, t] = view.px(0, ly), [r, b] = view.px(lx, 0);
                ctx.save();
                ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 3]);
                ctx.strokeRect(l, t, r - l, b - t); // the analysed area
                ctx.restore();
                if (this.state.sectionGuide && this.sectionLength() > 0.5) drawSectionLine(ctx, view, this.state.a, this.state.b, { handles: true });
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
        // "View depth": the edge lines of the model beyond the plane, hidden where a surface covers
        // them, drawn over the field and under the cut geometry. Without it, only what the plane cuts.
        let projection = [];
        if (this.state.viewDepth && this.model) {
            const key = [...this.state.a, ...this.state.b, this.state.viewDepthM].join();
            if (this.sectionDrawingKey !== key) {
                this.sectionDrawing = this.modelPlan("section");
                this.sectionDrawingKey = key;
            }
            projection = this.sectionDrawing.edges.map(({ canvas }) => ({ canvas, rect: [0, 0, len, lz * k] }));
        }
        const tall = (segs) => (k === 1 ? segs : segs.map((v, i) => (i & 1 ? v * k : v)));
        return {
            pick: (point, view) => this.pickGuide(point, view),
            extent: [0, 0, len, lz * k],
            pad: [this.padTop(), 110, 70, 70],
            images: [{ canvas: this.sectionSlice.canvas, rect: [0, 0, len, lz * k] }, ...projection],
            fills: [{ loops: tallLoops(cut.main.loops, k), ...SOLID }, { loops: tallLoops(cut.soft.loops, k), ...CANOPY }],
            lines: [{ segs: tall(cut.soft.open), ...SOFT_LINE }, { segs: tall(cut.main.open), ...OPEN_LINE }],
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
                if (this.state.planGuide) {
                const y = Math.round(view.px(0, this.state.z * k)[1]) + 0.5;
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(l, y);
                ctx.lineTo(r + 6, y);
                ctx.stroke(); // light under dark: readable over the field and over the cut ground
                ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.textAlign = "left";
                ctx.fillText(`Plan ${elevationText(this.state.z + world)}`, r + 10, y);
                }
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

    // The value at a point of the plan (x, y) or of the section (metres along the line, local
    // height): NaN inside the cut solids and where nothing is analysed.
    valueOnPlan(x, y) {
        const [lx, ly] = this.volume.size;
        if (insideLoops(this.cutPlan().main.loops, x, y) || sealed(this.planSlice, x / lx, 1 - y / ly)) return NaN;
        return this.volume.sample(this.state.scenario, x, y, this.state.z, true);
    }

    valueOnSection(along, height) {
        const { a, b } = this.state;
        const len = this.sectionLength() || 1;
        if (along < 0 || along > len || insideLoops(this.cutSection().main.loops, along, height) || sealed(this.sectionSlice, along / len, 1 - height / this.volume.size[2])) return NaN;
        return this.volume.sample(this.state.scenario, a[0] + ((b[0] - a[0]) * along) / len, a[1] + ((b[1] - a[1]) * along) / len, height, true);
    }

    hover2d(p, e) {
        if (!p) return this.onHover(null);
        const plan = this.state.mode === "plan";
        const height = plan ? this.state.z : p[1] / this.state.vx;
        const value = plan ? this.valueOnPlan(p[0], p[1]) : this.valueOnSection(p[0], height);
        this.onHover(Number.isNaN(value) ? null : { value, z: height + this.volume.worldZ }, e);
    }

    // ---- 3D scene ----

    // The model as plain arrays in local metres: triangles for the cuts, edge lines for the plan.
    // Canopies get a material of their own (they turn translucent under the colours on the surfaces).
    readModel() {
        this.parts = [];
        this.edges = new Float32Array(0);
        this.meshes = [];
        this.materials = new Set();
        this.softMaterials = new Set();
        this.inside = { value: 0 };
        if (!this.model) return;
        const root = this.viewer.root;
        root.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
        const m = new THREE.Matrix4(), p = new THREE.Vector3();
        const edges = [];
        const softOf = new Map(); // shared material -> its copy for the canopies
        this.model.traverse((node) => {
            if (!node.geometry) return;
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
                const soft = SOFT_LAYER.test(name);
                if (soft && !Array.isArray(node.material)) {
                    if (!softOf.has(node.material)) softOf.set(node.material, node.material.clone());
                    node.material = softOf.get(node.material);
                    this.softMaterials.add(node.material);
                }
                node.userData.soft = soft;
                this.meshes.push(node);
                this.parts.push({ soft, pos, index, d: new Float32Array(attr.count) });
            } else if (node.isLineSegments) {
                if (!index) edges.push(pos);
                else {
                    const flat = new Float32Array(index.length * 3);
                    for (let i = 0; i < index.length; i++) flat.set(pos.subarray(index[i] * 3, index[i] * 3 + 3), i * 3);
                    edges.push(flat);
                }
            }
            for (const mat of [node.material].flat()) this.materials.add(mat);
        });
        this.edges = new Float32Array(edges.reduce((n, e) => n + e.length, 0));
        let o = 0;
        for (const e of edges) {
            this.edges.set(e, o);
            o += e.length;
        }
        this.patchMaterials();
    }

    // Two additions to the model's own materials:
    //  - while the model is cut, the faces seen from behind (the inside of a cut solid) are the
    //    dark grey of the cut geometry: the cut reads as solid, not as a hollow shell
    //  - "drape": terrain and buildings take the colour of the field at their surface, read from
    //    the volume as a 3D texture a little outside the surface (along its normal)
    patchMaterials() {
        const { volume, viewer } = this;
        const lift = 0.4 * Math.min(volume.sx, volume.sy, volume.sz);
        this.drapeUniforms = {
            uDrape: { value: 0 },
            uDrapeField: { value: null },
            uDrapeLut: { value: null },
            uDrapeRange: { value: new THREE.Vector2(0, 1) },
            uDrapeOrigin: { value: viewer.root.position.clone() },
            uDrapeStep: { value: new THREE.Vector3(volume.sx, volume.sy, volume.sz) },
            uDrapeSize: { value: new THREE.Vector3(volume.nx, volume.ny, volume.nz) },
            uDrapeLift: { value: lift },
        };
        this.canDrape = viewer.renderer.capabilities.isWebGL2 !== false;
        const grey = (SOLID_GREY / 255).toFixed(3);
        for (const mat of this.materials) {
            const lit = mat.isMeshLambertMaterial || mat.isMeshStandardMaterial;
            if (!lit && !mat.isMeshBasicMaterial) continue; // the edge lines
            const drape = lit && this.canDrape && !this.softMaterials.has(mat);
            mat.onBeforeCompile = (shader) => {
                shader.uniforms.uInside = this.inside;
                let head = "uniform float uInside;\n";
                let tail = `\tif ( uInside > 0.5 && ! gl_FrontFacing ) gl_FragColor.rgb = vec3( ${grey} );\n`;
                if (drape) {
                    Object.assign(shader.uniforms, this.drapeUniforms);
                    shader.vertexShader =
                        "uniform vec3 uDrapeOrigin;\nuniform vec3 uDrapeStep;\nuniform vec3 uDrapeSize;\nuniform float uDrapeLift;\nvarying vec3 vDrape;\n" +
                        shader.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n" + DRAPE_VERTEX);
                    head = "precision highp sampler3D;\nuniform float uDrape;\nuniform sampler3D uDrapeField;\nuniform sampler2D uDrapeLut;\nuniform vec2 uDrapeRange;\nvarying vec3 vDrape;\n" + head;
                    tail = DRAPE_FRAGMENT + tail;
                }
                shader.fragmentShader = head + shader.fragmentShader.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n" + tail);
            };
            mat.customProgramCacheKey = () => (drape ? "volume-drape" : "volume-plain");
            mat.needsUpdate = true;
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

    // "Dots": every analysed point of the volume as a dot of its colour.
    updateDots(legend) {
        const s = this.state;
        if (!s.dots) {
            if (this.points) this.points.visible = false;
            return;
        }
        if (!this.points) {
            const material = new THREE.PointsMaterial({ size: DOT_SIZE * Math.min(this.volume.sx, this.volume.sy, this.volume.sz), vertexColors: true, map: dotTexture(), alphaTest: 0.5 });
            this.points = new THREE.Points(new THREE.BufferGeometry(), material);
            this.points.frustumCulled = false;
            this.group.add(this.points);
        }
        if (this.dotsFor !== s.scenario) {
            const nodes = this.volume.nodes(s.scenario);
            const n = nodes.length / 4;
            const position = new Float32Array(n * 3), color = new Float32Array(n * 3);
            const lut = linearLut(legend);
            const last = lut.length / 3 - 1, scale = last / (legend.max - legend.min || 1);
            for (let i = 0; i < n; i++) {
                position[i * 3] = nodes[i * 4];
                position[i * 3 + 1] = nodes[i * 4 + 2];
                position[i * 3 + 2] = -nodes[i * 4 + 1];
                const t = Math.min(Math.max(Math.round((nodes[i * 4 + 3] - legend.min) * scale), 0), last) * 3;
                color[i * 3] = lut[t];
                color[i * 3 + 1] = lut[t + 1];
                color[i * 3 + 2] = lut[t + 2];
            }
            this.points.geometry.dispose();
            this.points.geometry = new THREE.BufferGeometry();
            this.points.geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
            this.points.geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
            this.dotsFor = s.scenario;
        }
        this.points.visible = true;
    }

    // "Drape": the field of the scenario as a 3D texture (value and validity of every node, so the
    // shader can average the valid ones only) and its legend as a strip of colours.
    updateDrape(legend) {
        const s = this.state;
        const on = s.drape && this.canDrape && !!this.model;
        const u = this.drapeUniforms;
        if (!u) return;
        u.uDrape.value = on ? 1 : 0;
        for (const mat of this.softMaterials) {
            if (mat.transparent !== on) mat.needsUpdate = true;
            mat.transparent = on;
            mat.opacity = on ? CANOPY_OPACITY : 1;
            mat.depthWrite = !on;
        }
        if (!on) return;
        this.fieldTextures ||= {};
        if (!this.fieldTextures[s.scenario]) {
            const { nx, ny, nz, mask } = this.volume;
            const f = this.volume.fields[s.scenario];
            const data = new Uint16Array(f.length * 2);
            const one = THREE.DataUtils.toHalfFloat(1);
            for (let i = 0; i < f.length; i++) {
                if (mask[i] !== 0) continue;
                data[i * 2] = THREE.DataUtils.toHalfFloat(f[i]);
                data[i * 2 + 1] = one;
            }
            const texture = new THREE.Data3DTexture(data, nx, ny, nz);
            texture.format = THREE.RGFormat;
            texture.type = THREE.HalfFloatType;
            texture.minFilter = texture.magFilter = THREE.LinearFilter;
            texture.unpackAlignment = 1;
            texture.needsUpdate = true;
            this.fieldTextures[s.scenario] = texture;
        }
        const id = legend.colors.join();
        this.lutTextures ||= {};
        if (!this.lutTextures[id]) {
            const lut = colourLut(legend, 256);
            const data = new Uint8Array(256 * 4).fill(255);
            for (let i = 0; i < 256; i++) data.set(lut.subarray(i * 3, i * 3 + 3), i * 4);
            const texture = new THREE.DataTexture(data, 256, 1, THREE.RGBAFormat); // written as it is: the shader's output is already sRGB
            texture.minFilter = texture.magFilter = THREE.LinearFilter;
            texture.needsUpdate = true;
            this.lutTextures[id] = texture;
        }
        u.uDrapeField.value = this.fieldTextures[s.scenario];
        u.uDrapeLut.value = this.lutTextures[id];
        u.uDrapeRange.value.set(legend.min, legend.max);
    }

    // "Cut model": the model between the eye and each shown plane is cut away, so the field is
    // never hidden behind a building or a slope. The side follows the camera. The dots too.
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
        this.inside.value = planes.length ? 1 : 0;
        for (const m of this.materials) m.clippingPlanes = planes;
        if (this.points) this.points.material.clippingPlanes = planes;
    }

    // Value under the pointer, once the pointer rests: on a section plane, or on a surface while
    // the colours are spread on the model. Whatever of the model is in front hides it.
    bindHover3d() {
        const el = this.viewer.renderer.domElement;
        const ray = new THREE.Raycaster();
        let timer = 0, down = false;
        const probe = (e) => {
            const s = this.state;
            const rect = el.getBoundingClientRect();
            const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
            ray.setFromCamera(ndc, this.viewer.camera);
            const root = this.viewer.root;
            // the nearest surface of the model still drawn there (canopies are see-through under "drape")
            const front = ray
                .intersectObjects(this.meshes.filter((m) => !(s.drape && m.userData.soft)), false)
                .find((h) => !this.clipPlanes.some((pl) => pl.distanceToPoint(h.point) < 0));
            for (const hit of ray.intersectObjects([this.hPlane, this.vPlane].filter((p) => p.visible), false)) {
                if (front && front.distance < hit.distance - 0.05) break;
                const p = hit.point.clone().sub(root.position); // glTF: local (x, y, z) = (p.x, -p.z, p.y)
                const len = this.sectionLength() || 1;
                const value =
                    hit.object === this.hPlane
                        ? this.valueOnPlan(p.x, -p.z)
                        : this.valueOnSection(((p.x - s.a[0]) * (s.b[0] - s.a[0]) + (-p.z - s.a[1]) * (s.b[1] - s.a[1])) / len, p.y);
                if (Number.isNaN(value)) continue; // an empty or solid part of the plane
                return this.onHover({ value, z: p.y + this.volume.worldZ }, e);
            }
            if (s.drape && front && !front.object.userData.soft) {
                const lift = this.drapeUniforms.uDrapeLift.value;
                const n = front.face ? front.face.normal : new THREE.Vector3();
                const p = front.point.clone().sub(root.position).addScaledVector(n, lift);
                const value = this.volume.sample(s.scenario, p.x, -p.z, p.y, true);
                if (!Number.isNaN(value)) return this.onHover({ value, z: p.y + this.volume.worldZ }, e);
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

// ---- Colours on the surfaces (shader chunks) ----

// The point of the surface, a little outside it, in texture coordinates of the volume.
const DRAPE_VERTEX = `
	{
		vec4 drapeWorld = modelMatrix * vec4( transformed, 1.0 );
		vec3 drapeNormal = normalize( mat3( modelMatrix ) * objectNormal );
		vec3 drapePoint = drapeWorld.xyz - uDrapeOrigin + drapeNormal * uDrapeLift;
		vDrape = ( vec3( drapePoint.x, - drapePoint.z, drapePoint.y ) / uDrapeStep + 0.5 ) / uDrapeSize;
	}
`;

// The texture holds (value, 1) on valid nodes and (0, 0) elsewhere: filtered, r / g is the mean
// of the valid nodes around the point. Not analysed there: a pale grey of the surface's own tone.
const DRAPE_FRAGMENT = `
	if ( uDrape > 0.5 ) {
		vec3 drapeColor = vec3( dot( gl_FragColor.rgb, vec3( 0.299, 0.587, 0.114 ) ) * 0.3 + 0.62 );
		if ( all( greaterThanEqual( vDrape, vec3( 0.0 ) ) ) && all( lessThanEqual( vDrape, vec3( 1.0 ) ) ) ) {
			vec2 drapeSample = texture( uDrapeField, vDrape ).rg;
			if ( drapeSample.g > 0.02 ) {
				float drapeT = clamp( ( drapeSample.r / drapeSample.g - uDrapeRange.x ) / ( uDrapeRange.y - uDrapeRange.x ), 0.0, 1.0 );
				drapeColor = texture2D( uDrapeLut, vec2( drapeT, 0.5 ) ).rgb * ( 0.8 + 0.2 * abs( normalize( vNormal ).z ) );
			}
		}
		gl_FragColor.rgb = drapeColor;
	}
`;

// ---- Section planes, dots ----

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

function setTexture(mesh, { pixels, w, h }) {
    mesh.material.map?.dispose();
    const texture = new THREE.DataTexture(pixels, w, h, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
}

// A round dot for the points (they are squares otherwise).
let dot = null;
function dotTexture() {
    if (!dot) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(16, 16, 15, 0, Math.PI * 2);
        ctx.fill();
        dot = new THREE.CanvasTexture(canvas);
    }
    return dot;
}

// The legend's colours as linear values, for vertex colours.
function linearLut(legend) {
    const lut = colourLut(legend);
    const out = new Float32Array(lut.length);
    const c = new THREE.Color();
    for (let i = 0; i < lut.length; i += 3) {
        c.setRGB(lut[i] / 255, lut[i + 1] / 255, lut[i + 2] / 255, THREE.SRGBColorSpace);
        out[i] = c.r;
        out[i + 1] = c.g;
        out[i + 2] = c.b;
    }
    return out;
}

// The point at (u, v) of a slice (0..1 from its left and top) lies in the space painted as solid.
function sealed(slice, u, v) {
    if (!slice?.solid || !(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return false;
    return slice.solid[Math.min(slice.sw - 1, (u * slice.sw) | 0) + slice.sw * Math.min(slice.sh - 1, (v * slice.sh) | 0)] >= 2;
}
