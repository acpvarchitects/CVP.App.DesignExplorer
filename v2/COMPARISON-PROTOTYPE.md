# Comparison prototype — 2026-09-29

Question: Which comparison layout makes the selected options' trade-offs easiest to understand?

Run `python v2/_test/comparison_server.py` (loopback port 8767; helper is gitignored). Open `/v2/?data=/_study/MPW_260928_01_AI/,/_study/MPW_260928_02_PD_Liberal/,/_study/MPW_260928_02_PD_Strict/,/_study/MPW_260929_02_AI/&prototype=comparison&variant=A`.

Local-only hook in app.js replaces Best at what with comparison-prototype.js/css above the gallery. Existing data loader, filters, gallery and shortlist are reused. Normal/deployed page stays unchanged.

Variants: A pictures/summary/table; B radar/strengths with exact values disclosed; C pairwise differences against one selected baseline. All use the same selection, up to four options. Default illustrative selection uses three distinct measurement leaders and is explicitly labeled. Selection can change via top selectors or gallery Compare buttons.

Best found reference is per measurement across all loaded options, independent of filters; it is not one real option. Radar uses direction-aware min/max normalization on that population; polygon area is not a score. Noise differences use dB(A), no percentage tolerance; only identical noise values are called equal pending a domain decision. Other close-result labels retain the 2% rule. This is a layout experiment, not new production comparison semantics.

Verified real 280-option load, A/B/C rendering, and changing a selected option updating its summary. No deployment, push, or commit. Await user preference before promoting; preserve variants as prototype evidence when a decision is validated.

User selected B. Radar now sits below gallery/method summary. Fixed shortlist bar enables See comparison at 2+ real selections, Clear, and Back to options restoring window scroll position saved at the jump. No automatic example selection remains. Prior layout switcher is inline below comparison. Verified jump and exact return position in browser; local only.
