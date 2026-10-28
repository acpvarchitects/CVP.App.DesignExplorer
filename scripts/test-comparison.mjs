import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const rules = moduleUrl(await readFile(new URL('../v2/compare.js', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../v2/comparison.js', import.meta.url), 'utf8'))
    .replace('./compare.js?v=37', rules);
const { comparisonViews } = await import(moduleUrl(source));
const schema = {
    images: [{col: 'img', label: 'Image'}, {col: 'img:Axonometric', label: 'Axonometric'}],
    models: [{composed: true, label: 'Model'}],
    analyses: [{col: 'an_sun', label: 'Sun'}],
    tables: [{col: 'table_buildings', label: 'Buildings'}],
};
const studies = [{}, {manifest: {
    thumbnails: {views: [{column: 'img', label: 'Plan'}]},
    layers: [{column: 'an_sun', label: 'Winter sun hours'}],
    tables: [{column: 'table_buildings', label: 'Building schedule'}],
}}];
const views = comparisonViews({schema, studies});
assert.deepEqual(views.map(v => v.label), ['Plan', 'Axonometric', '3D model', 'Winter sun hours', 'Table · Building schedule']);
assert.equal(new Set(views.map(v => v.key)).size, views.length);
assert.deepEqual(views.map(v => v.mode), ['image', 'image', 'model', 'analysis', 'table']);
assert.equal(comparisonViews({schema, studies: [{}]})[0].label, 'Image');
assert.deepEqual(comparisonViews({schema: {images: [], models: [], analyses: [], tables: []}, studies: []}), []);
console.log('PASS comparison choices use metadata, stable keys, fallbacks and view order');

// Comparison composition must use its own mode even while the main preview shows an image.
const app = await readFile(new URL('../v2/app.js', import.meta.url), 'utf8');
const start = app.indexOf('function partsFor(');
const compose = app.slice(start, app.indexOf('// "Where this option stands"', start));
const context = vm.createContext({state: {mode: 'image'}, data: {schema: {
    layers: [{col: 'roof'}, {col: 'units'}, {col: 'facades'}], context: {col: 'context'},
}}, OVER_GENERAL: {sun: ['units', 'facades']}, ANALYSIS_ONLY: new Set(['facades']),
GENERAL_ONLY: new Set(['units']), assetUrl: (_o, file) => file || null});
vm.runInContext(compose, context);
const option = {row: {roof: 'roof.glb', units: 'units.glb', facades: 'facades.glb', sun: 'sun.glb', context: 'context.glb'}};
const parts = context.partsFor(option, {col: 'sun', composed: true}, 'analysis');
assert.deepEqual(JSON.parse(JSON.stringify(parts)), [
    {url: 'context.glb', kind: 'context'}, {url: 'roof.glb', kind: 'geometry'}, {url: 'sun.glb', kind: 'analysis'},
]);
assert.equal(context.state.mode, 'image');
assert.equal(context.partsFor({row: {}}, {col: 'sun', composed: true}, 'analysis'), null);
console.log('PASS comparison analysis composition is independent of main preview mode');
