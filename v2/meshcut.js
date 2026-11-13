// Cuts of a triangle model by a plane, for the 2D plan and section of a volume study and for the
// section planes in 3D. A cut solid gives closed outlines, which are filled; an open surface gives
// open lines, which are only drawn.
//   parts: [{ soft, pos: Float32Array xyz, index | null, d: Float32Array(vertices) }]  (soft = canopies)
//   cutModel(parts, o, e1, e2, n) -> { main: { loops, open }, soft: { loops, open } }
//     in the plane's own 2D coordinates (along e1 and e2 from o);
//     loops: [{ p: Float32Array [x, y, …], box: [x0, y0, x1, y1] }], open: Float32Array [x1, y1, x2, y2, …]
//   insideLoops(loops, x, y) -> the point is inside one of the outlines
//   edgesBelow(edges, z)     -> the edge lines lying below a plan's height, seen from above

const SNAP = 1000; // geometric endpoint tolerance: 1 mm

export function cutModel(parts, o, e1, e2, n) {
    const out = { main: { loops: [], open: [] }, soft: { loops: [], open: [] } };
    const no = n[0] * o[0] + n[1] * o[1] + n[2] * o[2];
    for (const part of parts) {
        const { pos, index, d } = part;
        let any = 0;
        for (let v = 0, i = 0; v < d.length; v++, i += 3) {
            d[v] = pos[i] * n[0] + pos[i + 1] * n[1] + pos[i + 2] * n[2] - no;
            any |= d[v] >= 0 ? 1 : 2;
        }
        if (any !== 3) continue; // the whole layer is on one side
        const segs = [];
        const count = index ? index.length : d.length;
        for (let t = 0; t + 2 < count; t += 3) {
            const i0 = index ? index[t] : t, i1 = index ? index[t + 1] : t + 1, i2 = index ? index[t + 2] : t + 2;
            const s0 = d[i0] >= 0, s1 = d[i1] >= 0, s2 = d[i2] >= 0;
            if (s0 === s1 && s1 === s2) continue;
            // always from the vertex below the plane to the one above: two triangles sharing an
            // edge get exactly the same point, so the outline closes
            if (s0 !== s1) s0 ? cross(pos, d, i1, i0, o, e1, e2, segs) : cross(pos, d, i0, i1, o, e1, e2, segs);
            if (s1 !== s2) s1 ? cross(pos, d, i2, i1, o, e1, e2, segs) : cross(pos, d, i1, i2, o, e1, e2, segs);
            if (s2 !== s0) s2 ? cross(pos, d, i0, i2, o, e1, e2, segs) : cross(pos, d, i2, i0, o, e1, e2, segs);
        }
        const group = part.soft ? out.soft : out.main;
        chain(segs, group.loops, group.open);
    }
    for (const g of [out.main, out.soft]) g.open = new Float32Array(g.open);
    return out;
}

function cross(pos, d, a, b, o, e1, e2, out) {
    const t = d[a] / (d[a] - d[b]);
    const x = pos[a * 3] + (pos[b * 3] - pos[a * 3]) * t - o[0];
    const y = pos[a * 3 + 1] + (pos[b * 3 + 1] - pos[a * 3 + 1]) * t - o[1];
    const z = pos[a * 3 + 2] + (pos[b * 3 + 2] - pos[a * 3 + 2]) * t - o[2];
    out.push(x * e1[0] + y * e1[1] + z * e1[2], x * e2[0] + y * e2[1] + z * e2[2]);
}

