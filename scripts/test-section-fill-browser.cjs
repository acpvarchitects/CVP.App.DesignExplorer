const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--no-proxy-server'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
        const base = process.env.ANALYSIS_PREVIEW_URL || 'http://127.0.0.1:8128';
        await page.route('**/volumeview.js?*', async route => {
            const response = await route.fetch();
            await route.fulfill({ response, body: (await response.text()).replace('async load(base, layer, modelLayer, initial = {}) {', 'async load(base, layer, modelLayer, initial = {}) { globalThis.testVolume = this;') });
        });
        await page.goto(`${base}/v2/analysis.html?PROJECT=ZRCH_261113_HotelNoise_Option02_Updated_Paths_Grid1p6_SectionFixed_v1&mode=section&sec=306.7,0,306.7,283&z=17.31`);
        await page.waitForFunction(() => window.testVolume?.slice && document.querySelector('#loading').hidden, {}, { timeout: 180000 });
        const result = await page.evaluate(async () => {
            const { drawLoops } = await import('/v2/slice2d.js?v=8');
            const { cutModel, insideLoops } = await import('/v2/meshcut.js?v=5');
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 80;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const square = [10, 10, 60, 10, 60, 60, 10, 60];
            const reverse = [10, 60, 60, 60, 60, 10, 10, 10];
            const loops = [square, reverse].map(p => ({ p }));
            drawLoops(ctx, { loops, color: '#282828', separate: true }, 1, 0, 1, 0);
            const overlap = [...ctx.getImageData(30, 30, 1, 1).data];
            ctx.clearRect(0, 0, 80, 80);
            drawLoops(ctx, { loops, color: 'rgba(96,150,96,0.4)' }, 1, 0, 1, 0);
            const canopyCancelled = ctx.getImageData(30, 30, 1, 1).data[3];
            ctx.clearRect(0, 0, 80, 80);
            drawLoops(ctx, { loops: [{ p: square }, { p: square }], color: 'rgba(96,150,96,0.4)' }, 1, 0, 1, 0);
            const canopyAlpha = ctx.getImageData(30, 30, 1, 1).data[3];
            const v = testVolume, terrain = v.parts[v.meshes.findIndex(m => /toposolid/i.test(m.name))];
            const samples = [...Array.from({ length: 45 }, (_, i) => 10 + i * 10), 306.7];
            const cuts = samples.map(x => {
                const cut = cutModel([terrain], [x, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0]).main;
                canvas.width = 2400;
                canvas.height = 260;
                drawLoops(ctx, { loops: cut.loops, color: '#282828', stroke: '#282828', width: 1, separate: true }, 5, 0, -5, 240);
                const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let checked = 0, white = 0;
                for (let along = 5; along < 455; along += 3) for (let z = 1; z < 40; z += 2) {
                    if (![[along - .3, z], [along + .3, z], [along, z - .3], [along, z + .3]].every(p => insideLoops(cut.loops, ...p))) continue;
                    checked++;
                    const i = (Math.floor(along * 5) + Math.floor(240 - z * 5) * canvas.width) * 4;
                    if (pixels[i + 3] < 250 || pixels[i] > 45) white++;
                }
                return { x, open: cut.open.length, checked, white };
            });
            // the space the analysis excludes (rooms, ground beyond the terrain mesh) is never a hole
            const holes = s => {
                const d = s.canvas.getContext('2d').getImageData(0, 0, s.sw, s.sh).data;
                let empty = 0, sealed = 0;
                for (let i = 0; i < s.solid.length; i++) {
                    if (s.solid[i] >= 2) sealed++;
                    else if (s.solid[i] === 0 && d[i * 4 + 3] < 128) empty++;
                }
                return { empty, sealed };
            };
            const voids = [];
            for (const x of [248.7, 306.7]) {
                v.set({ a: [x, 0], b: [x, 283] }, { quiet: true });
                v.update();
                voids.push({ x, ...holes(v.sectionSlice), projected: v.sectionScene().images.length - 1 });
            }
            voids.push({ x: 'plan', ...holes(v.planSlice), projected: 0 });
            return { overlap, canopyCancelled, canopyAlpha, cuts, voids };
        });
        assert.deepEqual(result.overlap, [40, 40, 40, 255], 'opposite-winding overlapping solids never cancel');
        assert.equal(result.canopyCancelled, 0, 'shared translucent fill behavior stays unchanged');
        assert.ok(Math.abs(result.canopyAlpha - 102) <= 1, 'trees keep one shared translucent fill');
        for (const cut of result.cuts) {
            assert.equal(cut.open, 0, `terrain remains closed at x=${cut.x}`);
            assert.ok(cut.checked > 100, `terrain sampling at x=${cut.x} is substantial`);
            assert.equal(cut.white, 0, `terrain interior has no white samples at x=${cut.x}`);
        }
        for (const cut of result.voids) {
            assert.equal(cut.empty, 0, `no empty pixel inside the analysed box at ${cut.x}`);
            assert.ok(cut.sealed > 0, `excluded space is painted solid at ${cut.x}`);
            assert.equal(cut.projected, 0, `the section at ${cut.x} shows no projected model`);
        }
        await page.screenshot({ path: 'v2/_test/section-fixed-306p7.png' });
        console.log(`PASS independent fills, original trees, ${result.cuts.length} real terrain cuts with no white interior samples`);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
