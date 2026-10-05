// Parallel coordinates: one vertical axis per input/result, one line per option.
// Goals are drawn with "better" at the top (↓ goals are flipped), so a line that
// stays high is good on every goal. Dragging on an axis filters the options.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const HEIGHT = 280;
const MARGIN = { top: 48, right: 80, bottom: 22, left: 80 };
const GROUP_GAP = 10; // px between the batches of a grouped axis

export class ParallelChart {
    constructor(el, { onBrush, onSelect, onInfo, onGroup }) {
        this.el = el;
        this.onBrush = onBrush;
        this.onSelect = onSelect;
        this.onInfo = onInfo; // axis title clicked (axes with `info` only)
        this.onGroup = onGroup; // coloured bar of a grouped axis clicked: its group key
        this.ranges = new Map(); // column -> [low, high], in data units
        this.svg = d3.select(el).append("svg").attr("class", "pc").attr("height", HEIGHT);
        this.linesLayer = this.svg.append("g").attr("class", "pc-lines");
        this.axesLayer = this.svg.append("g").attr("class", "pc-axes");
        this.width = 0;
        new ResizeObserver(() => {
            if (this.el.clientWidth && this.el.clientWidth !== this.width) this.build();
        }).observe(el);
    }

    // A grouped axis (`groups` + `groupOf(o)`) stacks one segment per group (batch), top to bottom,
    // with a gap and a coloured bar each: groups: [{ key, color, on, count, domain: [lo, hi] }].
    // It has no drag filter: the bars are the filter.
    // model: { scope, options, axes: [{ col, label, dir, value(o), info, groups, groupOf }], selected, matches(o), colorOf(o), shortlist }
    // `scope` names the option set (for example the method shown): a new scope redraws the axes.
    update(model) {
        const rebuild =
            !this.model ||
            !this.width ||
            this.model.scope !== model.scope ||
            this.model.axes.map((a) => a.col).join() !== model.axes.map((a) => a.col).join();
        this.model = model;
        if (rebuild) this.build();
        else this.drawLines();
    }

    // Ranges set from outside the chart (the sidebar): column -> [low, high], either end may be infinite.
    setRanges(ranges) {
        this.ranges = new Map(ranges);
        if (this.model) this.build();
    }

    // Whether an option passes every axis the user dragged on.
    accepts(o) {
        if (!this.model) return true;
        for (const [col, [lo, hi]] of this.ranges) {
            const axis = this.model.axes.find((a) => a.col === col);
            const v = axis && axis.value(o);
            if (!(v >= lo && v <= hi)) return false;
        }
        return true;
    }

    clearRanges() {
        this.ranges.clear();
        if (this.model) this.build();
    }

