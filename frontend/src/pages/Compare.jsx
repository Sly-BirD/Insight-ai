/**
 * src/pages/Compare.jsx
 * ─────────────────────────────────────────────────────────────
 * Step 8: Functional policy comparison page.
 *
 * Flow:
 *   1. User drops/selects exactly 2 PDFs
 *   2. Clicks "Compare Policies"
 *   3. Frontend POSTs both to /compare as multipart
 *   4. Backend extracts text + LLM produces structured diff
 *   5. Frontend renders categorised diff table + summary
 *
 * Wire into InsightAI.jsx:
 *   import CompareModule from "./pages/Compare.jsx";
 *   const MODULE_MAP = { ..., compare: CompareModule, ... };
 *   // Also remove the inline CompareModule function from InsightAI.jsx
 */

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/clerk-react";

const API_BASE = "http://localhost:8000";

// ─── API call ────────────────────────────────────────────────
async function callCompare(fileA, fileB, getToken) {
  const form = new FormData();
  form.append("files", fileA);
  form.append("files", fileB);
  let authHeader = {};
  try { const t = await getToken?.(); if (t) authHeader = { Authorization: `Bearer ${t}` }; } catch {}
  const res = await fetch(`${API_BASE}/compare`, {
    method: "POST",
    headers: authHeader,
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Category order and colors ────────────────────────────────
const CATEGORY_ORDER = [
  "Coverage",
  "Waiting Periods",
  "Exclusions",
  "Financial Terms",
  "Claims",
  "Network & Renewal",
  "General",
];

const CATEGORY_ICONS = {
  "Coverage":         "◈",
  "Waiting Periods":  "⏱",
  "Exclusions":       "✗",
  "Financial Terms":  "₹",
  "Claims":           "⌖",
  "Network & Renewal":"⟳",
  "General":          "≡",
};

// ─── File drop zone ───────────────────────────────────────────
function FileSlot({ label, file, onFile, dark, disabled }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.name?.toLowerCase().endsWith(".pdf")) onFile(f);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      style={{
        flex: 1, padding: "28px 20px", borderRadius: 14, textAlign: "center",
        border: `2px dashed ${
          dragging ? (dark ? "rgba(148,163,184,0.5)" : "rgba(30,41,59,0.4)")
          : file    ? (dark ? "rgba(34,197,94,0.35)"  : "rgba(34,197,94,0.3)")
          :           (dark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)")
        }`,
        background: dragging
          ? (dark ? "rgba(148,163,184,0.04)" : "rgba(30,41,59,0.02)")
          : file
          ? (dark ? "rgba(34,197,94,0.04)"  : "rgba(34,197,94,0.03)")
          : "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.2s",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <input ref={inputRef} type="file" accept=".pdf" style={{ display: "none" }}
        onChange={e => { const f = e.target.files[0]; if (f) onFile(f); }} />

      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.1em",
        textTransform: "uppercase", color: dark ? "#334155" : "#94a3b8", marginBottom: 10 }}>
        {label}
      </div>

      {file ? (
        <>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 20,
            color: "#22c55e", marginBottom: 8 }}>✓</div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 400,
            color: dark ? "#cbd5e1" : "#1e293b", margin: "0 0 4px",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {file.name}
          </p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10,
            color: dark ? "#334155" : "#94a3b8", margin: 0 }}>
            {(file.size / 1024 / 1024).toFixed(1)} MB · Click to change
          </p>
        </>
      ) : (
        <>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 24,
            color: dark ? "#1e293b" : "#e2e8f0", marginBottom: 10 }}>⬆</div>
          <p style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 15,
            fontStyle: "italic", color: dark ? "#475569" : "#64748b", margin: "0 0 4px" }}>
            {dragging ? "Release to add" : "Drop PDF here"}
          </p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10,
            letterSpacing: "0.06em", color: dark ? "#1e293b" : "#cbd5e1", margin: 0 }}>
            or click to browse
          </p>
        </>
      )}
    </div>
  );
}

