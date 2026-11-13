const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path'),os=require('node:os');
let browser;
(async()=>{
    browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:1600,height:900},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8124/v2/?PROJECT=ZRCH_B4_F_20261112,ZRCH_B23_F_20261112,ZRCH_STEP12_B4_20261112,ZRCH_STEP12_B19_20261112&option=1&mode=model');
    await page.locator('[data-standings-toggle]').waitFor();
    const widthBefore=await page.locator('.center').evaluate(el=>el.clientWidth);
    await page.locator('[data-standings-toggle]').click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#standingsContent').isVisible(),false);
    assert.ok((await page.locator('#sidesheet').boundingBox()).width<=45);
    assert.ok((await page.locator('.center').evaluate(el=>el.clientWidth))>widthBefore+150);
    await page.locator('[data-standings-toggle]').click();
    assert.equal(await page.locator('#standingsContent').isVisible(),true);
    const results=[];
    // Set the header's available width directly: independent of left/right sidebar breakpoints.
    for(const width of [1400,1100,950,850,780,700,620,430,300]){
        await page.locator('.preview-bar').evaluate((el,w)=>{el.style.width=w+'px';el.style.maxWidth='none';},width);
        await page.waitForTimeout(130);
        const state=await page.locator('.preview-bar').evaluate(el=>{
            const rect=s=>{const r=el.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
            return {width:el.clientWidth,layout:el.dataset.headerLayout,method:rect('#previewMethod'),title:rect('#previewTitle'),
                    modes:rect('#modeButtons'),nav:rect('.preview-nav'),buttons:[...el.querySelectorAll('.preview-nav button')].map(b=>b.getBoundingClientRect().y)};
        });
        assert.ok(state.buttons.every(y=>Math.abs(y-state.buttons[0])<1),'navigation never splits internally');
        if(state.layout==='batch-top'){
            assert.ok(state.method.y<state.title.y);
            assert.ok(Math.abs(state.modes.y-state.nav.y)<3,'batch wraps before navigation does');
            assert.ok(Math.abs(state.title.y-state.modes.y)<15,'Index stays with the controls in the first wrap');
        } else if(state.layout==='identity-top'){
            assert.ok(state.title.y<state.modes.y,'Index moves up before controls split');
            assert.ok(Math.abs(state.modes.x-state.method.x)<2,'controls realign to the left');
        }
        results.push(state);
    }
    assert.ok(results.some(s=>s.layout==='inline'));
    assert.ok(results.some(s=>s.layout==='batch-top'));
    assert.ok(results.some(s=>s.layout==='identity-top'));
    await page.locator('.preview-bar').evaluate(el=>{el.style.width='';el.style.maxWidth='';});
    await page.waitForTimeout(200);
    await page.screenshot({path:path.join(os.tmpdir(),'preview-header-responsive.png')});
    // Narrow layout keeps the same collapse control when standings move under the image.
    await page.setViewportSize({width:900,height:800});
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#preview > #standings').count(),1);
    await page.locator('[data-standings-toggle]').click();
    assert.equal(await page.locator('#standingsContent').isVisible(),false);
    await page.locator('#nextOption').click();
    assert.equal(await page.locator('#standingsContent').isVisible(),false,'collapsed state survives changing options');
    await page.locator('[data-standings-toggle]').click();
    assert.equal(await page.locator('#standingsContent').isVisible(),true);
    assert.equal(await page.locator('#layerToggles .layer-toggles-title').count(),0);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify(results.map(s=>({width:s.width,layout:s.layout})),null,2));
    console.log('PASS wrap priority, compact navigation, left alignment, collapsible standings and Layers heading removal');
    await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
