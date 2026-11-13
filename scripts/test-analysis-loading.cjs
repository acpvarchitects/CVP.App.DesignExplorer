const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage();
        const base = process.env.ANALYSIS_PREVIEW_URL || 'http://127.0.0.1:8128';
        let release;
        let gate = new Promise(resolve => { release = resolve; });
        await page.route('**/loading-fixture/layers.json*', async route => {
            await gate;
            await route.fulfill({ json: {
                levels: [{ key: 'L1', elevation_m: 0 }],
                layers: [{ key: 'test', label: 'Test', kind: 'analysis', dim: '2d', levels: ['L1'] }],
            } });
        });
        let releaseSvg;
        const svgGate = new Promise(resolve => { releaseSvg = resolve; });
        await page.route('**/loading-fixture/*.svg', async route => {
            await svgGate;
            await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>' });
        });
        await page.goto(`${base}/v2/analysis.html?data=/loading-fixture/`);
        assert.equal(await page.locator('#loading').isVisible(), true, 'visible while manifest is pending');
        assert.equal(await page.locator('.an-spinner').evaluate(el => getComputedStyle(el).animationName), 'an-spin');
        release();
        await page.locator('#app').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#loading').isVisible(), true, 'visible until SVGs finish');
        releaseSvg();
        await page.locator('#loading').waitFor({ state: 'hidden' });
        assert.equal(await page.locator('#app').getAttribute('aria-busy'), 'false');
        await page.unroute('**/loading-fixture/layers.json*');
        await page.route('**/loading-fixture/layers.json*', route => route.fulfill({ status: 503, body: '' }));
        await page.reload();
        await page.locator('#message').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#loading').isVisible(), false, 'manifest error dismisses spinner');
        await page.unroute('**/loading-fixture/layers.json*');
        await page.route('**/loading-fixture/layers.json*', route => route.fulfill({ json: {
            layers: [{ key: 'broken', label: 'Broken', kind: 'analysis', dim: '3d', file: 'volume.json' }],
        } }));
        await page.route('**/loading-fixture/volume.json', route => route.fulfill({ status: 404, body: '' }));
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#status').textContent.includes('404'));
        assert.equal(await page.locator('#loading').isVisible(), false, 'volume error dismisses spinner');
        await page.goto(`${base}/v2/analysis.html`);
        await page.locator('#message').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#loading').isVisible(), false, 'missing project dismisses spinner');
        console.log('PASS analysis spinner: manifest, SVGs, success, manifest/volume errors, missing project');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
