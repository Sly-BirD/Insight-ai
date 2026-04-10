/**
 * src/pages/Workspace.jsx
 * ─────────────────────────────────────────────────────────────
 * Combined Upload + Query workspace.
 *
 * Step 4: Upload state (fileList, progress, result) is stored in
 *   AppContext so it survives page switches — no more lost progress.
 *
 * Step 5: QueryPanel reads `hasDocuments` from AppContext.
 *   If false/null it shows a friendly prompt instead of querying.
 *   The backend also guards at /query (HTTP 400 if index empty).
 */

import { useState, useRef, useCallback, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/clerk-react";
import { AppContext } from "../context/AppContext.jsx";
import { ingestFiles, runQuery } from "../services/api.js";

// ─── Decision meta ────────────────────────────────────────────
const DECISION_META = {
  approve:       { label: "Approved",      icon: "✓", color: "#22c55e", bg: "rgba(34,197,94,0.06)",   border: "rgba(34,197,94,0.2)"   },
  reject:        { label: "Rejected",      icon: "✗", color: "#ef4444", bg: "rgba(239,68,68,0.06)",   border: "rgba(239,68,68,0.2)"   },
  partial:       { label: "Partial",       icon: "◑", color: "#f59e0b", bg: "rgba(245,158,11,0.06)",  border: "rgba(245,158,11,0.2)"  },
  informational: { label: "Informational", icon: "ℹ", color: "#94a3b8", bg: "rgba(148,163,184,0.06)", border: "rgba(148,163,184,0.2)" },
};
const dm = (d) => DECISION_META[(d ?? "").toLowerCase()] ?? DECISION_META.informational;

// ─── Toast ────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState(null);
  const show = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };
  const Toast = () => (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.msg}
          initial={{ opacity: 0, y: 16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0,  scale: 1    }}
          exit={   { opacity: 0, y: 16, scale: 0.95 }}
          onClick={() => setToast(null)}
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 9999,
            maxWidth: 360, padding: "13px 18px", borderRadius: 12, cursor: "pointer",
            background: toast.type === "error" ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.10)",
            border: `1px solid ${toast.type === "error" ? "rgba(239,68,68,0.25)" : "rgba(34,197,94,0.25)"}`,
            backdropFilter: "blur(12px)",
            display: "flex", alignItems: "center", gap: 10,
          }}
        >
          <span style={{ fontSize: 14, color: toast.type === "error" ? "#ef4444" : "#22c55e" }}>
            {toast.type === "error" ? "✗" : "✓"}
          </span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 300, lineHeight: 1.5,
            color: toast.type === "error" ? "#fca5a5" : "#86efac" }}>
            {toast.msg}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
  return { show, Toast };
}

// ─── Example queries ──────────────────────────────────────────
const EXAMPLES = [
  "What is the waiting period for pre-existing diseases in HDFC Easy Health?",
  "What are the major exclusions under HDFC Life Cardiac Care?",
  "Is cancer treatment covered under HDFC Life Cancer Care plan?",
  "What is the co-payment clause in SBI General Health Insurance?",
];

