import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../v2/meshcut.js', import.meta.url), 'utf8');
const { cutModel, insideLoops } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

function walls(segments) {
    const vertices = [];
    for (const [a, b] of segments) {
        vertices.push(...a, -1, ...b, -1, ...b, 1, ...a, -1, ...b, 1, ...a, 1);
    }
    return { pos: new Float32Array(vertices), index: null, d: new Float32Array(vertices.length / 3) };
}
const cut = segments => cutModel([walls(segments)], [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]).main;
const square = (end, start) => [[[0, 0], [end, 0]], [[start, 0], [1, 1]], [[1, 1], [0, 1]], [[0, 1], [0, 0]]];

const seam = cut(square(1.00049, 1.00051));
assert.equal(seam.loops.length, 1, 'near-identical ends across rounding buckets close');
assert.equal(seam.open.length, 0);
const hole = cut(square(1, 1.02));
assert.equal(hole.loops.length, 0, 'a real 2 cm opening remains open');
assert.ok(hole.open.length > 0);
const segments = [[[2, 0], [3, 1]], [[0, 0], [1, 0]], [[1, 0], [2, 0]]];
const open = cut(segments).open;
const key = (a, b) => [a.join(','), b.join(',')].sort().join('|');
const expected = segments.flatMap(([a, b]) => {
    const mid = a.map((x, i) => (x + b[i]) / 2);
    return [key(a, mid), key(mid, b)];
}).sort();
const actual = [];
for (let i = 0; i < open.length; i += 4) actual.push(key([...open.slice(i, i + 2)], [...open.slice(i + 2, i + 4)]));
assert.deepEqual(actual.sort(), expected, 'backward chaining never invents diagonal connections');
const rect = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]];
const neighbours = cut([...rect(0, 0, 1.0001, 1), ...rect(1.0009, 0.1, 2, 0.9)]);
assert.equal(neighbours.loops.length, 2, 'already closed nearby shapes remain independent');
assert.equal(neighbours.open.length, 0);
const reversed = segments => segments.map(([a, b]) => [b, a]).reverse();
const patio = cut([...rect(0, 0, 3, 3), ...reversed(rect(1, 1, 2, 2))]);
assert.equal(patio.loops.length, 1, 'a contour running the other way inside a solid is its hole');
assert.equal(patio.loops[0].holes.length, 1);
assert.equal(insideLoops(patio.loops, 0.5, 0.5), true, 'the solid around a patio is solid');
assert.equal(insideLoops(patio.loops, 1.5, 1.5), false, 'a patio is open air');
const flipped = cut([...reversed(rect(0, 0, 3, 3)), ...rect(1, 1, 2, 2)]);
assert.equal(flipped.loops.length, 1, 'holes do not depend on which way the whole model is wound');
assert.equal(flipped.loops[0].holes.length, 1);
const inner = cut([...rect(0, 0, 3, 3), ...rect(1, 1, 2, 2)]);
assert.equal(inner.loops.length, 2, 'a solid inside another one stays a solid');
assert.equal(insideLoops(inner.loops, 1.5, 1.5), true);
const island = cut([...rect(0, 0, 5, 5), ...reversed(rect(1, 1, 4, 4)), ...rect(2, 2, 3, 3)]);
assert.equal(island.loops.length, 2, 'what stands inside a patio is a solid of its own');
assert.equal(insideLoops(island.loops, 2.5, 2.5), true);
assert.equal(insideLoops(island.loops, 1.5, 1.5), false);
console.log('PASS mesh cuts: sub-mm seam, real openings, independent solids, patios, open-chain geometry');
