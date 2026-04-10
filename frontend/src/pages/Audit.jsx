/**
 * src/pages/Audit.jsx
 * ─────────────────────────────────────────────────────────────
 * Step 7: Audit log wired to real query history from GET /analytics.
 * Replaces the hardcoded static log with live data.
 *
 * Updated for the SaaS architecture using theme.css classes.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/clerk-react";
import { fetchAnalytics } from "../services/api";

// ─── Helpers ─────────────────────────────────────────────────
const decisionColor = (d) => ({
  approve:       "var(--color-success)",
  reject:        "var(--color-error)",
  partial:       "var(--color-warning)",
  informational: "var(--color-info)",
}[(d ?? "").toLowerCase()] ?? "var(--color-info)");

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
export default function AuditModule() {
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

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 0 80px" }}>

      {/* Controls row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, alignItems: "center", flexWrap: "wrap" }}>
        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search queries…"
          style={{
            flex: 1, minWidth: 200, maxWidth: 320,
            padding: "10px 16px", borderRadius: "10px",
            background: "var(--color-bg-input)",
            border: "1px solid var(--color-border-subtle)",
            fontFamily: "var(--font-sans)", fontSize: 13,
            color: "var(--color-text-primary)", outline: "none", boxSizing: "border-box",
          }}
        />

        {/* Decision filter */}
        <div style={{ display: "flex", gap: 8 }}>
          {["all", "approve", "reject", "partial", "informational"].map(f => (
            <button key={f} onClick={() => setFilterDec(f)}
              style={{
                padding: "8px 14px", borderRadius: "8px", cursor: "pointer",
                fontFamily: "var(--font-sans)", fontSize: 13,
                background: filterDec === f ? "var(--color-bg-subtle)" : "transparent",
                border: filterDec === f ? "1px solid var(--color-border-strong)" : "1px solid var(--color-border-subtle)",
                color: filterDec === f ? (f === "all" ? "var(--color-text-primary)" : decisionColor(f)) : "var(--color-text-muted)",
              }}>
              {f === "all" ? "All" : decisionLabel(f)}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {lastFetch && (
            <span className="text-small">
              {lastFetch.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button className="btn btn-ghost" onClick={load} disabled={loading}>
            {loading ? "…" : "↻"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card" style={{ borderColor: "var(--color-error)", marginBottom: 24 }}>
          <div className="text-body" style={{ color: "var(--color-error)" }}>Could not load audit log: {error}</div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card" style={{ textAlign: "center", padding: "64px 24px" }}>
          <div className="heading-section" style={{ fontSize: 24, marginBottom: 8 }}>
            {queries.length === 0 ? "No queries logged yet" : "No results match your filter"}
          </div>
          <p className="text-body" style={{ margin: 0 }}>
            {queries.length === 0
              ? "Run queries in the Workspace — they'll appear here automatically."
              : "Try adjusting the search or decision filter."}
          </p>
        </motion.div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ padding: "8px 0", overflow: "hidden" }}>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "160px 1fr 100px 80px 80px 80px",
            padding: "16px", gap: 16,
            borderBottom: "1px solid var(--color-border-strong)",
          }}>
            {["Timestamp", "Question", "Decision", "Confidence", "Audit", "Duration"].map(h => (
              <span key={h} className="text-small" style={{ fontWeight: 500 }}>{h}</span>
            ))}
          </div>

          {/* Rows */}
          <AnimatePresence initial={false}>
            {filtered.map((row, i) => (
              <motion.div key={row.id ?? i}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                style={{
                  display: "grid", gridTemplateColumns: "160px 1fr 100px 80px 80px 80px",
                  padding: "16px", gap: 16, alignItems: "center",
                  borderBottom: i < filtered.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
                }}
              >
                {/* Timestamp */}
                <span className="text-small">{formatTimestamp(row.timestamp)}</span>

                {/* Question */}
                <span className="text-body" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.question}>
                  {row.question}
                </span>

                {/* Decision badge */}
                <span className="text-small" style={{
                  padding: "4px 10px", borderRadius: "6px",
                  background: "var(--color-bg-subtle)",
                  border: "1px solid var(--color-border-subtle)",
                  color: decisionColor(row.decision),
                  justifySelf: "start",
                }}>
                  {decisionLabel(row.decision)}
                </span>

                {/* Confidence */}
                <span className="text-small">{row.confidence ?? "—"}%</span>

                {/* Audit score */}
                <span className="text-small" style={{
                  color: (row.audit_score ?? 0) >= 85 ? "var(--color-success)"
                    : (row.audit_score ?? 0) >= 70 ? "var(--color-warning)" : "var(--color-error)"
                }}>
                  {row.audit_score ?? "—"}
                </span>

                {/* Duration */}
                <span className="text-small">{row.duration_s != null ? `${row.duration_s}s` : "—"}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Footer count */}
      {filtered.length > 0 && (
        <div className="text-small" style={{ marginTop: 16 }}>
          Showing {filtered.length} of {queries.length} entr{queries.length === 1 ? "y" : "ies"} · resets on server restart
        </div>
      )}
    </div>
  );
}