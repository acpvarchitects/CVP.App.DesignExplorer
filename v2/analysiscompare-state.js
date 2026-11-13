// State shared by the analysis dashboard and its independently usable study viewers.
export function studyEntries(params) {
    const key = params.has("PROJECT") ? "PROJECT" : "data";
    return (params.get(key) || "").split(",").map(s => s.trim()).filter(Boolean).map((entry, i) => {
        const match = entry.match(/^(.+?):(?!\/\/)([^/]+)$/);
        return { key, entry, label: match?.[2]?.trim() || `Option ${i + 1}` };
    });
}

export function sharedLegend(a, b) {
    if (!a?.reading || !b?.reading || a.analysis !== b.analysis || a.reading.key !== b.reading.key || a.reading.unit !== b.reading.unit) return null;
    const x = a.reading.legend, y = b.reading.legend;
    if (!x || !y || ![x.min, x.max, y.min, y.max].every(Number.isFinite) || !x.colors?.length || !y.colors?.length) return null;
    return { ...x, min: Math.min(x.min, y.min), max: Math.max(x.max, y.max) };
}

// Volume views use local Rhino metres; cameras use local glTF (x,z,-y).
export function linkedView(source, target) {
    if (!source.view || !target.view || !source.origin || !target.origin) return null;
    const delta = source.origin.map((v, i) => v - target.origin[i]);
    const v = structuredClone(source.view);
    v.z += delta[2];
    for (const key of ["a", "b"]) v[key] = v[key].map((n, i) => n + delta[i]);
    // Refuse a line that the target would clamp: that would shift its distance axis.
    // This also covers crossing lines with both endpoints outside the target.
    if (target.size && [v.a, v.b].some(p => p.some((n, i) => n < 0 || n > target.size[i]))) return null;
    if (v.camera) v.camera = v.camera.map((n, i) => n + [delta[0], delta[2], -delta[1]][i % 3]);
    if (v.frame && v.mode === "plan") {
        v.frame[0] += delta[0];
        v.frame[1] += delta[1];
    } else if (v.frame && v.mode === "section") v.frame[1] += delta[2] * (v.vx || 1);
    // A missing scenario must never be interpreted as an available field.
    if (!target.scenarios.includes(v.scenario)) return null;
    return v;
}