    build() {
        if (!this.model) return;
        const { axes, options } = this.model;
        this.width = this.el.clientWidth;
        this.svg.attr("width", this.width).attr("viewBox", `0 0 ${this.width} ${HEIGHT}`);
        this.x = d3.scalePoint(axes.map((a) => a.col), [MARGIN.left, this.width - MARGIN.right]);
        this.segments = new Map(axes.filter((a) => a.groups).map((a) => [a.col, segmentsOf(a)]));
        this.y = new Map(
            axes.filter((a) => !a.groups).map((a) => {
                // An optional target widens the axis so its marker always fits.
                const vals = options.map((o) => a.value(o)).concat(a.target ?? []).filter(Number.isFinite);
                const scale = d3.scaleLinear().domain(d3.extent(vals)).nice();
                // Better at the top: ↓ goals put their lowest value up.
                scale.range(a.dir < 0 ? [MARGIN.top, HEIGHT - MARGIN.bottom] : [HEIGHT - MARGIN.bottom, MARGIN.top]);
                return [a.col, scale];
            })
        );
        // Forget drag ranges on axes that no longer exist.
        for (const col of this.ranges.keys()) if (!this.y.has(col)) this.ranges.delete(col);

        const spacing = axes.length > 1 ? this.x.step() : this.width;
        const axis = this.axesLayer
            .selectAll("g.pc-axis")
            .data(axes, (a) => a.col)
            .join("g")
            .attr("class", "pc-axis")
            .attr("transform", (a) => `translate(${this.x(a.col)},0)`);
        axis.each((a, i, nodes) => {
            const g = d3.select(nodes[i]);
            g.selectChildren().remove();
            if (a.groups) this.drawGroups(g, a);
            else g.append("g").call(d3.axisLeft(this.y.get(a.col)).ticks(5).tickSizeOuter(0));
            const label = g.append("text").attr("class", "pc-label").attr("y", 12).attr("text-anchor", "middle");
            wrap(label, a.label, spacing - 12, a.info ? " ⓘ" : "");
            // A described axis: its title opens "About" (pointer + ⓘ so it can be found).
            if (a.info) label.classed("has-info", true).on("click", () => this.onInfo?.(a.col));
            g.append("text")
                .attr("class", "pc-hint")
                .attr("y", MARGIN.top - 8)
                .attr("text-anchor", "middle")
                .text(a.dir > 0 ? "↑ better" : a.dir < 0 ? "↓ better (flipped)" : "");
            if (a.groups) return; // no drag filter on a grouped axis
            const brush = d3
                .brushY()
                .extent([
                    [-12, MARGIN.top],
                    [12, HEIGHT - MARGIN.bottom],
                ])
                .on("brush end", (event) => this.brushed(a, event));
            const bg = g.append("g").attr("class", "pc-brush").call(brush);
            const range = this.ranges.get(a.col);
            if (range) {
                const y = this.y.get(a.col);
                const [d0, d1] = y.domain();
                const clamp = (v) => Math.min(Math.max(v, Math.min(d0, d1)), Math.max(d0, d1));
                bg.call(brush.move, [y(clamp(range[0])), y(clamp(range[1]))].sort((p, q) => p - q));
            }
            // Target (optional): red dot on the axis with its value, above the brush, not catching the mouse.
            if (Number.isFinite(a.target)) {
                const t = g
                    .append("g")
                    .attr("class", "pc-target")
                    .attr("transform", `translate(0,${this.y.get(a.col)(a.target)})`);
                t.append("circle").attr("r", 4.5);
                // two lines: "target", then the value
                const label = t.append("text").attr("x", 8).attr("y", -3);
                label.append("tspan").attr("x", 8).text("target");
                if (a.targetText) label.append("tspan").attr("x", 8).attr("dy", "1.1em").text(a.targetText);
            }
        });
        this.drawLines();
    }

    // One small axis per group, and a coloured bar beside it: hover names the group, click filters.
    drawGroups(g, a) {
        const bars = g.append("g");
        const hover = g.append("text").attr("class", "pc-group-name").attr("x", 14).attr("text-anchor", "start");
        for (const s of this.segments.get(a.col)) {
            const span = s.y1 - s.y0;
            const ticks = s.single ? [s.group.domain[0]] : s.scale.ticks(Math.max(2, Math.floor(span / 45)));
            g.append("g").call(d3.axisLeft(s.scale).tickValues(ticks).tickFormat(d3.format("~g")).tickSizeOuter(0));
            const bar = bars
                .append("rect")
                .attr("class", "pc-group" + (s.group.on ? "" : " off"))
                .attr("x", 4)
                .attr("width", 6)
                .attr("rx", 2)
                .attr("y", s.y0)
                .attr("height", Math.max(span, 4))
                .attr("fill", s.group.color)
                .on("mouseenter", () => hover.attr("y", (s.y0 + s.y1) / 2 + 4).attr("fill", s.group.color).text(s.group.key))
                .on("mouseleave", () => hover.text(""))
                .on("click", () => this.onGroup?.(s.group.key));
            bar.append("title").text(`${s.group.key}: click to filter to this batch, again to clear`);
        }
        hover.raise(); // the name is drawn over the ticks
    }

