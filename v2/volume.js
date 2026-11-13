// Dense 3D field of a study (layers[] kind "analysis", dim "3d"): volume.json + field.bin.
//   volume.json  grid { dimensions [nx,ny,nz], spacing_m [sx,sy,sz] }, buffers [{ key, file, dtype,
//                byteOffset, count }] (float32 fields and a uint8 "mask"), coordinates.worldOriginRhino_m
//   node (i,j,k) sits at (i*sx, j*sy, k*sz) local metres, Z up; index = i + nx*(j + ny*k)
//   mask 0 = valid outdoor point; anything else is excluded (outside, below ground, inside a building)
// Values are interpolated (trilinear) between valid nodes only. Two readings:
//   strict  every contributing node must be valid, the rest stays empty (the receivers as computed)
//   filled  the valid nodes of the cell are enough (their weights are rescaled): the field reaches
//           the ground and the walls instead of stopping one grid step before them. Used by the
//           colour maps, which are then covered by the cut geometry; a cell with no valid node stays empty.
//   const vol = await loadVolume(base, "volume.json")
//   vol.sample("exposure", x, y, z, filled)         -> value | NaN
// A slice also marks the excluded space that lies under an analysed point (below the ground, inside
// a building: there is a valid node higher up in the same column): `excluded`, one byte per pixel.
// The view paints it as solid up to the cut geometry (volumeview.js, sealVoids).
//   vol.plan("exposure", legend, z)                 -> { w, h, canvas, excluded }, row 0 = north edge
//   vol.section("exposure", legend, [ax,ay], [bx,by]) -> { w, h, canvas, excluded }, A on the left, row 0 = top

const PLAN_PX_PER_CELL = 4; // raster resolution of a slice, in pixels per grid step
const SECTION_PX_PER_CELL = 8; // vertical resolution of a section (it is seen much closer)
const EPS = 1e-4; // a node with a smaller weight does not contribute
const MIN_VALID = 1e-3; // filled reading: the least total weight of valid nodes

export async function loadVolume(base, file) {
    const get = async (name, kind) => {
        const r = await fetch(base + name);
        if (!r.ok) throw new Error(`${name}: ${r.status} ${r.statusText}`);
        return r[kind]();
    };
    const meta = await get(file, "json");
    const files = new Map();
    for (const b of meta.buffers) if (!files.has(b.file)) files.set(b.file, get(b.file, "arrayBuffer"));
    const fields = {};
    let mask = null;
    for (const b of meta.buffers) {
        const data = await files.get(b.file);
        const bytes = data.slice(b.byteOffset, b.byteOffset + b.byteLength); // copy: float views need alignment
        if (b.key === "mask") mask = new Uint8Array(bytes);
        else fields[b.key] = new Float32Array(bytes);
    }
    return new Volume(meta, fields, mask);
}

export class Volume {
    constructor(meta, fields, mask) {
        const [nx, ny, nz] = meta.grid.dimensions;
        const [sx, sy, sz] = meta.grid.spacing_m;
        Object.assign(this, { meta, fields, nx, ny, nz, sx, sy, sz });
        this.mask = mask || new Uint8Array(nx * ny * nz);
        this.size = [(nx - 1) * sx, (ny - 1) * sy, (nz - 1) * sz]; // metres covered by the nodes
        this.worldZ = meta.coordinates?.worldOriginRhino_m?.[2] ?? 0; // model elevation of local z = 0
    }

    // The highest valid node of every column (-1: none): what is excluded below it is ground or building.
    tops() {
        if (!this.top) {
            const { nx, ny, nz, mask } = this;
            this.top = new Int16Array(nx * ny).fill(-1);
            for (let n = 0; n < nx * ny; n++) for (let k = nz - 1; k >= 0; k--) if (mask[n + nx * ny * k] === 0) {
                this.top[n] = k;
                break;
            }
        }
        return this.top;
    }

