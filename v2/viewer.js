// 3D viewer. Shows a composition of layers, one file each: [{ url, kind }] where kind is
//   "context"  shared by every option, loaded once, faded in analysis views
//   "geometry" the option's own layers (masses, floors, pools…), lit
//   "analysis" a colored analysis mesh, unlit so its vertex colors match the legend
// All files of a study share one origin, so they are overlaid as they are. The whole
// scene sits in one parent group shifted by the centre of the first bounding box,
// because the coordinates are hundreds of metres from the origin.
// Loads GLB/glTF and the legacy three.js JSON models of the classic Design Explorer.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const CACHE_SIZE = 60; // loaded files kept in memory (an option can have ~10 layers)
const CONTEXT_FADE = 0.45; // context opacity in analysis views
const LEVEL_EPS = 0.05; // m: two bases closer than this are the same level
// Outer outlines of the other levels while one is isolated: mid grey ("halftone"), no surfaces.
const CORNER_ANGLE = 25; // degrees: an outline turning less than this gets no vertical edge
const HALFTONE = new THREE.LineBasicMaterial({ color: 0x8c8c8c, transparent: true, opacity: 0.6, depthWrite: false });

export class Viewer {
    // onLevels(levels, level): after every composition, the levels of the shown analysis
    // (base heights, lowest first; empty when it is not made of whole floors) and the isolated one.
    // onPick(mesh | null, event) / onHover(mesh | null, event | null): a click (press and release
    // without a drag) or the pointer on one of the meshes listed in `pickable` (null = no picking).
    constructor(container, onStatus, { onLevels, onPick, onHover } = {}) {
        this.container = container;
        this.onStatus = onStatus || (() => {});
        this.onLevels = onLevels || (() => {});
        this.onPick = onPick || (() => {});
        this.onHover = onHover || (() => {});
        this.pickable = null;
        this.fitWidth = false; // see resetView
        this.level = null; // isolated level index, kept from option to option; null = all
        this.levels = [];
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a92, 2.4));
        const sun = new THREE.DirectionalLight(0xffffff, 1.6);
        sun.position.set(1, 2, 1.4);
        this.scene.add(sun);
        this.root = new THREE.Group();
        this.scene.add(this.root);

        this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100000);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        const canvas = this.renderer.domElement;
        let down = null;
        let frame = 0;
        canvas.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
        canvas.addEventListener("pointerup", (e) => {
            const still = down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 4;
            down = null;
            if (still && this.pickable) this.onPick(this.hit(e), e);
        });
        let last = 0;
        canvas.addEventListener("pointermove", (e) => {
            if (!this.pickable || e.buttons || frame || performance.now() - last < 70) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                last = performance.now();
                if (this.pickable) this.onHover(this.hit(e), e);
            });
        });
        canvas.addEventListener("pointerleave", () => this.pickable && this.onHover(null, null));

        this.cache = new Map(); // "kind|url" -> Promise<Object3D>
        this.shown = new Set(); // objects currently in the scene
        this.centred = false;
        this.framed = false;
        this.request = 0;

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(container);
        // A frame is drawn only when the camera moved (the controls' "change" event: the wheel
        // zoom updates the camera inside its own handler, so update() here would not report it)
        // or something else changed (this.dirty, see the methods below): a still view costs nothing.
        this.dirty = true;
        this.controls.addEventListener("change", () => (this.dirty = true));
        this.renderer.setAnimationLoop(() => {
            if (!this.container.offsetParent) return; // hidden: skip rendering
            const rect = this.container.getBoundingClientRect();
            if (rect.bottom < 0 || rect.top > window.innerHeight) return;
            this.controls.update(); // damping: keeps moving, and says so with "change"
            if (!this.dirty) return;
            this.dirty = false;
            this.renderer.render(this.scene, this.camera);
        });
    }

    resize() {
        const { clientWidth: w, clientHeight: h } = this.container;
        if (!w || !h) return;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.dirty = true;
    }

    // One file on its own (legacy studies, single-file analysis).
    show(url, kind = "geometry") {
        return this.compose([{ url, kind }]);
    }

    // Shows exactly these layers. The camera is kept between calls, so every
    // option is seen from the same point of view.
    // levels: false skips the level isolation (a view that handles floors itself).
    async compose(parts, { fadeContext = false, levels = true } = {}) {
        const request = ++this.request;
        this.onStatus("Loading 3D model…");
        const loaded = await Promise.allSettled(parts.map((p) => this.load(p.url, p.kind)));
        if (request !== this.request) return;

        const objects = [];
        const overlay = new Map(); // translucent overlays (part.opacity < 1), e.g. spacing zones
        loaded.forEach((l, i) => {
            if (l.status === "fulfilled") {
                objects.push(l.value);
                if (parts[i].opacity < 1 || parts[i].nodeOpacity) overlay.set(l.value, parts[i]);
            } else console.error("3D load failed", parts[i].url, l.reason);
        });
        for (const o of this.shown) this.root.remove(o);
        this.shown = new Set(objects);
        for (const o of objects) {
            this.root.add(o);
            if (o.userData.kind === "context") setOpacity(o, fadeContext ? CONTEXT_FADE : 1);
            else if (overlay.has(o)) setOverlayOpacity(o, overlay.get(o));
        }
        if (objects.length && !this.centred) this.centre(objects);
        if (objects.length && !this.framed) this.resetView();
        this.levels = levels ? findLevels(objects.find((o) => o.userData.kind === "analysis")) : [];
        // an analysis without levels keeps the choice for the next one that has them
        if (this.levels.length && this.level != null && this.level >= this.levels.length) this.level = null;
        this.applyLevel();
        // Commit the new frame even if the animation loop was throttled while offscreen.
        this.renderer.render(this.scene, this.camera);

        const failed = parts.length - objects.length;
        this.onStatus(!objects.length ? "Couldn't load this 3D file." : failed ? `${failed} of ${parts.length} layers couldn't load.` : "");
    }

    clear() {
        this.request++;
        for (const o of this.shown) this.root.remove(o);
        this.shown.clear();
        this.dirty = true;
        this.levels = [];
        this.onLevels([], this.level);
        this.onStatus("");
    }

    dispose() {
        this.clear();
        this.resizeObserver.disconnect();
        this.renderer.setAnimationLoop(null);
        this.controls.dispose();
        const disposeObject = root => {
            const geometries = new Set(), materials = new Set();
            root.traverse(node => {
                if (node.geometry) geometries.add(node.geometry);
                if (node.userData.baseGeometry) geometries.add(node.userData.baseGeometry);
                for (const g of node.userData.levelGeometries || []) if (g) geometries.add(g);
                for (const m of [node.material, node.userData.baseMaterial].flat().filter(Boolean)) {
                    if (m !== HALFTONE && m !== GHOST && m !== edgeLines.colored && m !== edgeLines.plain) materials.add(m);
                }
            });
            geometries.forEach(g => g.dispose());
            materials.forEach(m => m.dispose());
        };
        for (const pending of this.cache.values()) pending.then(disposeObject).catch(() => {});
        this.cache.clear();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        this.renderer.domElement.remove();
    }

    // Isolate one level of the analysis (index into this.levels), or null for all.
    setLevel(level) {
        this.level = level != null && level >= 0 && level < this.levels.length ? level : null;
        this.applyLevel();
    }

    // The isolated level keeps its colours and outlines; every other surface of the option
    // (other levels, floors, pools…) is hidden, and the other levels stay as halftone
    // outlines only. The context is left as it is.
    applyLevel() {
        const level = this.levels.length ? this.level : null;
        for (const o of this.shown) {
            if (o.userData.kind === "context") continue;
            o.traverse((node) => {
                if (node.userData.batch) return; // drawn by emphasise() only
                if (node.userData.outlineLevel != null) {
                    // outer outline of every other level; nothing when no level is isolated
                    node.visible = level != null && node.userData.outlineLevel !== level;
                } else if (node.isMesh) {
                    node.visible = level == null || (o.userData.kind === "analysis" && node.userData.level === level);
                } else if (node.isLine && node.userData.levelGeometries) {
                    node.userData.baseGeometry ||= node.geometry;
                    node.geometry = level == null ? node.userData.baseGeometry : node.userData.levelGeometries[level];
                } else if (node.isLine) {
                    node.visible = level == null; // outlines of another layer: hidden while isolating
                }
            });
        }
        this.dirty = true;
        this.onLevels(this.levels, level);
    }

    // The analysis object on screen, or null.
    analysisRoot() {
        return [...this.shown].find((o) => o.userData.kind === "analysis") || null;
    }

    // Emphasis inside the shown analysis: classify(mesh) returns "dim" (pushed back: plain light
    // grey, opaque, so stacked floors and towers behind each other do not add up into a smear of
    // their colours) or "hide"; anything else leaves the mesh as loaded. null resets every mesh.
    // hideOthers: also hide the option's other layers (cores, roofs…). The context is left alone.
    emphasise(classify, hideOthers = false) {
        const root = this.analysisRoot();
        for (const o of this.shown) if (o.userData.kind === "geometry") o.visible = !hideOthers;
        this.dirty = true;
        if (!classify) this.clipLines(null);
        if (!root) return;
        // One draw call per state instead of one per apartment (see buildBatch); the meshes
        // themselves stay in the scene, invisible, for picking. Without a batch: mesh by mesh.
        if (classify && root.userData.batch === undefined) root.userData.batch = buildBatch(root);
        const batch = root.userData.batch || null;
        root.traverse((node) => {
            if (!node.isMesh) return;
            if (node.userData.batch) {
                if (!classify) node.visible = false;
                return;
            }
            node.userData.baseMaterial ||= node.material;
            const how = classify ? classify(node) || "on" : null;
            node.userData.emphasis = how;
            node.visible = batch && classify ? false : how !== "hide";
            node.material = how === "dim" && !batch ? GHOST : node.userData.baseMaterial;
        });
        if (batch && classify) fillBatch(batch);
        this.renderer.render(this.scene, this.camera);
    }

    // Cut the analysis' outline lines above a height, region by region: regions = [{ box, top }]
    // (box: Box3, its x and z are used; top: a height, or null for no cut there). Every segment
    // follows the region nearest to its middle; one that crosses the top is shortened to it.
    // null puts the lines back as loaded.
    clipLines(regions) {
        const root = this.analysisRoot();
        if (!root) return;
        const active = !!regions && regions.some((r) => r.top != null);
        root.traverse((node) => {
            if (!node.isLineSegments || node.userData.outlineLevel != null) return;
            node.userData.baseGeometry ||= node.geometry;
            const base = node.userData.baseGeometry;
            if (node.userData.clipGeometry) {
                node.userData.clipGeometry.dispose();
                node.userData.clipGeometry = null;
            }
            if (!active) {
                node.geometry = base;
                return;
            }
            const pos = base.getAttribute("position");
            const col = base.getAttribute("color");
            const at = (i) => (base.index ? base.index.getX(i) : i);
            const n = base.index ? base.index.count : pos.count;
            let owner = node.userData.clipOwner;
            if (!owner || owner.regions !== regions.length) {
                const of = new Int16Array(n >> 1);
                for (let k = 0; k + 1 < n; k += 2) {
                    const a = at(k);
                    const b = at(k + 1);
                    const x = (pos.getX(a) + pos.getX(b)) / 2;
                    const z = (pos.getZ(a) + pos.getZ(b)) / 2;
                    let near = Infinity;
                    regions.forEach((r, i) => {
                        const dx = Math.max(r.box.min.x - x, 0, x - r.box.max.x);
                        const dz = Math.max(r.box.min.z - z, 0, z - r.box.max.z);
                        if (dx * dx + dz * dz < near) {
                            near = dx * dx + dz * dz;
                            of[k >> 1] = i;
                        }
                    });
                }
                owner = node.userData.clipOwner = { regions: regions.length, of };
            }
            const P = [];
            const C = [];
            for (let k = 0; k + 1 < n; k += 2) {
                const a = at(k);
                const b = at(k + 1);
                const top = regions[owner.of[k >> 1]].top;
                let ya = pos.getY(a);
                let yb = pos.getY(b);
                if (top != null) {
                    // above the cut, or rising from it: gone; the outline lying on the cut stays
                    if (Math.max(ya, yb) > top + LEVEL_EPS && Math.min(ya, yb) > top - LEVEL_EPS) continue;
                    ya = Math.min(ya, top);
                    yb = Math.min(yb, top);
                }
                P.push(pos.getX(a), ya, pos.getZ(a), pos.getX(b), yb, pos.getZ(b));
                if (col) for (const i of [a, b]) for (let c = 0; c < col.itemSize; c++) C.push(col.array[i * col.itemSize + c]);
            }
            const cut = new THREE.BufferGeometry();
            cut.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
            if (col) cut.setAttribute("color", new THREE.Float32BufferAttribute(C, col.itemSize));
            cut.userData.linearColors = true; // copied from the already converted colours
            node.userData.clipGeometry = cut;
            node.geometry = cut;
        });
        this.dirty = true;
    }

    // The pickable mesh under the pointer, or null.
    hit(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        POINTER.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        RAY.setFromCamera(POINTER, this.camera);
        const shown = (m) => (m.userData.emphasis ? m.userData.emphasis !== "hide" : m.visible);
        return RAY.intersectObjects(this.pickable.filter(shown), false)[0]?.object || null;
    }

    // Shift everything by the centre of the context (or of the first layer), once.
    centre(objects) {
        const ref = objects.find((o) => o.userData.kind === "context") || objects[0];
        this.root.position.set(0, 0, 0);
        this.root.updateMatrixWorld(true);
        const centre = new THREE.Box3().setFromObject(ref).getCenter(new THREE.Vector3());
        this.root.position.copy(centre).negate();
        this.root.updateMatrixWorld(true);
        this.centred = true;
    }

    // Frames the option's own layers (the context is much larger than the buildings).
    resetView() {
        const shown = [...this.shown];
        const own = shown.filter((o) => o.userData.kind !== "context");
        const box = new THREE.Box3();
        for (const o of own.length ? own : shown) box.expandByObject(o);
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const radius = box.getSize(new THREE.Vector3()).length() / 2;
        // fitWidth (Program tab): the narrower of the two half angles, so a tall, narrow view (table
        // docked beside the 3D) still shows the whole option. Every other view frames as before.
        const half = THREE.MathUtils.degToRad(this.camera.fov / 2);
        const distance = radius / Math.sin(this.fitWidth ? Math.min(half, Math.atan(Math.tan(half) * this.camera.aspect)) : half);
        const direction = new THREE.Vector3(1, 0.9, 1).normalize();
        this.camera.position.copy(center).addScaledVector(direction, distance * 0.62);
        this.camera.near = distance / 100;
        this.camera.far = distance * 20;
        this.camera.updateProjectionMatrix();
        this.controls.target.copy(center);
        this.controls.update();
        this.dirty = true;
        this.framed = true;
    }

    load(url, kind) {
        const key = `${kind}|${url}`;
        if (!this.cache.has(key)) {
            if (this.cache.size >= CACHE_SIZE) this.cache.delete(this.cache.keys().next().value);
            const file = /\.(glb|gltf)(\?|#|$)/i.test(url)
                ? new GLTFLoader().loadAsync(url).then((gltf) => gltf.scene)
                : fetch(url)
                      .then((r) => {
                          if (!r.ok) throw new Error(r.status + " " + r.statusText);
                          return r.json();
                      })
                      .then(parseLegacyScene);
            const promise = file.then((object) => prepare(object, kind));
            promise.catch(() => this.cache.delete(key));
            this.cache.set(key, promise);
        }
        return this.cache.get(key);
    }
}

