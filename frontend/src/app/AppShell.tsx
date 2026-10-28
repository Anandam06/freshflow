import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, FileSpreadsheet, FlaskConical, Home, KeyRound, Menu, Sprout, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { useClient } from "@/services/ClientContext";
import { getOperatorKey, onOperatorKeyChange, setOperatorKey } from "@/services/operatorKey";
import { useAsync } from "@/services/useAsync";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/playground", label: "Scenario Playground", icon: FlaskConical },
  { to: "/data", label: "Data & Reports", icon: FileSpreadsheet },
  { to: "/advanced", label: "Advanced Analysis", icon: BarChart3 },
];

function NavItems({ onNavigate, vertical }: { onNavigate?: () => void; vertical?: boolean }) {
  return (
    <nav aria-label="Main" className={cn("flex gap-1", vertical && "flex-col")}>
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn("flex items-center gap-2 rounded-full px-4 py-2.5 text-[15px] font-semibold transition-colors", isActive ? "bg-forest text-white" : "text-forest hover:bg-forest/5")
          }
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function OperatorKeyButton() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [hasKey, setHasKey] = useState(Boolean(getOperatorKey()));
  useEffect(() => onOperatorKeyChange(() => setHasKey(Boolean(getOperatorKey()))), []);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label="Set operator key">
        <KeyRound /> <span className="hidden 2xl:inline">{hasKey ? "Key set" : "Operator key"}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demo operator key</DialogTitle>
            <DialogDescription>
              On a public deployment, actions that change data (running a test, approving) need the operator key set on the backend. It stays in this tab only and is
              sent only as the X-Operator-Key header.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setOperatorKey(value.trim() || null);
              setValue("");
              setOpen(false);
            }}
            className="space-y-2"
          >
            <Label htmlFor="operator-key">Operator key</Label>
            <Input id="operator-key" type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
            <DialogFooter className="pt-2">
              {hasKey && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setOperatorKey(null);
                    setOpen(false);
                  }}
                >
                  Clear key
                </Button>
              )}
              <Button type="submit">Save for this tab</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusStrip() {
  const client = useClient();
  const health = useAsync(() => client.health(), [client]);
  let agent: ReactNode = null;
  if (health.data)
    agent = health.data.live_agent_configured ? (
      <Badge variant="fresh" title={health.data.llm_model ? `Live agent: ${health.data.llm_model}` : undefined}>
        Live AI agent{health.data.llm_model ? ` · ${health.data.llm_model.replace("claude-", "Claude ").replace(/-(\d)-(\d)$/, " $1.$2").replace(/([a-z])/g, (c) => c.toUpperCase())}` : ""}
      </Badge>
    ) : (
      <Badge variant="neutral" title="No LLM key configured: the agent runs its deterministic tool sequence">
        Deterministic agent
      </Badge>
    );
  else if (health.error) agent = <Badge variant="unsafe">Backend unreachable</Badge>;
  return (
    <div className="flex items-center gap-2">
      {client.mode === "live" ? (
        <Badge variant="forest">
          <span className="h-1.5 w-1.5 rounded-full bg-fresh" aria-hidden /> Live API
        </Badge>
      ) : (
        <Badge variant="risk" className="border-dashed">
          Demo data
        </Badge>
      )}
      <span className="hidden lg:inline-flex">{agent}</span>
      {client.mode === "live" && <OperatorKeyButton />}
    </div>
  );
}

export function AppShell() {
  const client = useClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-[1000] border-b border-forest/10 bg-[#fbf8f2]/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1680px] items-center gap-4 px-4 sm:px-6 lg:px-10">
          <NavLink to="/" className="flex items-center gap-3" aria-label="FreshFlow home">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-forest text-white shadow-sm">
              <Sprout className="h-6 w-6" aria-hidden />
            </span>
            <span className="leading-tight">
              <span className="block text-xl font-bold text-forest">FreshFlow</span>
              <span className="hidden text-xs font-medium text-fresh sm:block">Save Freshness. Protect Profit.</span>
            </span>
          </NavLink>
          <div className="ml-6 hidden lg:block">
            <NavItems />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <StatusStrip />
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen((o) => !o)} aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen}>
              {mobileOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        {mobileOpen && (
          <div className="border-t border-forest/10 px-4 py-3 lg:hidden">
            <NavItems vertical onNavigate={() => setMobileOpen(false)} />
          </div>
        )}
      </header>
      {client.mode === "demo" && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900" role="note">
          <strong>Demo data mode.</strong> No backend connected: screens replay recorded backend responses. Start the API to run the playground.
        </div>
      )}
      <main id="main" className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-[1680px] px-4 pb-8 text-sm text-slate-500 sm:px-6 lg:px-10">
        Abhikalp 2026 · FreshFlow MVP. All outcomes are synthetic simulations, not observed business results. Map © OpenStreetMap contributors; routes via OSRM; traffic is
        simulated.
      </footer>
    </div>
  );
}
