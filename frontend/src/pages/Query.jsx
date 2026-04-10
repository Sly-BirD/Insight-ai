/**
 * src/pages/Query.jsx
 * ─────────────────────────────────────────────────────────────
 * Fully functional Query page for InsightAI.
 *
 * Drop this into MODULE_MAP in InsightAI.jsx:
 *   import QueryModule from "./src/pages/Query.jsx";
 *   const MODULE_MAP = { ..., query: QueryModule, ... };
 *
 * Styling: 100% inline styles matching the existing InsightAI
 * aesthetic — DM Serif Display / DM Sans / DM Mono fonts,
 * the same card/border/background tokens, framer-motion
 * animations.  Zero Tailwind classes, zero new dependencies.
 */

import { useState, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/clerk-react";
import { runQuery } from "../services/api";

// ─── context ─────────────────────────────────────────────────
// Works with both the inline AppContext from InsightAI.jsx and
// the enhanced one from src/context/AppContext.jsx.
import { AppContext } from "../context/AppContext";

const useApp = () => useContext(AppContext);

// ─── constants ───────────────────────────────────────────────
const AUDIT_WARN_THRESHOLD = 85; // show warning banner below this score

/** Decision → visual tokens */
const DECISION_META = {
  approve: {
    label:  "Approved",
    icon:   "✓",
    color:  "#22c55e",
    bg:     "rgba(34,197,94,0.05)",
    border: "rgba(34,197,94,0.2)",
  },
  reject: {
    label:  "Rejected",
    icon:   "✗",
    color:  "#ef4444",
    bg:     "rgba(239,68,68,0.05)",
    border: "rgba(239,68,68,0.2)",
  },
  partial: {
    label:  "Partial",
    icon:   "◑",
    color:  "#f59e0b",
    bg:     "rgba(245,158,11,0.05)",
    border: "rgba(245,158,11,0.2)",
  },
  informational: {
    label:  "Informational",
    icon:   "ℹ",
    color:  "#94a3b8",
    bg:     "rgba(148,163,184,0.05)",
    border: "rgba(148,163,184,0.15)",
  },
};

const decisionMeta = (d) =>
  DECISION_META[(d ?? "").toLowerCase()] ?? DECISION_META.informational;

// ─── tiny toast ───────────────────────────────────────────────
/**
 * Self-contained toast notification — no external library needed.
 * Rendered at the bottom-right; auto-dismisses after 4 s.
 */
function Toast({ message, type, onDismiss }) {
  const isError = type === "error";
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      exit={   { opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position:     "fixed",
        bottom:       80,          // above the FloatingDock
        right:        24,
        zIndex:       9999,
        maxWidth:     380,
        padding:      "14px 18px",
        borderRadius: 12,
        background:   isError
          ? "rgba(239,68,68,0.12)"
          : "rgba(34,197,94,0.10)",
        border: `1px solid ${isError
          ? "rgba(239,68,68,0.25)"
          : "rgba(34,197,94,0.25)"}`,
        backdropFilter: "blur(12px)",
        display:      "flex",
        alignItems:   "center",
        gap:          10,
        cursor:       "pointer",
      }}
      onClick={onDismiss}
    >
      <span style={{ fontSize: 14, color: isError ? "#ef4444" : "#22c55e" }}>
        {isError ? "✗" : "✓"}
      </span>
      <span style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize:   13,
        fontWeight: 300,
        color:      isError ? "#fca5a5" : "#86efac",
        lineHeight: 1.5,
      }}>
        {message}
      </span>
    </motion.div>
  );
}