// ---- Levels ----

// The base heights of an analysis made of whole floors (each mesh sits between one base and
// the next, like the unit mix: one mesh per apartment per floor), lowest first; [] otherwise.
// Marks every mesh with its level and splits outline lines into one geometry per level (a line
// on the floor between two levels belongs to both). Computed once per loaded file.
function findLevels(root) {
    if (!root) return [];
    if (root.userData.levels) return root.userData.levels;
    const meshes = [];
    const lines = [];
    root.traverse((n) => (n.isMesh ? meshes.push(n) : n.isLineSegments && lines.push(n)));
    const spans = meshes.map((m) => {
        m.geometry.computeBoundingBox();
        return [m.geometry.boundingBox.min.y, m.geometry.boundingBox.max.y];
    });
    const bases = [];
    for (const y of spans.map((s) => s[0]).sort((a, b) => a - b)) if (!bases.length || y - bases[bases.length - 1] > LEVEL_EPS) bases.push(y);
    const top = Math.max(...spans.map((s) => s[1]));
    const tops = bases.map((b, i) => (i + 1 < bases.length ? bases[i + 1] : top));
    const levelOf = (lo, hi) => {
        let i = bases.length - 1;
        while (i > 0 && bases[i] > lo + LEVEL_EPS) i--;
        return hi <= tops[i] + LEVEL_EPS ? i : -1;
    };
    const levels = spans.map(([lo, hi]) => levelOf(lo, hi));
    const ok = bases.length >= 2 && levels.every((i) => i >= 0);
    if (ok) {
        meshes.forEach((m, k) => (m.userData.level = levels[k]));
        // one outer outline per level, from all its pieces (apartments, cores, corridors)
        bases.forEach((b, i) => {
            const outline = new THREE.LineSegments(levelOutline(meshes.filter((m) => m.userData.level === i), b, tops[i]), HALFTONE);
            outline.userData.outlineLevel = i;
            outline.visible = false;
            root.add(outline);
        });
        for (const line of lines) {
            const pos = line.geometry.getAttribute("position");
            const per = bases.map(() => []);
            for (let k = 0; k + 1 < pos.count; k += 2) {
                const lo = Math.min(pos.getY(k), pos.getY(k + 1));
                const hi = Math.max(pos.getY(k), pos.getY(k + 1));
                bases.forEach((b, i) => lo >= b - LEVEL_EPS && hi <= tops[i] + LEVEL_EPS && per[i].push(k, k + 1));
            }
            line.userData.levelGeometries = per.map((index) => {
                const g = new THREE.BufferGeometry();
                for (const [name, attr] of Object.entries(line.geometry.attributes)) g.setAttribute(name, attr);
                g.setIndex(index);
                return g;
            });
        }
    }
    root.userData.levels = ok ? bases : [];
    return root.userData.levels;
}