    // A plan elevation where most of the site is analysed: one step above the median ground node.
    defaultElevation() {
        const { nx, ny, nz, mask } = this;
        const lowest = [];
        for (let n = 0; n < nx * ny; n++) {
            let k = 0;
            while (k < nz && mask[n + nx * ny * k] !== 0) k++;
            if (k < nz) lowest.push(k);
        }
        lowest.sort((a, b) => a - b);
        const k = Math.min((lowest[lowest.length >> 1] ?? 0) + 1, nz - 1);
        return k * this.sz;
    }

    sample(key, x, y, z, filled = false) {
        const f = this.fields[key];
        const { nx, ny, nz, mask } = this;
        const gx = x / this.sx, gy = y / this.sy, gz = z / this.sz;
        if (!f || gx < -EPS || gy < -EPS || gz < -EPS || gx > nx - 1 + EPS || gy > ny - 1 + EPS || gz > nz - 1 + EPS) return NaN;
        const i = Math.min(Math.max(Math.floor(gx), 0), nx - 2), j = Math.min(Math.max(Math.floor(gy), 0), ny - 2), k = Math.min(Math.max(Math.floor(gz), 0), nz - 2);
        const fx = gx - i, fy = gy - j, fz = gz - k;
        let sum = 0, valid = 0;
        for (let c = 0; c < 8; c++) {
            const w = (c & 1 ? fx : 1 - fx) * (c & 2 ? fy : 1 - fy) * (c & 4 ? fz : 1 - fz);
            if (w < EPS) continue;
            const n = i + (c & 1) + nx * (j + ((c >> 1) & 1) + ny * (k + (c >> 2)));
            if (mask[n] !== 0) {
                if (!filled) return NaN;
                continue;
            }
            sum += w * f[n];
            valid += w;
        }
        return valid > MIN_VALID ? sum / valid : NaN;
    }

    // The valid nodes, thinned: [x, y, z, value] * n (local metres).
    nodes(key, every = 1) {
        const f = this.fields[key], { nx, ny, nz, mask } = this;
        const out = [];
        for (let k = 0; k < nz; k += every) for (let j = 0; j < ny; j += every) for (let i = 0; i < nx; i += every) {
            const n = i + nx * (j + ny * k);
            if (mask[n] === 0) out.push(i * this.sx, j * this.sy, k * this.sz, f[n]);
        }
        return new Float32Array(out);
    }

    // Colour map of a planar slice, as RGBA pixels: pixel (px, py) is the point
    // origin + u*(px+0.5) + v*(py+0.5) (metres). Empty where the mask excludes: alpha 0.
    // excluded: Uint8Array(w * h) | null, set to 1 where nothing is analysed under an analysed point.
    raster(key, legend, origin, u, v, w, h, filled = true, excluded = null) {
        const f = this.fields[key];
        const { nx, ny, nz, mask } = this;
        const out = new Uint8ClampedArray(w * h * 4);
        if (!f) return out;
        const lut = colourLut(legend);
        const last = lut.length / 3 - 1;
        const scale = last / (legend.max - legend.min || 1);
        const [ux, uy, uz] = [u[0] / this.sx, u[1] / this.sy, u[2] / this.sz];
        const [vx, vy, vz] = [v[0] / this.sx, v[1] / this.sy, v[2] / this.sz];
        const ox = origin[0] / this.sx + (ux + vx) / 2, oy = origin[1] / this.sy + (uy + vy) / 2, oz = origin[2] / this.sz + (uz + vz) / 2;
        const mx = nx - 1 + EPS, my = ny - 1 + EPS, mz = nz - 1 + EPS;
        const row = nx, slab = nx * ny;
        const top = excluded ? this.tops() : null;
        for (let py = 0; py < h; py++) {
            for (let px = 0; px < w; px++) {
                const gx = ox + ux * px + vx * py, gy = oy + uy * px + vy * py, gz = oz + uz * px + vz * py;
                if (gx < -EPS || gy < -EPS || gz < -EPS || gx > mx || gy > my || gz > mz) continue;
                let i = gx | 0, j = gy | 0, k = gz | 0;
                if (i > nx - 2) i = nx - 2;
                if (j > ny - 2) j = ny - 2;
                if (k > nz - 2) k = nz - 2;
                const fx = gx - i, fy = gy - j, fz = gz - k;
                const n = i + row * j + slab * k;
                let sum = 0, valid = 0, ok = true;
                for (let c = 0; c < 8; c++) {
                    const wgt = (c & 1 ? fx : 1 - fx) * (c & 2 ? fy : 1 - fy) * (c & 4 ? fz : 1 - fz);
                    if (wgt < EPS) continue;
                    const m = n + (c & 1) + (c & 2 ? row : 0) + (c & 4 ? slab : 0);
                    if (mask[m] !== 0) {
                        if (filled) continue;
                        ok = false;
                        break;
                    }
                    sum += wgt * f[m];
                    valid += wgt;
                }
                const o = (px + py * w) * 4;
                if (!ok || valid <= MIN_VALID) {
                    // nothing analysed here: ground or building if an analysed point lies above in this column
                    if (excluded && top[Math.min(Math.round(gx), nx - 1) + row * Math.min(Math.round(gy), ny - 1)] > gz) excluded[px + py * w] = 1;
                    continue;
                }
                sum /= valid;
                let t = Math.round((sum - legend.min) * scale);
                t = (t < 0 ? 0 : t > last ? last : t) * 3;
                out[o] = lut[t];
                out[o + 1] = lut[t + 1];
                out[o + 2] = lut[t + 2];
                out[o + 3] = 255;
            }
        }
        return out;
    }