// ─── UPLOAD PANEL ─────────────────────────────────────────────
// Step 4: reads/writes upload state from AppContext, not local state.
// This means switching pages and coming back preserves all progress.
function UploadPanel({ dark }) {
  const { getToken } = useAuth();
  const {
    uploadFiles,    setUploadFiles,
    uploadResult,
    isUploading,    setIsUploading,
    onIngestSuccess,
  } = useContext(AppContext);

  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const { show, Toast } = useToast();

  // Add new files — dedup by name against already-queued files
  const addFiles = useCallback((incoming) => {
    const pdfs = Array.from(incoming).filter(f => f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) { show("Only PDF files are accepted.", "error"); return; }
    setUploadFiles(prev => {
      const existing = new Set(prev.map(e => e.name));
      const fresh = pdfs
        .filter(f => !existing.has(f.name))
        .map(f => ({
          file: f, name: f.name,
          size: f.size < 1024 * 1024
            ? `${(f.size / 1024).toFixed(0)} KB`
            : `${(f.size / 1024 / 1024).toFixed(1)} MB`,
          progress: 0, status: "pending",
        }));
      if (!fresh.length) { show("File(s) already queued.", "error"); }
      return [...prev, ...fresh];
    });
  }, [setUploadFiles, show]);

  const handleIngest = async () => {
    const pending = uploadFiles.filter(f => f.status === "pending");
    if (!pending.length || isUploading) return;

    setIsUploading(true);

    // Mark pending → uploading
    setUploadFiles(prev =>
      prev.map(f => f.status === "pending" ? { ...f, status: "uploading", progress: 0 } : f)
    );

    // Fake progress animation while waiting for API
    const interval = setInterval(() => {
      setUploadFiles(prev =>
        prev.map(f => f.status === "uploading"
          ? { ...f, progress: Math.min(f.progress + 7, 88) }
          : f)
      );
    }, 300);

    try {
      const result = await ingestFiles(pending.map(f => f.file), getToken);
      clearInterval(interval);

      // Mark done / error per file
      setUploadFiles(prev =>
        prev.map(f => f.status === "uploading"
          ? {
              ...f, progress: 100,
              status: result.errors?.some(e => e.includes(f.name)) ? "error" : "done",
            }
          : f)
      );

      onIngestSuccess(result); // updates context + re-checks /status
      show(`Ingested ${result.processed} file(s) → ${result.nodes_created ?? "?"} nodes`, "success");

    } catch (err) {
      clearInterval(interval);
      setUploadFiles(prev =>
        prev.map(f => f.status === "uploading" ? { ...f, status: "error", progress: 0 } : f)
      );
      show(err.message, "error");
    } finally {
      setIsUploading(false);
    }
  };

  const statusColor = (status) => ({
    pending: dark ? "#334155" : "#94a3b8",
    uploading: dark ? "#94a3b8" : "#475569",
    done: "#22c55e", error: "#ef4444",
  }[status] ?? "#94a3b8");

  const hasPending = uploadFiles.some(f => f.status === "pending");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Toast />

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging
            ? (dark ? "rgba(148,163,184,0.45)" : "rgba(30,41,59,0.35)")
            : (dark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)")}`,
          borderRadius: 14, padding: "28px 16px", textAlign: "center",
          background: dragging ? (dark ? "rgba(148,163,184,0.04)" : "rgba(30,41,59,0.02)") : "transparent",
          cursor: isUploading ? "not-allowed" : "pointer",
          transition: "all 0.2s", opacity: isUploading ? 0.6 : 1,
        }}
      >
        <input ref={fileInputRef} type="file" accept=".pdf" multiple
          style={{ display: "none" }} onChange={e => addFiles(e.target.files)} />
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 22,
          color: dark ? "#1e293b" : "#e2e8f0", marginBottom: 10 }}>⬆</div>
        <p style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 15,
          fontStyle: "italic", color: dark ? "#475569" : "#64748b", margin: "0 0 4px" }}>
          {dragging ? "Release to add" : "Drop PDFs here"}
        </p>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10,
          letterSpacing: "0.06em", color: dark ? "#1e293b" : "#cbd5e1" }}>
          PDF only · Click to browse
        </p>
      </div>

      {/* File list — persists because it's in context */}
      <AnimatePresence initial={false}>
        {uploadFiles.map(f => (
          <motion.div key={f.name}
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <div style={{
              padding: "10px 14px", borderRadius: 10,
              background: dark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.025)",
              border: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                  color: dark ? "#cbd5e1" : "#1e293b",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {f.name}
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10,
                  color: statusColor(f.status), flexShrink: 0 }}>
                  {f.status === "done" ? "✓ done"
                    : f.status === "error" ? "✗ error"
                    : f.status === "uploading" ? `${f.progress}%`
                    : f.size}
                </span>
              </div>
              <div style={{ height: 2, borderRadius: 2,
                background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                <motion.div animate={{ width: `${f.progress}%` }} transition={{ duration: 0.4 }}
                  style={{ height: "100%", borderRadius: 2, background: statusColor(f.status) }} />
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Action row */}
      {uploadFiles.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!isUploading && (
            <button
              onClick={() => { setUploadFiles([]); }}
              style={{
                padding: "8px 14px", borderRadius: 8, background: "transparent",
                border: dark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)",
                fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                color: dark ? "#475569" : "#64748b", cursor: "pointer",
              }}>
              Clear
            </button>
          )}
          <motion.button
            whileHover={{ scale: isUploading || !hasPending ? 1 : 1.02 }}
            whileTap={  { scale: isUploading || !hasPending ? 1 : 0.97 }}
            onClick={handleIngest}
            disabled={isUploading || !hasPending}
            style={{
              flex: 1, padding: "9px 16px", borderRadius: 8, border: "none",
              background: isUploading || !hasPending
                ? (dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)")
                : (dark ? "#e2e8f0" : "#0f172a"),
              color: isUploading || !hasPending
                ? (dark ? "#334155" : "#94a3b8")
                : (dark ? "#0f172a" : "#e2e8f0"),
              fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
              cursor: isUploading || !hasPending ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
            {isUploading ? (
              <>
                <motion.div animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                  style={{ width: 11, height: 11, border: "2px solid rgba(148,163,184,0.2)",
                    borderTopColor: dark ? "#334155" : "#94a3b8", borderRadius: "50%" }} />
                Ingesting…
              </>
            ) : "Ingest →"}
          </motion.button>
        </div>
      )}

      {/* Success result — also persists via context */}
      <AnimatePresence>
        {uploadResult && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ padding: "12px 16px", borderRadius: 10,
              background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.18)" }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "#22c55e", margin: "0 0 8px" }}>
              Ingestion complete
            </p>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {[
                ["Files",  uploadResult.processed],
                ["Nodes",  uploadResult.nodes_created ?? "—"],
                ["Time",   uploadResult.duration_seconds ? `${uploadResult.duration_seconds}s` : "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.08em",
                    textTransform: "uppercase", color: dark ? "#334155" : "#94a3b8", marginBottom: 2 }}>{k}</div>
                  <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 20,
                    color: dark ? "#e2e8f0" : "#0f172a", letterSpacing: "-0.02em", lineHeight: 1 }}>{v}</div>
                </div>
              ))}
            </div>
            {uploadResult.errors?.length > 0 && (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                color: "#f59e0b", margin: "8px 0 0", fontWeight: 300 }}>
                ⚠ {uploadResult.errors.join(", ")}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── QUERY PANEL ──────────────────────────────────────────────