// The outer outline of one level: the boundary of the union of its pieces' top faces, drawn
// at the bottom and top of the level, with vertical edges where the outline turns.
//  1. each piece's top-face boundary (edges used by one top triangle of that piece)
//  2. all of them split wherever another endpoint lies on them (a corridor's long side
//     against several apartments), so shared stretches match exactly
//  3. a stretch found twice is a wall between two pieces: dropped; once is outside: kept
function levelOutline(meshes, y0, y1) {
    const Q = 100; // 1 cm
    const k2 = (x, z) => Math.round(x * Q) + "," + Math.round(z * Q);
    const pairKey = (ka, kb) => (ka < kb ? ka + "|" + kb : kb + "|" + ka);
    const segs = [];
    for (const mesh of meshes) {
        const g = mesh.geometry;
        const pos = g.getAttribute("position");
        const top = g.boundingBox.max.y;
        const at = (i) => (g.index ? g.index.getX(i) : i);
        const n = g.index ? g.index.count : pos.count;
        const edges = new Map();
        for (let t = 0; t + 2 < n; t += 3) {
            const v = [at(t), at(t + 1), at(t + 2)];
            if (!v.every((i) => Math.abs(pos.getY(i) - top) < 0.01)) continue;
            for (let e = 0; e < 3; e++) {
                const a = v[e];
                const b = v[(e + 1) % 3];
                const ka = k2(pos.getX(a), pos.getZ(a));
                const kb = k2(pos.getX(b), pos.getZ(b));
                if (ka === kb) continue;
                const key = pairKey(ka, kb);
                const hit = edges.get(key);
                if (hit) hit.n++;
                else edges.set(key, { n: 1, s: [pos.getX(a), pos.getZ(a), pos.getX(b), pos.getZ(b)] });
            }
        }
        for (const e of edges.values()) if (e.n === 1) segs.push(e.s);
    }
    // endpoints on a 1 m grid, to find the ones lying on each segment
    const grid = new Map();
    const seen = new Set();
    for (const s of segs) {
        for (const p of [[s[0], s[1]], [s[2], s[3]]]) {
            const k = k2(p[0], p[1]);
            if (seen.has(k)) continue;
            seen.add(k);
            const c = Math.floor(p[0]) + "," + Math.floor(p[1]);
            if (!grid.has(c)) grid.set(c, []);
            grid.get(c).push(p);
        }
    }
    const count = new Map();
    for (const [x1, z1, x2, z2] of segs) {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const len2 = dx * dx + dz * dz;
        const cuts = [0, 1];
        for (let gx = Math.floor(Math.min(x1, x2)); gx <= Math.floor(Math.max(x1, x2)); gx++) {
            for (let gz = Math.floor(Math.min(z1, z2)); gz <= Math.floor(Math.max(z1, z2)); gz++) {
                for (const [px, pz] of grid.get(gx + "," + gz) || []) {
                    const t = ((px - x1) * dx + (pz - z1) * dz) / len2;
                    if (t <= 1e-6 || t >= 1 - 1e-6) continue;
                    const ex = x1 + t * dx - px;
                    const ez = z1 + t * dz - pz;
                    if (ex * ex + ez * ez < 1e-4) cuts.push(t);
                }
            }
        }
        cuts.sort((a, b) => a - b);
        for (let c = 0; c + 1 < cuts.length; c++) {
            const a = [x1 + cuts[c] * dx, z1 + cuts[c] * dz];
            const b = [x1 + cuts[c + 1] * dx, z1 + cuts[c + 1] * dz];
            const ka = k2(a[0], a[1]);
            const kb = k2(b[0], b[1]);
            if (ka === kb) continue;
            const key = pairKey(ka, kb);
            const hit = count.get(key);
            if (hit) hit.n++;
            else count.set(key, { n: 1, a, b, ka, kb });
        }
    }
    const out = [];
    const ends = new Map(); // point key -> directions of the kept stretches leaving it
    const dirFrom = (p, q) => {
        const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
        return [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
    };
    for (const { n, a, b, ka, kb } of count.values()) {
        if (n !== 1) continue;
        out.push(a[0], y0, a[1], b[0], y0, b[1], a[0], y1, a[1], b[0], y1, b[1]);
        for (const [k, p, q] of [[ka, a, b], [kb, b, a]]) {
            if (!ends.has(k)) ends.set(k, { p, dirs: [] });
            ends.get(k).dirs.push(dirFrom(p, q));
        }
    }
    // a straight continuation has opposite directions (dot close to -1)
    const straight = -Math.cos(THREE.MathUtils.degToRad(CORNER_ANGLE));
    for (const { p, dirs } of ends.values()) {
        const turns = dirs.length !== 2 || dirs[0][0] * dirs[1][0] + dirs[0][1] * dirs[1][1] > straight;
        if (turns) out.push(p[0], y0, p[1], p[0], y1, p[1]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
    return geometry;
}

// ---- Materials and colors ----

// Colored layers carry their colors per vertex (COLOR_0). The exports pair them with a
// white (layered export) or black (older Rhino export) material; glTF multiplies the two, so the
// material is replaced. Analysis layers are unlit so the colors match the legend.
function prepare(root, kind) {
    root.userData.kind = kind;
    // The analysis sits exactly on surfaces of other layers (floors, masses): the depth
    // offset draws it in front of them there, instead of flickering white patches.
    const make = (vertexColors) =>
        kind === "analysis"
            ? new THREE.MeshBasicMaterial({ vertexColors, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 })
            : new THREE.MeshLambertMaterial({ vertexColors, side: THREE.DoubleSide });
    const materials = {};
    root.traverse((node) => {
        if (node.isLine && kind === "analysis") {
            node.material = toLinearColors(node.geometry) ? edgeLines.colored : edgeLines.plain;
            return;
        }
        if (!node.isMesh) return;
        const colored = toLinearColors(node.geometry);
        if (colored || kind !== "geometry") node.material = materials[colored] ||= make(colored);
    });
    if (kind !== "analysis") mergeSiblings(root); // analyses keep their meshes apart (levels, picking)
    return root;
}

// Vertex buffers of several geometries end to end (position, plus normal and color when all of
// them have it), with one index over the whole: ranges[k] = [start, count] of geometry k in it.
function joinGeometries(list) {
    const names = ["position", "normal", "color"].filter((n) => list.every((g) => g.getAttribute(n)));
    if (!names.includes("position")) return null;
    const size = Object.fromEntries(names.map((n) => [n, list[0].getAttribute(n).itemSize]));
    if (names.some((n) => list.some((g) => g.getAttribute(n).itemSize !== size[n]))) return null;
    let vertices = 0;
    let indices = 0;
    for (const g of list) {
        vertices += g.getAttribute("position").count;
        indices += g.index ? g.index.count : g.getAttribute("position").count;
    }
    const arrays = Object.fromEntries(names.map((n) => [n, new Float32Array(vertices * size[n])]));
    const index = new Uint32Array(indices);
    const ranges = [];
    let v = 0;
    let i = 0;
    for (const g of list) {
        const count = g.getAttribute("position").count;
        for (const n of names) {
            const a = g.getAttribute(n);
            const s = size[n];
            if (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute) arrays[n].set(a.array.subarray(0, count * s), v * s);
            else for (let k = 0; k < count; k++) for (let c = 0; c < s; c++) arrays[n][(v + k) * s + c] = a.getComponent(k, c);
        }
        const start = i;
        if (g.index) for (let k = 0; k < g.index.count; k++) index[i++] = v + g.index.getX(k);
        else for (let k = 0; k < count; k++) index[i++] = v + k;
        ranges.push([start, i - start]);
        v += count;
    }
    const attributes = Object.fromEntries(names.map((n) => [n, new THREE.BufferAttribute(arrays[n], size[n])]));
    return { attributes, index, ranges, colored: names.includes("color") };
}

function joinedGeometry(joined, index) {
    const g = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(joined.attributes)) g.setAttribute(name, attribute);
    g.setIndex(new THREE.BufferAttribute(index, 1));
    if (joined.colored) g.userData.linearColors = true; // copied from already converted colours
    return g;
}

const unmoved = (o) => o.position.lengthSq() === 0 && o.quaternion.x === 0 && o.quaternion.y === 0 && o.quaternion.z === 0 && o.scale.x === 1 && o.scale.y === 1 && o.scale.z === 1;

// A glTF mesh with many primitives loads as one object per primitive: thousands of draw calls
// for a layer that is one thing (1,600 apartments and balconies, 300 core pieces…). The sibling
// meshes that share a material and the same attributes become one mesh under the same parent,
// which keeps the glTF node name for the per-node settings (overlay opacity).
function mergeSiblings(root) {
    const parents = new Map();
    root.traverse((n) => {
        if (!n.isMesh || !n.parent || Array.isArray(n.material) || n.material.map || n.isSkinnedMesh || n.isInstancedMesh) return;
        if (!unmoved(n) || n.children.length || !n.geometry.getAttribute("position")) return;
        if (!parents.has(n.parent)) parents.set(n.parent, new Map());
        const key = n.material.uuid + "|" + ["normal", "color"].map((a) => n.geometry.getAttribute(a)?.itemSize || 0).join(",");
        const groups = parents.get(n.parent);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(n);
    });
    for (const [parent, groups] of parents) {
        for (const meshes of groups.values()) {
            if (meshes.length < 2) continue;
            const joined = joinGeometries(meshes.map((m) => m.geometry));
            if (!joined) continue;
            const mesh = new THREE.Mesh(joinedGeometry(joined, joined.index), meshes[0].material);
            mesh.name = parent.name;
            parent.add(mesh);
            for (const m of meshes) {
                parent.remove(m);
                m.geometry.dispose();
            }
        }
    }
}

// Program tab: every mesh of the analysis in shared vertex buffers, drawn by one mesh per
// original material ("as loaded") and one ghost mesh, each with the index ranges of the meshes
// in that state (fillBatch). null when the file is not made for it.
function buildBatch(root) {
    const meshes = [];
    let plain = true;
    root.traverse((n) => {
        if (!n.isMesh) return;
        meshes.push(n);
        for (let o = n; o && o !== root; o = o.parent) plain &&= unmoved(o);
    });
    if (!plain || meshes.length < 2 || meshes.some((m) => !m.geometry.getAttribute("normal"))) return null;
    const joined = joinGeometries(meshes.map((m) => m.geometry));
    if (!joined) return null;
    const make = (material) => {
        const mesh = new THREE.Mesh(joinedGeometry(joined, new Uint32Array(joined.index.length)), material);
        mesh.frustumCulled = false; // its extent changes with every selection
        mesh.userData.batch = true;
        mesh.visible = false;
        root.add(mesh);
        return mesh;
    };
    const on = new Map();
    const items = meshes.map((mesh, k) => {
        const material = mesh.userData.baseMaterial || mesh.material;
        if (!on.has(material)) on.set(material, make(material));
        return { mesh, material, start: joined.ranges[k][0], count: joined.ranges[k][1] };
    });
    return { items, index: joined.index, on, ghost: make(GHOST) };
}

function fillBatch(batch) {
    const drawn = [...batch.on.values(), batch.ghost];
    for (const mesh of drawn) mesh.userData.filled = 0;
    for (const item of batch.items) {
        const how = item.mesh.userData.emphasis;
        const target = how === "hide" ? null : how === "dim" ? batch.ghost : batch.on.get(item.material);
        if (!target) continue;
        target.geometry.index.array.set(batch.index.subarray(item.start, item.start + item.count), target.userData.filled);
        target.userData.filled += item.count;
    }
    for (const mesh of drawn) {
        mesh.geometry.index.needsUpdate = true;
        mesh.geometry.setDrawRange(0, mesh.userData.filled);
        mesh.visible = mesh.userData.filled > 0;
    }
}

// Edge lines of an analysis (the unit outlines) lie exactly on its faces, which the offset
// above pulls towards the camera; polygon offset does not apply to lines, so they are pulled
// further instead: along their own view ray (same pixel, nearer depth), by a fraction of their
// distance so the margin follows the zoom. Lines cannot be drawn thinner than 1 px, so they
// are half transparent to read lighter.
const EDGE_PULL = 0.004;
const EDGE_OPACITY = 0.45;
const edgeLines = { colored: edgeLineMaterial(true), plain: edgeLineMaterial(false) };

function edgeLineMaterial(vertexColors) {
    const material = new THREE.LineBasicMaterial({
        vertexColors,
        color: vertexColors ? 0xffffff : 0x000000,
        transparent: EDGE_OPACITY < 1,
        opacity: EDGE_OPACITY,
        depthWrite: false,
    });
    material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
            "#include <project_vertex>",
            `#include <project_vertex>\n\tgl_Position = projectionMatrix * vec4( mvPosition.xyz * ${1 - EDGE_PULL}, 1.0 );`
        );
    };
    return material;
}

