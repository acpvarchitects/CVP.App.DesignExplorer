// Independent media for the comparison slots. Existing canvases survive page redraws.
import { Viewer } from './viewer.js?v=36';
import { PlanViewer } from './plan2d.js?v=6';

export class ComparisonMedia {
    constructor({ assetUrl, partsFor, parseCsv, esc, fmt, fadeContext }) {
        Object.assign(this, { assetUrl, partsFor, parseCsv, esc, fmt, fadeContext });
        this.slots = new Map();
    }

    mount(box, chosen, view) {
        for (const [i, slot] of this.slots) {
            if (i >= chosen.length) { this.disposeSlot(slot); this.slots.delete(i); }
        }
        chosen.forEach((option, i) => {
            const host = box.querySelector(`[data-cp-media="${i}"]`);
            let slot = this.slots.get(i);
            if (!slot) {
                host.innerHTML = `<img class="cp-image" hidden alt="">
                    <div class="cp-3d" hidden></div><div class="cp-2d" hidden></div>
                    <div class="cp-data-table" hidden></div><img class="cp-legend" hidden alt="Colour legend">
                    <button type="button" class="cp-reset" hidden>Reset view</button><span class="cp-status" role="status"></span>`;
                slot = { root: host, version: 0 };
                for (const name of ['image', '3d', '2d', 'data-table', 'legend', 'reset', 'status']) {
                    slot[name] = host.querySelector(`.cp-${name}`);
                }
                slot.reset.addEventListener('click', () => slot.is2d ? slot.plan?.reset() : slot.viewer?.resetView());
                this.slots.set(i, slot);
            } else if (host !== slot.root) {
                host.replaceWith(slot.root);
            }
            const key = `${option.index}|${view?.key || ''}`;
            if (key !== slot.key) {
                slot.key = key;
                const pending = this.show(slot, option, view);
                const version = slot.version;
                pending.catch(() => {
                    if (slot.version === version) slot.status.textContent = 'This view could not be loaded.';
                });
            }
        });
    }

    async show(slot, option, view) {
        const version = ++slot.version;
        slot.abort?.abort();
        slot.is3d = false;
        slot.is2d = false;
        slot.viewer?.clear();
        for (const name of ['image', '3d', '2d', 'data-table', 'legend', 'reset']) slot[name].hidden = true;
        slot.status.textContent = '';
        if (!view) { slot.status.textContent = 'No views available.'; return; }
        const { mode, layer } = view;
        const raw = layer.col ? (option.row[layer.col] || '').trim() : '';
        const url = this.assetUrl(option, raw);
        if (mode === 'image') {
            if (!url) { slot.status.textContent = 'No image for this option.'; return; }
            slot.image.alt = `${option.title} · ${view.label}`;
            slot.image.onerror = () => { if (version === slot.version) slot.status.textContent = 'The image did not load.'; };
            slot.image.src = url;
            slot.image.hidden = false;
            return;
        }
        if (mode === 'table') {
            if (!url) { slot.status.textContent = 'No table for this option.'; return; }
            slot['data-table'].hidden = false;
            slot['data-table'].replaceChildren();
            slot.status.textContent = 'Loading table…';
            slot.abort = new AbortController();
            const response = await fetch(url, { signal: slot.abort.signal });
            if (!response.ok) throw Error('Table unavailable');
            const rows = this.parseCsv((await response.text()).replace(/^\uFEFF/, ''));
            if (version !== slot.version) return;
            const cell = value => value !== '' && Number.isFinite(Number(value))
                ? `<td class="num">${this.fmt(Number(value))}</td>` : `<td>${this.esc(value)}</td>`;
            slot['data-table'].innerHTML = `<table><thead><tr>${rows.columns.map(c => `<th>${this.esc(c)}</th>`).join('')}</tr></thead>
                <tbody>${rows.map(row => `<tr${/^total/i.test(row[rows.columns[0]] || '') ? ' class="total"' : ''}>
                    ${rows.columns.map(c => cell(row[c] ?? '')).join('')}</tr>`).join('')}</tbody></table>`;
            slot.status.textContent = '';
            return;
        }
        if (mode === 'analysis' && /\.svg$/i.test(raw)) {
            slot.is2d = true;
            slot['2d'].hidden = false;
            slot.reset.hidden = false;
            slot.plan ||= new PlanViewer(slot['2d']);
            await slot.plan.show([{ url, className: 'plan2d-analysis' }]);
            return;
        }
        const parts = this.partsFor(option, layer, mode);
        if (!parts) { slot.status.textContent = 'No 3D file for this option.'; return; }
        slot.is3d = true;
        slot['3d'].hidden = false;
        slot.reset.hidden = false;
        slot.viewer ||= new Viewer(slot['3d'], text => { if (slot.is3d) slot.status.textContent = text; });
        if (slot.study !== option.study) { slot.viewer.centred = false; slot.viewer.framed = false; }
        slot.study = option.study;
        if (mode === 'analysis' && layer.legendCol) {
            slot.legend.src = this.assetUrl(option, (option.row[layer.legendCol] || '').trim() || `${layer.legendCol}.png`);
            slot.legend.hidden = false;
            slot.legend.onerror = () => { slot.legend.hidden = true; };
        }
        await slot.viewer.compose(parts, { fadeContext: this.fadeContext(view) });
    }

    disposeSlot(slot) {
        slot.version++;
        slot.abort?.abort();
        slot.viewer?.dispose();
        slot.plan?.dispose();
        slot.root.remove();
    }

    clear() {
        for (const slot of this.slots.values()) this.disposeSlot(slot);
        this.slots.clear();
    }
}
