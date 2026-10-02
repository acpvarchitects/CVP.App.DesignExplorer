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

export class Viewer {
    constructor(container, onStatus) {
        this.container = container;
        this.onStatus = onStatus || (() => {});
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

        this.cache = new Map(); // "kind|url" -> Promise<Object3D>
        this.shown = new Set(); // objects currently in the scene
        this.centred = false;
        this.framed = false;
        this.request = 0;

        new ResizeObserver(() => this.resize()).observe(container);
        this.renderer.setAnimationLoop(() => {
            if (!this.container.offsetParent) return; // hidden: skip rendering
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        });
    }

    resize() {
        const { clientWidth: w, clientHeight: h } = this.container;
        if (!w || !h) return;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    // One file on its own (legacy studies, single-file analysis).
    show(url, kind = "geometry") {
        return this.compose([{ url, kind }]);
    }

    // Shows exactly these layers. The camera is kept between calls, so every
    // option is seen from the same point of view.
    async compose(parts, { fadeContext = false } = {}) {
        const request = ++this.request;
        this.onStatus("Loading 3D model…");
        const loaded = await Promise.allSettled(parts.map((p) => this.load(p.url, p.kind)));
        if (request !== this.request) return;

        const objects = [];
        loaded.forEach((l, i) => {
            if (l.status === "fulfilled") objects.push(l.value);
            else console.error("3D load failed", parts[i].url, l.reason);
        });
        for (const o of this.shown) this.root.remove(o);
        this.shown = new Set(objects);
        for (const o of objects) {
            this.root.add(o);
            if (o.userData.kind === "context") setOpacity(o, fadeContext ? CONTEXT_FADE : 1);
        }
        if (objects.length && !this.centred) this.centre(objects);
        if (objects.length && !this.framed) this.resetView();

        const failed = parts.length - objects.length;
        this.onStatus(!objects.length ? "Couldn't load this 3D file." : failed ? `${failed} of ${parts.length} layers couldn't load.` : "");
    }

    clear() {
        this.request++;
        for (const o of this.shown) this.root.remove(o);
        this.shown.clear();
        this.onStatus("");
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
        const distance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
        const direction = new THREE.Vector3(1, 0.9, 1).normalize();
        this.camera.position.copy(center).addScaledVector(direction, distance * 0.62);
        this.camera.near = distance / 100;
        this.camera.far = distance * 20;
        this.camera.updateProjectionMatrix();
        this.controls.target.copy(center);
        this.controls.update();
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
    return root;
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
