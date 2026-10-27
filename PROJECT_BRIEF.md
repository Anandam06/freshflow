# FRESHFLOW — SHARED MASTER PROJECT CONTEXT

## 1. PROJECT IDENTITY

**Project:** FreshFlow — Agentic Perishability Rescue Platform

**Competition:** Abhikalp 2026

**Case:** AgriTech & Farm-to-Fork Supply Chain

**Current development stage:** Round 2 — Product Development & Implementation.

You are part of a two-agent software engineering team building a working Agentic AI product supported by scientifically grounded synthetic data, logistics optimization, financial analysis and an executive-quality interface.

You must act with the judgment of:
- A senior product manager.
- An enterprise AI transformation consultant.
- A supply-chain operations specialist.
- A rigorous technical engineer.

The primary audience is an evaluation panel that may question any assumption, statistic, calculation, technology choice or claimed business outcome.

Your work must be understandable, demonstrable, reproducible and defensible.

---

## 2. OFFICIAL COMPETITION DELIVERABLES

### Round 1 — Product Ideation

Two-slide PPT, submitted in PDF format.

Slide 1:
Problem Understanding & Customer Insights — problem breakdown, target customer persona, key pain points and workflow gaps.

Slide 2:
Proposed Product & Value Proposition — product concept, core features, USP, Agentic AI application, expected impact and MVP feasibility.

Both slides are already conceptually finalized.

**Do not modify, replace or reinterpret the two Round 1 slides without explicit approval.**

### Round 2 — Product Development & Implementation

A. Complete PDF deck, maximum six slides total.

Retain the original two slides and add three to four slides covering:
- Research validation and key assumptions.
- MVP feature prioritization.
- Agentic AI workflows and tools.
- Business impact and KPIs.
- Pilot plan.
- Estimated costs.
- Risks and mitigation.

B. Clickable working MVP link.

The prototype must be accessible and demonstrate a functional Agentic AI workflow.

C. Demonstration video of no more than five minutes.

The video must demonstrate:
- Product interface.
- Key user interactions.
- Working Agentic AI functionality.
- Overall solution.

Software development must be aligned with these deliverables.

Do not confuse a beautiful clickable prototype with a functioning Agentic AI product.

---

## 3. PROBLEM STATEMENT

Fresh-produce aggregators operate in environments where product quality and commercial value change continuously.

The case identifies:
- Temperature and humidity variability.
- Highway and transport delays.
- FIFO-based routing.
- Fixed morning mandi pricing.
- Produce reaching markets with insufficient usable shelf life.
- Distress pricing, spoilage and write-offs.

The case describes post-harvest spoilage of 25–30%, with a target below 10%, and a target improvement of 12% in net batch realization margin.

These are case-specified baseline and success criteria, NOT validated FreshFlow outcomes.

Our central product insight:

"Perishability progressively shrinks the set of commercially feasible destinations. The real gap is not freshness visibility alone, but the time taken to turn changing freshness information into commercial action."

---

## 4. TARGET CUSTOMER AND PRODUCT

**Primary persona:** Operations / Supply Chain Head of a fresh-produce aggregator.

The operator manages:
- Collection and inventory.
- Dispatch priority.
- Transport and routes.
- Buyer allocations.
- Fulfilment and spoilage.
- Commercial realization.

### Product definition

FreshFlow is a bounded Agentic AI decision-and-execution layer that monitors produce freshness, detects when existing movement plans become infeasible or commercially inferior, evaluates feasible alternatives, and executes approved interventions.

### Product workflow

SENSE → PREDICT → DETECT → DECIDE → ACT → VERIFY → REPLAN.

SENSE:
Batch details, temperature/humidity history, GPS, buyer demand, market pricing, travel-time conditions.

PREDICT:
Remaining Shelf Life (RSL), including prediction uncertainty.

DETECT:
Determine whether the current plan remains operationally and economically feasible.

DECIDE:
Evaluate batch, buyer, route, vehicle and commercial-channel alternatives.

ACT:
Continue, reprioritize, reroute, switch buyer, redirect to wholesale/processing, or request approval.

VERIFY:
Check whether the intervention completed successfully.

REPLAN:
Repeat whenever a material event invalidates the current plan.

The system must never reroute unsafe produce merely to avoid reporting spoilage.

---

## 5. WHY AGENTIC AI?

