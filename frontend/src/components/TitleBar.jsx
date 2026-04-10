/**
 * src/components/TitleBar.jsx
 * ─────────────────────────────────────────────────────────────
 * Top navigation bar with brand, breadcrumbs, and actions.
 * Extracted + redesigned from InsightAI.jsx.
 *
 * Changes from original:
 * - Uses CSS classes from theme.css instead of inline styles
 * - Breadcrumb text bumped to 12px for readability
 * - Cleaner structure
 */

import { motion } from "framer-motion";
import ApiStatusDot from "./ApiStatusDot.jsx";
import UserButton from "./UserButton.jsx";

const BENTO_LABELS = {
  dashboard: "Dashboard",
  workspace: "Workspace",
  compare: "Compare",
  audit: "Audit Log",
};

export default function TitleBar({ dark, setDark, activeSection, setSection, notifications }) {
  const crumbs = activeSection === "home"
    ? ["Home"]
    : ["Home", BENTO_LABELS[activeSection] ?? activeSection];

  return (
    <motion.header
      initial={{ y: -64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="titlebar"
    >
      {/* Brand */}
      <button onClick={() => setSection("home")} className="titlebar-brand">
        <div className="titlebar-logo">
          {dark && (
            <div style={{
              position: "absolute", inset: 0, borderRadius: 8,
              background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.05), transparent)",
            }} />
          )}
          <span className="titlebar-logo-text">Փ</span>
        </div>
        <span className="titlebar-name">InsightAI</span>
      </button>

      {/* Breadcrumbs */}
      <div className="titlebar-breadcrumbs">
        {crumbs.map((c, i) => (
          <span key={c} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <span style={{ opacity: 0.4 }}>/</span>}
            <motion.span
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={i === crumbs.length - 1 ? "titlebar-breadcrumb-active" : ""}
              style={{ cursor: i === 0 ? "pointer" : "default" }}
              onClick={i === 0 ? () => setSection("home") : undefined}
            >
              {c}
            </motion.span>
          </span>
        ))}
      </div>

      {/* Actions */}
      <div className="titlebar-actions">
        <ApiStatusDot />

        {/* Notification bell */}
        <button className="notification-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
          </svg>
          {notifications > 0 && <span className="notification-dot" />}
        </button>

        {/* Dark/light toggle */}
        <button
          onClick={() => setDark(d => !d)}
          className="theme-toggle"
          aria-label="Toggle dark mode"
        >
          <motion.div
            animate={{ x: dark ? 22 : 2 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            style={{
              position: "absolute", top: 2.5,
              width: 17, height: 17, borderRadius: "50%",
              background: dark ? "#94a3b8" : "#64748b",
            }}
          />
        </button>

        <UserButton dark={dark} />
      </div>
    </motion.header>
  );
}