// Exports write sRGB colors (as picked in Grasshopper) where glTF expects linear ones:
// byte colors, and floats that are exact n/255 values, are converted once.
function toLinearColors(geometry) {
    const attr = geometry.getAttribute("color");
    if (!attr) return false;
    if (geometry.userData.linearColors) return true;
    if (!(attr.array instanceof Float32Array) || isByteColor(attr.array)) {
        const n = attr.itemSize;
        const out = new Float32Array(attr.count * n);
        const c = new THREE.Color();
        for (let i = 0; i < attr.count; i++) {
            c.setRGB(attr.getX(i), attr.getY(i), attr.getZ(i), THREE.SRGBColorSpace);
            out[i * n] = c.r;
            out[i * n + 1] = c.g;
            out[i * n + 2] = c.b;
            if (n === 4) out[i * n + 3] = attr.getW(i);
        }
        geometry.setAttribute("color", new THREE.BufferAttribute(out, n));
    }
    geometry.userData.linearColors = true;
    return true;
}

function isByteColor(array) {
    const step = Math.max(1, Math.floor(array.length / 5000));
    for (let i = 0; i < array.length; i += step) {
        const v = array[i] * 255;
        if (Math.abs(v - Math.round(v)) > 1e-3) return false;
    }
    return true;
}

