/**
 * src/components/AuthGuard.jsx
 * ─────────────────────────────────────────────────────────────
 * Renders children when the user is signed in.
 * When NOT signed in, shows a modal overlay with a sign-in prompt
 * instead of blocking the entire page — the background (home page
 * or current section) is still visible but blurred behind the modal.
 *
 * Usage:
 *   <AuthGuard dark={dark}>
 *     <WorkspaceModule dark={dark} />
 *   </AuthGuard>
 */

import { useAuth, SignIn } from "@clerk/clerk-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AuthGuard({ children, dark }) {
  const { isLoaded, isSignedIn } = useAuth();

  // While Clerk is loading, show nothing (avoids flash)
  if (!isLoaded) {
    return (
      <div style={{
        minHeight: "60vh", display: "flex", alignItems: "center",
        justifyContent: "center",
      }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          style={{
            width: 24, height: 24, borderRadius: "50%",
            border: `2px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
            borderTopColor: dark ? "#94a3b8" : "#475569",
          }}
        />
      </div>
    );
  }

  // Signed in — render the protected content normally
  if (isSignedIn) {
    return children;
  }

  // Not signed in — render a blurred overlay with the Clerk SignIn modal
  return (
    <>
      {/* Blurred content behind the modal */}
      <div style={{
        filter: "blur(6px)",
        opacity: 0.3,
        pointerEvents: "none",
        userSelect: "none",
      }}>
        {children}
      </div>

      {/* Modal overlay */}
      <AnimatePresence>
        <motion.div
          key="auth-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: dark
              ? "rgba(5,5,5,0.6)"
              : "rgba(249,250,251,0.6)",
            backdropFilter: "blur(8px)",
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={   { opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}
          >
            {/* Branding above the Clerk widget */}
            <div style={{ textAlign: "center" }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, margin: "0 auto 12px",
                background: dark ? "#1a1a2e" : "#1e293b",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: dark ? "1px solid rgba(255,255,255,0.12)" : "none",
              }}>
                <span style={{ color: "#94a3b8", fontSize: 16, fontWeight: 700 }}>Ai</span>
              </div>
              <p style={{
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontSize: 22, fontStyle: "italic", fontWeight: 400,
                color: dark ? "#e2e8f0" : "#0f172a",
                margin: "0 0 4px", letterSpacing: "-0.02em",
              }}>
                Sign in to InsightAI
              </p>
              <p style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13, fontWeight: 300,
                color: dark ? "#475569" : "#64748b",
                margin: 0,
              }}>
                Access your workspace, queries, and analytics
              </p>
            </div>

            {/* Clerk's built-in SignIn widget */}
            <SignIn
              appearance={{
                variables: {
                  colorPrimary:    dark ? "#94a3b8" : "#0f172a",
                  colorBackground: dark ? "#0f172a" : "#ffffff",
                  colorText:       dark ? "#e2e8f0" : "#0f172a",
                  colorInputBackground: dark ? "#1e293b" : "#f8fafc",
                  colorInputText:  dark ? "#e2e8f0" : "#0f172a",
                  borderRadius:    "10px",
                  fontFamily:      "'DM Sans', sans-serif",
                },
                elements: {
                  card: {
                    boxShadow: dark
                      ? "0 24px 64px rgba(0,0,0,0.6)"
                      : "0 24px 64px rgba(0,0,0,0.12)",
                    border: dark
                      ? "1px solid rgba(255,255,255,0.08)"
                      : "1px solid rgba(0,0,0,0.08)",
                  },
                  headerTitle:    { display: "none" }, // we show our own title above
                  headerSubtitle: { display: "none" },
                },
              }}
            />
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}