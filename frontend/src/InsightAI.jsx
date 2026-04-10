/**
 * src/InsightAI.jsx
 * ─────────────────────────────────────────────────────────────
 * Application shell — slim orchestrator.
 *
 * Responsibilities:
 *   1. Set data-theme attribute for CSS custom properties
 *   2. Render FluidShader background
 *   3. Render TitleBar, Sidebar, and routed page content
 *   4. Wrap everything in AppProvider for shared state
 *
 * All UI components are extracted into their own files.
 * All styling is driven by /styles/theme.css.
 */

import { motion, AnimatePresence, LayoutGroup } from "framer-motion";

// ─── Design system ────────────────────────────────────────────
import "./styles/theme.css";

// ─── Components ───────────────────────────────────────────────
import FluidShader from "./components/FluidShader.jsx";
import TitleBar from "./components/TitleBar.jsx";
import Sidebar from "./components/Sidebar.jsx";
import AuthGuard from "./components/AuthGuard.jsx";

// ─── Pages ────────────────────────────────────────────────────
import HomePage from "./pages/HomePage.jsx";
import WorkspaceModule from "./pages/Workspace.jsx";
import DashboardModule from "./pages/Dashboard.jsx";
import AuditModule from "./pages/Audit.jsx";
import CompareModule from "./pages/Compare.jsx";

// ─── Context ──────────────────────────────────────────────────
import { AppProvider, useApp } from "./context/AppContext.jsx";

// ─── Module routing map ───────────────────────────────────────
const MODULE_MAP = {
  dashboard: DashboardModule,
  workspace: WorkspaceModule,
  compare:   CompareModule,
  audit:     AuditModule,
};

const BENTO_CARDS = [
  { id: "dashboard", label: "Dashboard", icon: "◈", desc: "View your insurance trends and approval rates at a glance" },
  { id: "workspace", label: "Workspace", icon: "⌖", desc: "Upload policies and ask questions — all in one place." },
  { id: "compare",   label: "Compare",   icon: "⇄", desc: "See exactly what changed between two policy versions" },
  { id: "audit",     label: "Audit Log", icon: "≡", desc: "A secure log of all your previous searches and uploads." },
];

// ─── Module wrapper ───────────────────────────────────────────
function ModuleView({ id, dark, setSection }) {
  const Component = MODULE_MAP[id];
  const card = BENTO_CARDS.find(c => c.id === id);

  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{ padding: "80px 24px 0" }}
    >
      <div className="module-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <span className="module-header-icon">{card?.icon}</span>
          <h2 className="module-header-title">{card?.label}</h2>
        </div>
        <p className="module-header-desc">{card?.desc}</p>
      </div>
      {Component && <Component dark={dark} setSection={setSection} />}
    </motion.div>
  );
}

// ─── App inner (uses context) ─────────────────────────────────
function AppInner() {
  const { dark, setDark, activeSection, setSection, notifications } = useApp();

  return (
    <div className="app-shell" data-theme={dark ? "dark" : "light"}>
      <FluidShader dark={dark} />

      <div className={`main-content${activeSection !== "home" ? " with-sidebar" : ""}`}>
        <TitleBar
          dark={dark}
          setDark={setDark}
          activeSection={activeSection}
          setSection={setSection}
          notifications={notifications}
        />

        <LayoutGroup>
          <AnimatePresence mode="wait">
            {activeSection === "home" ? (
              <HomePage key="home" dark={dark} setSection={setSection} />
            ) : (
              <AuthGuard key="auth" dark={dark}>
                <ModuleView
                  key={activeSection}
                  id={activeSection}
                  dark={dark}
                  setSection={setSection}
                />
              </AuthGuard>
            )}
          </AnimatePresence>
        </LayoutGroup>
      </div>

      <Sidebar activeSection={activeSection} setSection={setSection} />
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────
export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
