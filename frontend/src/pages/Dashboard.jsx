/**
 * src/pages/Dashboard.jsx
 * ─────────────────────────────────────────────────────────────
 * Step 7: Dashboard wired to GET /analytics.
 * Shows real query counts, decision breakdown, confidence/audit
 * averages, and a 14-day trend chart — all from live backend data.
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@clerk/clerk-react";
import { fetchAnalytics } from "../services/api";

// ─── helpers ─────────────────────────────────────────────────
const decisionColor = (d) => ({
  approve: "var(--color-success)",
  reject: "var(--color-error)",
  partial: "var(--color-warning)",
  informational: "var(--color-info)",
}[d?.toLowerCase()] ?? "var(--color-info)");

const decisionLabel = (d) => ({
  approve: "Approved",
  reject: "Rejected",
  partial: "Partial",
  informational: "Info",
}[d?.toLowerCase()] ?? d);

function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch { return iso; }
}

// ─── Stat card ────────────────────────────────────────────────
function StatCard({ label, value, sub, color, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="card"
    >
      <div className="text-small" style={{ marginBottom: 8 }}>{label}</div>
      <div className="heading-display" style={{ fontSize: 40, color: color ?? "var(--color-text-primary)", marginBottom: 4 }}>
        {value ?? "—"}
      </div>
      {sub && <div className="text-small">{sub}</div>}
    </motion.div>
  );
}

// ─── Trend chart ─────────────────────────────────────────────
function TrendChart({ dailyCounts }) {
  if (!dailyCounts?.length) {
    return (
      <div className="text-body" style={{ textAlign: "center", padding: "40px" }}>
        No trend data yet. Run some queries first.
      </div>
    );
  }

  const maxQ = Math.max(...dailyCounts.map(d => d.queries), 1);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, marginBottom: 12 }}>
        {dailyCounts.map((d, i) => (
          <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
            <motion.div
              initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.3 + i * 0.04 }}
              style={{
                width: "100%", height: `${(d.queries / maxQ) * 100}%`,
                background: "var(--color-border-strong)", borderRadius: "4px 4px 0 0", transformOrigin: "bottom",
              }}
            />
            {d.rejected > 0 && (
              <motion.div
                initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.35 + i * 0.04 }}
                style={{
                  width: "100%", height: `${(d.rejected / maxQ) * 100 * 0.5}%`,
                  background: "var(--color-error)", borderRadius: "4px 4px 0 0", transformOrigin: "bottom",
                  opacity: 0.6
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {dailyCounts.map((d, i) => (
          <div key={d.date} className="text-small" style={{ flex: 1, textAlign: "center", fontSize: 11, opacity: i % 3 === 0 ? 1 : 0 }}>
            {formatDate(d.date)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Decision donut ──────────────────────────────────────────
function DecisionBreakdown({ decisions, total }) {
  if (!total) return null;

  const items = [
    { key: "approve", label: "Approved", color: "var(--color-success)" },
    { key: "reject", label: "Rejected", color: "var(--color-error)" },
    { key: "partial", label: "Partial", color: "var(--color-warning)" },
    { key: "informational", label: "Informational", color: "var(--color-info)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {items.map((item, i) => {
        const count = decisions?.[item.key] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <motion.div key={item.key} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.07 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span className="text-body">{item.label}</span>
              <span className="text-body" style={{ color: item.color }}>{count} <span style={{ opacity: 0.5 }}>({pct}%)</span></span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--color-border-subtle)", overflow: "hidden" }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.3 + i * 0.07, duration: 0.6 }}
                style={{ height: "100%", borderRadius: 3, background: item.color }} />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Recent queries ───────────────────────────────────────────
function RecentQueriesTable({ queries }) {
  if (!queries?.length) {
    return <div className="text-body" style={{ padding: "32px", textAlign: "center" }}>No queries yet.</div>;
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 80px 80px", padding: "12px 16px", borderBottom: "1px solid var(--color-border)" }}>
        {["Question", "Decision", "Confidence", "Audit"].map(h => (
          <span key={h} className="text-small" style={{ fontWeight: 500 }}>{h}</span>
        ))}
      </div>
      {queries.slice(0, 8).map((row, i) => (
        <motion.div key={row.id ?? i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
          style={{ display: "grid", gridTemplateColumns: "1fr 100px 80px 80px", padding: "16px", alignItems: "center", borderBottom: i < Math.min(queries.length, 8) - 1 ? "1px solid var(--color-border-subtle)" : "none" }}>
          <span className="text-body" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.question}>{row.question}</span>
          <span className="text-small" style={{ color: decisionColor(row.decision) }}>{decisionLabel(row.decision)}</span>
          <span className="text-small">{row.confidence}%</span>
          <span className="text-small" style={{ color: (row.audit_score ?? 0) >= 85 ? "var(--color-success)" : (row.audit_score ?? 0) >= 70 ? "var(--color-warning)" : "var(--color-error)" }}>
            {row.audit_score ?? "—"}/100
          </span>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────
export default function DashboardModule() {
  const { getToken } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchAnalytics(getToken);
      setAnalytics(data); setLastFetch(new Date());
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  useEffect(() => { load(); const interval = setInterval(load, 30_000); return () => clearInterval(interval); }, []);

  if (loading && !analytics) return <div className="text-body" style={{ textAlign: "center", padding: "80px" }}>Loading analytics…</div>;
  if (error) return (
    <div className="card" style={{ maxWidth: 600, margin: "0 auto", borderColor: "var(--color-error)" }}>
      <div className="heading-section" style={{ color: "var(--color-error)", marginBottom: 8 }}>Error loading analytics</div>
      <div className="text-body" style={{ marginBottom: 16 }}>{error}</div>
      <button className="btn btn-primary" onClick={load}>Retry</button>
    </div>
  );

  const a = analytics;
  const total = a?.total_queries ?? 0;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 0 100px" }}>
      {/* Header controls */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16, marginBottom: 32 }}>
        {lastFetch && <span className="text-small">Updated {lastFetch.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
        <button className="btn btn-ghost" onClick={load} disabled={loading}>{loading ? "…" : "↻ Refresh"}</button>
      </div>

      {/* Top stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginBottom: 32 }}>
        <StatCard label="Total Queries" value={total.toLocaleString()} sub="all time" />
        <StatCard delay={0.06} label="Avg Confidence" value={`${a?.avg_confidence ?? 0}%`} sub="model certainty" />
        <StatCard delay={0.12} label="Avg Audit Score" value={`${a?.avg_audit_score ?? 0}`} sub="faithfulness vs original" color={(a?.avg_audit_score ?? 0) >= 80 ? "var(--color-success)" : "var(--color-error)"} />
        <StatCard delay={0.18} label="Avg Query Time" value={`${a?.avg_duration_s ?? 0}s`} sub="latency" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 24, marginBottom: 24 }}>
        {/* Breakdown */}
        <div className="card">
          <div className="heading-section" style={{ fontSize: 24, marginBottom: 24 }}>Decisions</div>
          {total === 0 ? <div className="text-body">No queries yet.</div> : <DecisionBreakdown decisions={a?.decisions} total={total} />}
        </div>

        {/* Trend */}
        <div className="card">
          <div className="heading-section" style={{ fontSize: 24, marginBottom: 24 }}>Query Volume</div>
          <TrendChart dailyCounts={a?.daily_counts ?? []} />
          <div style={{ display: "flex", gap: 24, marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 12, height: 4, borderRadius: 2, background: "var(--color-border-strong)" }} /><span className="text-small">All queries</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 12, height: 4, borderRadius: 2, background: "var(--color-error)", opacity: 0.6 }} /><span className="text-small">Rejected</span></div>
          </div>
        </div>
      </div>

      {/* Recent queries */}
      <div className="card" style={{ padding: "8px 0" }}>
        <div className="heading-section" style={{ fontSize: 24, padding: "24px 24px 16px" }}>Recent Activity</div>
        <RecentQueriesTable queries={a?.recent_queries ?? []} />
      </div>
    </div>
  );
}