/**
 * src/pages/Workspace.jsx
 * ─────────────────────────────────────────────────────────────
 * Combined Upload + Query workspace.
 *
 * Updated for the SaaS architecture using theme.css classes.
 */

import { useState, useRef, useCallback, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/clerk-react";
import { AppContext } from "../context/AppContext.jsx";
import { ingestFiles, runQuery } from "../services/api.js";

// ─── Decision meta ────────────────────────────────────────────
const DECISION_META = {
  approve:       { label: "Approved",      icon: "✓", color: "var(--color-success)" },
  reject:        { label: "Rejected",      icon: "✗", color: "var(--color-error)" },
  partial:       { label: "Partial",       icon: "◑", color: "var(--color-warning)" },
  informational: { label: "Informational", icon: "ℹ", color: "var(--color-info)" },
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
          className="card"
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 9999,
            cursor: "pointer",
            border: `1px solid ${toast.type === "error" ? "var(--color-error)" : "var(--color-success)"}`,
            display: "flex", alignItems: "center", gap: 10,
          }}
        >
          <span style={{ fontSize: 16, color: toast.type === "error" ? "var(--color-error)" : "var(--color-success)" }}>
            {toast.type === "error" ? "✗" : "✓"}
          </span>
          <span className="text-body" style={{ margin: 0 }}>
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
  "What is the waiting period for pre-existing diseases?",
  "What are the major exclusions under Cardiac Care?",
  "Is cancer treatment covered?",
  "What is the co-payment clause?",
];

