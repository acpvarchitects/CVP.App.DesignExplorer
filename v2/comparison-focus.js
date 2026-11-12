// Local emphasis only: never redraw cards or reload their interactive viewers.
export class ComparisonFocus {
    constructor(root) {
        this.root = root;
        this.selected = null;
        this.hovered = null;
        this.focused = null;
        const control = target => target?.closest?.('[data-cp-focus]');
        root.addEventListener('pointerover', e => {
            const next = control(e.target);
            if (!next || next === control(e.relatedTarget)) return;
            this.hovered = next.dataset.cpFocus;
            this.apply();
        });
        root.addEventListener('pointerout', e => {
            const previous = control(e.target);
            if (!previous || previous === control(e.relatedTarget)) return;
            this.hovered = null;
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
            const button = control(e.target);
            if (!button) return;
            const id = button.dataset.cpFocus;
            this.selected = this.selected === id ? null : id;
            this.hovered = this.focused = null;
            this.apply();
        });
        root.addEventListener('keydown', e => {
            if (e.key !== 'Escape' || (!this.selected && !this.hovered && !this.focused)) return;
            e.preventDefault();
            e.stopPropagation();
            this.selected = this.hovered = this.focused = null;
            this.apply();
        });
    }

    sync(optionIds) {
        if (!optionIds.map(String).includes(this.selected)) this.selected = null;
        this.hovered = this.focused = null;
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
        for (const shape of shapes) if (!shape.classList.contains('cp-active')) shape.parentNode.append(shape);
        for (const shape of shapes) if (shape.classList.contains('cp-active')) shape.parentNode.append(shape);
    }
}
