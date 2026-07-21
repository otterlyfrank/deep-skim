# Deep-Skim System Prompt

Source of truth for runtime: `src/generation/prompt.js` (plus `depth.js` length targets and multipass maps).

## Intent

Produce a **substantial condensed reading**, not an abstract executive summary.

| Source scale | Condensed-reading target |
|--------------|---------------------------|
| ~200 page book | ~**10–20 pages** of dense notes |
| ~500 page book | ~**25–50 pages** of dense notes |

§2 (Hierarchical Outline + Core Claims) carries most of the word budget: full claim blocks with stakes, mechanism, supports, limits.

Long sources use **multipass maps** + **staged write** (parts A/B/C) so output can exceed a single completion window.

See `src/generation/prompt.js` for the exact system prompt and `src/generation/depth.js` for scaling tables.
