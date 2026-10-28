# FreshFlow UX redesign (2026-10-28)

Rollback point taken before the redesign: `Abhikalp/freshflow_rollback_2026-10-28_pre-redesign.tar.gz`.

## Old → new

| Before | After | Notes |
|---|---|---|
| Sidebar with 7 analytics pages | Top navigation with 4 areas: Home · Scenario Playground · Data & Reports · Advanced Analysis | All 7 old pages are kept, under Advanced Analysis |
| Executive overview (`/`) | Advanced → Fleet results (`/advanced`) | Fleet (2,000-batch tomato) results; M-labels replaced by A–D |
| — | **Home** (`/`) | New: map-first landing with one call to action |
| Scenario studio (16 numeric fields) | **Scenario Playground** steps 1–4 (cards, map, severity chips, Advanced settings) for one shipment · Advanced → Fleet scenarios for the fleet model | Fleet parameters (batches, days, repetitions) stay in Advanced |
| Agent rescue replay (T17) | Playground step 5 (agent timeline + approval) for any shipment · Advanced → Live agent demo (T17) | Same `agent.Investigation` tools and approval gate |
| Comparison lab | Advanced → Compare all four · playground "Compare all four" toggle | |
| Risk & sensitivity | Advanced → "What if conditions change?" | |
| Freshness control tower | Advanced → Control tower | |
| Evidence register | Advanced → Evidence & assumptions | Plus the `Sources_Assumptions` sheet in every Excel export |
| CSV/JSON export | Data & Reports: Excel template, validated upload, Excel exports (shipment, workbook run, comparison, fleet) | CSV/JSON export kept in Fleet scenarios |
| M0 / M1 / M2 / M3 | A · Traditional Planning / B · Freshness-Aware / C · Smart Optimization / D · FreshFlow Agentic AI | Tooltips on hover, focus and tap |

## What is real, simulated or illustrative

- **Real:** road geometry, distances and free-flow times (OpenStreetMap via OSRM, cached by `backend/build_mumbai_network.py`). The agent's tool calls, the policy check, the approval gate and state persistence. Every number on screen comes from the backend.
- **Simulated:** traffic (a multiplier on free-flow time; labelled "Simulated traffic"), disruptions, freshness (thermal-age proxy), buyer offers and acceptance.
- **Synthetic:** the 12 buyers (real localities, invented businesses) and all commodity, channel and cost parameters. Each is registered in `research/assumptions.csv` and in the Excel template.
- **Illustrative imagery:** produce and disruption pictures are Microsoft Fluent Emoji 3D illustrations (MIT), not photographs.

## Engine behaviour worth knowing

- A, B and the committed buyer: A and B always ship to the buyer chosen in step 2. C (and D's starting plan) keeps that buyer unless the forecast already shows it cannot accept the load.
- D decides on a *conservative* shelf-life estimate. Near a threshold it may divert a load that would have been accepted, so D can earn less than B or C. The app shows this honestly.
- With no disruption, the agent records "No intervention required" and asks for nothing. If no buyer can accept in time, it escalates instead of forcing a diversion.