// ─── Diff table ───────────────────────────────────────────────
function DiffTable({ rows, docAName, docBName, dark }) {
  // Group rows by category in defined order
  const grouped = {};
  CATEGORY_ORDER.forEach(cat => { grouped[cat] = []; });
  rows.forEach(row => {
    const cat = row.category || "General";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(row);
  });

  const changedCount = rows.filter(r => r.changed).length;

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: "Total fields", value: rows.length },
          { label: "Changed",      value: changedCount, color: "#f59e0b" },
          { label: "Identical",    value: rows.length - changedCount, color: "#22c55e" },
        ].map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 18,
              color: s.color ?? (dark ? "#e2e8f0" : "#0f172a"), letterSpacing: "-0.02em" }}>
              {s.value}
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.08em",
              textTransform: "uppercase", color: dark ? "#334155" : "#94a3b8" }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Category sections */}
      {CATEGORY_ORDER.map(category => {
        const catRows = grouped[category] || [];
        if (!catRows.length) return null;

        return (
          <motion.div key={category}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            style={{ marginBottom: 16 }}
          >
            {/* Category header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14,
                color: dark ? "#334155" : "#94a3b8" }}>
                {CATEGORY_ICONS[category] ?? "·"}
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.1em",
                textTransform: "uppercase", color: dark ? "#475569" : "#64748b" }}>
                {category}
              </span>
              <div style={{ flex: 1, height: 1,
                background: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)" }} />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9,
                color: dark ? "#1e293b" : "#e2e8f0" }}>
                {catRows.filter(r => r.changed).length} change{catRows.filter(r => r.changed).length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Rows */}
            <div style={{ borderRadius: 12, overflow: "hidden",
              border: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)" }}>

              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 1fr",
                padding: "9px 14px", gap: 12,
                background: dark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.025)",
                borderBottom: dark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.05)" }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8,
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  color: dark ? "#1e293b" : "#e2e8f0" }}>Field</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8,
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  color: dark ? "#1e293b" : "#e2e8f0",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={docAName}>
                  A: {docAName.replace(/\.pdf$/i, "").slice(0, 30)}
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8,
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  color: dark ? "#1e293b" : "#e2e8f0",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={docBName}>
                  B: {docBName.replace(/\.pdf$/i, "").slice(0, 30)}
                </span>
              </div>

              {/* Data rows */}
              {catRows.map((row, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "180px 1fr 1fr",
                  padding: "10px 14px", gap: 12, alignItems: "start",
                  background: row.changed
                    ? (dark ? "rgba(245,158,11,0.03)" : "rgba(245,158,11,0.025)")
                    : "transparent",
                  borderBottom: i < catRows.length - 1
                    ? (dark ? "1px solid rgba(255,255,255,0.03)" : "1px solid rgba(0,0,0,0.04)")
                    : "none",
                }}>
                  {/* Field name */}
                  <div>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                      color: dark ? "#64748b" : "#475569", fontWeight: 300 }}>
                      {row.field}
                    </span>
                    {row.changed && (
                      <span style={{ marginLeft: 6, fontSize: 8,
                        color: "#f59e0b" }}>●</span>
                    )}
                    {row.note && (
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10,
                        color: dark ? "#334155" : "#94a3b8", marginTop: 2,
                        fontStyle: "italic", fontWeight: 300 }}>
                        {row.note}
                      </div>
                    )}
                  </div>

                  {/* Value A */}
                  <span style={{
                    fontFamily: "'DM Mono', monospace", fontSize: 11, lineHeight: 1.5,
                    color: row.changed
                      ? (dark ? "#94a3b8" : "#475569")
                      : (dark ? "#475569" : "#94a3b8"),
                    textDecoration: row.changed ? "line-through" : "none",
                    opacity: row.changed ? 0.55 : 1,
                  }}>
                    {row.value_a || "Not specified"}
                  </span>

                  {/* Value B */}
                  <span style={{
                    fontFamily: "'DM Mono', monospace", fontSize: 11, lineHeight: 1.5,
                    color: row.changed ? "#f59e0b" : (dark ? "#475569" : "#94a3b8"),
                    fontWeight: row.changed ? 500 : 400,
                  }}>
                    {row.value_b || "Not specified"}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────
