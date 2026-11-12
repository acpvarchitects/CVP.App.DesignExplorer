// Run with a local server at 8765 and Playwright installed (or PLAYWRIGHT_MODULE_PATH).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
let browser;

(async () => {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const labels = ['Area-adjusted Horizontal View [%]', 'Area-adjusted Sky View [%]',
        'Area-adjusted Winter sun [h]', 'Winter sun apartments ≥2h [%]',
        'Hotel sun lost [h/day]', 'Hotel overlooked [%]', 'Street noise [dB(A)]'];
    const csv = ['in:Index,' + labels.map((s, i) => `out:${i > 3 ? '↓' : '↑'} ${s}`).join(',') + ',img',
        ...[0, 1, 2, 3].map(i => `${i},${labels.map((_, j) => 20 + i * 3 + j).join(',')},plan.svg`)].join('\n');
    await page.route(url => url.pathname.startsWith('/comparison-fixture/'), route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('data.csv')) return route.fulfill({ contentType: 'text/csv', body: csv });
        if (url.pathname.endsWith('layers.json')) return route.fulfill({ json: {version: 1, layers: []} });
        if (url.pathname.endsWith('plan.svg')) return route.fulfill({ contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#dce4dd"/><path d="M100 100H700V400H100Z" fill="none" stroke="#176a83" stroke-width="5"/></svg>' });
        return route.fulfill({ status: 404, body: '' });
    });
    const baseUrl = new URL(process.env.DE_TEST_URL || 'http://127.0.0.1:8765/v2/?data=/comparison-fixture/&compare=1,2,3');
    await page.goto(baseUrl.href);
    await page.locator('#comparison .cp-axis-label').first().waitFor();
    const results = [];
    for (const viewport of [{width: 1366,height: 768}, {width: 1920,height: 1080}, {width: 1280,height: 720}, {width:1366,height:650}]) {
        await page.setViewportSize(viewport);
        for (const collapsed of [false, true]) {
            if (await page.evaluate(() => document.documentElement.classList.contains('nav-collapsed')) !== collapsed)
                await page.locator('#navToggle').click();
            await page.waitForTimeout(350);
            await page.evaluate(() => {
                const card = document.querySelector('.center-scroll');
                const section = document.querySelector('#comparison');
                card.scrollTop += section.getBoundingClientRect().top - card.getBoundingClientRect().top - 12;
            });
            await page.waitForTimeout(350);
            const bounds = await page.evaluate(() => {
                const section = document.querySelector('#comparison'), card = document.querySelector('.center-scroll');
                const a = section.getBoundingClientRect(), b = card.getBoundingClientRect();
                const chart = section.querySelector('.cp-radar-chart').getBoundingClientRect();
                const labels = [...section.querySelectorAll('.cp-axis-label')].map(el => {
                    const r = el.getBoundingClientRect();return {x:r.left-chart.left,y:r.top-chart.top,right:r.right-chart.left,bottom:r.bottom-chart.top};
                });
                const content = section.querySelector('.cp-content');
                return { top:a.top, bottom:a.bottom, viewTop:b.top, viewBottom:b.bottom, labels,
                    mediaHeight:section.querySelector('.cp-media').clientHeight,
                    contentHeight:content.clientHeight, contentScroll:content.scrollHeight, chartWidth:chart.width,chartHeight:chart.height,
                    pageOverflow:document.documentElement.scrollWidth > innerWidth };
            });
            assert.ok(bounds.top >= bounds.viewTop - 1 && bounds.bottom <= bounds.viewBottom + 1, JSON.stringify(bounds));
            assert.equal(bounds.pageOverflow, false);
            assert.equal(bounds.labels.length, labels.length);
            for (const r of bounds.labels) assert.ok(r.x >= 0 && r.right <= bounds.chartWidth && r.y >= 0 && r.bottom <= bounds.chartHeight, JSON.stringify(r));
            assert.ok(bounds.contentScroll <= bounds.contentHeight + 2, 'Default comparison fits without hidden footer: '+JSON.stringify(bounds));
            results.push({viewport, collapsed, ...bounds});
            await page.screenshot({path: path.join(os.tmpdir(), `comparison-${viewport.width}x${viewport.height}-${collapsed ? 'rail' : 'drawer'}.png`)});
        }
    }
    // Expanding exact values keeps the last row reachable inside the comparison.
    await page.locator('#comparison details summary').click();
    await page.locator('#comparison .cp-table tbody tr:last-child').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('#comparison .cp-table tbody tr:last-child').isVisible());
    // Both ends of the shortlist range, without changing the viewport budget.
    for (const compare of ['1,2', '1,2,3,4']) {
        const url = new URL(baseUrl);url.searchParams.set('compare', compare);
        await page.goto(url.href);
        await page.locator('#comparison .cp-axis-label').first().waitFor();
        await page.waitForTimeout(200);
        assert.equal(await page.locator('#comparison .cp-picks article').count(), compare.split(',').length);
        const overflow = await page.locator('#comparison .cp-content').evaluate(el => el.scrollHeight-el.clientHeight);
        assert.ok(overflow <= 2, '2–4 option comparison fits the same height: '+overflow);
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify(results, null, 2));
    await browser.close();
})().catch(async error => { console.error(error);await browser?.close();process.exitCode = 1; });
