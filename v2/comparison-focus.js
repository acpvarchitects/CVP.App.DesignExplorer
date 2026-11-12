// Local emphasis only: never redraw cards or reload their interactive viewers.
export class ComparisonFocus {
    constructor(root) {
        this.root = root;
        this.selected = null;
        this.hovered = null;
        this.focused = null;
        const control = target => target?.closest?.('[data-cp-focus]');
        const preview = e => {
            const next = this.controlAt(e);
            root.classList.toggle('cp-radar-line-hover', !!next?.matches('.cp-radar-shape'));
            const id = next?.dataset.cpFocus ?? null;
            if (this.hovered === id) return;
            this.hovered = id;
            this.apply();
        };
        root.addEventListener('pointerover', preview);
        root.addEventListener('pointermove', preview);
        root.addEventListener('pointerleave', () => {
            this.hovered = null;
            root.classList.remove('cp-radar-line-hover');
            this.apply();
        });
        root.addEventListener('focusin', e => {
            this.focused = control(e.target)?.dataset.cpFocus ?? null;
            this.apply();
        });
        root.addEventListener('focusout', e => {
            this.focused = control(e.relatedTarget)?.dataset.cpFocus ?? null;
            this.apply();
        });
        root.addEventListener('click', e => {
            const button = this.controlAt(e);
            if (!button) return;
            this.toggle(button.dataset.cpFocus);
        });
        root.ownerDocument.addEventListener('click', e => {
            if (root.contains(e.target) && this.controlAt(e)) return;
            if (this.selected !== null || this.hovered !== null || this.focused !== null) this.clear();
        });
        root.addEventListener('keydown', e => {
            const shape = e.target.closest?.('.cp-radar-shape');
            if (shape && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                e.stopPropagation();
                this.toggle(shape.dataset.cpFocus);
                return;
            }
            if (e.key !== 'Escape' || (!this.selected && !this.hovered && !this.focused)) return;
            e.preventDefault();
            e.stopPropagation();
            this.clear();
        });
    }

    controlAt(event) {
        const svg = event.target.closest?.('.cp-radar-chart svg');
        if (!svg) return event.target.closest?.('[data-cp-focus]');
        // Pick the nearest contour, in screen pixels, even where polygons overlap.
        // Interior fill and stacking order must never decide which option wins.
        let nearest = null, best = 25; // 5px tolerance around the outer boundary
        const shapes = [...svg.querySelectorAll('.cp-radar-shape')]
            .sort((a,b) => Number(a.dataset.cpOrder)-Number(b.dataset.cpOrder));
        for (const shape of shapes) {
            const matrix = shape.getScreenCTM();
            if (!matrix) continue;
            const points = [...shape.points].map(p => ({
                x:matrix.a*p.x+matrix.c*p.y+matrix.e,
                y:matrix.b*p.x+matrix.d*p.y+matrix.f,
            }));
            points.forEach((a,i) => {
                const b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y;
                const length=dx*dx+dy*dy;
                const t=length ? Math.max(0,Math.min(1,((event.clientX-a.x)*dx+(event.clientY-a.y)*dy)/length)) : 0;
                const d=(event.clientX-a.x-t*dx)**2+(event.clientY-a.y-t*dy)**2;
                if (d<best) { best=d;nearest=shape; }
            });
        }
        return nearest;
    }

    toggle(id) {
        this.selected = this.selected === id ? null : id;
        this.hovered = this.focused = null;
        this.apply();
    }

    clear() {
        this.selected = this.hovered = this.focused = null;
        this.root.classList.remove('cp-radar-line-hover');
        this.apply();
    }

    sync(optionIds) {
        if (!optionIds.map(String).includes(this.selected)) this.selected = null;
        this.hovered = this.focused = null;
        this.root.classList.remove('cp-radar-line-hover');
        this.apply();
    }

    apply() {
        const active = this.hovered ?? this.focused ?? this.selected;
        this.root.classList.toggle('cp-preselect', active !== null && active !== this.selected);
        if (this.selected !== null) this.root.dataset.cpSelected = this.selected;
        else delete this.root.dataset.cpSelected;
        for (const element of this.root.querySelectorAll('[data-cp-option]')) {
            const matches = element.dataset.cpOption === active;
            element.classList.toggle('cp-active', active !== null && matches);
            element.classList.toggle('cp-muted', this.selected !== null && !matches);
        }
        for (const button of this.root.querySelectorAll('[data-cp-focus]')) {
            button.setAttribute('aria-pressed', String(button.dataset.cpFocus === this.selected));
        }
        const shapes = [...this.root.querySelectorAll('.cp-radar-shape')]
            .sort((a, b) => Number(a.dataset.cpOrder) - Number(b.dataset.cpOrder));
        if (shapes.includes(this.root.ownerDocument.activeElement)) return;
        const order = shapes.filter(s => !s.classList.contains('cp-active'))
            .concat(shapes.filter(s => s.classList.contains('cp-active')));
        const group = shapes[0]?.parentNode;
        // Move only siblings that are out of place; preserve the focused SVG node.
        order.forEach((shape, i) => {
            if (group.children[i] !== shape) group.insertBefore(shape, group.children[i] ?? null);
        });
    }
}