Do not call every calculation or automated trigger an AI agent.

The architecture distinguishes:

- Sensors and APIs: observe.
- RSL model: predict.
- Optimization engine: calculate feasible alternatives.
- Policy engine: enforce constraints.
- Agentic orchestrator: dynamically choose tools, investigate exceptions, coordinate action and replan.
- Human operator: approve consequential decisions.

The product should demonstrate an actual agent-controlled tool workflow, not merely a scripted animation.

A deterministic event detector may initiate the process, but the agent must perform meaningful tool selection/orchestration during non-standard exceptions.

An optional deterministic fallback is permitted for reliability and comparative testing. Clearly identify which mode is active.

The language model must not invent prices, scientific measurements, financial calculations or safety approvals.

---

## 6. THE FOUR COMPARISON SYSTEMS

All models must operate on identical batches and identical exogenous disruptions.

M0 — EXISTING:
FIFO + static morning buyer/route/pricing decisions.

M1 — FRESHNESS AWARE:
RSL estimation + FEFO dispatch.

M2 — STATIC OPTIMIZATION:
M1 + buyer, route and channel optimization at planning time.

M3 — AGENTIC FRESHFLOW:
M2 + event-driven investigation, fresh information, bounded interventions, alternative-channel rescue, execution and replanning.

This comparison is mandatory because:

M1 − M0 measures the improvement from freshness-aware planning.

M2 − M1 measures the additional benefit of optimization.

M3 − M2 measures the incremental benefit of Agentic coordination and intervention.

Never attribute all of M3's improvement over M0 exclusively to Agentic AI.

---

## 7. MODELING AND FINANCIAL OBJECTIVES

Calculate:
- Spoilage rate.
- Spoiled quantity.
- Sellable quantity.
- Gross sales revenue.
- Net realization per input kilogram.
- Procurement costs.
- Transportation costs.
- Handling/storage costs.
- Rescue/diversion costs.
- Agent and sensor operating costs.
- Operating profit.
- Operating profit margin.
- Incremental profit vs M0.
- Incremental Agentic benefit vs M2.
- ROI and payback, if economically defined.
- Buyer rejection rate.
- On-time fulfilment.
- Successful rescue rate.
- Food-safety violations.
- Probability of meeting targets across simulated runs.

Explicitly define "net batch realization margin" and distinguish percentage uplift from percentage-point improvement.

Do not double-count revenue loss, markdowns or spoiled goods.

Do not present synthetic simulation output as observed business performance.

If targets are missed, report the failure honestly.

---

## 8. DATA AND EVIDENCE POLICY

Use four categories:

CASE:
Directly supplied by the competition.

RESEARCH:
Externally verified evidence, with URLs, publication details and limitations.

SYNTHETIC:
Generated assumptions and observations for the prototype.

SIMULATED RESULT:
Calculated output from a particular model run.

Every material numeric assumption must be traceable.

Possible external reference sources:
- AGMARKNET/data.gov.in — commodity prices.
- e-NAM — market information.
- FAO and peer-reviewed research — perishability.
- NASA POWER — historical weather.
- OpenStreetMap/OSRM — routes and reference travel time.

Do not assume these sources provide complete real-time APIs or real buyer contracts.

The default dataset is 2,000 synthetic tomato batches over 30 simulated days, with configurable volume and simulation repetitions.

Use seeded randomness and repeatable experiments.

Calibration must be isolated from final policy evaluation.

The simulation must conserve kilograms, enforce buyer and vehicle capacity, respect food safety, and prevent access to future information.

---

## 9. MVP SUCCESS SCENARIO

Implement one hero journey:

Batch T17 — tomatoes.

1. Assigned to Retailer A.
2. Temperature/traffic disruption occurs.
3. Arrival freshness becomes insufficient.
4. Agent investigates via real tool calls.
5. RSL prediction updates.
6. Alternative buyers and routes are checked.
7. Optimizer ranks feasible options.
8. Policy engine checks constraints.
9. Agent chooses compliant action or requests approval.
10. Destination or route changes in persistent state.
11. A trace records the decision and result.
12. Monitoring resumes.

The demo must make it obvious that the system actually performs the workflow.

All T17 parameters may be illustrative, but must be generated or stored consistently rather than hard-coded into a misleading demo.

---

