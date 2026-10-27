// Pure, deterministic clustering. Input features describe generation, never scores or IDs.
export const MAX_CLUSTERS = 50;
export function clampClusterCount(value, baseCount) {
    return Math.max(1,Math.min(Math.floor(value)||1,MAX_CLUSTERS,Math.max(1,baseCount)));
}
export function optionKey(value) {
    const s = String(value ?? "").trim();
    return s && Number.isFinite(Number(s)) ? String(Number(s)) : s;
}

export function readGeneration(rows, manifest) {
    if (manifest?.version !== 1 || !manifest.feature_space || !Array.isArray(manifest.features) ||
        !manifest.features.length || new Set(manifest.features).size !== manifest.features.length ||
        !["none", "standardize"].includes(manifest.scaling)) throw Error("Invalid generation metadata");
    const { features, key_column: key } = manifest;
    if (!key || features.includes(key) || ![key, ...features].every(c => rows.columns.includes(c))) {
        throw Error("Generation CSV columns do not match its metadata");
    }
    const vectors = new Map();
    for (const row of rows) {
        const id = optionKey(row[key]);
        if (!id || vectors.has(id)) throw Error("Missing or duplicate generation option ID");
        const values = features.map(c => String(row[c] ?? "").trim());
        if (values.some(v => !v || !Number.isFinite(Number(v)))) throw Error(`Invalid generation values for option ${id}`);
        vectors.set(id, values.map(Number));
    }
    return { manifest, vectors, signature: JSON.stringify([manifest.feature_space, features, manifest.scaling]) };
}

export function generationScope(options) {
    const signatures = new Set();
    const points = [];
    for (const option of options) {
        const gen = option.study.generation;
        if (!gen) throw Error(`${option.study.name}: ${option.study.generationError || "generation files unavailable"}`);
        signatures.add(gen.signature);
        const vector = gen.vectors.get(optionKey(option.row[gen.manifest.join_column || "in:Index"]));
        if (!vector) throw Error(`${option.title}: no matching generation row`);
        points.push({ option, vector });
    }
    if (signatures.size > 1) throw Error("The selected studies use incompatible generation features or coordinate frames");
    return { points, scaling: options[0]?.study.generation.manifest.scaling || "none" };
}

function squared(a, b) {
    let sum = 0;
    for (let j = 0; j < a.length; j++) { const d = a[j] - b[j]; sum += d * d; }
    return sum;
}

// Remove constant dimensions; optionally standardize jointly over ALL participating studies.
export function scaleVectors(vectors, scaling) {
    if (!vectors.length) return [];
    const n = vectors.length, d = vectors[0].length;
    if (!d || vectors.some(v => v.length !== d || v.some(x => !Number.isFinite(x)))) throw Error("Invalid feature vectors");
    const dims = [];
    for (let j = 0; j < d; j++) {
        const mean = vectors.reduce((s, v) => s + v[j], 0) / n;
        const variance = vectors.reduce((s, v) => s + (v[j] - mean) ** 2, 0) / n;
        if (variance > 1e-16) dims.push({ j, mean, scale: scaling === "standardize" ? Math.sqrt(variance) : 1 });
    }
    return vectors.map(v => Float64Array.from(dims.map(({j, mean, scale}) => (v[j] - mean) / scale)));
}

// Seeded k-means++ + Lloyd iterations, multiple starts, minimum squared-error solution.
// Duplicate vectors stay together; k is capped at the number of distinct vectors.
export function kmeans(vectors, requestedK, { starts = 5, iterations = 80 } = {}) {
    if (!Number.isInteger(requestedK) || requestedK < 1) throw Error("Choose a positive whole number of clusters");
    if (!vectors.length) return { clusters: [], inertia: 0, requestedK };
    const distinct = [...new Map(vectors.map(v => [Array.from(v).join(","), v])).values()];
    const k = Math.min(requestedK, distinct.length), n = vectors.length, dim = vectors[0].length;
    if (k === distinct.length) {
        // One group per distinct vector is already the exact zero-error solution.
        const groups = new Map();
        vectors.forEach((v,i) => {
            const key = Array.from(v).join(",");
            if (!groups.has(key)) groups.set(key,{center:Float64Array.from(v),members:[]});
            groups.get(key).members.push(i);
        });
        return {clusters:[...groups.values()],inertia:0,requestedK};
    }
    let best;
    for (let start = 0; start < starts; start++) {
        let seed = 7301 + start * 104729;
        const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        const centers = [Float64Array.from(distinct[Math.floor(random() * distinct.length)])];
        const nearest = new Float64Array(distinct.length).fill(Infinity);
        while (centers.length < k) {
            // Update only against the new center: O(n*k*d), not O(n*k*k*d).
            const last = centers[centers.length-1];
            for (let i=0;i<distinct.length;i++) nearest[i]=Math.min(nearest[i],squared(distinct[i],last));
            let target = random() * nearest.reduce((a,b) => a+b, 0), selected = nearest.findLastIndex(d => d > 0);
            for (let i = 0; i < nearest.length; i++) { target -= nearest[i]; if (target < 0) { selected = i; break; } }
            centers.push(Float64Array.from(distinct[selected]));
        }
        let labels = Array(n).fill(-1);
        for (let iter = 0; iter < iterations; iter++) {
            let changed = false;
            const members = Array.from({length:k}, () => []);
            for (let i = 0; i < n; i++) {
                let at = 0, distance = Infinity;
                for (let c = 0; c < k; c++) { const d = squared(vectors[i], centers[c]); if (d < distance) { distance = d; at = c; } }
                if (labels[i] !== at) changed = true;
                labels[i] = at; members[at].push(i);
            }
            // Empty cluster: move a distant point from a non-singleton cluster, then update all means.
            for (let c = 0; c < k; c++) if (!members[c].length) {
                let far = -1, distance = -1;
                for (let i = 0; i < n; i++) if (members[labels[i]].length > 1) {
                    const d = squared(vectors[i], centers[labels[i]]);
                    if (d > distance) { distance = d; far = i; }
                }
                if (far >= 0) {
                    members[labels[far]].splice(members[labels[far]].indexOf(far), 1);
                    labels[far] = c; members[c].push(far); changed = true;
                }
            }
            for (let c = 0; c < k; c++) {
                centers[c].fill(0);
                for (const i of members[c]) for (let j = 0; j < dim; j++) centers[c][j] += vectors[i][j] / members[c].length;
            }
            if (!changed) break;
        }
        const clusters = centers.map((center,c) => ({ center, members: labels.flatMap((label,i) => label === c ? [i] : []) })).filter(c => c.members.length);
        const inertia = clusters.reduce((s,c) => s + c.members.reduce((a,i) => a + squared(vectors[i],c.center),0),0);
        if (!best || inertia < best.inertia) best = { clusters, inertia, requestedK };
    }
    return best;
}

export function representatives(result, points, vectors, metric = null) {
    let fallbacks = 0;
    const clusters = result.clusters.map(cluster => {
        const near = [...cluster.members].sort((a,b) => squared(vectors[a],cluster.center) - squared(vectors[b],cluster.center) || a-b);
        let chosen = near[0];
        if (metric) {
            const valid = near.filter(i => Number.isFinite(points[i].option.values[metric.col]));
            if (valid.length) chosen = valid.reduce((best,i) => metric.dir * (points[i].option.values[metric.col] - points[best].option.values[metric.col]) > 0 ? i : best);
            else fallbacks++;
        }
        return { members: cluster.members.map(i => points[i].option), representative: points[chosen].option };
    });
    return { clusters, selected: new Set(clusters.map(c => c.representative)), fallbacks };
}