// Step 5: reads `hasDocuments` and `documentCount` from context.
// Shows a clear prompt if no docs are indexed instead of querying.
function QueryPanel({ dark }) {
  const { getToken } = useAuth();
  const { hasDocuments, documentCount, addQuery } = useContext(AppContext);

  const [question, setQuestion] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);
  const { show, Toast } = useToast();
  const textareaRef = useRef(null);

  const handleSubmit = async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const data = await runQuery(question, getToken);
      setResult(data);
      addQuery?.(question, data);
      show("Query complete", "success");
    } catch (err) {
      // Surface backend 400 "no documents" error cleanly
      setError(err.message);
      show(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const meta      = dm(result?.answer?.decision);
  const auditScore = result?.audit?.score ?? null;

  // ── No documents state ────────────────────────────────────
  // hasDocuments=false means we KNOW the index is empty.
  // hasDocuments=null means we're still checking — show a neutral prompt.
  const indexEmpty = hasDocuments === false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Toast />

      {/* Step 5: Empty index notice — shown prominently but non-blocking */}
      <AnimatePresence>
        {indexEmpty && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              padding: "14px 18px", borderRadius: 12,
              background: dark ? "rgba(245,158,11,0.06)" : "rgba(245,158,11,0.04)",
              border: "1px solid rgba(245,158,11,0.2)",
              display: "flex", alignItems: "flex-start", gap: 10,
            }}
          >
            <span style={{ fontSize: 16, marginTop: 1 }}>⬆</span>
            <div>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.08em",
                textTransform: "uppercase", color: "#f59e0b", margin: "0 0 4px" }}>
                No documents indexed
              </p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 300,
                color: dark ? "#64748b" : "#94a3b8", margin: 0, lineHeight: 1.6 }}>
                Upload at least one PDF using the panel on the left before querying.
                The query engine needs indexed policy documents to answer from.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Index status pill — shows node count when docs are loaded */}
      {hasDocuments && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.08em",
            textTransform: "uppercase", color: dark ? "#334155" : "#94a3b8" }}>
            {documentCount.toLocaleString()} nodes indexed — ready to query
          </span>
        </div>
      )}

      {/* Textarea */}
      <div>
        <textarea
          ref={textareaRef}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSubmit(); }}
          disabled={loading}
          rows={3}
          placeholder={
            indexEmpty
              ? "Upload documents first, then ask your question here…"
              : "Ask anything about a policy… (⌘ Enter to submit)"
          }
          style={{
            width: "100%", padding: "14px 16px", borderRadius: 12, resize: "vertical",
            background: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)",
            border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)",
            fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 300, lineHeight: 1.6,
            color: dark ? "#e2e8f0" : "#0f172a", outline: "none",
            boxSizing: "border-box", opacity: loading ? 0.6 : 1, transition: "border-color 0.2s",
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <motion.button
            whileHover={{ scale: loading || !question.trim() ? 1 : 1.02 }}
            whileTap={  { scale: loading || !question.trim() ? 1 : 0.97 }}
            onClick={handleSubmit}
            disabled={loading || !question.trim()}
            style={{
              padding: "9px 22px", borderRadius: 9, border: "none",
              background: loading || !question.trim()
                ? (dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)")
                : (dark ? "#e2e8f0" : "#0f172a"),
              color: loading || !question.trim()
                ? (dark ? "#334155" : "#94a3b8")
                : (dark ? "#0f172a" : "#e2e8f0"),
              fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
              cursor: loading || !question.trim() ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}>
            {loading ? (
              <>
                <motion.div animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                  style={{ width: 11, height: 11, border: "2px solid rgba(148,163,184,0.2)",
                    borderTopColor: dark ? "#334155" : "#94a3b8", borderRadius: "50%" }} />
                Analysing…
              </>
            ) : "Run Query →"}
          </motion.button>
        </div>
      </div>

      {/* Example queries */}
      {!result && !loading && !error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.1em",
            textTransform: "uppercase", color: dark ? "#334155" : "#94a3b8", marginBottom: 8 }}>
            Example queries
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {EXAMPLES.map(q => (
              <button key={q} onClick={() => { setQuestion(q); textareaRef.current?.focus(); }}
                style={{
                  textAlign: "left", padding: "9px 13px", borderRadius: 8,
                  background: "transparent",
                  border: dark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.06)",
                  fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 300,
                  color: dark ? "#475569" : "#64748b", cursor: "pointer", lineHeight: 1.5,
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={e => {
                  e.target.style.color = dark ? "#94a3b8" : "#475569";
                  e.target.style.borderColor = dark ? "rgba(148,163,184,0.18)" : "rgba(30,41,59,0.18)";
                }}
                onMouseLeave={e => {
                  e.target.style.color = dark ? "#475569" : "#64748b";
                  e.target.style.borderColor = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
                }}>
                {q}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Loading */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ textAlign: "center", padding: "32px 0" }}>
            <motion.div animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              style={{ width: 24, height: 24, borderRadius: "50%", display: "inline-block",
                border: `2px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)"}`,
                borderTopColor: dark ? "#94a3b8" : "#475569" }} />
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10,
              color: dark ? "#334155" : "#94a3b8", marginTop: 12, letterSpacing: "0.06em" }}>
              Retrieving → Grading → Generating → Auditing…
            </p>
          </motion.div>
        )}

        {/* Error */}
        {error && !loading && (
          <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ padding: "14px 18px", borderRadius: 12,
              background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "#ef4444", margin: "0 0 4px" }}>Error</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 300,
              color: dark ? "#fca5a5" : "#ef4444", margin: 0, lineHeight: 1.6 }}>{error}</p>
          </motion.div>
        )}

        {/* Result */}
        {result && !loading && (
          <motion.div key="result" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Decision card */}
            <div style={{ padding: "18px 22px", borderRadius: 14,
              background: meta.bg, border: `1px solid ${meta.border}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 10, gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: meta.bg,
                    border: `1px solid ${meta.border}`, display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 14, color: meta.color }}>{meta.icon}</div>
                  <span style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 17,
                    fontStyle: "italic", color: meta.color, letterSpacing: "-0.01em" }}>{meta.label}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10,
                    color: dark ? "#475569" : "#94a3b8" }}>{result.answer?.confidence}% confidence</span>
                  {auditScore !== null && (
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9,
                      color: auditScore >= 85 ? "#22c55e" : auditScore >= 70 ? "#f59e0b" : "#ef4444" }}>
                      Audit {auditScore}/100
                    </span>
                  )}
                </div>
              </div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.7,
                color: dark ? "#94a3b8" : "#475569", margin: 0, fontWeight: 300 }}>
                {result.answer?.justification}
              </p>
            </div>

            {/* Clauses */}
            {result.answer?.clauses?.length > 0 && (
              <div>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.08em",
                  textTransform: "uppercase", color: dark ? "#334155" : "#94a3b8", margin: "0 0 7px" }}>
                  Supporting Clauses
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {result.answer.clauses.map((c, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      style={{ display: "flex", gap: 10, padding: "10px 14px", borderRadius: 9,
                        background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                        border: dark ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(0,0,0,0.04)" }}>
                      <span style={{ color: dark ? "#334155" : "#cbd5e1", flexShrink: 0,
                        fontSize: 10, marginTop: 1 }}>▸</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10,
                        lineHeight: 1.65, color: dark ? "#475569" : "#64748b" }}>{c}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Audit flags */}
            {result.audit?.flags?.length > 0 && (
              <div style={{ padding: "11px 14px", borderRadius: 10,
                background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.15)" }}>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.08em",
                  textTransform: "uppercase", color: "#f59e0b", margin: "0 0 6px" }}>Audit Flags</p>
                {result.audit.flags.map((flag, i) => (
                  <p key={i} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                    color: dark ? "#64748b" : "#94a3b8", fontWeight: 300, lineHeight: 1.6,
                    margin: i < result.audit.flags.length - 1 ? "0 0 3px" : 0 }}>⚠ {flag}</p>
                ))}
              </div>
            )}

            {/* Low audit warning */}
            {auditScore !== null && auditScore < 85 && (
              <div style={{ padding: "10px 14px", borderRadius: 9,
                background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)" }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 300,
                  color: dark ? "#fca5a5" : "#ef4444", margin: 0, lineHeight: 1.6 }}>
                  ⚠ Answer scored {auditScore}/100 on faithfulness. Verify against the original policy before acting on this.
                </p>
              </div>
            )}

            {/* Retrieval metadata */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {[
                ["Chunks",   result.retrieval_info?.chunks_used],
                ["Rewrites", result.retrieval_info?.rewrites_done],
                ["Audit",    `${result.audit?.score ?? "—"}/100`],
              ].map(([k, v]) => (
                <span key={k} style={{ fontFamily: "'DM Mono', monospace", fontSize: 9,
                  color: dark ? "#1e293b" : "#e2e8f0", letterSpacing: "0.04em" }}>
                  {k}: <span style={{ color: dark ? "#334155" : "#94a3b8" }}>{v}</span>
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── WORKSPACE ────────────────────────────────────────────────
export default function WorkspaceModule({ dark }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 5fr) minmax(0, 8fr)",
      gap: 20,
      maxWidth: 1100,
      margin: "0 auto",
      padding: "0 0 80px",
      alignItems: "start",
    }}>

      {/* Left: Upload (state lives in context — survives navigation) */}
      <div style={{
        padding: "20px", borderRadius: 16,
        background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)",
        border: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)",
        position: "sticky", top: 76,
      }}>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.1em",
          textTransform: "uppercase", color: dark ? "#334155" : "#94a3b8", marginBottom: 14 }}>
          Documents
        </p>
        <UploadPanel dark={dark} />
      </div>

      {/* Right: Query (reads hasDocuments from context) */}
      <div style={{
        padding: "20px", borderRadius: 16,
        background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)",
        border: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)",
      }}>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.1em",
          textTransform: "uppercase", color: dark ? "#334155" : "#94a3b8", marginBottom: 14 }}>
          Query
        </p>
        <QueryPanel dark={dark} />
      </div>
    </div>
  );
}