## 10. SHARED TECHNOLOGY STACK

Frontend:
- React.
- TypeScript.
- Vite.
- Tailwind CSS.
- Accessible component library.
- ECharts or Recharts.

Backend:
- Python.
- FastAPI.
- NumPy/Pandas.
- OR-Tools or another suitable optimization solver.
- SQLite for MVP persistent state.
- Pydantic for schemas and validation.

Agent orchestration:
- Tool-based agent runtime with bounded execution.
- Human approval gates.
- Trace logging.
- Deterministic policy enforcement.

Deployment:
- Publicly accessible frontend URL.
- Accessible backend API.
- Documented environment variables.
- No secrets committed to Git.
- No dependency on a developer's laptop being powered on.

---

## 11. SINGLE REPOSITORY STRUCTURE

freshflow/
  README.md
  PROJECT_BRIEF.md
  DELIVERY_CHECKLIST.md
  .env.example

  shared/
    api-contract.yaml
    schema/
    fixtures/

  frontend/
    src/
      app/
      components/
      pages/
      charts/
      services/
      types/
    public/
    tests/

  backend/
    app/
      api/
      models/
      simulation/
      freshness/
      optimization/
      agent/
      financials/
      storage/
    tests/
    requirements.txt

  data/
    raw/
    synthetic/
    scenarios/
    results/

  research/
    sources.csv
    assumptions.csv
    calibration_log.md

  docs/
    architecture.md
    integration.md
    mvp-demo.md
    deployment.md

  submission/
    round1/
    round2/
      deck/
      video/

The Round 1 submission must remain unchanged unless the project owner explicitly requests changes.

---

## 12. PARALLEL ENGINEERING RULES

Two agents will work simultaneously.

Claude Code owns:
- Frontend.
- UI components.
- Charts.
- User interactions.
- Dashboard pages.
- Frontend tests.

Codex owns:
- API contract.
- Backend.
- Data generator.
- Scientific models.
- Optimization.
- Agent runtime.
- Financial calculations.
- Simulation tests.

The backend owns financial calculation truth.

The frontend must never independently recalculate authoritative financial metrics.

The API contract is the single source of truth.

Codex publishes the contract; Claude Code consumes it.

Use separate Git worktrees or branches.

Never concurrently modify the same file.

Never silently change the contract.

Document breaking changes and integration requirements.

---

## 13. PRIORITY ORDER

P0 — Essential for working MVP:
- Reproducible data.
- M0–M3 simulation.
- Financial results.
- Executive comparison dashboard.
- Functional agent rescue flow.
- Approval/execute functionality.
- Traceability.
- Working public deployment.

P1 — Strong competition features:
- Sensitivity analysis.
- Scenario controls.
- Batch control tower.
- Evidence register.
- Financial waterfall.
- Multiple rescue cases.

P2 — Optional enhancements:
- Sophisticated computer vision.
- Live buyer-system integration.
- Blockchain.
- Complex multi-vehicle optimization.
- Multi-agent swarms.
- Advanced forecasting.

Never sacrifice P0 for P2.

---

## 14. COMPLETION STANDARDS

Nothing is complete merely because code has been written.

Every deliverable must:
- Run successfully.
- Have tests.
- Have no fake buttons.
- Display correct units.
- Distinguish assumptions and measured outputs.
- Handle invalid inputs.
- Explain its limitations.
- Be reproducible.
- Have documentation.
- Work with the other team's component.

The MVP must answer:

"What changed, why did the agent intervene, what alternatives were considered, what did it do, and what economic impact resulted?"

The business model must answer:

"How much is saved compared with M0, what portion comes specifically from Agentic AI, and what happens under unfavorable scenarios?"

---

## 15. WORKING INSTRUCTIONS

Do not spend the first stage writing an enormous strategy report.

Inspect the repository and existing project files.

Follow this shared brief.

Execute your assigned workstream autonomously.

Ask for clarification only when an essential dependency is genuinely missing.

Use reasonable defaults, record assumptions and proceed.

Do not invent simulation evidence or claim tests passed unless executed.

Keep your work modular and integration-friendly.

Before finishing, provide:
- What was built.
- Files changed.
- Tests run and results.
- Remaining blockers.
- Integration instructions.
- Next highest-priority task.

Treat this as a real product with an approaching demonstration, not a conceptual class assignment.