// ─── UPLOAD PANEL ─────────────────────────────────────────────
function UploadPanel() {
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

    setUploadFiles(prev =>
      prev.map(f => f.status === "pending" ? { ...f, status: "uploading", progress: 0 } : f)
    );

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

      setUploadFiles(prev =>
        prev.map(f => f.status === "uploading"
          ? {
              ...f, progress: 100,
              status: result.errors?.some(e => e.includes(f.name)) ? "error" : "done",
            }
          : f)
      );

      onIngestSuccess(result);
      show(`Ingested ${result.processed} file(s)`, "success");

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

  const hasPending = uploadFiles.some(f => f.status === "pending");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Toast />

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "var(--color-border-strong)" : "var(--color-border)"}`,
          borderRadius: "var(--radius-lg)",
          padding: "32px 16px",
          textAlign: "center",
          background: dragging ? "var(--color-bg-subtle)" : "transparent",
          cursor: isUploading ? "not-allowed" : "pointer",
          transition: "all var(--transition-fast)",
          opacity: isUploading ? 0.6 : 1,
        }}
      >
        <input ref={fileInputRef} type="file" accept=".pdf" multiple style={{ display: "none" }} onChange={e => addFiles(e.target.files)} />
        <div style={{ fontSize: 24, color: "var(--color-text-muted)", marginBottom: 8 }}>⬆</div>
        <div className="heading-section" style={{ fontSize: 20, marginBottom: 4 }}>
          {dragging ? "Release to add" : "Drop PDFs here"}
        </div>
        <div className="text-small">
          PDF only · Click to browse
        </div>
      </div>

      {/* File list */}
      <AnimatePresence initial={false}>
        {uploadFiles.map(f => (
          <motion.div key={f.name}
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <div className="card-subtle">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
                <span className="text-body" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, color: "var(--color-text-primary)" }}>
                  {f.name}
                </span>
                <span className="text-small" style={{ flexShrink: 0, color: f.status === "error" ? "var(--color-error)" : f.status === "done" ? "var(--color-success)" : "var(--color-text-muted)" }}>
                  {f.status === "done" ? "✓ Done" : f.status === "error" ? "✗ Error" : f.status === "uploading" ? `${f.progress}%` : f.size}
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: "var(--color-border-subtle)", overflow: "hidden" }}>
                <motion.div animate={{ width: `${f.progress}%` }} transition={{ duration: 0.4 }}
                  style={{ height: "100%", borderRadius: 2, background: f.status === "error" ? "var(--color-error)" : f.status === "done" ? "var(--color-success)" : "var(--color-text-muted)" }} />
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Action row */}
      {uploadFiles.length > 0 && (
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {!isUploading && (
            <button className="btn btn-ghost" onClick={() => setUploadFiles([])}>
              Clear
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleIngest}
            disabled={isUploading || !hasPending}
            style={{ flex: 1, justifyContent: "center" }}
          >
            {isUploading ? "Ingesting…" : "Ingest →"}
          </button>
        </div>
      )}

      {/* Success result */}
      <AnimatePresence>
        {uploadResult && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="card" style={{ borderColor: "var(--color-success)" }}>
            <div className="heading-section" style={{ fontSize: 20, color: "var(--color-success)", marginBottom: 12 }}>
              Ingestion complete
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 8 }}>
              <div>
                <div className="text-small">Files</div>
                <div className="heading-display" style={{ fontSize: 24 }}>{uploadResult.processed}</div>
              </div>
              <div>
                <div className="text-small">Nodes</div>
                <div className="heading-display" style={{ fontSize: 24 }}>{uploadResult.nodes_created ?? "—"}</div>
              </div>
            </div>
            {uploadResult.errors?.length > 0 && (
              <div className="text-small" style={{ color: "var(--color-warning)" }}>
                ⚠ {uploadResult.errors.join(", ")}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── QUERY PANEL ──────────────────────────────────────────────
function QueryPanel() {
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
      setError(err.message);
      show(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const meta      = dm(result?.answer?.decision);
  const auditScore = result?.audit?.score ?? null;
  const indexEmpty = hasDocuments === false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Toast />

      {/* Empty index notice */}
      <AnimatePresence>
        {indexEmpty && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="card-subtle" style={{ borderColor: "var(--color-warning)" }}>
            <div className="heading-section" style={{ fontSize: 18, color: "var(--color-warning)", marginBottom: 4 }}>
              No documents indexed
            </div>
            <div className="text-body" style={{ margin: 0 }}>
              Upload at least one PDF using the panel on the left before querying.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Index status */}
      {hasDocuments && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-success)" }} />
          <span className="text-small">
            {documentCount.toLocaleString()} nodes indexed — ready to query
          </span>
        </div>
      )}

      {/* Textarea */}
      <div className="card" style={{ padding: "8px" }}>
        <textarea
          ref={textareaRef}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSubmit(); }}
          disabled={loading}
          rows={3}
          placeholder={indexEmpty ? "Upload documents first…" : "Ask anything about a policy… (⌘ Enter)"}
          style={{
            width: "100%", padding: "12px", border: "none", resize: "vertical",
            background: "transparent", color: "var(--color-text-primary)",
            fontFamily: "var(--font-sans)", fontSize: 16, outline: "none",
            opacity: loading ? 0.6 : 1,
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px" }}>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading || !question.trim()}
          >
            {loading ? "Analysing…" : "Run Query →"}
          </button>
        </div>
      </div>

      {/* Example queries */}
      {!result && !loading && !error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
          <div className="text-small" style={{ marginBottom: 12 }}>Suggested Questions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {EXAMPLES.map(q => (
              <button key={q} onClick={() => { setQuestion(q); textareaRef.current?.focus(); }}
                className="card-subtle"
                style={{ textAlign: "left", cursor: "pointer", transition: "all var(--transition-fast)", border: "1px solid var(--color-border-subtle)" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-border-strong)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border-subtle)"}>
                <span className="text-body" style={{ margin: 0, pointerEvents: "none" }}>{q}</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Loading */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ textAlign: "center", padding: "40px 0" }}>
            <div className="text-body">Analysing policy structure & retrieving nodes...</div>
          </motion.div>
        )}

        {/* Error */}
        {error && !loading && (
          <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card" style={{ borderColor: "var(--color-error)" }}>
            <div className="heading-section" style={{ fontSize: 20, color: "var(--color-error)", marginBottom: 8 }}>Error</div>
            <div className="text-body" style={{ margin: 0 }}>{error}</div>
          </motion.div>
        )}

        {/* Result */}
        {result && !loading && (
          <motion.div key="result" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Decision card */}
            <div className="card-elevated" style={{ borderColor: meta.color }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 24, color: meta.color }}>{meta.icon}</div>
                  <div className="heading-section" style={{ fontSize: 24, color: meta.color }}>{meta.label}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="text-small">{result.answer?.confidence}% confidence</div>
                  {auditScore !== null && (
                    <div className="text-small" style={{ color: auditScore >= 85 ? "var(--color-success)" : "var(--color-warning)" }}>
                      Audit Score: {auditScore}/100
                    </div>
                  )}
                </div>
              </div>
              <div className="text-body" style={{ fontSize: 16, color: "var(--color-text-primary)" }}>
                {result.answer?.justification}
              </div>
            </div>

            {/* Clauses */}
            {result.answer?.clauses?.length > 0 && (
              <div>
                <div className="text-small" style={{ marginBottom: 12 }}>Supporting Clauses</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {result.answer.clauses.map((c, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="card-subtle">
                      <div className="text-body" style={{ margin: 0 }}>{c}</div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Audit flags */}
            {result.audit?.flags?.length > 0 && (
              <div className="card-subtle" style={{ borderColor: "var(--color-warning)" }}>
                <div className="text-small" style={{ color: "var(--color-warning)", marginBottom: 8 }}>Audit Flags raised</div>
                {result.audit.flags.map((flag, i) => (
                  <div key={i} className="text-body" style={{ margin: "0 0 4px" }}>⚠ {flag}</div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── WORKSPACE ────────────────────────────────────────────────
export default function WorkspaceModule() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 5fr) minmax(0, 8fr)", gap: 32, maxWidth: 1200, margin: "0 auto", padding: "0 0 100px", alignItems: "start" }}>
      {/* Left: Upload */}
      <div className="card" style={{ position: "sticky", top: 88 }}>
        <div className="heading-section" style={{ fontSize: 24, marginBottom: 24 }}>Documents</div>
        <UploadPanel />
      </div>

      {/* Right: Query */}
      <div className="card" style={{ padding: "32px 24px" }}>
        <div className="heading-section" style={{ fontSize: 24, marginBottom: 24 }}>Query Engine</div>
        <QueryPanel />
      </div>
    </div>
  );
}