function useToast() {
  const [toast, setToast] = useState(null);

  const show = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4_000);
  };

  const ToastPortal = () => (
    <AnimatePresence>
      {toast && (
        <Toast
          key={toast.message}
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </AnimatePresence>
  );

  return { show, ToastPortal };
}

// ─── example queries ─────────────────────────────────────────
const EXAMPLE_QUERIES = [
  "What is the waiting period for pre-existing diseases in HDFC Easy Health?",
  "What are the major exclusions under HDFC Life Cardiac Care policy?",
  "Is cancer treatment covered under HDFC Life Cancer Care plan?",
  "What is the co-payment clause in SBI General Health Insurance?",
];

// ─── component ───────────────────────────────────────────────
export default function QueryModule({ dark }) {
  // Fall back gracefully if context isn't the enhanced version
  const ctx       = useApp?.() ?? {};
  const addQuery  = ctx.addQuery ?? (() => {});
  const { getToken } = useAuth();

  const [question, setQuestion] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [apiError, setApiError] = useState(null);

  const { show: showToast, ToastPortal } = useToast();

  // ── submit ─────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setApiError(null);

    try {
      const data = await runQuery(question, getToken);
      setResult(data);
      addQuery(question, data);
      showToast("Query complete", "success");
    } catch (err) {
      setApiError(err.message);
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    // Ctrl/Cmd + Enter to submit
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSubmit();
  };

  // ── derived display ────────────────────────────────────────
  const dm          = decisionMeta(result?.answer?.decision);
  const auditScore  = result?.audit?.score  ?? null;
  const showWarning = auditScore !== null && auditScore < AUDIT_WARN_THRESHOLD;

  // ── shared style tokens ────────────────────────────────────
  const cardBase = {
    borderRadius: 16,
    background:   dark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.02)",
    border:       dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)",
  };

  const monoSm = {
    fontFamily:    "'DM Mono', monospace",
    fontSize:      10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color:         dark ? "#5a6a78" : "#94a3b8",
  };

  // ── render ─────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 0 80px" }}>
      <ToastPortal />

      {/* ── Input area ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ marginBottom: 24 }}
      >
        {/* Textarea */}
        <div style={{ position: "relative" }}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={3}
            placeholder="Ask anything about an insurance policy…"
            style={{
              width:       "100%",
              padding:     "18px 20px",
              borderRadius: 14,
              background:  dark ? "rgba(15,23,42,0.65)" : "rgba(0,0,0,0.025)",
              border:      dark
                ? "1px solid rgba(255,255,255,0.1)"
                : "1px solid rgba(0,0,0,0.1)",
              fontFamily:  "'DM Sans', sans-serif",
              fontSize:    15,
              fontWeight:  300,
              lineHeight:  1.6,
              color:       dark ? "#e2e8f0" : "#0f172a",
              outline:     "none",
              resize:      "vertical",
              boxSizing:   "border-box",
              opacity:     loading ? 0.6 : 1,
              transition:  "border-color 0.2s",
            }}
          />
        </div>

        {/* Submit row */}
        <div style={{
          display:        "flex",
          justifyContent: "space-between",
          alignItems:     "center",
          marginTop:      10,
          gap:            12,
        }}>
          <span style={{
            fontFamily:    "'DM Mono', monospace",
            fontSize:      10,
            color:         dark ? "#3a4550" : "#e2e8f0",
            letterSpacing: "0.04em",
          }}>
            ⌘ + Enter to submit
          </span>

          <motion.button
            whileHover={{ scale: loading ? 1 : 1.02 }}
            whileTap={  { scale: loading ? 1 : 0.97 }}
            onClick={handleSubmit}
            disabled={loading || !question.trim()}
            style={{
              padding:      "11px 24px",
              borderRadius: 10,
              background:   loading || !question.trim()
                ? (dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)")
                : (dark ? "#e2e8f0" : "#0f172a"),
              color: loading || !question.trim()
                ? (dark ? "#5a6a78" : "#94a3b8")
                : (dark ? "#0f172a" : "#e2e8f0"),
              border:      "none",
              fontFamily:  "'DM Sans', sans-serif",
              fontSize:    13,
              fontWeight:  500,
              cursor:      loading || !question.trim() ? "not-allowed" : "pointer",
              display:     "flex",
              alignItems:  "center",
              gap:         8,
              transition:  "background 0.2s, color 0.2s",
              letterSpacing: "0.01em",
            }}
          >
            {loading ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                  style={{
                    width:  12, height: 12,
                    border: "2px solid rgba(148,163,184,0.2)",
                    borderTopColor: dark ? "#5a6a78" : "#94a3b8",
                    borderRadius:   "50%",
                  }}
                />
                Analysing…
              </>
            ) : (
              "Run Query →"
            )}
          </motion.button>
        </div>
      </motion.div>

      {/* ── Example queries ── */}
      {!result && !loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{ marginBottom: 32 }}
        >
          <p style={{ ...monoSm, marginBottom: 10 }}>Example queries</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {EXAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => setQuestion(q)}
                style={{
                  textAlign:    "left",
                  padding:      "10px 14px",
                  borderRadius: 9,
                  background:   "transparent",
                  border:       dark
                    ? "1px solid rgba(255,255,255,0.05)"
                    : "1px solid rgba(0,0,0,0.06)",
                  fontFamily:   "'DM Sans', sans-serif",
                  fontSize:     13,
                  fontWeight:   300,
                  color:        dark ? "#8899a6" : "#64748b",
                  cursor:       "pointer",
                  transition:   "border-color 0.2s, color 0.2s",
                  lineHeight:   1.5,
                }}
                onMouseEnter={(e) => {
                  e.target.style.borderColor = dark
                    ? "rgba(148,163,184,0.18)"
                    : "rgba(30,41,59,0.18)";
                  e.target.style.color = dark ? "#94a3b8" : "#475569";
                }}
                onMouseLeave={(e) => {
                  e.target.style.borderColor = dark
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(0,0,0,0.06)";
                  e.target.style.color = dark ? "#8899a6" : "#64748b";
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Loading state ── */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={  { opacity: 0 }}
            style={{ textAlign: "center", padding: "48px 0" }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              style={{
                width:  28, height: 28,
                border: `2px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)"}`,
                borderTopColor: dark ? "#94a3b8" : "#475569",
                borderRadius:   "50%",
                display:        "inline-block",
              }}
            />
            <p style={{
              fontFamily:    "'DM Mono', monospace",
              fontSize:      11,
              color:         dark ? "#5a6a78" : "#94a3b8",
              marginTop:     16,
              letterSpacing: "0.06em",
            }}>
              Retrieving → Grading → Generating → Auditing…
            </p>
          </motion.div>
        )}

        {/* ── Error state ── */}
        {apiError && !loading && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0  }}
            exit={  { opacity: 0        }}
            style={{
              padding:      "18px 22px",
              borderRadius: 14,
              background:   "rgba(239,68,68,0.05)",
              border:       "1px solid rgba(239,68,68,0.2)",
            }}
          >
            <p style={{
              fontFamily: "'DM Mono', monospace",
              fontSize:   10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color:      "#ef4444",
              marginBottom: 6,
            }}>
              Error
            </p>
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize:   14,
              color:      dark ? "#fca5a5" : "#ef4444",
              lineHeight: 1.6,
              fontWeight: 300,
              margin:     0,
            }}>
              {apiError}
            </p>
            <p style={{
              fontFamily:    "'DM Mono', monospace",
              fontSize:      10,
              color:         dark ? "#5a6a78" : "#94a3b8",
              letterSpacing: "0.04em",
              marginTop:     8,
            }}>
              Make sure the API is running and connected
            </p>
          </motion.div>
        )}

        {/* ── Result ── */}
        {result && !loading && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0  }}
            exit={  { opacity: 0, y: -12 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >

            {/* Decision card */}
            <div style={{
              padding:      "24px 28px",
              borderRadius: 16,
              background:   dm.bg,
              border:       `1px solid ${dm.border}`,
              marginBottom: 14,
            }}>
              {/* Header row */}
              <div style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "space-between",
                marginBottom:   14,
                flexWrap:       "wrap",
                gap:            12,
              }}>
                {/* Decision badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width:        36, height: 36,
                    borderRadius: 10,
                    background:   dm.bg,
                    border:       `1px solid ${dm.border}`,
                    display:      "flex",
                    alignItems:   "center",
                    justifyContent: "center",
                    fontSize:     16,
                    color:        dm.color,
                  }}>
                    {dm.icon}
                  </div>
                  <span style={{
                    fontFamily:    "'DM Serif Display', Georgia, serif",
                    fontSize:      20,
                    fontStyle:     "italic",
                    color:         dm.color,
                    letterSpacing: "-0.01em",
                  }}>
                    {dm.label}
                  </span>
                </div>

                {/* Scores */}
                <div style={{
                  display:       "flex",
                  flexDirection: "column",
                  alignItems:    "flex-end",
                  gap:           4,
                }}>
                  <span style={{
                    fontFamily:    "'DM Mono', monospace",
                    fontSize:      11,
                    letterSpacing: "0.06em",
                    color:         dark ? "#8899a6" : "#94a3b8",
                  }}>
                    {result.answer?.confidence}% confidence
                  </span>
                  {auditScore !== null && (
                    <span style={{
                      fontFamily:    "'DM Mono', monospace",
                      fontSize:      10,
                      letterSpacing: "0.04em",
                      color:         auditScore >= 85 ? "#22c55e" : auditScore >= 70 ? "#f59e0b" : "#ef4444",
                    }}>
                      Audit {auditScore}/100
                    </span>
                  )}
                </div>
              </div>

              {/* Justification */}
              <p style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize:   14,
                lineHeight: 1.7,
                color:      dark ? "#94a3b8" : "#475569",
                margin:     0,
                fontWeight: 300,
              }}>
                {result.answer?.justification}
              </p>
            </div>

            {/* Supporting clauses */}
            {result.answer?.clauses?.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0  }}
                transition={{ delay: 0.15 }}
                style={{ marginBottom: 14 }}
              >
                <p style={{ ...monoSm, marginBottom: 10 }}>Supporting Clauses</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {result.answer.clauses.map((clause, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0   }}
                      transition={{ delay: 0.18 + i * 0.07 }}
                      style={{
                        display:      "flex",
                        gap:          12,
                        alignItems:   "flex-start",
                        padding:      "12px 16px",
                        borderRadius: 10,
                        background:   dark ? "rgba(15,23,42,0.75)" : "rgba(0,0,0,0.02)",
                        border:       dark
                          ? "1px solid rgba(255,255,255,0.04)"
                          : "1px solid rgba(0,0,0,0.04)",
                      }}
                    >
                      <span style={{
                        color:     dark ? "#5a6a78" : "#cbd5e1",
                        marginTop: 2,
                        flexShrink: 0,
                        fontSize:  11,
                      }}>▸</span>
                      <span style={{
                        fontFamily: "'DM Mono', monospace",
                        fontSize:   11,
                        lineHeight: 1.65,
                        color:      dark ? "#8899a6" : "#64748b",
                      }}>
                        {clause}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Audit flags */}
            {result.audit?.flags?.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                style={{
                  padding:      "14px 18px",
                  borderRadius: 12,
                  background:   "rgba(245,158,11,0.04)",
                  border:       "1px solid rgba(245,158,11,0.15)",
                  marginBottom: 12,
                }}
              >
                <p style={{
                  fontFamily:    "'DM Mono', monospace",
                  fontSize:      10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color:         "#f59e0b",
                  marginBottom:  8,
                }}>
                  Audit Flags
                </p>
                {result.audit.flags.map((flag, i) => (
                  <p key={i} style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize:   12,
                    lineHeight: 1.65,
                    color:      dark ? "#64748b" : "#94a3b8",
                    margin:     i < result.audit.flags.length - 1 ? "0 0 4px" : 0,
                    fontWeight: 300,
                  }}>
                    ⚠ {flag}
                  </p>
                ))}
              </motion.div>
            )}

            {/* Low-audit warning banner */}
            {showWarning && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                style={{
                  padding:      "12px 16px",
                  borderRadius: 10,
                  background:   "rgba(239,68,68,0.04)",
                  border:       "1px solid rgba(239,68,68,0.15)",
                  marginBottom: 12,
                }}
              >
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize:   12,
                  lineHeight: 1.65,
                  color:      dark ? "#fca5a5" : "#ef4444",
                  margin:     0,
                  fontWeight: 300,
                }}>
                  ⚠ This answer scored {auditScore}/100 on faithfulness audit.
                  Verify directly against the original policy document before acting on this information.
                </p>
              </motion.div>
            )}

            {/* API-level warning */}
            {result.warning && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.32 }}
                style={{
                  padding:      "12px 16px",
                  borderRadius: 10,
                  background:   "rgba(239,68,68,0.04)",
                  border:       "1px solid rgba(239,68,68,0.12)",
                  marginBottom: 12,
                }}
              >
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize:   12,
                  lineHeight: 1.65,
                  color:      dark ? "#94a3b8" : "#64748b",
                  margin:     0,
                  fontWeight: 300,
                }}>
                  {result.warning}
                </p>
              </motion.div>
            )}

            {/* Retrieval metadata footer */}
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 4 }}>
              {[
                { k: "Chunks",   v: result.retrieval_info?.chunks_used   },
                { k: "Rewrites", v: result.retrieval_info?.rewrites_done  },
                { k: "Audit",    v: `${result.audit?.score ?? "—"}/100`  },
                { k: "Query",    v: result.retrieval_info?.final_query?.slice(0, 40) + (result.retrieval_info?.final_query?.length > 40 ? "…" : "") },
              ].map(({ k, v }) => (
                <span key={k} style={{
                  fontFamily:    "'DM Mono', monospace",
                  fontSize:      10,
                  color:         dark ? "#3a4550" : "#e2e8f0",
                  letterSpacing: "0.04em",
                }}>
                  {k}:{" "}
                  <span style={{ color: dark ? "#5a6a78" : "#94a3b8" }}>{v}</span>
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
