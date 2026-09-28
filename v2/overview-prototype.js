// THROWAWAY: Which overview makes two methods easiest to scan and evaluate?
// Three structures on /v2/?variant=A|B|C; existing loader and original v2 retained.
import { Viewer } from './viewer.js';
import { ParallelChart } from './parallel.js';
export function mountPrototype(data) {
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const fmt = v => Number.isFinite(v) ? v.toLocaleString(undefined,{maximumFractionDigits:1}) : '—';
    const url = new URL(location.href);
    let variant = ['A','B','C'].includes(url.searchParams.get('variant')) ? url.searchParams.get('variant') : 'A';
    let method = '', metric = data.schema.outputs[0], ranges = {}, visible = [], selected = null, viewer, chart;
    let inputAxes = [];
    const valueOf = (o, col) => col in o.values ? o.values[col] : Number(o.row[col]);
    let previewKind = 'images', previewLayer = 0;
    const names = {A:'Visual overview',B:'Methods side by side',C:'Results table'};
    const asset = (o, col) => { const name=o.row[col]; return !name ? '' : /^(https?:|data:|\/)/.test(name) ? name : o.study.base + name; };
    const image = o => asset(o, data.schema.images[0]?.col);
    const title = o => o.title.replace(o.study.name + ' · ', '');
    const direction = m => m.dir < 0 ? 'Lower is better' : m.dir > 0 ? 'Higher is better' : 'High to low · no preferred direction';
    const sort = rows => [...rows].sort((a,b) => {
        const av=a.values[metric.col], bv=b.values[metric.col];
        return !Number.isFinite(av) ? 1 : !Number.isFinite(bv) ? -1 : (bv-av)*(metric.dir || 1);
    });
    const css = document.createElement('link'); css.rel='stylesheet'; css.href='./overview-prototype.css'; document.head.append(css);
    document.body.classList.add('prototype');
    document.querySelector('#projectName').textContent=data.studies.map(s=>s.name).join(' + ');
    document.querySelector('#optionCount').textContent=data.options.length+' options';
    document.querySelector('#shareBtn').hidden=true;
    const oldLink=document.querySelector('#classicLink'); oldLink.textContent='Current v2'; const original=new URL(location.href); original.searchParams.delete('variant'); oldLink.href=original;
    const app=document.querySelector('#app'); app.hidden=false; app.className='proto-app';
    app.innerHTML=`<div class="proto-heading"><div><span class="eyebrow">EXPLORE THE STUDY</span><h1>Find the options worth a closer look</h1><p>Explore both methods together, or focus on one. Filters apply across methods.</p></div><span class="prototype-tag">Layout prototype · real study data</span></div>
    <nav id="method-tabs" aria-label="Methods"></nav>
    <div class="proto-workspace"><aside class="proto-filters"><div class="filter-title"><h2>Measurements</h2><button id="proto-clear">Reset</button></div><p class="muted">Keep options within these ranges.</p><div id="proto-ranges"></div></aside>
    <section class="proto-results"><div class="result-toolbar"><div><h2 id="result-count"></h2><span id="scope-note" class="muted"></span></div><label>Order by <select id="proto-sort">${data.schema.outputs.map((m,i)=>`<option value="${i}">${esc(m.label)} ${m.dir<0?'↓':m.dir>0?'↑':''}</option>`).join('')}</select><small id="sort-direction"></small></label></div><div id="method-summary"></div><section id="proto-chart-panel" aria-label="Chart filters"><span id="chart-filter-count" hidden></span><div class="chart-tools"><span>Drag a range on any axis. Click a line to inspect an option.</span><label><input id="chart-inputs" type="checkbox"> Show inputs</label><button id="chart-clear">Clear chart filters</button></div><div id="chart-active-ranges"></div><div class="proto-chart-scroll"><div id="proto-chart"></div></div><p class="chart-legend">Blue / amber: methods · dark red: inspected option · pale lines: filtered out</p></section><div id="proto-options"></div></section></div>`;
    const dialog=document.createElement('section'); dialog.className='proto-detail'; dialog.innerHTML=`<div class="detail-head"><div><span id="detail-method" class="eyebrow"></span><h2 id="detail-title"></h2></div><button id="detail-close" aria-label="Expand preview" aria-expanded="false">Expand preview</button></div><div class="detail-controls"><button id="detail-prev">← Previous</button><div id="detail-modes" class="seg" aria-label="Preview mode"></div><select id="detail-layer" aria-label="Preview layer" hidden></select><button id="detail-next">Next →</button></div><img id="detail-image" alt=""><div id="detail-3d" hidden></div><p id="detail-status"></p><div id="detail-values"></div><p class="muted">Compared with all matching options in the current method selection.</p>`; document.querySelector('.proto-results').prepend(dialog);
    const switcher=document.createElement('div');switcher.className='proto-switcher';switcher.innerHTML='<span>TRY A LAYOUT</span><button id="variant-prev" aria-label="Previous layout">←</button><strong id="variant-name"></strong><button id="variant-next" aria-label="Next layout">→</button>';document.body.append(switcher);
    const $=id=>document.getElementById(id);
    $('proto-options').after($('method-summary'));
    const top = document.createElement('div'); top.className='overview-top';
    const intro = document.createElement('div'); intro.className='overview-intro';
    app.prepend(top); top.append(intro, $('proto-chart-panel'));
    intro.append(app.querySelector('.proto-heading'), $('method-tabs'));

    function filters() {
        $('proto-ranges').innerHTML=data.schema.outputs.map((m,i)=>{ const s=data.stats[m.col], r=ranges[m.col]||[s.min,s.max];return `<fieldset><legend>${esc(m.label)}</legend><small>${esc(direction(m))}</small><div class="range-inputs"><label>Min<input type="number" step="any" data-range="${i}" data-bound="0" value="${r[0]}" aria-label="${esc(m.label)} minimum"></label><span>–</span><label>Max<input type="number" step="any" data-range="${i}" data-bound="1" value="${r[1]}" aria-label="${esc(m.label)} maximum"></label></div>${m.dir?`<button class="quick-filter" data-better="${i}">Better than average</button>`:''}</fieldset>`;}).join('');
    }
    function card(o) {return `<button class="option-card" data-open="${o.index}" style="--method:${o.study.color}"><div class="option-image"><img loading="lazy" src="${esc(image(o))}" alt="${esc(title(o))}"></div><div class="option-body"><span class="method-label">${esc(o.study.name)}</span><h3>${esc(title(o))}</h3><div class="card-value"><strong>${fmt(o.values[metric.col])}</strong><span>${esc(metric.label)}</span></div></div></button>`;}
    function render(fromBrush = false) {
        const scope=data.options.filter(o=>!method||o.study.name===method);
        inputAxes=data.schema.inputs.filter(m=>scope.every(o=>o.row[m.col]!=null&&o.row[m.col]!==''&&Number.isFinite(Number(o.row[m.col]))));
        for(const m of data.schema.inputs)if(!inputAxes.includes(m))delete ranges[m.col];
        $('chart-inputs').parentElement.hidden=!inputAxes.length;
        if(!inputAxes.length)$('chart-inputs').checked=false;
        visible=sort(data.options.filter(o=>(!method||o.study.name===method)&&Object.entries(ranges).every(([col,[lo,hi]])=>Number.isFinite(valueOf(o,col))&&valueOf(o,col)>=lo&&valueOf(o,col)<=hi)));
        $('method-tabs').innerHTML=[['','All methods'],...data.studies.map(s=>[s.name,s.name])].map(([key,label])=>`<button data-method="${esc(key)}" aria-pressed="${method===key}">${esc(label)} <span>${data.options.filter(o=>!key||o.study.name===key).length}</span></button>`).join('');
        $('result-count').textContent=`${visible.length} of ${data.options.filter(o=>!method||o.study.name===method).length} options`;
        $('scope-note').textContent=`${method||'All methods'} · ${Object.keys(ranges).length ? Object.keys(ranges).length+' active measurement filters' : 'No measurement filters'}`;
        $('sort-direction').textContent=direction(metric);
        const summaries=data.studies.filter(s=>!method||s.name===method).map(s=>{
            const rows=visible.filter(o=>o.study===s), vals=rows.map(o=>o.values[metric.col]).filter(Number.isFinite).sort((a,b)=>a-b), mid=Math.floor(vals.length/2), med=vals.length?(vals.length%2?vals[mid]:(vals[mid-1]+vals[mid])/2):NaN;
            const total=data.options.filter(o=>o.study===s).length;
            return `<article class="method-summary" style="--method:${s.color}"><div><strong>${esc(s.name)}</strong><span>${rows.length}/${total} match · ${Math.round(rows.length/total*100)}%</span></div><p>${esc(metric.label)}</p><div class="summary-values"><span>${metric.dir?'Best result':'Highest result'} <b>${fmt(rows[0]?.values[metric.col])}</b></span><span>Typical result <small>(median)</small> <b>${fmt(med)}</b></span></div>${rows.length?`<button data-open="${rows[0].index}">Inspect ${esc(title(rows[0]))} ↗</button>`:'<span>No matching options</span>'}</article>`;
        });
        $('method-summary').innerHTML=`<div class="method-summary-label"><strong>Compare methods</strong><span>${esc(metric.label)} · matching options only</span></div>`+summaries.join('');
        const list=$('proto-options');list.className='variant-'+variant;
        if(!visible.length) list.innerHTML='<div class="empty-options"><h2>No options match these ranges</h2><p>Widen a measurement range or use Reset to see all options again.</p></div>';
        else if(variant==='A') list.innerHTML=visible.map(card).join('');
        else if(variant==='B') list.innerHTML=data.studies.filter(s=>!method||s.name===method).map(s=>`<section class="method-column"><h2 style="color:${s.color}">${esc(s.name)} <span class="muted">${visible.filter(o=>o.study===s).length} options</span></h2><div class="method-grid">${visible.filter(o=>o.study===s).map(card).join('')||'<p>No matching options</p>'}</div></section>`).join('');
        else list.innerHTML=`<table><thead><tr><th>Option</th><th>Method</th>${data.schema.outputs.map(m=>`<th>${esc(m.label)} ${m.dir<0?'↓':m.dir>0?'↑':''}</th>`).join('')}</tr></thead><tbody>${visible.map(o=>`<tr><td><button class="table-option" data-open="${o.index}"><img loading="lazy" src="${esc(image(o))}" alt="">${esc(title(o))}</button></td><td><span class="method-label" style="--method:${o.study.color}">${esc(o.study.name)}</span></td>${data.schema.outputs.map(m=>`<td class="${m===metric?'sorted-cell':''}">${fmt(o.values[m.col])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        $('variant-name').textContent=variant+' · '+names[variant];
        url.searchParams.set('variant',variant);history.replaceState(null,'',url);
        dialog.hidden = !visible.length;
        if (visible.length) open((visible.includes(selected) ? selected : visible[0]).index);
        updateChart(fromBrush);
        $('chart-filter-count').textContent=Object.keys(ranges).length ? '· '+Object.keys(ranges).length+' active ranges' : '';
        $('chart-active-ranges').innerHTML=Object.entries(ranges).map(([col,[lo,hi]])=>{const m=[...data.schema.outputs,...inputAxes].find(m=>m.col===col);return `<span>${esc(m?.label||col)}: ${fmt(lo)} – ${fmt(hi)}</span>`;}).join('');
    }
    function renderMediaControls() {
        const labels={images:'Image',models:'3D model',analyses:'3D analysis'};
        $('detail-modes').innerHTML=Object.entries(labels).map(([key,label])=>`<button data-preview="${key}" aria-pressed="${previewKind===key}" class="${previewKind===key?'on':''}" ${data.schema[key].length?'':'disabled title="No analysis files in this study"'}>${label}</button>`).join('');
        const layers=data.schema[previewKind];
        $('detail-layer').hidden=layers.length<2;
        $('detail-layer').innerHTML=layers.map((l,i)=>`<option value="${i}">${esc(l.label)}</option>`).join('');
        $('detail-layer').value=String(previewLayer);
    }
    $('detail-modes').onclick=e=>{const button=e.target.closest('[data-preview]');if(!button||button.disabled)return;previewKind=button.dataset.preview;previewLayer=0;renderMediaControls();showMedia();};
    $('detail-layer').onchange=e=>{previewLayer=+e.target.value;showMedia();};
    function showMedia() {
        const kind=previewKind, i=previewLayer; const layer=data.schema[kind]?.[+i]; const src=layer?asset(selected,layer.col):''; const is3d=kind!=='images';
        $('detail-image').hidden=is3d; $('detail-3d').hidden=!is3d; $('detail-status').textContent=src?'':'No file for this view.';
        if(is3d){if(!viewer)viewer=new Viewer($('detail-3d'),text=>$('detail-status').textContent=text);viewer.clear();if(src)viewer.show(src);}
        else {viewer?.clear();$('detail-image').src=src;$('detail-image').alt=title(selected);}
    }
    function open(index) {
        selected=data.options[index];$('detail-title').textContent=title(selected);$('detail-method').textContent=selected.study.name;
        if(!data.schema[previewKind].length){previewKind=['images','models','analyses'].find(k=>data.schema[k].length)||'images';previewLayer=0;}
        renderMediaControls();
        $('detail-values').innerHTML=`<h3>Where this option stands</h3><p class="standing-scope">Among ${visible.length} matching options · ${esc(method||'all methods')}</p>`+data.schema.outputs.map(m=>{
            const rows=visible.filter(o=>Number.isFinite(o.values[m.col])), v=selected.values[m.col], vals=rows.map(o=>o.values[m.col]);
            if(!Number.isFinite(v)||!vals.length)return `<div class="standing"><span>${esc(m.label)}</span><strong>—</strong><small>No result available</small></div>`;
            const lo=Math.min(...vals),hi=Math.max(...vals), pos=n=>hi===lo?50:100*(m.dir<0?(hi-n)/(hi-lo):(n-lo)/(hi-lo));
            const worse=rows.filter(o=>m.dir*(v-o.values[m.col])>0).length,better=rows.filter(o=>m.dir*(o.values[m.col]-v)>0).length;
            const verdict=!m.dir?'No preferred direction':rows.length===1?'Only matching option':hi===lo?'All matching options have the same value':better===0?'Best result'+(rows.length-worse>1?' · shared':''):worse===0?'Lowest performance in this group':`Better than ${worse} of ${rows.length-1} other options`;
            const dots=rows.filter(o=>o!==selected).map(o=>`<i class="other-dot" style="left:${pos(o.values[m.col])}%" aria-hidden="true"></i>`).join('');
            return `<div class="standing"><div class="standing-heading"><span>${esc(m.label)}</span><strong>${fmt(v)}</strong></div><div class="standing-track" role="img" aria-label="${esc(m.label+': '+fmt(v)+'. '+verdict)}">${dots}<i class="selected-dot" style="left:${pos(v)}%" aria-hidden="true"></i></div><div class="standing-ends"><span>${m.dir?'Worse':'Lower'}</span><span>${m.dir?'Better':'Higher'}</span></div><small class="standing-verdict">${verdict}</small></div>`;
        }).join('')+'<p class="dot-key">● Large dot: this option · small dots: others</p>';
        const pos=visible.indexOf(selected);$('detail-prev').disabled=pos<=0;$('detail-next').disabled=pos>=visible.length-1;
        showMedia();
        app.querySelectorAll('[data-open]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.open===index)));
        if(chart?.model)chart.update({...chart.model,selected});
    }
    app.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-method')){method=b.dataset.method;render();}if(b.hasAttribute('data-open'))open(+b.dataset.open);if(b.hasAttribute('data-better')){const m=data.schema.outputs[+b.dataset.better],s=data.stats[m.col];ranges[m.col]=m.dir>0?[s.mean,s.max]:[s.min,s.mean];filters();render();}if(b.id==='proto-clear'){ranges={};filters();render();}});
    app.addEventListener('change',e=>{if(e.target.id==='proto-sort'){metric=data.schema.outputs[+e.target.value];render();}if(e.target.hasAttribute('data-range')){const m=data.schema.outputs[+e.target.dataset.range],s=data.stats[m.col],bound=+e.target.dataset.bound,v=e.target.valueAsNumber;ranges[m.col]??=[s.min,s.max];ranges[m.col][bound]=Number.isFinite(v)?v:(bound?s.max:s.min);render();}});
    $('detail-close').onclick=()=>{const expanded=dialog.classList.toggle('expanded');$('detail-close').textContent=expanded?'Compact preview':'Expand preview';$('detail-close').setAttribute('aria-expanded',String(expanded));};
    $('detail-prev').onclick=()=>open(visible[visible.indexOf(selected)-1].index);$('detail-next').onclick=()=>open(visible[visible.indexOf(selected)+1].index);
    const cycle=delta=>{variant=['A','B','C'][(['A','B','C'].indexOf(variant)+delta+3)%3];render();};
    $('variant-prev').onclick=()=>cycle(-1);$('variant-next').onclick=()=>cycle(1);
    document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,[contenteditable]'))return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();cycle(e.key==='ArrowLeft'?-1:1);}});
    function updateChart(fromBrush) {

        if(!chart)chart=new ParallelChart($('proto-chart'),{onBrush:()=>{ranges=Object.fromEntries(chart.ranges);filters();render(true);},onSelect:index=>{if(visible.some(o=>o.index===index))open(index);}});
        const axes=[...($('chart-inputs').checked?inputAxes.map(m=>({...m,dir:0,value:o=>Number(o.row[m.col])})):[]),...data.schema.outputs.map(m=>({...m,value:o=>o.values[m.col]}))];
        const nextRanges=new Map(Object.entries(ranges));
        const changed=JSON.stringify([...chart.ranges])!==JSON.stringify([...nextRanges]);
        chart.ranges=nextRanges;
        chart.update({options:data.options.filter(o=>!method||o.study.name===method),axes,selected:visible.length?selected:null,matches:o=>visible.includes(o),colorOf:o=>o.study.color,shortlist:[]});
        if(changed&&!fromBrush)chart.build();
    }

    $('chart-clear').onclick=()=>{ranges={};filters();render();};
    $('chart-inputs').onchange=()=>{if(!$('chart-inputs').checked)inputAxes.forEach(m=>delete ranges[m.col]);filters();render();};
    filters();render();
}
