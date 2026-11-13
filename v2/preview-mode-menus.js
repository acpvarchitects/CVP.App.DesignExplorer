const MENU_MODES = new Set(['analysis', 'table']);

export function previewModesHtml({modes,layersOf,state,esc}) {
    return modes.map(mode => {
        const list=layersOf(mode.key),active=mode.key===state.mode,hasMenu=MENU_MODES.has(mode.key);
        const current=active&&hasMenu ? list[state.layer[mode.key]]?.label : '';
        const title=mode.label+(current?' · '+current:'');
        return `<button type="button" data-mode="${mode.key}" class="${active?'on':''}" aria-pressed="${active}"
            ${hasMenu?'aria-haspopup="menu" aria-expanded="false" aria-controls="previewModeMenu"':''}
            ${list.length?'':`disabled`} aria-label="${esc(title)}" title="${esc(list.length?title:'No '+mode.label.toLowerCase()+' files in this study')}">
            ${current?`<span class="preview-mode-current">${esc(current)}</span>`:`<span>${mode.label}</span>`}
            ${hasMenu?'<span aria-hidden="true">▾</span>':''}</button>`;
    }).join('');
}

export class PreviewModeMenus {
    constructor({host,modes,layersOf,getState,choose,esc}) {
        Object.assign(this,{host,modes,layersOf,getState,choose,esc});
        this.menu=document.createElement('div');
        this.menu.id='previewModeMenu';
        this.menu.className='preview-mode-menu';
        this.menu.setAttribute('popover','manual');
        this.menu.setAttribute('role','menu');
        document.body.append(this.menu);
        host.addEventListener('click',event=>{
            const button=event.target.closest('button[data-mode]');
            if(!button||button.disabled)return;
            if(MENU_MODES.has(button.dataset.mode))this.open(button);
            else this.select(button.dataset.mode);
        });
        host.addEventListener('keydown',event=>{
            const button=event.target.closest('button[data-mode][aria-haspopup]');
            if(!button||button.disabled||!['ArrowDown','ArrowUp'].includes(event.key))return;
            event.preventDefault();event.stopPropagation();
            this.open(button,event.key==='ArrowUp'?'last':'first');
        });
        this.menu.addEventListener('click',event=>{
            const item=event.target.closest('button[data-layer-index]');
            if(item)this.select(this.key,Number(item.dataset.layerIndex));
        });
        this.menu.addEventListener('keydown',event=>this.keydown(event));
        document.addEventListener('pointerdown',event=>{
            if(!this.menu.contains(event.target)&&!this.trigger?.contains(event.target))this.close();
        });
        window.addEventListener('resize',()=>this.close());
        document.addEventListener('scroll',event=>{
            if(this.trigger&&!this.menu.contains(event.target))this.position();
        },true);
    }

    render() {
        this.close();
        this.host.innerHTML=previewModesHtml({modes:this.modes,layersOf:this.layersOf,state:this.getState(),esc:this.esc});
    }

    open(button,edge=null) {
        if(this.trigger===button&&this.menu.matches(':popover-open')&&!edge){this.close(true);return;}
        this.close();
        this.trigger=button;this.key=button.dataset.mode;
        const state=this.getState();
        this.menu.setAttribute('aria-label',this.modes.find(m=>m.key===this.key).label);
        this.menu.innerHTML=this.layersOf(this.key).map((layer,index)=>{
            const checked=state.mode===this.key&&state.layer[this.key]===index;
            return `<button type="button" role="menuitemradio" aria-checked="${checked}" data-layer-index="${index}">
                <span class="preview-mode-check" aria-hidden="true">${checked?'✓':''}</span><span>${this.esc(layer.label)}</span></button>`;
        }).join('');
        this.menu.showPopover();
        button.setAttribute('aria-expanded','true');
        this.position();
        const items=[...this.menu.querySelectorAll('button')];
        (edge==='last'?items.at(-1):edge==='first'?items[0]:this.menu.querySelector('[aria-checked="true"]')||items[0])?.focus();
    }

    position() {
        if(!this.trigger||!this.menu.matches(':popover-open'))return;
        const rect=this.trigger.getBoundingClientRect();
        if(rect.bottom<0||rect.top>window.innerHeight){this.close();return;}
        this.menu.style.maxHeight=Math.min(360,window.innerHeight-16)+'px';
        const height=this.menu.offsetHeight,width=this.menu.offsetWidth;
        const below=window.innerHeight-rect.bottom-8,above=rect.top-8;
        const upwards=height>below&&above>below;
        this.menu.style.maxHeight=Math.max(80,Math.min(360,upwards?above:below))+'px';
        this.menu.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-width-8))+'px';
        this.menu.style.top=(upwards?Math.max(8,rect.top-this.menu.offsetHeight-4):rect.bottom+4)+'px';
    }

    close(focus=false) {
        if(this.menu.matches(':popover-open'))this.menu.hidePopover();
        const trigger=this.trigger;
        trigger?.setAttribute('aria-expanded','false');
        this.trigger=null;
        if(focus)trigger?.focus();
    }

    select(key,index) {
        this.close();
        this.choose(key,index);
        this.host.querySelector(`[data-mode="${key}"]`)?.focus();
    }

    keydown(event) {
        const items=[...this.menu.querySelectorAll('button')];
        const index=items.indexOf(document.activeElement);
        const targets={ArrowDown:items[(index+1)%items.length],ArrowUp:items[(index-1+items.length)%items.length],Home:items[0],End:items.at(-1)};
        if(targets[event.key]){event.preventDefault();event.stopPropagation();targets[event.key].focus();}
        else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close(true);}
        else if(event.key==='Tab'){
            event.preventDefault();
            const trigger=this.trigger;this.close();
            const fields=[...document.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')]
                .filter(el=>el.getClientRects().length);
            fields[(fields.indexOf(trigger)+(event.shiftKey?-1:1)+fields.length)%fields.length]?.focus();
        }
    }
}
