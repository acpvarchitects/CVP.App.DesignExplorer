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
    // Hover previews a region; click pins it. These changes preserve media DOM/viewers.
    const letters = page.locator('#comparison .cp-select-letter');
    const bands = page.locator('#comparison .cp-select-band');
    const box = page.locator('#comparison');
    const state = () => box.evaluate(el => ({selected:el.dataset.cpSelected ?? null,
        active:[...el.querySelectorAll('.cp-radar-shape.cp-active')].map(p=>p.dataset.cpOption),
        muted:[...el.querySelectorAll('.cp-radar-shape.cp-muted')].map(p=>({id:p.dataset.cpOption,
            fill:getComputedStyle(p).fill,stroke:getComputedStyle(p).stroke,width:getComputedStyle(p).strokeWidth})),
        pressed:[...el.querySelectorAll('[data-cp-focus][aria-pressed="true"]')].map(b=>b.dataset.cpFocus)}));
    const ids = await letters.evaluateAll(elements => elements.map(el=>el.dataset.cpFocus));
    await page.evaluate(()=>{window.comparisonMediaBefore=document.querySelector('#comparison .cp-media')});
    await letters.nth(0).hover();
    assert.deepEqual((await state()).active,[ids[0]]);
    assert.equal((await state()).selected,null);
    assert.equal((await state()).muted.length,0,'hover previews without committing isolation');
    await page.locator('#comparison h2').hover();
    assert.equal((await state()).muted.length,0);
    await letters.nth(1).click();
    await page.locator('#comparison h2').hover();
    let emphasis = await state();
    assert.equal(emphasis.selected,ids[1]);
    assert.deepEqual(emphasis.active,[ids[1]]);
    assert.deepEqual(emphasis.pressed,[ids[1],ids[1],ids[1]]);
    assert.ok(emphasis.muted.every(p=>p.fill==='none' && p.stroke==='rgb(169, 175, 177)' && p.width==='1px'));
    await page.screenshot({path:path.join(os.tmpdir(),'comparison-selected.png')});
    await bands.nth(2).hover();
    assert.deepEqual((await state()).active,[ids[2]]);
    assert.equal((await state()).selected,ids[1]);
    await page.locator('#comparison h2').hover();
    assert.deepEqual((await state()).active,[ids[1]]);
    await bands.nth(0).click();
    assert.equal((await state()).selected,ids[0]);
    await letters.nth(0).click();
    assert.equal((await state()).selected,null);
    assert.equal((await state()).muted.length,0);
    const bandStyle = await bands.nth(0).evaluate(el => ({height:el.getBoundingClientRect().height,
        background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el.closest('article')).borderTopWidth}));
    assert.equal(bandStyle.height,18);
    assert.equal(bandStyle.background,'rgba(0, 0, 0, 0)');
    assert.equal(bandStyle.border,'3px');
    // The invisible target extends above the thin visible border.
    await bands.nth(0).click({position:{x:20,y:2}});
    assert.equal((await state()).selected,ids[0]);
    await page.locator('#comparison h2').click();
    assert.equal((await state()).selected,null,'clicking elsewhere inside comparison clears selection');
    assert.equal((await state()).muted.length,0);
    await letters.nth(1).click();
    await page.locator('#projectName').click();
    assert.equal((await state()).selected,null,'clicking outside comparison clears selection');
    await letters.nth(1).click();
    await page.locator('#comparison .cp-radar-chart').click({position:{x:4,y:4}});
    assert.equal((await state()).selected,null,'clicking blank chart space clears selection');
    await letters.nth(1).focus();
    assert.deepEqual((await state()).active,[ids[1]]);
    await page.keyboard.press('Enter');
    assert.equal((await state()).selected,ids[1]);
    await page.keyboard.press('Escape');
    assert.equal((await state()).selected,null);
    await page.locator('#comparison h2').click();
    // Locate a contour sample and a genuinely interior sample independently of SVG hit targets.
    const samples = await page.locator('#comparison .cp-radar-chart svg').evaluate((svg,targetId) => {
        const shapes=[...svg.querySelectorAll('.cp-radar-shape')].map(el=>{
            const m=el.getScreenCTM();
            return {id:el.dataset.cpOption,points:[...el.points].map(p=>({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f}))};
        });
        const distance=(p,pts)=>Math.min(...pts.map((a,i)=>{
            const b=pts[(i+1)%pts.length],dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy;
            const t=d?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d)):0;
            return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
        }));
        const inside=(p,pts)=>{let yes=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){
            const a=pts[i],b=pts[j];if((a.y>p.y)!=(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;
        }return yes;};
        const b=svg.getBoundingClientRect();let outline=null,interior=null;
        for(let y=b.top+.5;y<b.bottom;y+=.75)for(let x=b.left+.5;x<b.right;x+=.75){
            const p={x,y};const ranked=shapes.map(s=>({s,d:distance(p,s.points)})).sort((a,b)=>a.d-b.d);
            if(!outline&&ranked[0].s.id===targetId&&ranked[0].d<1.5&&ranked[1].d-ranked[0].d>.05)outline=p;
            if(!interior&&ranked[0].d>8&&shapes.some(s=>inside(p,s.points)))interior=p;
            if(outline&&interior)return {outline,interior};
        }
        return {outline,interior};
    },ids[2]);
    assert.ok(samples.outline && samples.interior,'both contour and filled-interior samples exist');
    const point=samples.outline;
    await page.mouse.move(point.x,point.y);
    assert.deepEqual((await state()).active,[ids[2]]);
    await page.mouse.click(point.x,point.y);
    assert.equal((await state()).selected,ids[2],'clicking the outer contour pins its option');
    assert.equal((await state()).muted.length,2);
    await page.mouse.click(point.x,point.y);
    assert.equal((await state()).selected,null,'second click on the contour restores all colours');
    await page.mouse.move(samples.interior.x,samples.interior.y);
    assert.deepEqual((await state()).active,[],'the interior is not a hover selection target');
    await page.mouse.click(point.x,point.y);
    await page.mouse.click(samples.interior.x,samples.interior.y);
    assert.equal((await state()).selected,null,'clicking the interior clears rather than selects');
    const shapeA=page.locator(`#comparison .cp-radar-shape[data-cp-option="${ids[0]}"]`);
    await page.locator('#comparison h2').hover();
    await shapeA.focus();
    await page.keyboard.press('Enter');
    assert.equal((await state()).selected,ids[0]);
    await page.keyboard.press('Space');
    assert.equal((await state()).selected,null);
    assert.equal(await shapeA.evaluate(el=>document.activeElement===el),true,'SVG keyboard focus survives toggling');
    assert.equal(await page.evaluate(()=>window.comparisonMediaBefore===document.querySelector('#comparison .cp-media')),true);
    await letters.nth(1).click();
    await page.locator('#comparison select[data-slot="0"]').selectOption('3');
    assert.equal((await state()).selected,ids[1], 'emphasis survives a different option changing');
    await page.locator('#comparison select[data-slot="1"]').selectOption('0');
    assert.equal((await state()).selected,null,'replacing the highlighted option clears stale emphasis');
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