    brushed(a, event) {
        if (!event.sourceEvent) return; // moved by code, not by the user
        const y = this.y.get(a.col);
        if (event.selection) {
            const [lo, hi] = event.selection.map((p) => y.invert(p)).sort((p, q) => p - q);
            this.ranges.set(a.col, [lo, hi]);
        } else {
            this.ranges.delete(a.col);
        }
        this.onBrush();
    }

    drawLines() {
        const { options, axes, selected, matches, colorOf, shortlist } = this.model;
        const line = d3
            .line()
            .defined((d) => Number.isFinite(d[1]))
            .x((d) => this.x(d[0]))
            .y((d) => d[1]);
        // Pixel height of option o on axis a (grouped axes: inside o's own segment).
        const at = (a, o) => {
            const v = a.value(o);
            if (!Number.isFinite(v)) return NaN;
            if (!a.groups) return this.y.get(a.col)(v);
            const s = this.segments.get(a.col).find((x) => x.group.key === a.groupOf(o));
            return s ? s.scale(v) : NaN;
        };
        const layer = (o) => (o === selected ? 3 : shortlist.includes(o.index) ? 2 : matches(o) ? 1 : 0);
        // Fainter lines when there are many, so overlapping studies stay visible.
        this.svg.style("--pc-opacity", Math.max(0.25, Math.min(0.6, 40 / options.length)).toFixed(2));
        // Faded lines first, the selected option last (on top).
        const sorted = [...options].sort((p, q) => layer(p) - layer(q));
        this.linesLayer
            .selectAll("path")
            .data(sorted, (o) => o.index)
            .join((enter) =>
                enter
                    .append("path")
                    .on("click", (event, o) => this.onSelect(o.index))
                    .call((p) => p.append("title"))
            )
            .order()
            .attr("d", (o) => line(axes.map((a) => [a.col, at(a, o)])))
            .attr("class", (o) => ["pc-line", "pc-l" + layer(o)].join(" "))
            .attr("stroke", (o) => (layer(o) === 0 ? null : layer(o) === 3 ? null : colorOf(o)))
            .select("title")
            .text((o) => o.title);
    }
}

// Segments of a grouped axis, top to bottom in group order. Height follows the group's size
// (at least 8% of the axis, so a one-option batch stays clickable). Low values at the top, so
// reading down goes batch 1 index 1…n, batch 2 index 1…n. A one-value group sits mid-segment.
function segmentsOf(a) {
    const groups = a.groups;
    const total = groups.reduce((n, g) => n + g.count, 0);
    const weights = groups.map((g) => Math.max(g.count, total * 0.08));
    const sum = weights.reduce((p, q) => p + q, 0);
    const free = HEIGHT - MARGIN.bottom - MARGIN.top - GROUP_GAP * (groups.length - 1);
    let y = MARGIN.top;
    return groups.map((group, i) => {
        const y0 = y;
        const y1 = y0 + (free * weights[i]) / sum;
        y = y1 + GROUP_GAP;
        const [lo, hi] = group.domain;
        const single = lo === hi;
        const scale = d3.scaleLinear().domain(single ? [lo - 1, lo + 1] : [lo, hi]).range([y0, y1]);
        return { group, y0, y1, scale, single };
    });
}

// Splits an axis label over at most two lines so neighbours don't overlap.
// `suffix` (e.g. the ⓘ of a described axis) follows the last line.
function wrap(text, label, width, suffix = "") {
    const words = label.split(/\s+/);
    const lines = [""];
    for (const w of words) {
        const next = lines[lines.length - 1] ? lines[lines.length - 1] + " " + w : w;
        if (next.length * 6.5 > width && lines[lines.length - 1] && lines.length < 2) lines.push(w);
        else lines[lines.length - 1] = next;
    }
    lines.forEach((l, i) => text.append("tspan").attr("x", 0).attr("dy", i ? 14 : 0).text(l + (i === lines.length - 1 ? suffix : "")));
    text.append("title").text(suffix ? label + " · click for a description" : label);
}
