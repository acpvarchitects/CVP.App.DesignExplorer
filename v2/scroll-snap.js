// Section snapping for the centre card: "scroll snapping" with directional paging.
//
// The card is a column of sections (chart, selected option, options mosaic, comparison). It never
// rests with the edge between two sections inside the view:
//   - a wheel step that would show the next section goes all the way to it (down: the next
//     section's top; up from a section's top: the previous section, its top or, when it is taller
//     than the view, its last screen);
//   - any other scroll (scroll bar, keys, touch, a wheel inside a tall section) settles, when it
//     stops, to the aligned position in the direction it was going; a view that is almost aligned
//     (the layout moved a few pixels) goes back to the nearest section top instead.
// Inside a section taller than the view the scroll is free. A wheel over something that scrolls or
// zooms itself (a table, the 3D view) is left alone. Off while the page itself scrolls (narrow
// screens). CSS scroll-snap alone cannot do this: it snaps to the nearest point, not the next one
// in the direction of the gesture.
//
//   const snap = sectionSnap(scrollerElement, () => [section elements, in order, visible only], { margin })
//   margin: px kept above a section's top (same as the app's own scroll targets).
//   snap.show(element): bring that section's top into place.
//
// While it is on, the card has the class "snap-on" and --snap-view (its height in px), for a
// section that fills the view; and an empty block at its end is kept as tall as needed for the
// last section's top to reach the top of the view (little content under it would otherwise stop
// the scroll half way, with the section above still showing).

const EPS = 3; // px: closer than this is aligned
const NEAR = 48; // px: closer than this to a section top is "almost aligned"
const SETTLE_MS = 140; // quiet time after the last scroll event before settling
const GO_MS = 420;
const GESTURE_GAP_MS = 160; // wheel events closer than this belong to the same gesture
const GESTURE_MAX_MS = 600; // …but the lock never lasts longer than this after the snap

