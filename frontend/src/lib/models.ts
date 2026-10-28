import type { ModelId } from "@/types/api";

export type StrategyLetter = "A" | "B" | "C" | "D";

export interface ModelMeta {
  id: ModelId;
  letter: StrategyLetter;
  name: string;
  oneLiner: string;
  tooltip: string;
  learnMore: string;
  color: string;
}

/**
 * Display names for the four strategies. Internal ids (M0–M3) are unchanged everywhere in the API;
 * A/B/C/D is the only label shown to users.
 */
export const MODEL_META: Record<ModelId, ModelMeta> = {
  M0: {
    id: "M0",
    letter: "A",
    name: "Traditional Planning",
    oneLiner: "Fixed buyer and route, loaded in arrival order.",
    tooltip: "Ships to the buyer agreed in the morning, on the usual route, first-in-first-out. Nothing changes after the truck leaves.",
    learnMore:
      "Strategy A (internal M0): FIFO loading queue, fixed morning buyer, route and price. No freshness signal and no intervention after dispatch. It is today's common practice and the baseline for every comparison.",
    color: "#97a1ae",
  },
  M1: {
    id: "M1",
    letter: "B",
    name: "Freshness-Aware",
    oneLiner: "Same buyer, but the produce that will spoil first leaves first.",
    tooltip: "Estimates remaining shelf life and loads first-expiring stock first (FEFO). Buyer and route stay fixed.",
    learnMore:
      "Strategy B (internal M1): adds remaining-shelf-life estimates and first-expiring-first-out dispatch, so at-risk lots wait less at the hub. It does not change buyer, route or price.",
    color: "#76808f",
  },
  M2: {
    id: "M2",
    letter: "C",
    name: "Smart Optimization",
    oneLiner: "Picks the best feasible buyer and route before dispatch.",
    tooltip: "Uses shelf life, prices, capacity and travel time to plan the best buyer and route in the morning. A strong plan, but it cannot react after the truck leaves.",
    learnMore:
      "Strategy C (internal M2): B plus plan-time optimization of buyer, route and channel (OR-Tools in the fleet model). Its optimization is genuinely useful. What it lacks is event-driven monitoring and action once the truck is on the road.",
    color: "#4f5b6b",
  },
  M3: {
    id: "M3",
    letter: "D",
    name: "FreshFlow Agentic AI",
    oneLiner: "C, plus an agent that reacts when something goes wrong on the road.",
    tooltip: "Monitors the shipment, detects disruptions, calls tools to re-check freshness, buyers and routes, applies safety rules, asks for approval and executes the change.",
    learnMore:
      "Strategy D (internal M3): C plus an agent that, after a disruption, calls tools (shelf-life prediction, buyer options, capacity, route ETA, optimizer), validates the result against policy and food-safety rules, requests human approval and only then executes and verifies the change. D's extra value over C is that event-driven action — it can also be zero or negative when nothing needed fixing.",
    color: "#0f8a7e",
  },
};

export const MODEL_ORDER: ModelId[] = ["M0", "M1", "M2", "M3"];
export const LETTER_TO_MODEL: Record<StrategyLetter, ModelId> = { A: "M0", B: "M1", C: "M2", D: "M3" };
export const letterOf = (id: ModelId) => MODEL_META[id].letter;
export const labelOf = (id: ModelId) => `${MODEL_META[id].letter} · ${MODEL_META[id].name}`;

export const INCREMENT_META = [
  { key: "freshness", from: "M0", to: "M1", label: "Freshness (B − A)", tooltip: "Value of freshness-aware FEFO dispatch alone." },
  { key: "optimization", from: "M1", to: "M2", label: "Optimization (C − B)", tooltip: "Additional value of plan-time buyer and channel optimization." },
  { key: "agentic", from: "M2", to: "M3", label: "FreshFlow actions (D − C)", tooltip: "Extra value created by FreshFlow's actions after a disruption." },
] as const;