// A translucent overlay: the layer opacity on every mesh, then `nodeOpacity` ({glTF node name:
// opacity}) on the meshes under those nodes. Overridden meshes get their own material (prepare()
// shares one material per file), cloned once per loaded file.
function setOverlayOpacity(root, { opacity = 1, nodeOpacity = null }) {
    setOpacity(root, opacity);
    if (!nodeOpacity) return;
    root.traverse((node) => {
        const value = nodeOpacity[node.name];
        if (value == null) return;
        node.traverse((mesh) => {
            if (!mesh.isMesh) return;
            if (!mesh.userData.ownMaterial) {
                mesh.material = mesh.material.clone();
                mesh.userData.ownMaterial = true;
            }
            mesh.material.transparent = value < 1;
            mesh.material.opacity = value;
            mesh.material.depthWrite = value >= 1;
        });
    });
}

const RAY = new THREE.Raycaster();
const POINTER = new THREE.Vector2();
// Pushed-back meshes (see Viewer.emphasise): lit light grey, with the analysis' depth offset.
const GHOST = new THREE.MeshLambertMaterial({ color: 0xdfe2df, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });

function setOpacity(root, opacity) {
    root.traverse((node) => {
        if (!node.isMesh) return;
        node.material.transparent = opacity < 1;
        node.material.opacity = opacity;
        node.material.depthWrite = opacity >= 1; // a faded context must not hide the analysis
    });
}