export function sectionSnap(scroller, sections, { margin = 12 } = {}) {
    let animating = false;
    let cancel = null;
    let lastTop = scroller.scrollTop;
    let lastDir = 0;
    let timer = 0;
    let lastWheel = 0;
    let locked = false; // a wheel gesture already moved one section: its tail (touchpad inertia) is ignored
    let landed = 0;

    const active = () => getComputedStyle(scroller).overflowY === "auto";
    const view = () => scroller.clientHeight;
    const max = () => Math.max(0, scroller.scrollHeight - view());
    const spacer = document.createElement("div");
    spacer.setAttribute("aria-hidden", "true");
    scroller.append(spacer);
    const topOf = (el) => Math.round(el.getBoundingClientRect().top - (scroller.getBoundingClientRect().top - scroller.scrollTop) - margin);

    // Scroll positions that put each section's top `margin` under the top of the view; 0 first.
    function tops() {
        const list = [0];
        for (const el of sections()) {
            const top = topOf(el);
            if (top > list[list.length - 1] + EPS) list.push(top);
        }
        return list;
    }

    // The empty block at the end: tall enough for the last section's top to be reachable.
    function fit() {
        if (!active()) return void (spacer.style.height = "0px");
        const last = tops().at(-1);
        for (let pass = 0; pass < 2; pass++) {
            const short = Math.ceil(last - max());
            const height = Math.max(0, spacer.offsetHeight + short);
            if (Math.abs(height - spacer.offsetHeight) < 1) return;
            spacer.style.height = height + "px";
        }
    }

    const nearest = (list, p) => list.find((s) => Math.abs(s - p) <= NEAR) ?? null;
    // The first section edge inside the view at position p (not the one the view is about on), or null.
    const edgeInView = (list, p) => list.find((s) => s > p + NEAR && s < p + view() - EPS) ?? null;
    // Where "up" from the edge `s` lands: the previous section's top, or its last screen when tall.
    function before(list, s) {
        const prev = [...list].reverse().find((t) => t < s - EPS) ?? 0;
        return s - prev >= view() + EPS ? s - view() : prev;
    }

    function go(top) {
        const target = Math.max(0, Math.min(top, max()));
        const start = scroller.scrollTop;
        if (Math.abs(target - start) < 1) return;
        cancel?.();
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
            scroller.scrollTo({ top: target, behavior: "instant" });
            lastTop = target;
            return;
        }
        animating = true;
        const duration = Math.min(GO_MS, 140 + Math.abs(target - start) * 0.6);
        let frame = 0;
        let began = 0;
        const stop = () => {
            cancelAnimationFrame(frame);
            for (const t of ["pointerdown", "touchstart", "keydown"]) window.removeEventListener(t, stop);
            cancel = null;
            lastTop = scroller.scrollTop;
            landed = performance.now();
            animating = false;
        };
        cancel = stop;
        for (const t of ["pointerdown", "touchstart", "keydown"]) window.addEventListener(t, stop, { passive: true });
        const tick = (now) => {
            began ||= now;
            const t = Math.min(1, (now - began) / duration);
            scroller.scrollTo({ top: start + (target - start) * (1 - Math.pow(1 - t, 3)), behavior: "instant" });
            if (t < 1) frame = requestAnimationFrame(tick);
            else stop();
        };
        frame = requestAnimationFrame(tick);
    }

    // Does something between the wheel's target and the card scroll by itself that way?
    function scrollsInside(target, dir) {
        for (let el = target; el && el !== scroller; el = el.parentElement) {
            const style = getComputedStyle(el);
            if (!/(auto|scroll)/.test(style.overflowY) || el.scrollHeight <= el.clientHeight + 1) continue;
            if (dir > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
        }
        return false;
    }

    scroller.addEventListener(
        "wheel",
        (e) => {
            if (!active() || e.defaultPrevented || e.ctrlKey || !e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
            const now = performance.now();
            const gap = now - lastWheel;
            lastWheel = now;
            if (animating) return e.preventDefault(); // one section per gesture
            if (locked) {
                if (gap < GESTURE_GAP_MS && now - landed < GESTURE_MAX_MS) return e.preventDefault();
                locked = false;
            }
            const dir = Math.sign(e.deltaY);
            if (scrollsInside(e.target, dir)) return;
            fit();
            const list = tops();
            const p = scroller.scrollTop;
            let target = null;
            if (dir > 0) target = edgeInView(list, p);
            else {
                const at = nearest(list, p);
                if (at != null) target = at > EPS ? before(list, at) : null;
                else {
                    const edge = edgeInView(list, p);
                    if (edge != null) target = before(list, edge);
                }
            }
            if (target == null || Math.abs(Math.min(target, max()) - p) < 1) return; // free scroll
            e.preventDefault();
            locked = true;
            go(target);
        },
        { passive: false }
    );

    // After any other scroll, or a change of layout: no section edge may stay inside the view,
    // unless the view is aligned on a section's top or at the very end.
    function settle() {
        if (!active() || animating) return;
        fit();
        const list = tops();
        const p = scroller.scrollTop;
        const at = nearest(list, p);
        if (at != null) return go(at);
        if (p >= max() - EPS) return;
        const edge = edgeInView(list, p);
        if (edge != null) go(lastDir < 0 ? before(list, edge) : edge);
    }
    const later = (ms) => {
        clearTimeout(timer);
        timer = setTimeout(settle, ms);
    };

    scroller.addEventListener(
        "scroll",
        () => {
            const p = scroller.scrollTop;
            if (!animating && Math.abs(p - lastTop) >= 1) lastDir = Math.sign(p - lastTop);
            lastTop = p;
            later(SETTLE_MS);
        },
        { passive: true }
    );

    // The view's height, for a section that fills it (the expanded option); and a new settle
    // when the content changes height (an option opens, the chart is redrawn).
    const size = () => {
        scroller.classList.toggle("snap-on", active());
        scroller.style.setProperty("--snap-view", view() + "px");
    };
    const observer = new ResizeObserver(() => {
        size();
        fit();
        later(80);
    });
    observer.observe(scroller);
    for (const child of scroller.children) if (child !== spacer) observer.observe(child);
    size();
    fit();

    return {
        settle,
        // false when the card does not scroll by itself (narrow screens): the caller scrolls the page
        show(el) {
            if (!active() || !el) return false;
            size();
            fit();
            go(topOf(el));
            return true;
        },
    };
}
