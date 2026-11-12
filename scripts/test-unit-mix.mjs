import assert from 'node:assert/strict';
import { mixCompareHtml, mixConfig, mixGroupKeys, mixHtml, mixUnits, programCount, programKey, programMatch, programTableHtml } from '../v2/unit-mix.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const doc = { version: 1, towers: [
    { id: 'T01', floors: 10, base: 2, height_m: 41, plate: ['220', '240', '220', '300'], length_m: 70, cores: 2, hotel: false, zone: 'double' },
    { id: 'T02', floors: 5, base: 2, height_m: 24.5, plate: ['180', '180'], length_m: 35, cores: 1, hotel: true, zone: 'hotel' },
] };
const entry = { key: 'mix_units', mix: {
    types: [
        { key: '180', label: '180 m²', area_m2: 180, rgb: [46, 117, 182], parking: 1.3 },
        { key: '220', label: '220 m²', area_m2: 220, rgb: [84, 160, 64], parking: 1.5 },
        { key: '240', label: '240 m²', area_m2: 240, rgb: [237, 125, 49], parking: 1.5 },
        { key: '300', label: '300 m²', area_m2: 300, rgb: [192, 0, 0], parking: 1.5 },
    ],
    target: { '180': 10, '220': 20, '240': 10, '300': 10 },
    zones: [{ key: 'hotel', label: 'Hotel' }, { key: 'double', label: 'Double' }],
} };
const cfg = mixConfig(entry, doc);
assert.equal(cfg.targetUnits, 50);
assert.equal(cfg.targetArea, 10 * 180 + 20 * 220 + 10 * 240 + 10 * 300);

// Compare totals: 180 = 2 x 5 = 10, 220 = 2 x 10 = 20, 240 = 10, 300 = 10 -> 50, all on target.
const compare = mixCompareHtml(doc, cfg, esc);
const cells = [...compare.matchAll(/<tr><td class="mix-txt">([^<]*(?:<[^>]+>[^<]*)*?)<\/td><td>([^<]+)<\/td>/g)].map(m => m[2]);
assert.deepEqual(cells.slice(0, 5), ['10', '20', '10', '10', '50']);
assert.ok(!compare.includes('mix-off'), 'every size is on target');
console.log('PASS unit mix totals per size, total and target');

// View A: one table for every tower (no zone level, no hotel mark since 12/11), every tower foldable.
const ui = { view: 'tower', measure: 'units', closed: new Set() };
const a = mixHtml(doc, cfg, ui, esc);
assert.ok(!a.includes('Hotel') && !a.includes('Double') && !a.includes('mix-zone') && !a.includes('mix-pill'), 'zones and the hotel mark are not shown');
assert.ok(a.indexOf('T01') < a.indexOf('T02'), 'towers keep the order of the JSON');
assert.deepEqual(mixGroupKeys(doc), ['t:T01', 't:T02']);
ui.closed = new Set(mixGroupKeys(doc));
assert.ok(!mixHtml(doc, cfg, ui, esc).includes('mix-child'), 'folded towers hide their size rows');
// View C in m²: 220 column = 20 x 220.
const c = mixHtml(doc, cfg, { view: 'matrix', measure: 'area', closed: new Set() }, esc);
assert.ok(c.includes('4,400'));
// No settings: types come from the data, no target, no crash.
assert.deepEqual(mixConfig(null, doc).types.map(t => t.key), ['180', '220', '240', '300']);
assert.ok(mixHtml(doc, mixConfig(null, doc), { view: 'tower', measure: 'units', closed: new Set() }, esc).includes('Option total'));
console.log('PASS unit mix views: one table, folding, matrix in m², missing settings');

