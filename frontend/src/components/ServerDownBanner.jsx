/**
 * src/components/ServerDownBanner.jsx
 * ─────────────────────────────────────────────────────────────
 * Dismissible notification banner that appears when the backend
 * API is detected as offline (apiOnline === false).
 *
 * Features:
 *   - Slides in from the top with a smooth spring animation
 *   - Auto-dismisses when the server comes back online
 *   - User can manually dismiss; it reappears on next health-check failure
 *   - Pulsing warning icon for visual urgency
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "../context/AppContext.jsx";

export default function ServerDownBanner() {
  const { apiOnline } = useApp();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when server comes back and then goes down again
  useEffect(() => {
    if (apiOnline === true) {
      setDismissed(false);
    }
  }, [apiOnline]);

  const show = apiOnline === false && !dismissed;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="server-down-banner"
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        >
          <div className="server-down-banner-inner">
            {/* Pulsing warning icon */}
            <div className="server-down-icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>

            {/* Message */}
            <div className="server-down-text">
              <span className="server-down-title">Server Unreachable</span>
              <span className="server-down-desc">
                The backend is currently offline. Some features may be unavailable until the connection is restored.
              </span>
            </div>

            {/* Retry indicator — subtle pulsing dot */}
            <div className="server-down-retry">
              <span className="server-down-retry-dot" />
              <span className="server-down-retry-label">Retrying…</span>
            </div>

            {/* Dismiss button */}
            <button
              className="server-down-dismiss"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss banner"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
