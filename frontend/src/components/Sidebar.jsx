/**
 * src/components/Sidebar.jsx
 * ─────────────────────────────────────────────────────────────
 * Replaces both LeftSidebar AND FloatingDock from InsightAI.jsx.
 * Clean sidebar with frosted background, proper active state,
 * readable labels. No magnification dock — simpler and more
 * usable for a SaaS tool.
 */

import { motion, AnimatePresence } from "framer-motion";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "◈" },
  { id: "workspace", label: "Workspace", icon: "⌖" },
  { id: "compare",   label: "Compare",   icon: "⇄" },
  { id: "audit",     label: "Audit Log", icon: "≡" },
];

export default function Sidebar({ activeSection, setSection }) {
  const visible = activeSection !== "home";

  return (
    <AnimatePresence>
      {visible && (
        <motion.nav
          initial={{ x: -80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
          className="sidebar"
        >
          {NAV_ITEMS.map((item, i) => (
            <motion.button
              key={item.id}
              onClick={() => setSection(item.id)}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`sidebar-item${activeSection === item.id ? " active" : ""}`}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span>{item.label}</span>
            </motion.button>
          ))}

          <div className="sidebar-divider" />

          <motion.button
            onClick={() => setSection("home")}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: NAV_ITEMS.length * 0.05 }}
            className="sidebar-item"
          >
            <span className="sidebar-item-icon">⌂</span>
            <span>Home</span>
          </motion.button>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
