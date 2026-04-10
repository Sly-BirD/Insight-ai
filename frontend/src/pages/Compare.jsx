/**
 * src/pages/Compare.jsx
 * ─────────────────────────────────────────────────────────────
 * Step 8: Functional policy comparison page.
 *
 * Updated for the SaaS architecture using theme.css classes.
 */

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/clerk-react";
import { compareFiles } from "../services/api.js";

// ─── Category order and icons ────────────────────────────────
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
function FileSlot({ label, file, onFile, disabled }) {
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
        flex: 1, padding: "32px 24px", borderRadius: "var(--radius-lg)", textAlign: "center",
        border: `2px dashed ${
          dragging ? "var(--color-border-strong)"
          : file ? "var(--color-success)"
          : "var(--color-border)"
        }`,
        background: dragging ? "var(--color-bg-subtle)" : file ? "rgba(34,197,94,0.05)" : "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all var(--transition-fast)",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <input ref={inputRef} type="file" accept=".pdf" style={{ display: "none" }}
        onChange={e => { const f = e.target.files[0]; if (f) onFile(f); }} />

      <div className="text-small" style={{ marginBottom: 12, fontWeight: 500 }}>{label}</div>

      {file ? (
        <>
          <div style={{ fontSize: 24, color: "var(--color-success)", marginBottom: 8 }}>✓</div>
          <div className="heading-section" style={{ fontSize: 18, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {file.name}
          </div>
          <div className="text-small">
            {(file.size / 1024 / 1024).toFixed(1)} MB · Click to change
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 28, color: "var(--color-text-muted)", marginBottom: 8 }}>⬆</div>
          <div className="heading-section" style={{ fontSize: 18, marginBottom: 4 }}>
            {dragging ? "Release to add" : "Drop PDF here"}
          </div>
          <div className="text-small">or click to browse</div>
        </>
      )}
    </div>
  );
}

