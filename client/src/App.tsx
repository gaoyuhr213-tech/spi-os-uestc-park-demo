import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { PresentProvider } from "./contexts/PresentContext";
import Home from "./pages/Home";
import Scenarios from "./pages/Scenarios";
import Simulation from "./pages/Simulation";
import Governance from "./pages/Governance";
import DecisionCenter from "@/pages/DecisionCenter";
import ROI from "@/pages/ROI";
import Radar from "./pages/Radar";
import Referral from "./pages/Referral";
import Tasks from "./pages/Tasks";
import Rules from "./pages/Rules";
import ResourceAdmin from "./pages/ResourceAdmin";
import Connectors from "./pages/Connectors";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Scenarios} />
      <Route path={"/park-health"} component={Home} />
      <Route path={"/decision"} component={DecisionCenter} />
      <Route path={"/radar"} component={Radar} />
      <Route path={"/referral"} component={Referral} />
      <Route path={"/simulation"} component={Simulation} />
      <Route path={"/governance"} component={Governance} />
      <Route path={"/tasks"} component={Tasks} />
      <Route path={"/rules"} component={Rules} />
      <Route path={"/resources"} component={ResourceAdmin} />
      <Route path={"/connectors"} component={Connectors} />
      <Route path={"/roi"} component={ROI} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <PresentProvider>
            <Router />
          </PresentProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