export default function CompareModule({ dark }) {
  const { getToken } = useAuth();
  const [fileA,   setFileA]   = useState(null);
  const [fileB,   setFileB]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState(null);

  const canCompare = fileA && fileB && !loading;

  const handleCompare = async () => {
    if (!canCompare) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const data = await callCompare(fileA, fileB, getToken);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFileA(null);
    setFileB(null);
    setResult(null);
    setError(null);
  };

  const monoSm = {
    fontFamily: "'DM Mono', monospace",
    fontSize: 9, letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: dark ? "#334155" : "#94a3b8",
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 0 80px" }}>

      {/* File drop slots */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <FileSlot label="Policy A" file={fileA} onFile={setFileA} dark={dark} disabled={loading} />
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0,
          fontFamily: "'DM Mono', monospace", fontSize: 18,
          color: dark ? "#1e293b" : "#e2e8f0" }}>⇄</div>
        <FileSlot label="Policy B" file={fileB} onFile={setFileB} dark={dark} disabled={loading} />
      </div>

      {/* Action row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, alignItems: "center" }}>
        <motion.button
          whileHover={{ scale: canCompare ? 1.02 : 1 }}
          whileTap={  { scale: canCompare ? 0.97 : 1 }}
          onClick={handleCompare}
          disabled={!canCompare}
          style={{
            padding: "10px 24px", borderRadius: 10, border: "none",
            background: canCompare
              ? (dark ? "#e2e8f0" : "#0f172a")
              : (dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"),
            color: canCompare
              ? (dark ? "#0f172a" : "#e2e8f0")
              : (dark ? "#334155" : "#94a3b8"),
            fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
            cursor: canCompare ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          {loading ? (
            <>
              <motion.div animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                style={{ width: 12, height: 12, border: "2px solid rgba(148,163,184,0.2)",
                  borderTopColor: dark ? "#334155" : "#94a3b8", borderRadius: "50%" }} />
              Comparing…
            </>
          ) : "Compare Policies →"}
        </motion.button>

        {(result || error) && (
          <button onClick={handleReset}
            style={{ padding: "9px 16px", borderRadius: 9, cursor: "pointer",
              background: "transparent",
              border: dark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)",
              fontFamily: "'DM Sans', sans-serif", fontSize: 12,
              color: dark ? "#475569" : "#64748b" }}>
            Reset
          </button>
        )}

        {!fileA && !fileB && (
          <span style={{ ...monoSm }}>
            Upload two policy PDFs to compare them
          </span>
        )}
        {fileA && !fileB && (
          <span style={{ ...monoSm, color: "#f59e0b" }}>
            Add Policy B to continue
          </span>
        )}
      </div>

      {/* Loading state */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div key="loading"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ textAlign: "center", padding: "48px 0" }}>
            <motion.div animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              style={{ width: 28, height: 28, borderRadius: "50%", display: "inline-block",
                border: `2px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)"}`,
                borderTopColor: dark ? "#94a3b8" : "#475569" }} />
            <p style={{ ...monoSm, marginTop: 16 }}>
              Extracting text → Analysing policies → Building comparison…
            </p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12,
              color: dark ? "#334155" : "#94a3b8", marginTop: 6, fontWeight: 300 }}>
              This takes 20-40 seconds depending on document size.
            </p>
          </motion.div>
        )}

        {/* Error */}
        {error && !loading && (
          <motion.div key="error"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ padding: "16px 20px", borderRadius: 12,
              background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <p style={{ ...monoSm, color: "#ef4444", marginBottom: 4 }}>Comparison failed</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 300,
              color: dark ? "#fca5a5" : "#ef4444", margin: 0, lineHeight: 1.6 }}>
              {error}
            </p>
          </motion.div>
        )}

        {/* Result */}
        {result && !loading && (
          <motion.div key="result"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>

            {/* Header: insurers */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "stretch" }}>
              {[
                { label: "Policy A", name: result.doc_a_name, insurer: result.doc_a_insurer },
                { label: "Policy B", name: result.doc_b_name, insurer: result.doc_b_insurer },
              ].map((doc, i) => (
                <div key={i} style={{ flex: 1, padding: "14px 18px", borderRadius: 12,
                  background: dark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.025)",
                  border: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)" }}>
                  <div style={{ ...monoSm, marginBottom: 6 }}>{doc.label}</div>
                  <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 16,
                    color: dark ? "#e2e8f0" : "#0f172a", letterSpacing: "-0.01em",
                    marginBottom: 2 }}>
                    {doc.insurer}
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10,
                    color: dark ? "#334155" : "#94a3b8",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={doc.name}>
                    {doc.name}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div style={{ padding: "16px 20px", borderRadius: 12, marginBottom: 16,
              background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)",
              border: dark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.05)" }}>
              <p style={{ ...monoSm, marginBottom: 8 }}>Summary</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.7,
                color: dark ? "#94a3b8" : "#475569", margin: "0 0 12px", fontWeight: 300 }}>
                {result.summary}
              </p>
              {result.key_changes?.length > 0 && (
                <>
                  <p style={{ ...monoSm, marginBottom: 6 }}>Key Differences</p>
                  {result.key_changes.map((kc, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                      <span style={{ color: "#f59e0b", flexShrink: 0, fontSize: 10,
                        marginTop: 2 }}>●</span>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                        lineHeight: 1.6, color: dark ? "#64748b" : "#475569", fontWeight: 300 }}>
                        {kc}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 8, color: "#f59e0b" }}>●</span>
                <span style={{ ...monoSm }}>Changed field</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10,
                  textDecoration: "line-through", opacity: 0.5,
                  color: dark ? "#94a3b8" : "#475569" }}>value</span>
                <span style={{ ...monoSm }}>= Policy A (old)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10,
                  color: "#f59e0b" }}>value</span>
                <span style={{ ...monoSm }}>= Policy B (new)</span>
              </div>
            </div>

            {/* Diff table */}
            <DiffTable
              rows={result.rows}
              docAName={result.doc_a_name}
              docBName={result.doc_b_name}
              dark={dark}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}