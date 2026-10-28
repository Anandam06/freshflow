"""Write evidence/FreshFlow_PPT_Evidence_Summary.md from evidence/raw/summary.json (run build_workbook first)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'evidence' / 'raw'
LIVE = 'https://freshflow-tatz.onrender.com'


def lakh(v):
    return f"₹{v / 1e5:,.1f} lakh"


def inr(v):
    return f"₹{v:,.0f}"


def main():
    s = json.loads((RAW / 'summary.json').read_text(encoding='utf-8'))
    agg, ref, names = s['agg'], s['rowref'], s['names']
    ship = {json.loads(l)['test_id']: json.loads(l) for l in (RAW / 'shipments_live.jsonl').read_text(encoding='utf-8').splitlines()}
    health = json.loads((RAW / 'live_health.json').read_text(encoding='utf-8'))
    net = json.loads((RAW / 'live_network.json').read_text(encoding='utf-8'))
    pr = lambda sid: f"Profit_Comparison row {ref.get('Profit_Comparison|' + sid, '?')}"
    sp = lambda sid: f"Spoilage_Comparison row {ref.get('Spoilage_Comparison|' + sid, '?')}"
    S, X = agg['S01'], agg['X01']
    brief = [sid for sid in s['fleet_ids'] if sid.startswith('S')]
    xs = [sid for sid in s['fleet_ids'] if sid.startswith('X')]
    best = max(s['fleet_ids'], key=lambda k: agg[k]['DC']['mean'])
    worst = min(s['fleet_ids'], key=lambda k: agg[k]['DC']['mean'])
    s06 = ship['S06']['response']
    ag1, ag1a = ship['AG1']['response'], ship['AG1-approval']['response']
    usage = next(t['result'] for t in ag1a['state']['trace'] if t['tool'] == 'llm_usage')
    distinct_traffic = all(abs(agg[k]['M3']['profit']['mean'] - S['M3']['profit']['mean']) < 1e-6 for k in ['S02', 'S03', 'S04', 'S05'])

    L = []
    w = L.append
    w('# FreshFlow — PPT Evidence Summary')
    w('')
    w(f'Evidence workbook: `evidence/FreshFlow_Scenario_Validation.xlsx` · Live app: {LIVE} · API {health["version"]}, commit b32cafa · '
      f'{s["n_fleet_runs"]} paired fleet runs ({s["reps"]} seeds × scenario) + live shipment/agent tests.')
    w('')
    w('**All results are SIMULATED on SYNTHETIC data. None is an actual Mumbai operating outcome; no physical truck was rerouted.**')
    w('**Reporting convention:** every fleet amount is per simulated 30-day period of 2,000 batches (~1,000 tonnes), averaged across 30 independent runs — '
      'never a total across runs. Spoilage rates are the average of the per-run rates. The dashboard uses the same convention and the same stored runs.')
    w('Reference format: Scenario → Run ID(s) → Excel sheet/row → source or assumption.')
    w('')
    w('## Slide 3 — Data & Validation')
    w('')
    w('| Claim | Value | Trace |')
    w('|---|---|---|')
    for c in s['claims']:
        if c[0] == 'Slide 3':
            w(f'| {c[1]} | {c[2]} | {c[3]} · {c[4]} |')
    w('')
    w('Suggested wording: *"34 scenarios defined; '
      f'{len([c for c in brief])} run as 30-seed paired fleet experiments and 5 on the live Mumbai engine; 3 flagged not implemented. '
      'Every number links to an inspectable Excel workbook with run IDs and seeds."*')
    w('')
    w('## Slide 5 — Business Impact')
    w('')
    w('| Claim | Value | Trace |')
    w('|---|---|---|')
    for c in s['claims']:
        if c[0] == 'Slide 5':
            w(f'| {c[1]} | {c[2]} | {c[3]} · {c[4]} |')
    w('')
    w('### What the numbers say (read before choosing headlines)')
    w('')
    w(f'1. **The big gain is optimization, not the agent alone.** In the baseline (S01), A → D cuts spoilage from '
      f'{S["M0"]["spoil"]["mean"]:.1%} to {S["M3"]["spoil"]["mean"]:.1%} and raises profit per 30-day period from {lakh(S["M0"]["profit"]["mean"])} to '
      f'{lakh(S["M3"]["profit"]["mean"])} — but C (optimization without the agent) already reaches {S["M2"]["spoil"]["mean"]:.1%} and '
      f'{lakh(S["M2"]["profit"]["mean"])}. ({pr("S01")}, {sp("S01")}; S01 → LOCAL-S01-60000…60029)')
    w(f'2. **Without disruptions the agent costs slightly more than it saves.** S01 D − C = {inr(S["DC"]["mean"])} per 30-day period '
      f'(P05 {inr(S["DC"]["p05"])}, P95 {inr(S["DC"]["p95"])}); D beats C in {S["P_DC"]:.0%} of seeds. ({pr("S01")})')
    w(f'3. **With disruptions the agent pays.** X01 (30% of lots disrupted, declared supplementary): D − C = {lakh(X["DC"]["mean"])} '
      f'(P05 {lakh(X["DC"]["p05"])}, P95 {lakh(X["DC"]["p95"])}), D beats C in {X["P_DC"]:.0%} of seeds; spoilage C '
      f'{X["M2"]["spoil"]["mean"]:.1%} → D {X["M3"]["spoil"]["mean"]:.1%}. ({pr("X01")}, {sp("X01")})')
    w(f'4. D beats A in {len(s["d_beats_a"])} of {len(brief)} executed brief fleet scenarios. D does **not** beat C in '
      f'{len(s["d_not_c"])} of {len(brief)} — {len(s["d_not_c_distinct"])} of {len(s["distinct"])} once the {len(s["same_as_s01"])} scenarios that reproduce S01 exactly '
      f'({", ".join(s["same_as_s01"])}) are removed. Every one of them has zero disruptions (the app default); the only brief scenario with disruptions, '
      f'S32, has D > C. With disruptions, D beats C in {len(s["x_beats_c"])} of {len(xs)} X-scenarios.')
    w(f'4b. **Solver caveat on magnitudes.** ~82% of daily C/D allocations stop at the CP-SAT time limit (feasible, not proven optimal). On the live '
      f'Linux deployment, X01 seeds {s["seeds_x01_live"][0]}–{s["seeds_x01_live"][-1]} give mean D − C {lakh(s["live_dc_x01"])} vs {lakh(s["local_dc_x01"])} '
      f'locally on the same seeds. Quote D − C as "about ₹15–20 lakh per simulated 30-day period under 30% disruption", not as a precise figure.')
    w(f'5. Largest agentic contribution: {best} {names[best]} (D − C {lakh(agg[best]["DC"]["mean"])}); weakest: {worst} {names[worst]} '
      f'(D − C {lakh(agg[worst]["DC"]["mean"])}). See Sensitivity_Analysis.')
    if distinct_traffic:
        w('6. S02–S05 (traffic only) are identical to S01: the fleet engine applies traffic only to disrupted lots and the default disruption '
          'probability is 0. Do not cite S02–S05 as traffic evidence; use X02–X05.')
    w('')
    w('### Representative rescue (live Mumbai engine)')
    A, D = s06['strategies']['A'], s06['strategies']['D']
    w(f'S06 road closure (high), tomato 800 kg, Turbhe APMC (H1) → {A["buyer_name"]} (B02). Traditional plan: {A["distance_km"]:.1f} km, '
      f'{A["lead_time_hours"]:.2f} h, rejected ({A["rejection_reasons"][0]}), profit {inr(A["operating_profit_inr"])}. '
      f'FreshFlow checks 12 buyers from the simulated checkpoint and proposes {D["buyer_name"]}: {D["distance_km"]:.1f} km, '
      f'{D["lead_time_hours"]:.2f} h, arrives with {D["arrival_rsl_hours"]:.1f} h shelf life, profit {inr(D["operating_profit_inr"])} if approved. '
      f'Run {s06["id"]} → Route_ETA_Changes, Agent_Action_Log. OSRM distances, simulated traffic (×2.0).')
    w('')
    w('### Live Claude agent proof')
    w(f'AG1 {ag1["id"]} (buyer cancellation, live mode): {health["llm_model"]} made {usage["tool_calls"]} tool calls '
      f'({usage["input_tokens"]:,} input / {usage["output_tokens"]:,} output tokens, ≈ ${usage["estimated_cost_usd"]:.4f}); '
      f'proposal → human approved → destination {ag1["state"]["destination"]} → {ag1a["state"]["destination"]}, state version '
      f'{ag1["state"]["version"]} → {ag1a["state"]["version"]}; replaying the stale approval returned HTTP 409. AG3 shows a human rejection '
      '(plan kept); AG5 shows "no feasible buyer" with nothing executed. → Agent_Validation, Agent_Action_Log, agent_traces.json')
    w('')
    w('Note: fleet-scale D results (S/X scenarios) use a deterministic emulation of the agent policy, not live Claude calls.')
    w('')
    w('## Recommended charts')
    w('- Profit_Comparison chart 2: mean profit A/B/C/D for S01 vs X01 — shows optimization gain and where the agent adds value.')
    w('- Spoilage_Comparison chart: spoilage A/B/C/D by scenario.')
    w('- Profit_Comparison chart 1: D − C by scenario — honest view of when the agent is and is not worth it.')
    w('')
    w('## Limitations to disclose on the slide or in notes')
    w('- Synthetic data, no field calibration; percentiles are simulation variability, not confidence intervals.')
    w('- Fleet experiments are tomato-only on a 3-buyer synthetic junction graph; the 18-commodity Mumbai engine evaluates single shipments.')
    w(f'- {len(net["commodities"])} commodities implemented, 12 of the 18 on the brief list (missing: papaya, guava, pomegranate, cabbage, cauliflower, okra).')
    w('- Traffic is a simulated multiplier on OSRM free-flow times — no live traffic feed.')
    w('- S07 loading delay, S13 ripening, S26 agent execution failure: NOT IMPLEMENTED.')
    w(f'- Fleet runs executed locally on the deployed commit; A/B match the live site exactly, C/D differ by up to {s["max_dev"]:.1%} (time-limited CP-SAT, platform-sensitive).')
    w('- The app default has 0% disruptions, so most brief scenarios measure calm conditions; agentic value appears only when disruptions occur (X-family, S32).')
    w('')
    w('## PPT link label')
    w('"Explore all simulation scenarios and results" → link to the shared copy of `FreshFlow_Scenario_Validation.xlsx` (never a localhost URL).')
    (ROOT / 'evidence' / 'FreshFlow_PPT_Evidence_Summary.md').write_text('\n'.join(L) + '\n', encoding='utf-8')
    print('brief written')


if __name__ == '__main__':
    main()
