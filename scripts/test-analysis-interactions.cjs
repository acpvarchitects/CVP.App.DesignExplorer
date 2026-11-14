const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--no-proxy-server'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        // Retain the live viewer for geometric pointer targeting in this browser test only.
        await page.route('**/volumeview.js?*', async route => {
            const response = await route.fetch();
            await route.fulfill({ response, body: (await response.text()).replace('async load(base, layer, modelLayer, initial = {}) {', 'async load(base, layer, modelLayer, initial = {}) { globalThis.testVolume = this;') });
        });
        const base = process.env.ANALYSIS_PREVIEW_URL || 'http://127.0.0.1:8128';
        await page.goto(`${base}/v2/analysis.html?PROJECT=ZRCH_261113_HotelNoise_Option01_Grid1p6_110428&mode=section`);
        await page.waitForFunction(() => window.testVolume?.slice && document.querySelector('#loading').hidden, {}, { timeout: 180000 });
        const key = page.locator('.slice2d-key'), refit = page.getByRole('button', { name: 'Refit key plan' });
        assert.equal(await refit.isVisible(), false);
        const originalLine = await page.evaluate(() => JSON.stringify([testVolume.state.a, testVolume.state.b]));
        const handle = await page.evaluate(() => testVolume.keyPlan.px(...testVolume.state.a));
        const keyRect = await key.boundingBox();
        assert.ok(handle[1] > 5 && handle[1] < keyRect.height - 5, 'endpoint is reachable inside the key-plan border');
        await page.mouse.move(keyRect.x + handle[0], keyRect.y + handle[1]);
        await page.mouse.down();
        await page.mouse.move(keyRect.x + handle[0] + 25, keyRect.y + handle[1] - 15, { steps: 6 });
        await page.mouse.up();
        assert.notEqual(await page.evaluate(() => JSON.stringify([testVolume.state.a, testVolume.state.b])), originalLine, 'key-plan endpoint drag actually moves the section');
        await page.evaluate(() => testVolume.set({ a: [testVolume.volume.size[0] / 2, 0], b: [testVolume.volume.size[0] / 2, testVolume.volume.size[1]] }));
        await page.waitForFunction(() => !testVolume.keyPlan.pending);
        const mid = await page.evaluate(() => testVolume.keyPlan.px(...testVolume.state.a.map((n, i) => (n + testVolume.state.b[i]) / 2)));
        const beforeMove = await page.evaluate(() => ({ a: [...testVolume.state.a], b: [...testVolume.state.b] }));
        await page.mouse.move(keyRect.x + mid[0], keyRect.y + mid[1]);
        await page.mouse.down();
        await page.mouse.move(keyRect.x + mid[0] + 20, keyRect.y + mid[1], { steps: 6 });
        await page.mouse.up();
        const afterMove = await page.evaluate(() => ({ a: [...testVolume.state.a], b: [...testVolume.state.b] }));
        assert.ok(afterMove.a[0] > beforeMove.a[0], 'dragging the key-plan line translates the section');
        assert.ok(Math.abs((afterMove.a[0] - beforeMove.a[0]) - (afterMove.b[0] - beforeMove.b[0])) < 1e-6, 'translation preserves direction and length');
        await page.evaluate(value => testVolume.set(value), beforeMove);
        await page.waitForFunction(() => !testVolume.keyPlan.pending);
        const image = await key.evaluate(c => c.toDataURL());
        await key.click({ position: { x: 20, y: 20 } });
        await key.click({ position: { x: 70, y: 50 } });
        assert.equal(await page.evaluate(() => JSON.stringify([testVolume.state.a, testVolume.state.b])), originalLine, 'arbitrary key-plan clicks do not create sections');
        const snap = await page.evaluate(async () => {
            const { snapSectionEnd } = await import('/v2/slice2d.js?v=9');
            return [[3, 90], [90, 3], [45, 60]].map(p => snapSectionEnd(p, [0, 0], [0, 0, 100, 100]));
        });
        assert.deepEqual(snap, [[0, 90], [90, 0], [45, 60]], 'orthogonal snap prefers both site axes and permits diagonal sections');
        await key.hover();
        await page.mouse.wheel(0, 250);
        await refit.waitFor({ state: 'visible' });
        await page.waitForFunction(() => testVolume.keyPlan.zoom < 1);
        assert.notEqual(await key.evaluate(c => c.toDataURL()), image);
        await page.mouse.wheel(0, -600);
        await page.waitForFunction(() => testVolume.keyPlan.zoom > 1);
        await refit.click();
        await refit.waitFor({ state: 'hidden' });
        await page.waitForFunction(() => testVolume.keyPlan.zoom === 1 && !testVolume.keyPlan.center);
        assert.equal(await page.evaluate(() => JSON.stringify([testVolume.state.a, testVolume.state.b])), originalLine, 'key-plan navigation never moves the section');
        const canvas = page.locator('.slice2d-canvas');
        const drag = async (from, to) => {
            const rect = await canvas.boundingBox();
            await page.mouse.move(rect.x + from[0], rect.y + from[1]);
            await page.mouse.down();
            await page.mouse.move(rect.x + to[0], rect.y + to[1], { steps: 6 });
            await page.mouse.up();
        };
        let from = await page.evaluate(() => testVolume.slice.px(testVolume.sectionLength() / 2, testVolume.state.z * testVolume.state.vx));
        await drag(from, [from[0], from[1] - 12]);
        assert.ok(await page.evaluate(() => testVolume.state.z + testVolume.volume.worldZ > 14), 'dragging plan line changes elevation');
        await page.screenshot({ path: 'v2/_test/section-solid-view.png' });
        await page.getByRole('button', { name: 'Hide plan', exact: true }).click();
        assert.equal(await page.evaluate(() => testVolume.state.planGuide), false);
        assert.equal(await page.evaluate(() => testVolume.pickGuide([testVolume.sectionLength() / 2, testVolume.state.z], testVolume.slice)), null);
        await page.getByRole('button', { name: 'Show plan', exact: true }).click();
        await page.locator('[data-mode="plan"]').click();
        await page.waitForFunction(() => testVolume.state.mode === 'plan' && testVolume.sceneFor === 'plan' && !testVolume.slice.pending);
        from = await page.evaluate(() => testVolume.slice.px(...testVolume.state.a.map((n, i) => (n + testVolume.state.b[i]) / 2)));
        const before = await page.evaluate(() => testVolume.state.a[0]);
        await drag(from, [from[0] + 20, from[1]]);
        assert.ok(await page.evaluate(x => testVolume.state.a[0] > x && testVolume.state.a[0] === testVolume.state.b[0], before), 'dragging the plan section line translates both endpoints');
        from = await page.evaluate(() => testVolume.slice.px(...testVolume.state.a));
        await drag(from, [from[0] + 100, from[1] - 15]);
        assert.ok(await page.evaluate(() => testVolume.state.a[0] !== testVolume.state.b[0]), 'dragging endpoint rotates section');
        await page.getByRole('button', { name: 'Hide section', exact: true }).click();
        assert.equal(await page.evaluate(() => testVolume.state.sectionGuide), false);
        await page.screenshot({ path: 'v2/_test/plan-solid-view.png' });
        await page.reload();
        await page.waitForFunction(() => window.testVolume?.slice && document.querySelector('#loading').hidden, {}, { timeout: 180000 });
        assert.equal(await page.evaluate(() => testVolume.state.sectionGuide), false, 'guide visibility survives URL restore');
        // Two overlapping floors: top view sees the upper floor; a cut below it sees the lower floor.
        const colours = await page.evaluate(async () => {
            const THREE = await import('three');
            const v = Object.create(Object.getPrototypeOf(testVolume));
            v.viewer = testVolume.viewer;
            v.volume = { size: [10, 10, 10] };
            v.state = { z: 5 };
            v.model = new THREE.Group();
            for (const [y, color] of [[2, 0x0000ff], [8, 0xff0000]]) {
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 6), new THREE.MeshBasicMaterial({ color }));
                mesh.position.set(5, y, -5);
                v.model.add(mesh);
            }
            const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(3, 3, -5), new THREE.Vector3(7, 3, -5)]);
            v.model.add(new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0x00ff00 })));
            v.viewer.root.add(v.model);
            v.viewer.root.updateMatrixWorld(true);
            const atCentre = scene => {
                const c = scene.images[0].canvas;
                return [...c.getContext('2d').getImageData(c.width / 2, c.height / 2 + 20, 1, 1).data];
            };
            const top = v.modelPlan(), plan = v.modelPlan('plan');
            const edgeAlpha = scene => {
                const c = scene.edges[0].canvas;
                const data = c.getContext('2d').getImageData(c.width / 2 - 1, c.height / 2 - 1, 3, 3).data;
                return Math.max(...[...data].filter((_, i) => i % 4 === 3));
            };
            const result = [atCentre(top), plan.images.length, (() => { v.state.z = 9; return edgeAlpha(v.modelPlan('plan')); })(), edgeAlpha(plan)];
            v.viewer.root.remove(v.model);
            for (const material of v.drawingMaterials) material.dispose();
            v.model.traverse(node => node.geometry?.dispose());
            return result;
        });
        assert.deepEqual(colours[0], [255, 0, 0, 255], 'upper floor occludes lower floor');
        assert.equal(colours[1], 0, 'uncut surface shading is never included in analysis drawings');
        assert.equal(colours[2], 0, 'upper surfaces hide lower edges in the overlay pass');
        assert.ok(colours[3] > 0, 'exposed edges remain visible after cutting away the upper floor');
        assert.deepEqual(errors, []);
        console.log('PASS key-plan zoom/refit, guide visibility/URL restore, plan and section dragging, surface occlusion');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
