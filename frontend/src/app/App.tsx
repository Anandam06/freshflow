import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LoadingBlock } from "@/components/common";
import { ClientProvider } from "@/services/ClientContext";
import type { ApiClient } from "@/services/client";
import { PlaygroundProvider } from "@/state/PlaygroundContext";
import { AppShell } from "./AppShell";

const HomePage = lazy(() => import("@/pages/home/HomePage"));
const PlaygroundPage = lazy(() => import("@/pages/playground/PlaygroundPage"));
const DataReportsPage = lazy(() => import("@/pages/data/DataReportsPage"));
const AdvancedLayout = lazy(() => import("@/pages/advanced/AdvancedLayout"));
const Overview = lazy(() => import("@/pages/Overview"));
const ComparisonLab = lazy(() => import("@/pages/ComparisonLab"));
const ScenarioStudio = lazy(() => import("@/pages/ScenarioStudio"));
const DecisionReplay = lazy(() => import("@/pages/DecisionReplay"));
const RiskSensitivity = lazy(() => import("@/pages/RiskSensitivity"));
const ControlTower = lazy(() => import("@/pages/ControlTower"));
const EvidenceRegister = lazy(() => import("@/pages/EvidenceRegister"));
const NotFound = lazy(() => import("@/pages/NotFound"));

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading page" />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="playground" element={<PlaygroundPage />} />
          <Route path="data" element={<DataReportsPage />} />
          <Route path="advanced" element={<AdvancedLayout />}>
            <Route index element={<Overview />} />
            <Route path="compare" element={<ComparisonLab />} />
            <Route path="scenarios" element={<ScenarioStudio />} />
            <Route path="risk" element={<RiskSensitivity />} />
            <Route path="tower" element={<ControlTower />} />
            <Route path="agent-demo" element={<DecisionReplay />} />
            <Route path="agent-demo/:batchId" element={<DecisionReplay />} />
            <Route path="agent-demo/run/:runId/:batchId" element={<DecisionReplay />} />
            <Route path="evidence" element={<EvidenceRegister />} />
          </Route>
          {/* Links from the previous layout keep working. */}
          <Route path="compare" element={<Navigate to="/advanced/compare" replace />} />
          <Route path="scenarios" element={<Navigate to="/advanced/scenarios" replace />} />
          <Route path="risk" element={<Navigate to="/advanced/risk" replace />} />
          <Route path="tower" element={<Navigate to="/advanced/tower" replace />} />
          <Route path="evidence" element={<Navigate to="/advanced/evidence" replace />} />
          <Route path="replay" element={<Navigate to="/advanced/agent-demo" replace />} />
          <Route path="replay/:batchId" element={<DecisionReplay />} />
          <Route path="replay/run/:runId/:batchId" element={<DecisionReplay />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export function Providers({ client, children }: { client?: ApiClient; children: React.ReactNode }) {
  return (
    <ClientProvider client={client}>
      <TooltipProvider delayDuration={150}>
        <PlaygroundProvider>{children}</PlaygroundProvider>
      </TooltipProvider>
    </ClientProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Providers>
        <AppRoutes />
      </Providers>
    </BrowserRouter>
  );
}