// A type the settings do not list is still counted (grey, appended), never dropped.
const odd = { towers: [{ ...doc.towers[0], plate: ['220', '200'] }] };
const oddCfg = mixConfig(entry, odd);
assert.deepEqual(oddCfg.types.map(t => t.key), ['180', '220', '240', '300', '200']);
assert.ok(mixCompareHtml(odd, oddCfg, esc).includes('<td>20</td>'), 'total 2 x 10 floors includes the unlisted type');
assert.ok(mixHtml(odd, oddCfg, { view: 'tower', measure: 'units', closed: new Set() }, esc).includes('200: not in the study'), 'the view says the unlisted size has no parking ratio');
assert.ok(!mixHtml(doc, cfg, { view: 'tower', measure: 'units', closed: new Set() }, esc).includes('not in the study'), 'no note when every size is listed');
// Values from the JSON never reach the HTML unescaped: ids in data attributes, numbers, colours.
const evil = { towers: [{ id: 'A" onfocus="x', floors: '<b>', base: 1, height_m: 3, plate: ['180'], zone: '"><i>', cores: 1 }] };
const evilCfg = mixConfig({ mix: { types: [{ key: '180', label: '180', area_m2: 180, rgb: ['1);x:"', 0, 0] }] } }, evil);
for (const view of ['tower', 'matrix']) {
    const html = mixHtml(evil, evilCfg, { view, measure: 'units', closed: new Set() }, esc);
    assert.ok(!html.includes('" onfocus="') && !html.includes('<b>') && !html.includes('"><i>') && !html.includes('x:"'), view + ' escapes JSON values');
}
// Gaps round before sign and colour: a 0.4 m² area gap is on target.
const near = mixHtml(doc, mixConfig({ mix: { ...entry.mix, client: { area_m2: cfg.targetArea + 0.4 } } }, doc), ui, esc);
assert.ok(near.includes('<span class="mix-eq">±0</span>'));
console.log('PASS unit mix: unlisted types counted, values escaped, gaps rounded');

// Program tab: the apartments in the order of the 3D file (tower, floor, along the typical floor).
const units = mixUnits(doc);
assert.equal(units.length, 10 * 4 + 5 * 2);
assert.deepEqual(units.slice(0, 5), [
    { tower: 'T01', floor: 0, type: '220' }, { tower: 'T01', floor: 0, type: '240' }, { tower: 'T01', floor: 0, type: '220' },
    { tower: 'T01', floor: 0, type: '300' }, { tower: 'T01', floor: 1, type: '220' },
]);
assert.deepEqual(units.at(-1), { tower: 'T02', floor: 4, type: '180' });
// Selection keys: a tower, a size everywhere, one tower x size cell.
const count = key => units.filter(u => programMatch(key, u)).length;
assert.equal(count(programKey('t', 'T01')), 40);
assert.equal(count(programKey('s', '220')), 20);
assert.equal(count(programKey('c', 'T01', '220')), 20);
assert.equal(count(programKey('c', 'T02', '220')), 0);
assert.equal(programCount(units.filter(u => programMatch(programKey('s', '180'), u)), cfg), '10 apartments · 1,800 m²');
// The table: every tower name, size header and filled cell is a button with its key; empty cells are not.
const table = programTableHtml(doc, cfg, 'units', esc);
const keys = [...table.matchAll(/data-prog-key="([^"]+)"/g)].map(m => JSON.parse(m[1].replace(/&quot;/g, '"')));
assert.deepEqual(keys.filter(k => k[0] === 't').map(k => k[1]), ['T01', 'T02']);
assert.deepEqual(keys.filter(k => k[0] === 's').map(k => k[1]), ['180', '220', '240', '300']);
assert.deepEqual(keys.filter(k => k[0] === 'c'), [['c', 'T01', '220'], ['c', 'T01', '240'], ['c', 'T01', '300'], ['c', 'T02', '180']]);
assert.ok(table.includes('Target') && table.includes('Gap') && !table.includes('mix-pill'));
assert.ok(programTableHtml(doc, cfg, 'area', esc).includes('4,400'), 'm² measure');
const evilTable = programTableHtml(evil, evilCfg, 'units', esc);
assert.ok(!evilTable.includes('" onfocus="') && !evilTable.includes('<b>') && !evilTable.includes('x:"'), 'the Program table escapes JSON values');
console.log('PASS Program tab: apartment order, selection keys, table buttons, escaping');
