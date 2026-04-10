/**
 * src/components/ApiStatusDot.jsx
 * ─────────────────────────────────────────────────────────────
 * Animated connection-status indicator for the API backend.
 * Extracted from InsightAI.jsx.
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { checkHealth } from "../services/api.js";

export default function ApiStatusDot() {
  const [online, setOnline] = useState(null);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const ok = await checkHealth();
        if (active) setOnline(ok);
      } catch {
        if (active) setOnline(false);
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  const color = online === null ? "#f59e0b" : online ? "#22c55e" : "#ef4444";

  return (
    <div className="api-status" title={online === null ? "Checking…" : online ? "API Online" : "API Offline"}>
      <motion.div
        animate={{ opacity: online === true ? [1, 0.3, 1] : 1 }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="api-status-dot"
        style={{ background: color }}
      />
    </div>
  );
}
