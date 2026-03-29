/**
 * src/pages/Dashboard.jsx
 * ─────────────────────────────────────────────────────────────
 * Step 7: Dashboard wired to GET /analytics.
 * Shows real query counts, decision breakdown, confidence/audit
 * averages, and a 14-day trend chart — all from live backend data.
 *
 * Wire into InsightAI.jsx MODULE_MAP:
 *   import DashboardModule from "./pages/Dashboard.jsx";
 *   const MODULE_MAP = { dashboard: DashboardModule, ... };
 */

import { useState, useEffect, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/clerk-react";
import { fetchAnalytics } from "../services/api";
import { AppContext } from "../context/AppContext.jsx";

// ─── helpers ─────────────────────────────────────────────────
const decisionColor = (d) => ({
  approve: "#22c55e",
  reject: "#ef4444",
  partial: "#f59e0b",
  informational: "#94a3b8",
}[d?.toLowerCase()] ?? "#94a3b8");

const decisionLabel = (d) => ({
  approve: "Approved",
  reject: "Rejected",
  partial: "Partial",
  informational: "Info",
}[d?.toLowerCase()] ?? d);

function formatTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch { return iso; }
}

// ─── Stat card ────────────────────────────────────────────────
function StatCard({ label, value, sub, color, dark, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{
        padding: "20px 22px", borderRadius: 14,
        background: dark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.025)",
        border: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <div style={{
        fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.1em",
        textTransform: "uppercase", color: dark ? "#334155" : "#94a3b8", marginBottom: 10
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 30,
        fontWeight: 400, color: color ?? (dark ? "#e2e8f0" : "#0f172a"),
        letterSpacing: "-0.03em", lineHeight: 1
      }}>
        {value ?? "—"}
      </div>
      {sub && (
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 10,
          color: dark ? "#334155" : "#94a3b8", marginTop: 7
        }}>
          {sub}
        </div>
      )}
    </motion.div>
  );
}

