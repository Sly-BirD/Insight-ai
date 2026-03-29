/**
 * src/pages/Audit.jsx
 * ─────────────────────────────────────────────────────────────
 * Step 7: Audit log wired to real query history from GET /analytics.
 * Replaces the hardcoded static log with live data.
 *
 * Wire into InsightAI.jsx MODULE_MAP:
 *   import AuditModule from "./pages/Audit.jsx";
 *   const MODULE_MAP = { audit: AuditModule, ... };
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/clerk-react";
import { fetchAnalytics } from "../services/api";

// ─── Helpers ─────────────────────────────────────────────────
const decisionColor = (d) => ({
  approve:       "#22c55e",
  reject:        "#ef4444",
  partial:       "#f59e0b",
  informational: "#94a3b8",
}[(d ?? "").toLowerCase()] ?? "#94a3b8");

const decisionLabel = (d) => ({
  approve:       "Approve",
  reject:        "Reject",
  partial:       "Partial",
  informational: "Info",
}[(d ?? "").toLowerCase()] ?? d ?? "—");

function formatTimestamp(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString([], {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

// ─── Component ───────────────────────────────────────────────
export default function AuditModule({ dark }) {
  const { getToken } = useAuth();
  const [queries,   setQueries]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [search,    setSearch]    = useState("");
  const [filterDec, setFilterDec] = useState("all");
  const [lastFetch, setLastFetch] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnalytics(getToken);
      setQueries(data.recent_queries ?? []);
      setLastFetch(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  // ── Filter ────────────────────────────────────────────────
  const filtered = queries.filter(row => {
    const matchSearch = !search || row.question?.toLowerCase().includes(search.toLowerCase());
    const matchDec    = filterDec === "all" || row.decision?.toLowerCase() === filterDec;
    return matchSearch && matchDec;
  });

  const monoSm = {
    fontFamily: "'DM Mono', monospace",
    fontSize: 9, letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: dark ? "#334155" : "#94a3b8",
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 0 80px" }}>

      {/* Controls row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16,
        alignItems: "center", flexWrap: "wrap" }}>

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search queries…"
          style={{
            flex: 1, minWidth: 200, maxWidth: 320,
            padding: "9px 14px", borderRadius: 9,
            background: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)",
            border: dark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)",
            fontFamily: "'DM Mono', monospace", fontSize: 11,
            color: dark ? "#94a3b8" : "#475569", outline: "none", boxSizing: "border-box",
          }}
        />

        {/* Decision filter */}
        {["all", "approve", "reject", "partial", "informational"].map(f => (
          <button key={f} onClick={() => setFilterDec(f)}
            style={{
              padding: "7px 12px", borderRadius: 7, cursor: "pointer",
              fontFamily: "'DM Mono', monospace", fontSize: 9,
              letterSpacing: "0.08em", textTransform: "uppercase",
              background: filterDec === f
                ? (dark ? "rgba(148,163,184,0.15)" : "rgba(30,41,59,0.1)")
                : "transparent",
              border: filterDec === f
                ? (dark ? "1px solid rgba(148,163,184,0.2)" : "1px solid rgba(30,41,59,0.15)")
                : (dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)"),
              color: filterDec === f
                ? (f === "all" ? (dark ? "#e2e8f0" : "#0f172a") : decisionColor(f))
                : (dark ? "#475569" : "#94a3b8"),
            }}>
            {f === "all" ? "All" : decisionLabel(f)}
          </button>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {lastFetch && (
            <span style={{ ...monoSm }}>
              {lastFetch.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button onClick={load} disabled={loading}
            style={{ padding: "6px 12px", borderRadius: 7, border: "none", cursor: "pointer",
              background: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
              fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.08em",
              textTransform: "uppercase", color: dark ? "#475569" : "#94a3b8" }}>
            {loading ? "…" : "↻"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "14px 18px", borderRadius: 10, marginBottom: 16,
          background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13,
            color: "#ef4444", margin: 0 }}>
            Could not load audit log: {error}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ padding: "48px", textAlign: "center" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 24,
            color: dark ? "#1e293b" : "#e2e8f0", marginBottom: 16 }}>≡</div>
          <p style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 18,
            fontStyle: "italic", color: dark ? "#475569" : "#64748b",
            margin: "0 0 8px" }}>
            {queries.length === 0 ? "No queries logged yet" : "No results match your filter"}
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13,
            color: dark ? "#334155" : "#94a3b8", margin: 0, fontWeight: 300 }}>
            {queries.length === 0
              ? "Run queries in the Workspace — they'll appear here automatically."
              : "Try adjusting the search or decision filter."}
          </p>
        </motion.div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          style={{ borderRadius: 14, overflow: "hidden",
            border: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)" }}>

          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "160px 1fr 90px 60px 60px 70px",
            padding: "10px 16px", gap: 8,
            background: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
            borderBottom: dark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.05)",
          }}>
            {["Timestamp", "Question", "Decision", "Conf.", "Audit", "Duration"].map(h => (
              <span key={h} style={{ ...monoSm }}>{h}</span>
            ))}
          </div>

          {/* Rows */}
          <AnimatePresence initial={false}>
            {filtered.map((row, i) => (
              <motion.div key={row.id ?? i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "160px 1fr 90px 60px 60px 70px",
                  padding: "11px 16px", gap: 8, alignItems: "center",
                  borderBottom: i < filtered.length - 1
                    ? (dark ? "1px solid rgba(255,255,255,0.03)" : "1px solid rgba(0,0,0,0.04)")
                    : "none",
                }}
              >
                {/* Timestamp */}
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10,
                  color: dark ? "#334155" : "#94a3b8" }}>
                  {formatTimestamp(row.timestamp)}
                </span>

                {/* Question */}
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                  color: dark ? "#64748b" : "#475569", fontWeight: 300,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={row.question}>
                  {row.question}
                </span>

                {/* Decision badge */}
                <span style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 9,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  padding: "3px 8px", borderRadius: 5,
                  background: `${decisionColor(row.decision)}18`,
                  color: decisionColor(row.decision),
                  justifySelf: "start",
                }}>
                  {decisionLabel(row.decision)}
                </span>

                {/* Confidence */}
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11,
                  color: dark ? "#475569" : "#64748b" }}>
                  {row.confidence ?? "—"}%
                </span>

                {/* Audit score */}
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11,
                  color: (row.audit_score ?? 0) >= 85 ? "#22c55e"
                    : (row.audit_score ?? 0) >= 70 ? "#f59e0b" : "#ef4444" }}>
                  {row.audit_score ?? "—"}
                </span>

                {/* Duration */}
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10,
                  color: dark ? "#334155" : "#94a3b8" }}>
                  {row.duration_s != null ? `${row.duration_s}s` : "—"}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Footer count */}
      {filtered.length > 0 && (
        <div style={{ marginTop: 12, ...monoSm }}>
          Showing {filtered.length} of {queries.length} entr{queries.length === 1 ? "y" : "ies"}
          {" "}· resets on server restart
        </div>
      )}
    </div>
  );
}