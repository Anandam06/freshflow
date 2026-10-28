import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { SimulationProvider } from "@/state/SimulationContext";

const TABS = [
  { to: "/advanced", label: "Fleet results", end: true },
  { to: "/advanced/compare", label: "Compare all four" },
  { to: "/advanced/scenarios", label: "Fleet scenarios" },
  { to: "/advanced/risk", label: "What if conditions change?" },
  { to: "/advanced/tower", label: "Control tower" },
  { to: "/advanced/agent-demo", label: "Live agent demo (T17)" },
  { to: "/advanced/evidence", label: "Evidence & assumptions" },
];

/** Detailed analytics kept from the original app, one click away from the simple journey. */
export default function AdvancedLayout() {
  return (
    <div>
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-fresh">Advanced analysis</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-forest">The full evidence behind FreshFlow</h1>
        <p className="mt-2 max-w-3xl text-lg text-slate-600">
          A 2,000-shipment tomato fleet simulation comparing A, B, C and D across repeated runs, plus sensitivity tests, the batch control tower and every assumption.
        </p>
      </header>
      <nav aria-label="Advanced analysis" className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                "whitespace-nowrap rounded-full border-2 px-4 py-2 text-[15px] font-semibold transition-colors",
                isActive ? "border-forest bg-forest text-white" : "border-forest/15 bg-white text-forest hover:border-forest/40",
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      {/* The 2,000-batch fleet simulation loads only when Advanced Analysis is opened. */}
      <SimulationProvider>
        <Outlet />
      </SimulationProvider>
    </div>
  );
}