// ─── Trend chart ─────────────────────────────────────────────
function TrendChart({ dailyCounts, dark }) {
  if (!dailyCounts?.length) {
    return (
      <div style={{
        padding: "32px", textAlign: "center",
        fontFamily: "'DM Mono', monospace", fontSize: 11,
        color: dark ? "#334155" : "#94a3b8", letterSpacing: "0.06em"
      }}>
        No trend data yet — run some queries first.
      </div>
    );
  }

  const maxQ = Math.max(...dailyCounts.map(d => d.queries), 1);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80, marginBottom: 8 }}>
        {dailyCounts.map((d, i) => (
          <div key={d.date} style={{
            flex: 1, display: "flex", flexDirection: "column",
            gap: 2, alignItems: "center"
          }}>
            <motion.div
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: 0.3 + i * 0.04, duration: 0.4 }}
              style={{
                width: "100%",
                height: (d.queries / maxQ) * 64,
                background: dark ? "rgba(148,163,184,0.25)" : "rgba(30,41,59,0.15)",
                borderRadius: "3px 3px 0 0",
                transformOrigin: "bottom",
              }}
            />
            {d.rejected > 0 && (
              <motion.div
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: 0.35 + i * 0.04, duration: 0.4 }}
                style={{
                  width: "100%",
                  height: (d.rejected / maxQ) * 64 * 0.5,
                  background: "rgba(239,68,68,0.3)",
                  borderRadius: "3px 3px 0 0",
                  transformOrigin: "bottom",
                }}
              />
            )}
          </div>
        ))}
      </div>
      {/* X-axis dates */}
      <div style={{ display: "flex", gap: 6 }}>
        {dailyCounts.map((d, i) => (
          <div key={d.date} style={{
            flex: 1, textAlign: "center",
            fontFamily: "'DM Mono', monospace", fontSize: 8,
            color: dark ? "#1e293b" : "#e2e8f0",
            // Only show every 3rd label to avoid crowding
            opacity: i % 3 === 0 ? 1 : 0,
          }}>
            {formatDate(d.date)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Decision donut (CSS-based, no chart lib needed) ─────────
function DecisionBreakdown({ decisions, total, dark }) {
  if (!total) return null;

  const items = [
    { key: "approve", label: "Approved", color: "#22c55e" },
    { key: "reject", label: "Rejected", color: "#ef4444" },
    { key: "partial", label: "Partial", color: "#f59e0b" },
    { key: "informational", label: "Informational", color: "#94a3b8" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => {
        const count = decisions?.[item.key] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <motion.div key={item.key}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.07 }}
          >
            <div style={{
              display: "flex", justifyContent: "space-between",
              marginBottom: 4
            }}>
              <span style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                color: dark ? "#64748b" : "#475569", fontWeight: 300
              }}>
                {item.label}
              </span>
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: 11,
                color: item.color
              }}>
                {count} <span style={{ opacity: 0.5 }}>({pct}%)</span>
              </span>
            </div>
            <div style={{
              height: 3, borderRadius: 2,
              background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
              overflow: "hidden"
            }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ delay: 0.3 + i * 0.07, duration: 0.6, ease: "easeOut" }}
                style={{ height: "100%", borderRadius: 2, background: item.color }}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Recent queries mini-table ────────────────────────────────
function RecentQueriesTable({ queries, dark }) {
  if (!queries?.length) {
    return (
      <div style={{
        padding: "24px", textAlign: "center",
        fontFamily: "'DM Mono', monospace", fontSize: 11,
        color: dark ? "#334155" : "#94a3b8", letterSpacing: "0.06em"
      }}>
        No queries yet — ask something in the Workspace.
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 80px 60px 60px",
        padding: "8px 14px", gap: 8,
        borderBottom: dark ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(0,0,0,0.04)"
      }}>
        {["Question", "Decision", "Conf.", "Audit"].map(h => (
          <span key={h} style={{
            fontFamily: "'DM Mono', monospace", fontSize: 8,
            letterSpacing: "0.1em", textTransform: "uppercase",
            color: dark ? "#1e293b" : "#e2e8f0"
          }}>
            {h}
          </span>
        ))}
      </div>

      {queries.slice(0, 8).map((row, i) => (
        <motion.div key={row.id ?? i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.04 }}
          style={{
            display: "grid", gridTemplateColumns: "1fr 80px 60px 60px",
            padding: "10px 14px", gap: 8, alignItems: "center",
            borderBottom: i < Math.min(queries.length, 8) - 1
              ? (dark ? "1px solid rgba(255,255,255,0.03)" : "1px solid rgba(0,0,0,0.04)")
              : "none",
          }}
        >
          <span style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: 12,
            color: dark ? "#64748b" : "#475569", fontWeight: 300,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
          }}
            title={row.question}>
            {row.question}
          </span>
          <span style={{
            fontFamily: "'DM Mono', monospace", fontSize: 10,
            color: decisionColor(row.decision)
          }}>
            {decisionLabel(row.decision)}
          </span>
          <span style={{
            fontFamily: "'DM Mono', monospace", fontSize: 10,
            color: dark ? "#475569" : "#64748b"
          }}>
            {row.confidence}%
          </span>
          <span style={{
            fontFamily: "'DM Mono', monospace", fontSize: 10,
            color: (row.audit_score ?? 0) >= 85 ? "#22c55e"
              : (row.audit_score ?? 0) >= 70 ? "#f59e0b" : "#ef4444"
          }}>
            {row.audit_score ?? "—"}/100
          </span>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────
export default function DashboardModule({ dark }) {
  const { getToken } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnalytics(getToken);
      setAnalytics(data);
      setLastFetch(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load on mount and auto-refresh every 30s
  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  const monoSm = {
    fontFamily: "'DM Mono', monospace",
    fontSize: 9, letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: dark ? "#334155" : "#94a3b8",
  };

  const cardStyle = {
    padding: "20px 22px", borderRadius: 14,
    background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)",
    border: dark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.05)",
  };

  if (loading && !analytics) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 0", textAlign: "center" }}>
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          style={{
            width: 24, height: 24, border: `2px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)"}`,
            borderTopColor: dark ? "#94a3b8" : "#475569", borderRadius: "50%", display: "inline-block"
          }} />
        <p style={{ ...monoSm, marginTop: 12 }}>Loading analytics…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 0 60px" }}>
        <div style={{
          padding: "16px 20px", borderRadius: 12,
          background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)"
        }}>
          <p style={{ ...monoSm, color: "#ef4444", marginBottom: 4 }}>Error loading analytics</p>
          <p style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: 13,
            color: dark ? "#fca5a5" : "#ef4444", margin: "0 0 10px", fontWeight: 300
          }}>
            {error}
          </p>
          <button onClick={load} style={{
            padding: "7px 16px", borderRadius: 8, border: "none",
            background: dark ? "#1e293b" : "#0f172a", color: dark ? "#94a3b8" : "#e2e8f0",
            fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer"
          }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const a = analytics;
  const total = a?.total_queries ?? 0;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 0 60px" }}>

      {/* Refresh row */}
      <div style={{
        display: "flex", justifyContent: "flex-end", alignItems: "center",
        gap: 10, marginBottom: 20
      }}>
        {lastFetch && (
          <span style={{ ...monoSm }}>
            Updated {lastFetch.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <button onClick={load} disabled={loading}
          style={{
            padding: "6px 12px", borderRadius: 7, border: "none", cursor: "pointer",
            background: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
            fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.08em",
            textTransform: "uppercase", color: dark ? "#475569" : "#94a3b8"
          }}>
          {loading ? "…" : "↻ Refresh"}
        </button>
      </div>

      {/* Stat cards row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard dark={dark} delay={0} label="Total Queries" value={total.toLocaleString()} sub="all time" />
        <StatCard dark={dark} delay={0.06} label="Avg Confidence" value={`${a?.avg_confidence ?? 0}%`} sub="across all queries" color={dark ? "#e2e8f0" : "#0f172a"} />
        <StatCard dark={dark} delay={0.12} label="Avg Audit Score" value={`${a?.avg_audit_score ?? 0}`} sub="faithfulness / 100"
          color={(a?.avg_audit_score ?? 0) >= 80 ? "#22c55e" : (a?.avg_audit_score ?? 0) >= 65 ? "#f59e0b" : "#ef4444"} />
        <StatCard dark={dark} delay={0.18} label="Avg Query Time" value={`${a?.avg_duration_s ?? 0}s`} sub="end-to-end latency" />
      </div>

      {/* Middle row: Decision breakdown + Trend chart */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>

        {/* Decision breakdown */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24 }} style={cardStyle}>
          <p style={{ ...monoSm, marginBottom: 16 }}>Decision Breakdown</p>
          {total === 0 ? (
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 12,
              color: dark ? "#334155" : "#94a3b8", fontWeight: 300
            }}>
              No queries yet.
            </p>
          ) : (
            <DecisionBreakdown decisions={a?.decisions} total={total} dark={dark} />
          )}
        </motion.div>

        {/* Trend chart */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }} style={cardStyle}>
          <p style={{ ...monoSm, marginBottom: 16 }}>Query Volume — Last 14 Days</p>
          <TrendChart dailyCounts={a?.daily_counts ?? []} dark={dark} />
          <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 10, height: 3, borderRadius: 2,
                background: dark ? "rgba(148,163,184,0.25)" : "rgba(30,41,59,0.15)"
              }} />
              <span style={{ ...monoSm }}>All queries</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 10, height: 3, borderRadius: 2,
                background: "rgba(239,68,68,0.3)"
              }} />
              <span style={{ ...monoSm }}>Rejected</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Recent queries table */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32 }}
        style={{ ...cardStyle, overflow: "hidden" }}>
        <p style={{
          ...monoSm, marginBottom: 2, padding: "0 0 12px",
          borderBottom: dark ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(0,0,0,0.04)"
        }}>
          Recent Queries
        </p>
        <RecentQueriesTable queries={a?.recent_queries ?? []} dark={dark} />
      </motion.div>
    </div>
  );
}