// Joins segments [x1, y1, x2, y2, …] end to end: closed outlines go to `loops`, the rest to `open`.
function chain(segs, loops, open) {
    const n = segs.length >> 2;
    const key = i => (Math.round(segs[i] * SNAP) + 1e7) * 4e7 + Math.round(segs[i + 1] * SNAP) + 1e7;
    const ends = new Map();
    const keys = new Float64Array(n * 2);
    const used = new Uint8Array(n);
    const add = (k, id) => {
        if (!ends.has(k)) ends.set(k, []);
        ends.get(k).push(id);
    };
    for (let s = 0; s < n; s++) {
        const a = (keys[s * 2] = key(s * 4)), b = (keys[s * 2 + 1] = key(s * 4 + 2));
        if (a === b) { used[s] = 1; continue; }
        add(a, s * 2);
        add(b, s * 2 + 1);
    }
    // Repair only dangling endpoints. Closed contours keep their original topology, even
    // where two separate surfaces run less than 1 mm apart. Quantisation alone can leave
    // near-identical endpoints in adjacent buckets.
    const dangling = [...ends].filter(([, ids]) => ids.length === 1);
    const buckets = new Map(), joined = new Map();
    for (const [k, [id]] of dangling) {
        const x = segs[id * 2], y = segs[id * 2 + 1];
        const bx = Math.floor(x * SNAP), by = Math.floor(y * SNAP);
        let nearest = null, distance = 1 / (SNAP * SNAP);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            for (const p of buckets.get(`${bx + dx},${by + dy}`) || []) {
                if (joined.has(p.k)) continue;
                const d = (p.x - x) ** 2 + (p.y - y) ** 2;
                if (d <= distance) { nearest = p; distance = d; }
            }
        }
        if (nearest) {
            joined.set(k, nearest.k);
            joined.set(nearest.k, nearest.k);
        } else {
            const bucket = `${bx},${by}`;
            if (!buckets.has(bucket)) buckets.set(bucket, []);
            buckets.get(bucket).push({ k, x, y });
        }
    }
    if (joined.size) {
        ends.clear();
        for (let s = 0; s < n; s++) {
            if (used[s]) continue;
            for (const id of [s * 2, s * 2 + 1]) {
                keys[id] = joined.get(keys[id]) ?? keys[id];
                add(keys[id], id);
            }
        }
    }
    // follows unused segments from a point; returns the far ends, in order
    const walk = (from, stop, path) => {
        let at = from;
        while (at !== stop) {
            let next = -1;
            for (const id of ends.get(at)) if (!used[id >> 1]) next = id;
            if (next < 0) return false;
            used[next >> 1] = 1;
            const far = next ^ 1;
            path.push(segs[far * 2], segs[far * 2 + 1]);
            at = keys[far];
        }
        return true;
    };
    for (let s = 0; s < n; s++) {
        if (used[s]) continue;
        used[s] = 1;
        let path = [segs[s * 4], segs[s * 4 + 1], segs[s * 4 + 2], segs[s * 4 + 3]];
        if (walk(keys[s * 2 + 1], keys[s * 2], path) && path.length >= 8) {
            path.length -= 2; // the last point is the first again
            loops.push(loop(path));
            continue;
        }
        // not closed: also backwards from the start, then kept as plain lines
        const back = [];
        walk(keys[s * 2], NaN, back);
        const head = [];
        for (let i = back.length - 2; i >= 0; i -= 2) head.push(back[i], back[i + 1]);
        path = head.concat(path);
        for (let i = 0; i + 3 < path.length; i += 2) open.push(path[i], path[i + 1], path[i + 2], path[i + 3]);
    }
}

// Keep a consistent orientation for shared translucent fills. Opaque solids are drawn
// independently, so overlaps never rely on a compound path or a boolean union.
function loop(path) {
    let area = 0;
    for (let i = 0, j = path.length - 2; i < path.length; j = i, i += 2) area += path[j] * path[i + 1] - path[i] * path[j + 1];
    if (area < 0) {
        for (let i = 0, j = path.length - 2; i < j; i += 2, j -= 2) {
            [path[i], path[j]] = [path[j], path[i]];
            [path[i + 1], path[j + 1]] = [path[j + 1], path[i + 1]];
        }
    }
    const p = new Float32Array(path);
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 2) {
        if (p[i] < box[0]) box[0] = p[i];
        if (p[i] > box[2]) box[2] = p[i];
        if (p[i + 1] < box[1]) box[1] = p[i + 1];
        if (p[i + 1] > box[3]) box[3] = p[i + 1];
    }
    return { p, box };
}

export function insideLoops(loops, x, y) {
    for (const { p, box } of loops) {
        if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) continue;
        let inside = false;
        for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
            if (p[i + 1] > y !== p[j + 1] > y && x < ((p[j] - p[i]) * (y - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) inside = !inside;
        }
        if (inside) return true;
    }
    return false;
}

// The same outlines with their heights (y) times k, for a section drawn taller.
export function tallLoops(loops, k) {
    return k === 1 ? loops : loops.map(({ p, box }) => ({ p: p.map((v, i) => (i & 1 ? v * k : v)), box: [box[0], box[1] * k, box[2], box[3] * k] }));
}

export function edgesBelow(edges, z) {
    const out = [];
    for (let i = 0; i + 5 < edges.length; i += 6) {
        if (edges[i + 2] > z || edges[i + 5] > z) continue;
        out.push(edges[i], edges[i + 1], edges[i + 3], edges[i + 4]);
    }
    return new Float32Array(out);
}
