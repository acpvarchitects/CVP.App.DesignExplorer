// 3D viewer: loads GLB/glTF (analysis meshes with vertex colors) and the
// legacy three.js JSON models already used by the classic Design Explorer.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const CACHE_SIZE = 8;

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

        this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100000);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        this.cache = new Map(); // url -> Promise<Object3D>
        this.current = null;
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

    // Shows the model at `url`. The camera is kept between options so that
    // every option is seen from the same point of view.
    async show(url) {
        const request = ++this.request;
        this.onStatus("Loading 3D model…");
        try {
            const object = await this.load(url);
            if (request !== this.request) return;
            if (this.current) this.scene.remove(this.current);
            this.current = object;
            this.scene.add(object);
            if (!this.framed) this.resetView();
            this.onStatus("");
        } catch (err) {
            if (request !== this.request) return;
            console.error("3D load failed", url, err);
            this.onStatus("Couldn't load this 3D file.");
        }
    }

    clear() {
        this.request++;
        if (this.current) this.scene.remove(this.current);
        this.current = null;
        this.onStatus("");
    }

    resetView() {
        if (!this.current) return;
        const box = new THREE.Box3().setFromObject(this.current);
        const center = box.getCenter(new THREE.Vector3());
        const radius = box.getSize(new THREE.Vector3()).length() / 2;
        const distance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
        const direction = new THREE.Vector3(1, 0.9, 1).normalize();
        this.camera.position.copy(center).addScaledVector(direction, distance * 0.8);
        this.camera.near = distance / 100;
        this.camera.far = distance * 10;
        this.camera.updateProjectionMatrix();
        this.controls.target.copy(center);
        this.controls.update();
        this.framed = true;
    }

    load(url) {
        if (!this.cache.has(url)) {
            if (this.cache.size >= CACHE_SIZE) {
                const oldest = this.cache.keys().next().value;
                this.cache.delete(oldest);
            }
            const promise = /\.(glb|gltf)(\?|#|$)/i.test(url)
                ? new GLTFLoader().loadAsync(url).then((gltf) => useVertexColors(gltf.scene))
                : fetch(url)
                      .then((r) => {
                          if (!r.ok) throw new Error(r.status + " " + r.statusText);
                          return r.json();
                      })
                      .then(parseLegacyScene);
            promise.catch(() => this.cache.delete(url));
            this.cache.set(url, promise);
        }
        return this.cache.get(url);
    }
}

// ---- GLB analysis meshes ----

// Analysis meshes carry their result as vertex colors. Rhino's exporter pairs
// them with a black material (glTF multiplies the two, so the mesh renders
// black) and writes sRGB byte values (n/255) where glTF expects linear ones.
function useVertexColors(root) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    root.traverse((node) => {
        const colors = node.isMesh && node.geometry.getAttribute("color");
        if (!colors) return;
        if (colors.array instanceof Float32Array && isByteColor(colors.array)) {
            const c = new THREE.Color();
            for (let i = 0; i < colors.count; i++) {
                c.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i), THREE.SRGBColorSpace);
                colors.setXYZ(i, c.r, c.g, c.b);
            }
            colors.needsUpdate = true;
        }
        node.material = material;
    });
    return root;
}

function isByteColor(array) {
    const step = Math.max(1, Math.floor(array.length / 5000));
    for (let i = 0; i < array.length; i += step) {
        const v = array[i] * 255;
        if (Math.abs(v - Math.round(v)) > 1e-3) return false;
    }
    return true;
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
    geometry.computeVertexNormals();
    return geometry;
}