    // Horizontal slice at local height z over the whole grid, north at the top.
    plan(key, legend, z) {
        const [lx, ly] = this.size;
        const w = (this.nx - 1) * PLAN_PX_PER_CELL, h = (this.ny - 1) * PLAN_PX_PER_CELL;
        const excluded = new Uint8Array(w * h);
        return slice(this.raster(key, legend, [0, ly, z], [lx / w, 0, 0], [0, -ly / h, 0], w, h, true, excluded), w, h, excluded);
    }

    // Vertical slice from a to b (plan points), over the whole height.
    section(key, legend, a, b) {
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const lz = this.size[2];
        const w = Math.max(2, Math.round((length / this.sx) * PLAN_PX_PER_CELL)), h = (this.nz - 1) * SECTION_PX_PER_CELL;
        const u = [(b[0] - a[0]) / w, (b[1] - a[1]) / w, 0];
        const excluded = new Uint8Array(w * h);
        return slice(this.raster(key, legend, [a[0], a[1], lz], u, [0, 0, -lz / h], w, h, true, excluded), w, h, excluded);
    }
}

// Legend colours as a lookup table (linear between the colours, as the legend bar): [r,g,b]*n.
const luts = new Map();
export function colourLut(legend, n = 1024) {
    const id = legend.colors.join() + n;
    if (!luts.has(id)) {
        const cols = legend.colors.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
        const lut = new Uint8Array(n * 3);
        for (let s = 0; s < n; s++) {
            const t = (s / (n - 1)) * (cols.length - 1);
            const i = Math.min(Math.floor(t), cols.length - 2);
            for (let c = 0; c < 3; c++) lut[s * 3 + c] = Math.round(cols[i][c] + (cols[i + 1][c] - cols[i][c]) * (t - i));
        }
        luts.set(id, lut);
    }
    return luts.get(id);
}

// A slice: the canvas, for 2D drawing, and its excluded pixels.
function slice(px, w, h, excluded) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").putImageData(new ImageData(px, w, h), 0, 0);
    return { w, h, canvas, excluded };
}

// RGBA pixels for a texture: the empty pixels next to a coloured one take its colour (still
// alpha 0), so filtering across the edge of the field does not darken it (a canvas cannot keep
// a colour under alpha 0).
export function texturePixels(px, w, h) {
    const pixels = new Uint8Array(px);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const o = (x + y * w) * 4;
            if (px[o + 3]) continue;
            for (const [dx, dy] of NEIGHBOURS) {
                const xx = x + dx, yy = y + dy;
                if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                const q = (xx + yy * w) * 4;
                if (!px[q + 3]) continue;
                pixels[o] = px[q];
                pixels[o + 1] = px[q + 1];
                pixels[o + 2] = px[q + 2];
                break;
            }
        }
    }
    return pixels;
}
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
