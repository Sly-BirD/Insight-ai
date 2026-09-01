/**
 * src/components/ServerDownBanner.jsx
 * ─────────────────────────────────────────────────────────────
 * Persistent maintenance banner shown to all users.
 *
 * The backend is currently offline because Hugging Face moved
 * their Docker tier to a paid plan.  This banner is always
 * visible (not gated on health-check results) and cannot be
 * permanently dismissed — it reappears on page reload.
 *
 * Features:
 *   - Slides in from the top with a smooth spring animation
 *   - User can dismiss for the current session
 *   - Wrench / maintenance icon with pulse animation
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function ServerDownBanner() {
  const [dismissed, setDismissed] = useState(false);

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          className="server-down-banner"
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        >
          <div className="server-down-banner-inner">
            {/* Pulsing maintenance icon */}
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
                <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
              </svg>
            </div>

            {/* Message */}
            <div className="server-down-text">
              <span className="server-down-title">🚧 System Under Maintenance</span>
              <span className="server-down-desc">
                Hugging Face has moved their Docker tier to a paid plan, so our backend is currently offline.
                All features are unavailable until we migrate to a new hosting solution. We appreciate your patience!
              </span>
            </div>

            {/* Maintenance status badge */}
            <div className="server-down-retry">
              <span className="server-down-retry-dot" />
              <span className="server-down-retry-label">Maintenance</span>
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
