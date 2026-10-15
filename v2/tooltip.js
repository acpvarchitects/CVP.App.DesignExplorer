// Tooltips as the library's (Angular Material `matTooltip` with the ACPV theme): inverse-surface
// container, 12px text, 4px corner, fade in/out, no delay. Every element with a `title` gets one
// (the native `title` is moved to `data-tooltip` so the browser's own bubble never shows).
// `data-tooltip-pos="right"` puts it beside the element (rail items), the default is below.
// `data-tooltip-rail` marks the side-nav rows: their tooltip only exists while the sidebar is the rail.
const tip = document.createElement("div");
tip.className = "acpv-tooltip";
tip.setAttribute("role", "tooltip");
document.body.appendChild(tip);
let current = null;

const compact = matchMedia("(max-width: 839px)");

function textOf(el) {
    const t = el.getAttribute("title");
    if (t != null) {
        el.setAttribute("data-tooltip", t);
        el.removeAttribute("title");
    }
    return el.getAttribute("data-tooltip") || "";
}

function allowed(el) {
    if (!el.hasAttribute("data-tooltip-rail")) return true;
    return document.documentElement.classList.contains("nav-collapsed") && !compact.matches;
}

function place(el) {
    const r = el.getBoundingClientRect();
    const gap = 8;
    const t = tip.getBoundingClientRect();
    let x;
    let y;
    if (el.getAttribute("data-tooltip-pos") === "right") {
        x = r.right + gap;
        y = r.top + (r.height - t.height) / 2;
    } else {
        x = r.left + (r.width - t.width) / 2;
        y = r.bottom + gap;
    }
    x = Math.max(8, Math.min(x, innerWidth - t.width - 8));
    if (y + t.height > innerHeight - 8) y = r.top - gap - t.height; // no room below: above
    tip.style.left = `${Math.round(x)}px`;
    tip.style.top = `${Math.round(Math.max(8, y))}px`;
}

function show(el) {
    const text = textOf(el);
    if (!text || !allowed(el)) return hide();
    current = el;
    tip.textContent = text;
    tip.classList.add("on");
    place(el);
}

function hide() {
    current = null;
    tip.classList.remove("on");
}

const target = (e) => e.target.closest?.("[title], [data-tooltip]");

document.addEventListener("mouseover", (e) => {
    const el = target(e);
    if (el && el !== current) show(el);
    else if (!el) hide();
});
document.addEventListener("mouseout", (e) => {
    if (current && !current.contains(e.relatedTarget)) hide();
});
document.addEventListener("focusin", (e) => {
    const el = target(e);
    if (el && e.target.matches?.(":focus-visible")) show(el);
});
document.addEventListener("focusout", hide);
document.addEventListener("keydown", (e) => e.key === "Escape" && hide());
document.addEventListener("click", hide, true);
addEventListener("scroll", hide, true);
