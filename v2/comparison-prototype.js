// THROWAWAY: three comparison structures on /v2/?prototype=comparison&variant=A|B|C.
// Uses the host's real data/shortlist. No deployment or persistence beyond host URL state.
let ctx, root, switcher, baseline, sticky, returnPosition=null, variant='B';
// The bottom bar is not permanent: it pops up for a few seconds after the shortlist changes.
let lastCount=null, hideTimer=null;
const POPUP_MS=5000;
function popUp(){
    sticky.hidden=false;
    clearTimeout(hideTimer);
    hideTimer=setTimeout(()=>{sticky.hidden=true;},POPUP_MS);
}
let cancelScroll;
function scrollWithinPage(top, arrival) {
    cancelScroll?.();
    const start=window.scrollY;
    const target=Math.max(0,Math.min(top,document.documentElement.scrollHeight-window.innerHeight));
    const finish=()=>{if(arrival){arrival.classList.remove('cp-arrived');void arrival.offsetWidth;arrival.classList.add('cp-arrived');}};
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){window.scrollTo({top:target,behavior:'instant'});finish();return;}
    // Slow enough to follow where you're going: 1.3 s for short jumps, up to 2.6 s for long ones.
    const duration=Math.min(2600,Math.max(1300,Math.abs(target-start)*.3));
    let frame, began;
    const stop=()=>{cancelAnimationFrame(frame);window.removeEventListener('wheel',stop);window.removeEventListener('touchstart',stop);window.removeEventListener('keydown',stop);cancelScroll=null;};
    cancelScroll=stop;
    window.addEventListener('wheel',stop,{passive:true});window.addEventListener('touchstart',stop,{passive:true});window.addEventListener('keydown',stop);
    function tick(now){began??=now;const t=Math.min(1,(now-began)/duration);const eased=-(Math.cos(Math.PI*t)-1)/2;window.scrollTo({top:start+(target-start)*eased,behavior:'instant'});if(t<1)frame=requestAnimationFrame(tick);else{stop();finish();}}
    frame=requestAnimationFrame(tick);
}
function scrollToComparison(){scrollWithinPage(window.scrollY+root.getBoundingClientRect().top-20,root);}
const colors=['#176a83','#bc6332','#7655a2','#448452'];
const names={A:'Pictures + comparison table',B:'Radar + strengths',C:'Compare against one option'};
export function renderComparison(next) {
    ctx=next;
    if(!root){
        const css=document.createElement('link');css.rel='stylesheet';css.href='./comparison-prototype.css?v=2';document.head.append(css);
        root=document.createElement('section');root.id='comparison-prototype';root.className='card';
        document.querySelector('.insight').before(root);
        document.querySelector('.insight').hidden=true;
        switcher=document.createElement('div');switcher.className='compare-switcher';root.after(switcher);
        sticky=document.createElement('nav');sticky.className='cp-sticky';sticky.setAttribute('aria-label','Shortlist comparison');document.body.append(sticky);
        sticky.hidden=true;
        sticky.onclick=e=>{if(e.target.closest('[data-see]')&&ctx.selected.length>=2){sticky.hidden=true;returnPosition={x:scrollX,y:scrollY};scrollToComparison();}if(e.target.closest('[data-clear]'))ctx.change([]);if(e.target.closest('[data-back]'))goBack();};
        sticky.onmouseenter=()=>clearTimeout(hideTimer); // stays while the pointer is on it
        sticky.onmouseleave=()=>{hideTimer=setTimeout(()=>{sticky.hidden=true;},1500);};
        // Same "See comparison" in the shortlist line above the gallery (scrolls with the page).
        document.getElementById('shortlistBar').addEventListener('click',e=>{if(e.target.closest('[data-see-inline]')&&ctx.selected.length>=2){returnPosition={x:scrollX,y:scrollY};scrollToComparison();}});
        switcher.onclick=e=>{const b=e.target.closest('[data-variant]');if(b){variant=b.dataset.variant;draw();root.scrollIntoView({block:'start',behavior:'smooth'});}};
        root.addEventListener('change',e=>{
            if(e.target.matches('[data-slot]')){const ids=chosen().map(o=>o.index);ids[+e.target.dataset.slot]=+e.target.value;ctx.change([...new Set(ids)]);}
            if(e.target.id==='compare-baseline'){baseline=+e.target.value;draw();}
        });
        root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-back'))goBack();if(b.hasAttribute('data-remove'))ctx.change(chosen().filter(o=>o.index!==+b.dataset.remove).map(o=>o.index));if(b.hasAttribute('data-add')){const others=ctx.data.options.filter(o=>!chosen().includes(o));if(others.length)ctx.change([...chosen().map(o=>o.index),others[0].index]);}});
    }
    if(!names[variant])variant='A';
    draw();
}
function goBack(){
    if(returnPosition)scrollWithinPage(returnPosition.y);
    else scrollWithinPage(window.scrollY+document.getElementById('gallery').getBoundingClientRect().top-20);
}
function chosen(){return ctx.selected.map(i=>ctx.data.options[i]);}
function draw(){
    const {data,esc:E,fmt:F,thumbUrl}=ctx, options=chosen(), goals=data.schema.outputs.filter(m=>m.dir), all=data.options;
    if(lastCount!==null&&options.length!==lastCount&&options.length>0)popUp();
    if(!options.length)sticky.hidden=true;
    lastCount=options.length;
    document.querySelectorAll('.cp-see-inline').forEach(b=>b.remove());
    if(options.length>=2)document.getElementById('shortlistBar').insertAdjacentHTML('beforeend','<button type="button" class="cp-see-inline" data-see-inline>See comparison ↓</button>');
    sticky.innerHTML=`<strong>${options.length} selected</strong><span>${options.length===0?'Use Compare on gallery cards':options.length===1?'Select one more option':''}</span><button data-see ${options.length<2?'disabled':''}>See comparison ↓</button>${options.length?'<button data-clear>Clear</button>':''}<button data-back>Back to options ↑</button>`;
    root.hidden=options.length<2;switcher.hidden=options.length<2;
    if(options.length<2)return;
    const label=o=>o.title.startsWith(o.study.name+' · ')?o.title.slice(o.study.name.length+3):o.title;
    const rows=data.schema.outputs.map(m=>{
        const valid=options.filter(o=>Number.isFinite(o.values[m.col]));
        const ranked=[...valid].sort((a,b)=>(m.dir||1)*(b.values[m.col]-a.values[m.col]));
        const pool=all.map(o=>o.values[m.col]).filter(Number.isFinite);
        const best=pool.length?(m.dir<0?Math.min(...pool):Math.max(...pool)):NaN;
        const noise=/dB/i.test(m.label);
        const near=(a,b)=>noise?Math.abs(a-b)<1e-9:a===b||Math.abs(a-b)/Math.max(Math.abs(b),1e-9)<.02;
        const leaders=m.dir&&ranked.length?ranked.filter(o=>near(o.values[m.col],ranked[0].values[m.col])):[];
        return {m,ranked,best,noise,near,leaders,min:Math.min(...pool),max:Math.max(...pool)};
    });
    const badge=(o,r)=>r.leaders.includes(o)?(r.leaders.length>1?(r.noise?'Same value':'About the same'):'Best of selected'):'';
    const gap=(o,r)=>{const v=o.values[r.m.col];if(!Number.isFinite(v)||!Number.isFinite(r.best))return '—';if(!r.m.dir)return 'No preferred direction';const d=Math.abs(v-r.best);return d<1e-9?'Matches best found':`${F(d)} ${r.m.label.match(/\[([^\]]+)\]/)?.[1]==='%'?'percentage points':r.m.label.match(/\[([^\]]+)\]/)?.[1]||'units'} from best`;};
    const summaries=options.map((o,i)=>{
        const wins=rows.filter(r=>r.leaders.length===1&&r.leaders[0]===o).map(r=>r.m.label);
        const shared=rows.filter(r=>r.leaders.length>1&&r.leaders.includes(o)).map(r=>r.m.label);
        return `<article class="cp-strength" style="--option:${colors[i]}"><strong>${String.fromCharCode(65+i)} · ${E(label(o))}</strong><p>${wins.length?'Leads on '+wins.map(E).join(', ')+'.':'No sole lead on these measurements.'}</p>${shared.length?`<small>Close to the lead: ${shared.map(E).join(', ')}.</small>`:''}</article>`;
    }).join('');
    const top=`<header class="cp-head"><div><span class="cp-kicker">COMPARE OPTIONS · LOCAL PROTOTYPE</span><h2>Which trade-offs work for you?</h2><p>${options.length} selected · reference: all ${all.length} options across ${data.studies.length} loaded methods</p></div><button data-back>Back to options ↑</button></header><div class="cp-picks">${options.map((o,i)=>`<article style="--option:${colors[i]}"><img src="${E(thumbUrl(o)||'')}" alt="${E(label(o))}"><div><b>${String.fromCharCode(65+i)}</b><select data-slot="${i}" aria-label="Option ${String.fromCharCode(65+i)}">${data.studies.map(s=>`<optgroup label="${E(s.name)}">${data.options.filter(x=>x.study===s).map(x=>`<option value="${x.index}" ${x===o?'selected':''}>${E(label(x))}</option>`).join('')}</optgroup>`).join('')}</select><small>${E(o.study.name)}</small><button data-remove="${o.index}" aria-label="Remove ${E(label(o))}">Remove</button></div></article>`).join('')}${options.length<4?'<button data-add>Add option +</button>':''}</div>${!ctx.selected.length?'<p class="cp-demo">Example selection: three different measurement leaders. Change the options here or use Compare on the gallery cards.</p>':''}`;
    const table=`<div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Measurement</th>${options.map((o,i)=>`<th style="color:${colors[i]}">${String.fromCharCode(65+i)} · ${E(label(o))}</th>`).join('')}<th class="cp-reference">Best found¹</th></tr></thead><tbody>${rows.map(r=>`<tr><th>${E(r.m.label)}<small>${r.m.dir>0?'Higher is better':r.m.dir<0?'Lower is better':'No preferred direction'}</small></th>${options.map(o=>`<td class="${r.leaders.includes(o)?'cp-leading':''}"><b>${F(o.values[r.m.col])}</b><small>${badge(o,r)||gap(o,r)}</small></td>`).join('')}<td class="cp-reference"><b>${r.m.dir?F(r.best):'—'}</b></td></tr>`).join('')}</tbody></table></div>`;
    let body='';
    if(variant==='A')body=`<div class="cp-strengths">${summaries}</div>${table}`;
    if(variant==='B'){
        const n=goals.length,cx=240,cy=215,R=155;
        const point=(i,f)=>[cx+Math.cos(i*2*Math.PI/n-Math.PI/2)*R*f,cy+Math.sin(i*2*Math.PI/n-Math.PI/2)*R*f];
        const poly=f=>goals.map((m,i)=>point(i,f).join(',')).join(' ');
        const score=(o,r)=>!Number.isFinite(o.values[r.m.col])?0:r.max===r.min?1:r.m.dir<0?(r.max-o.values[r.m.col])/(r.max-r.min):(o.values[r.m.col]-r.min)/(r.max-r.min);
        const gr=rows.filter(r=>r.m.dir);
        const radar=goals.length>=3?`<svg viewBox="0 0 480 440" role="img" aria-label="Radar chart. Outer edge is best observed for each measurement; inner point is worst observed.">${[.25,.5,.75,1].map(f=>`<polygon points="${poly(f)}" fill="none" stroke="#dce4dd" ${f===1?'stroke-dasharray="5 4"':''}/>`).join('')}${goals.map((m,i)=>{const p=point(i,1),t=point(i,1.16);return `<line x1="${cx}" y1="${cy}" x2="${p[0]}" y2="${p[1]}" stroke="#e1e7e1"/><text x="${t[0]}" y="${t[1]}" text-anchor="middle" font-size="12" fill="#516054">${i+1}</text>`;}).join('')}${options.map((o,j)=>`<polygon points="${gr.map((r,i)=>point(i,score(o,r)).join(',')).join(' ')}" fill="${colors[j]}" fill-opacity=".06" stroke="${colors[j]}" stroke-width="2.5"/>`).join('')}</svg>`:'<p>Radar needs at least three directional measurements.</p>';
        body=`<div class="cp-radar-layout"><div class="cp-radar">${radar}<p>Outward = better · dashed edge = best found¹</p><ol>${goals.map(m=>`<li>${E(m.label)}</li>`).join('')}</ol></div><div><h3>What each option does better</h3>${summaries}<p class="cp-note">Axes are normalized across all loaded options, from worst to best. Shape area is not an overall score.</p></div></div><details><summary>See exact values and best-found reference</summary>${table}</details>`;
    }
    if(variant==='C'){
        if(!options.some(o=>o.index===baseline))baseline=options[0]?.index;
        const base=options.find(o=>o.index===baseline),others=options.filter(o=>o!==base);
        body=`<div class="cp-baseline"><label>Compare against <select id="compare-baseline">${options.map((o,i)=>`<option value="${o.index}" ${o===base?'selected':''}>${String.fromCharCode(65+i)} · ${E(label(o))}</option>`).join('')}</select></label><p>Read each alternative as a change from this option.</p></div><div class="cp-duels">${others.map(o=>`<article><h3>${E(label(o))} <small>vs ${E(label(base))}</small></h3>${rows.map(r=>{const a=o.values[r.m.col],b=base.values[r.m.col],delta=a-b;const valid=Number.isFinite(a)&&Number.isFinite(b);const same=valid&&r.near(a,b);const better=valid&&r.m.dir*delta>0;return `<div class="cp-delta"><span>${E(r.m.label)}</span><b class="${!valid||!r.m.dir||same?'neutral':better?'positive':'negative'}">${!valid?'—':same?'About the same':`${delta>0?'+':''}${F(delta)}`}</b><small>${!valid?'Missing result':same?'':!r.m.dir?'Difference only':better?'Better':'Worse'} · ${gap(o,r)}</small></div>`;}).join('')}</article>`).join('')}</div>${!others.length?'<p>Add a second option to compare.</p>':''}`;
    }
    root.innerHTML=top+body+`<footer class="cp-note">¹ Best found uses a separate best value for every measurement, across all loaded options. It is not one buildable option. Filters do not change this reference. Close results use the existing 2% rule; noise is shown in dB(A), with only equal values called the same. Noise tolerance needs a domain decision.</footer>`;
    switcher.innerHTML=`<button data-variant="${['A','B','C'][(['A','B','C'].indexOf(variant)+2)%3]}" aria-label="Previous comparison layout">←</button><span>COMPARISON PROTOTYPE</span>${['A','B','C'].map(v=>`<button data-variant="${v}" aria-pressed="${v===variant}">${v} · ${names[v]}</button>`).join('')}<button data-variant="${['A','B','C'][(['A','B','C'].indexOf(variant)+1)%3]}" aria-label="Next comparison layout">→</button>`;
    const u=new URL(location.href);u.searchParams.set('variant',variant);history.replaceState(null,'',u);
}
