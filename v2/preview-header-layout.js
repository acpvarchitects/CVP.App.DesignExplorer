// Reserve the complete controls row, including navigation, before wrapping identity text.
export class PreviewHeaderLayout {
    constructor(bar) {
        this.bar=bar;
        this.pending=0;
        this.observer=new ResizeObserver(()=>this.schedule());
        this.observer.observe(bar);
        this.observer.observe(bar.querySelector('.preview-controls'));
        document.fonts?.ready.then(()=>this.schedule());
    }

    schedule() {
        if(this.pending)return;
        this.pending=requestAnimationFrame(()=>{this.pending=0;this.fit();});
    }

    fit() {
        const bar=this.bar,width=bar.clientWidth;
        if(!width||!bar.getClientRects().length)return;
        const textWidth=el=>{
            if(!el||!el.textContent.trim()||!el.getClientRects().length)return 0;
            const range=document.createRange();range.selectNodeContents(el);
            return range.getBoundingClientRect().width;
        };
        const method=textWidth(bar.querySelector('#previewMethod'));
        const title=textWidth(bar.querySelector('#previewTitle'));
        const summary=bar.querySelector('#previewSummary');
        const note=summary?.textContent.trim()?summary.getBoundingClientRect().width:0;
        const controls=bar.querySelector('.preview-controls');
        const parts=[...controls.children].filter(el=>el.getClientRects().length);
        const gap=parseFloat(getComputedStyle(controls).columnGap)||0;
        const controlsWidth=parts.reduce((sum,el)=>{
            const w=el.id==='modeButtons'
                ? [...el.children].reduce((n,b)=>n+b.getBoundingClientRect().width,0)+2
                : el.getBoundingClientRect().width;
            return sum+w;
        },0)+gap*Math.max(0,parts.length-1);
        const identityGap=8*(Number(method>0)+Number(title>0)+Number(note>0)-1);
        const withoutMethod=title+(note?8+note:0);
        const rowGap=parseFloat(getComputedStyle(bar).columnGap)||0;
        const full=method+title+note+Math.max(0,identityGap)+4+rowGap+controlsWidth;
        const row=withoutMethod+rowGap+controlsWidth;
        const layout=full<=width?'inline':method&&row<=width?'batch-top':'identity-top';
        if(bar.dataset.headerLayout!==layout)bar.dataset.headerLayout=layout;
    }
}