// ---- Legacy three.js JSON (format 3 geometries inside an object scene) ----

function parseLegacyScene(json) {
    const geometries = new Map(
        (json.geometries || []).map((g) => [g.uuid, legacyGeometry(g.data || g)])
    );
    const material = new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
    });
    const root = new THREE.Group();
    const children = json.object?.children || [];
    for (const child of children) {
        const geometry = geometries.get(child.geometry);
        if (!geometry) continue;
        const mesh = new THREE.Mesh(geometry, material);
        if (child.matrix) {
            mesh.matrix.fromArray(child.matrix);
            mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
        }
        root.add(mesh);
    }
    return root;
}

function legacyGeometry(data) {
    const vertices = data.vertices || [];
    const faces = data.faces || [];
    const scale = data.scale ? 1 / data.scale : 1;
    const colors = (data.colors || []).map((c) => new THREE.Color(c));
    const uvLayers = (data.uvs || []).filter((layer) => layer && layer.length).length;
    const white = new THREE.Color(1, 1, 1);
    const position = [];
    const color = [];

    let i = 0;
    while (i < faces.length) {
        const type = faces[i++];
        const quad = type & 1;
        const n = quad ? 4 : 3;
        const idx = faces.slice(i, i + n);
        i += n;
        if (type & 2) i++; // material index
        if (type & 4) i += uvLayers; // face uv
        if (type & 8) i += n * uvLayers; // face vertex uvs
        if (type & 16) i++; // face normal
        if (type & 32) i += n; // face vertex normals
        let faceColor = null;
        let vertexColors = null;
        if (type & 64) faceColor = colors[faces[i++]];
        if (type & 128) {
            vertexColors = faces.slice(i, i + n).map((k) => colors[k]);
            i += n;
        }
        const triangles = quad ? [0, 1, 3, 1, 2, 3] : [0, 1, 2];
        for (const k of triangles) {
            const v = idx[k] * 3;
            position.push(vertices[v] * scale, vertices[v + 1] * scale, vertices[v + 2] * scale);
            const c = (vertexColors && vertexColors[k]) || faceColor || white;
            color.push(c.r, c.g, c.b);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));
    geometry.userData.linearColors = true; // THREE.Color already converted the hex colors
    geometry.computeVertexNormals();
    return geometry;
}
