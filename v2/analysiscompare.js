import { studyEntries, sharedLegend, linkedView } from "./analysiscompare-state.js?v=1";

export function startComparison(params) {
    const entries = studyEntries(params);
    const slots = entries.map(() => ({ state: null }));
    let tab = ["0", "1", "compare"].includes(params.get("tab")) ? params.get("tab") : "0";
    let linked = params.get("linked") !== "0";
    let active = 0;
    const $ = id => document.getElementById(id);
    $("app").remove();
    $("exportBtn").remove();
    $("projectName").textContent = "Compare analyses";
    $("projectNote").textContent = "2 options";
    document.title = "Compare analyses · Design Explorer";
    const main = document.createElement("main");
    main.className = "ac-dashboard";
    main.innerHTML = `<nav class="ac-tabs seg" aria-label="Study views"></nav>
        <div class="ac-actions"><label><input id="acLink" type="checkbox"> Link views</label>
        <label><input id="acDetails" type="checkbox"> Show analysis details</label>
        <label>Scenario <select id="acScenario" aria-label="Comparison scenario"></select></label>
        <span id="acStatus" class="muted small" role="status"></span></div>
        <div id="acLegend" class="ac-legend" aria-label="Shared colour legend" hidden></div>
        <div class="ac-panes"></div>`;
    document.body.insertBefore(main, $("message"));
    const tabs = main.querySelector("nav"), panes = main.querySelector(".ac-panes");
    const send = (i, action, value) => slots[i].frame.contentWindow.postMessage({ type: "analysis-command", action, value }, location.origin);
    const save = () => {
        const p = new URLSearchParams(params);
        p.set("tab", tab);
        p.set("linked", linked ? "1" : "0");
        p.set("details", $("acDetails").checked ? "1" : "0");
        // Each study's complete view survives a copied link, including independent views.
        slots.forEach((s, i) => {
            if (s.state) {
                if (s.state.view) p.set(`view${i + 1}`, JSON.stringify(s.state.view));
                else p.delete(`view${i + 1}`);
                p.set(`an${i + 1}`, s.state.analysis);
                if (s.state.level) p.set(`level${i + 1}`, s.state.level);
                else p.delete(`level${i + 1}`);
            }
        });
        history.replaceState(null, "", "?" + p);
    };
    const scale = () => {
        const [a, b] = slots.map(s => s.state?.view ? s.state : null);
        const legend = tab === "compare" ? sharedLegend(a, b) : null;
        slots.forEach((s, i) => send(i, "legend", legend));
        const select = $("acScenario");
        const choices = a && b ? a.scenarios.filter(key => b.scenarios.includes(key)) : [];
        const signature = JSON.stringify(choices);
        if (select.dataset.choices !== signature) {
            select.replaceChildren(...choices.map(key => new Option(a.scenarioLabels[key] || key, key)));
            select.dataset.choices = signature;
        }
        select.disabled = !choices.length;
        if (a && b) select.value = a.view.scenario === b.view.scenario ? a.view.scenario : "";
        const bar = $("acLegend");
        bar.hidden = !legend;
        bar.replaceChildren();
        if (legend) {
            const label = document.createElement("span"), gradient = document.createElement("span"), end = document.createElement("span");
            label.textContent = `${legend.min} ${a.reading.unit || ""}`;
            end.textContent = `${legend.max} ${a.reading.unit || ""}`;
            gradient.className = "ac-gradient";
            gradient.style.background = `linear-gradient(90deg,${legend.colors.join(",")})`;
            bar.append(label, gradient, end);
        }
        $("acStatus").textContent = tab !== "compare" ? "" : !a || !b ? "Waiting for both 3D analyses…" : legend ? "Same colour scale in both options" : "Choose the same analysis and scenario in both options to compare colours.";
        if (tab === "compare" && linked && a && b && !linkedView(a, b)) $("acStatus").textContent += " Views stay independent: matching scenarios, known origins and section lines inside both volumes are needed.";
    };
    const sync = from => {
        const a = slots[from].state, b = slots[1 - from].state;
        if (!a?.view || !b?.view || a.analysis !== b.analysis) return;
        const view = linkedView(a, b);
        if (view) send(1 - from, "view", view);
        else $("acStatus").textContent = "Views cannot be linked: matching scenarios and model origins are needed.";
    };
    const select = value => {
        tab = value;
        main.dataset.tab = tab;
        [...tabs.children].forEach(b => {
            b.classList.toggle("on", b.dataset.tab === tab);
            b.setAttribute("aria-pressed", String(b.dataset.tab === tab));
        });
        slots.forEach((s, i) => {
            s.panel.hidden = tab !== "compare" && tab !== String(i);
            send(i, "compact", tab === "compare" && !$("acDetails").checked);
        });
        main.querySelector(".ac-actions").hidden = tab !== "compare";
        if (tab !== "compare") active = +tab;
        else if (linked) sync(active);
        scale();
        save();
    };
    for (const [i, label] of [...entries.map((e, i) => [String(i), e.label]), ["compare", "Compare"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.dataset.tab = i;
        button.onclick = () => select(i);
        tabs.append(button);
    }
    // Register before assigning frame URLs: cached studies may load immediately.
    window.addEventListener("message", e => {
        if (e.origin !== location.origin || e.data?.type !== "analysis-state") return;
        const i = slots.findIndex(s => s.frame?.contentWindow === e.source);
        if (i < 0) return;
        const previousReading = JSON.stringify(slots[i].state?.reading);
        slots[i].state = e.data.state;
        slots[i].summary.textContent = e.data.state?.reading ? `Mean · ${e.data.state.reading.label}: ${e.data.state.mean.toFixed(1)} ${e.data.state.reading.unit || ""}` : "";
        if (e.data.changed) active = i;
        if (tab === "compare" && linked && e.data.changed) sync(i);
        else if (tab === "compare" && linked && slots.every(s => s.state) && !e.data.applied) sync(active);
        if (!e.data.applied || previousReading !== JSON.stringify(e.data.state?.reading)) scale();
        save();
    });
    entries.forEach((entry, i) => {
        const panel = document.createElement("section");
        panel.className = "ac-option";
        const header = document.createElement("header");
        const title = document.createElement("strong");
        title.textContent = entry.label;
        const expand = document.createElement("button");
        const summary = document.createElement("span");
        summary.className = "muted small";
        expand.type = "button";
        expand.textContent = "Expand";
        expand.setAttribute("aria-label", `Expand ${entry.label}`);
        expand.onclick = () => select(String(i));
        header.append(title, summary, expand);
        const frame = document.createElement("iframe");
        frame.title = `${entry.label} analysis`;
        const p = new URLSearchParams(params);
        ["PROJECT", "data", "tab", "linked", "details", "view1", "view2", "an1", "an2", "level1", "level2"].forEach(k => p.delete(k));
        p.set(entry.key, entry.entry);
        p.set("embedded", "1");
        if (params.has(`an${i + 1}`)) p.set("an", params.get(`an${i + 1}`));
        if (params.has(`level${i + 1}`)) p.set("level", params.get(`level${i + 1}`));
        if (params.has(`view${i + 1}`)) p.set("initialView", params.get(`view${i + 1}`));
        frame.src = "analysis.html?" + p;
        slots[i].frame = frame;
        slots[i].panel = panel;
        slots[i].summary = summary;
        frame.addEventListener("load", () => send(i, "compact", tab === "compare" && !$("acDetails").checked));
        panel.append(header, frame);
        panes.append(panel);
    });
    $("acLink").checked = linked;
    $("acDetails").checked = params.get("details") === "1";
    $("acLink").onchange = () => { linked = $("acLink").checked; if (linked) sync(active); save(); };
    $("acDetails").onchange = () => select(tab);
    $("acScenario").onchange = () => slots.forEach((s, i) => {
        if (s.state?.view) send(i, "view", { ...s.state.view, scenario: $("acScenario").value });
    });
    $("shareBtn").onclick = async () => {
        const initial = new URL(location.pathname, location.origin);
        for (const key of ["PROJECT", "data"]) if (params.has(key)) initial.searchParams.set(key, params.get(key));
        try { await navigator.clipboard.writeText(initial.href); }
        catch {
            const t = document.createElement("textarea");
            t.value = initial.href;
            document.body.append(t); t.select(); document.execCommand("copy"); t.remove();
        }
        $("shareBtn").textContent = "Copied";
        setTimeout(() => $("shareBtn").textContent = "Copy link", 1500);
    };
    select(tab);
}