// ─── Diff table ───────────────────────────────────────────────
function DiffTable({ rows, docAName, docBName }) {
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
      <div style={{ display: "flex", gap: 24, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total fields", value: rows.length, color: "var(--color-text-primary)" },
          { label: "Changed",      value: changedCount, color: "var(--color-warning)" },
          { label: "Identical",    value: rows.length - changedCount, color: "var(--color-success)" },
        ].map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span className="heading-display" style={{ fontSize: 28, color: s.color }}>{s.value}</span>
            <span className="text-small">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Category sections */}
      {CATEGORY_ORDER.map(category => {
        const catRows = grouped[category] || [];
        if (!catRows.length) return null;

        return (
          <motion.div key={category} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ marginBottom: 32 }}>
            {/* Category header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 18, color: "var(--color-text-muted)" }}>{CATEGORY_ICONS[category] ?? "·"}</span>
              <span className="heading-section" style={{ fontSize: 20 }}>{category}</span>
              <div style={{ flex: 1, height: 1, background: "var(--color-border-subtle)" }} />
              <span className="text-small">{catRows.filter(r => r.changed).length} changes</span>
            </div>

            {/* Rows */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "16px", gap: 16, background: "var(--color-bg-subtle)", borderBottom: "1px solid var(--color-border-strong)" }}>
                <span className="text-small" style={{ fontWeight: 500 }}>Field</span>
                <span className="text-small" style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={docAName}>A: {docAName.replace(/\.pdf$/i, "")}</span>
                <span className="text-small" style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={docBName}>B: {docBName.replace(/\.pdf$/i, "")}</span>
              </div>

              {/* Data rows */}
              {catRows.map((row, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "16px", gap: 16, alignItems: "start", background: row.changed ? "rgba(245,158,11,0.05)" : "transparent", borderBottom: i < catRows.length - 1 ? "1px solid var(--color-border-subtle)" : "none" }}>
                  {/* Field name */}
                  <div>
                    <span className="text-body" style={{ fontWeight: row.changed ? 500 : 300, color: row.changed ? "var(--color-text-primary)" : "var(--color-text-body)" }}>
                      {row.field}
                    </span>
                    {row.changed && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--color-warning)" }}>●</span>}
                    {row.note && <div className="text-small" style={{ marginTop: 4, fontStyle: "italic" }}>{row.note}</div>}
                  </div>

                  {/* Value A */}
                  <span className="text-body" style={{ textDecoration: row.changed ? "line-through" : "none", opacity: row.changed ? 0.6 : 1 }}>
                    {row.value_a || "Not specified"}
                  </span>

                  {/* Value B */}
                  <span className="text-body" style={{ color: row.changed ? "var(--color-warning)" : "var(--color-text-body)", fontWeight: row.changed ? 500 : 300 }}>
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
export default function CompareModule() {
  const { getToken } = useAuth();
  const [fileA,   setFileA]   = useState(null);
  const [fileB,   setFileB]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState(null);

  const canCompare = fileA && fileB && !loading;

  const handleCompare = async () => {
    if (!canCompare) return;
    setLoading(true); setResult(null); setError(null);
    try {
      const data = await compareFiles(fileA, fileB, getToken);
      setResult(data);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const handleReset = () => {
    setFileA(null); setFileB(null); setResult(null); setError(null);
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 0 100px" }}>

      {/* File drop slots */}
      <div style={{ display: "flex", gap: 24, marginBottom: 24 }}>
        <FileSlot label="Policy A" file={fileA} onFile={setFileA} disabled={loading} />
        <div style={{ display: "flex", alignItems: "center", fontSize: 32, color: "var(--color-text-muted)" }}>⇄</div>
        <FileSlot label="Policy B" file={fileB} onFile={setFileB} disabled={loading} />
      </div>

      {/* Action row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 40, alignItems: "center" }}>
        <button className="btn btn-primary" onClick={handleCompare} disabled={!canCompare}>
          {loading ? "Comparing…" : "Compare Policies →"}
        </button>

        {(result || error) && (
          <button className="btn btn-ghost" onClick={handleReset}>Reset</button>
        )}

        {!fileA && !fileB && <span className="text-small">Upload two policy PDFs to compare them</span>}
        {fileA && !fileB && <span className="text-small" style={{ color: "var(--color-warning)" }}>Add Policy B to continue</span>}
      </div>

      {/* Loading state */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ textAlign: "center", padding: "64px 0" }}>
            <div className="heading-section" style={{ fontSize: 24, marginBottom: 8 }}>Comparing documents...</div>
            <div className="text-body">Extracting text → Analysing policies → Building comparison matrix</div>
            <div className="text-small" style={{ marginTop: 16 }}>This takes 20-40 seconds depending on document size.</div>
          </motion.div>
        )}

        {/* Error */}
        {error && !loading && (
          <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card" style={{ borderColor: "var(--color-error)" }}>
            <div className="heading-section" style={{ fontSize: 20, color: "var(--color-error)", marginBottom: 8 }}>Comparison failed</div>
            <div className="text-body" style={{ margin: 0 }}>{error}</div>
          </motion.div>
        )}

        {/* Result */}
        {result && !loading && (
          <motion.div key="result" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
            {/* Header: insurers */}
            <div style={{ display: "flex", gap: 24, marginBottom: 32, alignItems: "stretch" }}>
              {[
                { label: "Policy A", name: result.doc_a_name, insurer: result.doc_a_insurer },
                { label: "Policy B", name: result.doc_b_name, insurer: result.doc_b_insurer },
              ].map((doc, i) => (
                <div key={i} className="card" style={{ flex: 1 }}>
                  <div className="text-small" style={{ marginBottom: 8 }}>{doc.label}</div>
                  <div className="heading-display" style={{ fontSize: 28, marginBottom: 4 }}>{doc.insurer}</div>
                  <div className="text-body" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={doc.name}>{doc.name}</div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="card-elevated" style={{ marginBottom: 32 }}>
              <div className="heading-section" style={{ fontSize: 20, marginBottom: 12 }}>Summary</div>
              <div className="text-body" style={{ fontSize: 16, marginBottom: 24 }}>{result.summary}</div>
              {result.key_changes?.length > 0 && (
                <>
                  <div className="text-small" style={{ marginBottom: 12 }}>Key Differences</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {result.key_changes.map((kc, i) => (
                      <div key={i} style={{ display: "flex", gap: 12, alignItems: "start" }}>
                        <span style={{ color: "var(--color-warning)", flexShrink: 0, fontSize: 14, marginTop: 4 }}>●</span>
                        <span className="text-body" style={{ margin: 0 }}>{kc}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 24, marginBottom: 24, flexWrap: "wrap", padding: "16px", background: "var(--color-bg-subtle)", borderRadius: "var(--radius-md)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--color-warning)" }}>●</span>
                <span className="text-body">Changed field</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="text-body" style={{ textDecoration: "line-through", opacity: 0.6 }}>value</span>
                <span className="text-body">= Policy A (old)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="text-body" style={{ color: "var(--color-warning)" }}>value</span>
                <span className="text-body">= Policy B (new)</span>
              </div>
            </div>

            {/* Diff table */}
            <DiffTable rows={result.rows} docAName={result.doc_a_name} docBName={result.doc_b_name} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}