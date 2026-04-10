/**
 * src/pages/Upload.jsx
 * ─────────────────────────────────────────────────────────────
 * Fully functional Upload & Ingest page for InsightAI.
 *
 * Drop this into MODULE_MAP in InsightAI.jsx:
 *   import UploadModule from "./src/pages/Upload.jsx";
 *   const MODULE_MAP = { ..., upload: UploadModule, ... };
 *
 * Styling: 100% inline styles — no Tailwind, no new deps.
 * Matches DM Serif Display / DM Sans / DM Mono font stack and
 * all dark-mode tokens used throughout InsightAI.jsx.
 */

import { useState, useRef, useCallback, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/clerk-react";
import { ingestFiles } from "../services/api";
import { AppContext } from "../context/AppContext";

const useApp = () => useContext(AppContext);

// ─── Toast (same tiny implementation as Query.jsx) ────────────
function Toast({ message, type, onDismiss }) {
  const isError = type === "error";
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      exit={   { opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      onClick={onDismiss}
      style={{
        position:     "fixed",
        bottom:       80,
        right:        24,
        zIndex:       9999,
        maxWidth:     380,
        padding:      "14px 18px",
        borderRadius: 12,
        background:   isError ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.10)",
        border:       `1px solid ${isError ? "rgba(239,68,68,0.25)" : "rgba(34,197,94,0.25)"}`,
        backdropFilter: "blur(12px)",
        display:      "flex",
        alignItems:   "center",
        gap:          10,
        cursor:       "pointer",
      }}
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
      {toast && <Toast key={toast.message} message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </AnimatePresence>
  );
  return { show, ToastPortal };
}

// ─── file-status helpers ──────────────────────────────────────
const statusColor = (status, dark) => ({
  pending:   dark ? "#5a6a78" : "#94a3b8",
  uploading: dark ? "#94a3b8" : "#475569",
  done:      "#22c55e",
  error:     "#ef4444",
}[status] ?? (dark ? "#5a6a78" : "#94a3b8"));

const statusLabel = (status, progress) => ({
  pending:   "Pending",
  uploading: `${progress}%`,
  done:      "✓ Done",
  error:     "✗ Error",
}[status] ?? status);

// ─── component ───────────────────────────────────────────────
export default function UploadModule({ dark }) {
  const { getToken } = useAuth();
  const [dragging,   setDragging]   = useState(false);
  const [fileList,   setFileList]   = useState([]);  // { file, name, size, progress, status }
  const [uploading,  setUploading]  = useState(false);
  const [ingestResult, setIngestResult] = useState(null);

  const fileInputRef = useRef(null);
  const { show: showToast, ToastPortal } = useToast();

  // ── add files ─────────────────────────────────────────────
  const addFiles = useCallback((incoming) => {
    const pdfs = Array.from(incoming).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) {
      showToast("Only PDF files are accepted.", "error");
      return;
    }
    setIngestResult(null);
    setFileList((prev) => {
      const existing = new Set(prev.map((e) => e.name));
      const fresh = pdfs
        .filter((f) => !existing.has(f.name))
        .map((f) => ({
          file:     f,
          name:     f.name,
          size:     f.size < 1024 * 1024
            ? `${(f.size / 1024).toFixed(0)} KB`
            : `${(f.size / 1024 / 1024).toFixed(1)} MB`,
          progress: 0,
          status:   "pending",
        }));
      return [...prev, ...fresh];
    });
  }, [showToast]);

  // ── remove single file ────────────────────────────────────
  const removeFile = (name) => {
    setFileList((prev) => prev.filter((f) => f.name !== name));
  };

  // ── upload & ingest ───────────────────────────────────────
  const handleIngest = async () => {
    const pending = fileList.filter((f) => f.status === "pending");
    if (!pending.length || uploading) return;

    setUploading(true);
    setIngestResult(null);

    // Mark all pending as uploading, start fake progress animation
    setFileList((prev) =>
      prev.map((f) => f.status === "pending" ? { ...f, status: "uploading", progress: 0 } : f)
    );

    const interval = setInterval(() => {
      setFileList((prev) =>
        prev.map((f) =>
          f.status === "uploading"
            ? { ...f, progress: Math.min(f.progress + 7, 88) }
            : f
        )
      );
    }, 300);

    try {
      const files  = pending.map((f) => f.file);
      const result = await ingestFiles(files, getToken);

      clearInterval(interval);

      // Mark done / error based on result
      setFileList((prev) =>
        prev.map((f) =>
          f.status === "uploading"
            ? {
                ...f,
                progress: 100,
                status:   result.errors?.some((e) => e.includes(f.name))
                  ? "error"
                  : "done",
              }
            : f
        )
      );

      setIngestResult(result);
      showToast(
        `Ingested ${result.processed} file(s) → ${result.nodes_created ?? "?"} nodes`,
        "success"
      );
    } catch (err) {
      clearInterval(interval);
      setFileList((prev) =>
        prev.map((f) =>
          f.status === "uploading" ? { ...f, status: "error", progress: 0 } : f
        )
      );
      showToast(err.message, "error");
    } finally {
      setUploading(false);
    }
  };

  // ── drag handlers ─────────────────────────────────────────
  const onDragOver  = (e) => { e.preventDefault(); setDragging(true);  };
  const onDragLeave = ()  => { setDragging(false); };
  const onDrop      = (e) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  // ── shared tokens ─────────────────────────────────────────
  const monoSm = {
    fontFamily:    "'DM Mono', monospace",
    fontSize:      10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color:         dark ? "#5a6a78" : "#94a3b8",
  };

  const hasPending = fileList.some((f) => f.status === "pending");

  // ── render ────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 0 80px" }}>
      <ToastPortal />

      {/* ── Drop zone ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1    }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        style={{
          border:       `2px dashed ${
            dragging
              ? (dark ? "rgba(148,163,184,0.4)" : "rgba(30,41,59,0.3)")
              : (dark ? "rgba(15,23,42,0.65)" : "rgba(0,0,0,0.08)")
          }`,
          borderRadius: 20,
          padding:      "52px 32px",
          textAlign:    "center",
          marginBottom: 20,
          background:   dragging
            ? (dark ? "rgba(148,163,184,0.04)" : "rgba(30,41,59,0.02)")
            : "transparent",
          transition:   "all 0.2s",
          cursor:       uploading ? "not-allowed" : "pointer",
          opacity:      uploading ? 0.6 : 1,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          style={{ display: "none" }}
          onChange={(e) => addFiles(e.target.files)}
        />

        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize:   28,
          color:      dragging
            ? (dark ? "#64748b" : "#64748b")
            : (dark ? "#3a4550" : "#e2e8f0"),
          marginBottom: 14,
          lineHeight:   1,
          transition:   "color 0.2s",
        }}>
          ⬆
        </div>

        <p style={{
          fontFamily: "'DM Serif Display', Georgia, serif",
          fontSize:   20,
          fontStyle:  "italic",
          color:      dark ? "#8899a6" : "#64748b",
          margin:     "0 0 6px",
        }}>
          {dragging ? "Release to add files" : "Drop policy PDFs here"}
        </p>

        <p style={{
          fontFamily:    "'DM Mono', monospace",
          fontSize:      11,
          letterSpacing: "0.06em",
          color:         dark ? "#3a4550" : "#cbd5e1",
        }}>
          PDF only · Max 50 MB per file · Click to browse
        </p>
      </motion.div>

      {/* ── File list ── */}
      <AnimatePresence initial={false}>
        {fileList.map((f, i) => (
          <motion.div
            key={f.name}
            initial={{ opacity: 0, x: -16, height: 0 }}
            animate={{ opacity: 1, x: 0,   height: "auto" }}
            exit={   { opacity: 0, x: 16,  height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ marginBottom: 8, overflow: "hidden" }}
          >
            <div style={{
              padding:      "14px 18px",
              borderRadius: 12,
              background:   dark ? "rgba(15,23,42,0.72)" : "rgba(0,0,0,0.025)",
              border:       dark
                ? "1px solid rgba(255,255,255,0.06)"
                : "1px solid rgba(0,0,0,0.06)",
            }}>
              {/* Name row */}
              <div style={{
                display:        "flex",
                justifyContent: "space-between",
                alignItems:     "center",
                marginBottom:   8,
                gap:            8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {/* PDF icon */}
                  <span style={{
                    fontFamily:    "'DM Mono', monospace",
                    fontSize:      9,
                    letterSpacing: "0.08em",
                    padding:       "2px 6px",
                    borderRadius:  4,
                    background:    dark ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.06)",
                    border:        "1px solid rgba(239,68,68,0.15)",
                    color:         "#f87171",
                    flexShrink:    0,
                  }}>
                    PDF
                  </span>
                  <span style={{
                    fontFamily:   "'DM Sans', sans-serif",
                    fontSize:     13,
                    color:        dark ? "#cbd5e1" : "#1e293b",
                    fontWeight:   400,
                    overflow:     "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace:   "nowrap",
                  }}>
                    {f.name}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span style={{
                    fontFamily:    "'DM Mono', monospace",
                    fontSize:      10,
                    letterSpacing: "0.04em",
                    color:         statusColor(f.status, dark),
                  }}>
                    {statusLabel(f.status, f.progress)}
                  </span>

                  {/* Remove button (only when not uploading) */}
                  {!uploading && f.status !== "uploading" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(f.name); }}
                      style={{
                        background: "none",
                        border:     "none",
                        cursor:     "pointer",
                        color:      dark ? "#3a4550" : "#e2e8f0",
                        fontSize:   14,
                        lineHeight: 1,
                        padding:    "2px 4px",
                        borderRadius: 4,
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={(e) => { e.target.style.color = dark ? "#ef4444" : "#dc2626"; }}
                      onMouseLeave={(e) => { e.target.style.color = dark ? "#3a4550" : "#e2e8f0"; }}
                      title="Remove"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div style={{
                height:       3,
                borderRadius: 2,
                background:   dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                overflow:     "hidden",
              }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${f.progress}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  style={{
                    height:       "100%",
                    borderRadius: 2,
                    background:   statusColor(f.status, dark),
                  }}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* ── Action row ── */}
      {fileList.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display:        "flex",
            justifyContent: "space-between",
            alignItems:     "center",
            marginTop:      16,
            gap:            12,
            flexWrap:       "wrap",
          }}
        >
          {/* File count */}
          <span style={{
            fontFamily:    "'DM Mono', monospace",
            fontSize:      11,
            color:         dark ? "#5a6a78" : "#94a3b8",
            letterSpacing: "0.04em",
          }}>
            {fileList.length} file{fileList.length !== 1 ? "s" : ""} selected
            {fileList.filter((f) => f.status === "done").length > 0 &&
              ` · ${fileList.filter((f) => f.status === "done").length} ingested`}
          </span>

          <div style={{ display: "flex", gap: 10 }}>
            {/* Clear all */}
            {!uploading && (
              <button
                onClick={() => { setFileList([]); setIngestResult(null); }}
                style={{
                  padding:      "10px 18px",
                  borderRadius: 9,
                  background:   "transparent",
                  border:       dark
                    ? "1px solid rgba(255,255,255,0.08)"
                    : "1px solid rgba(0,0,0,0.08)",
                  fontFamily:   "'DM Sans', sans-serif",
                  fontSize:     13,
                  fontWeight:   400,
                  color:        dark ? "#8899a6" : "#64748b",
                  cursor:       "pointer",
                  transition:   "border-color 0.2s",
                }}
              >
                Clear
              </button>
            )}

            {/* Upload & Ingest */}
            <motion.button
              whileHover={{ scale: uploading || !hasPending ? 1 : 1.02 }}
              whileTap={  { scale: uploading || !hasPending ? 1 : 0.97 }}
              onClick={handleIngest}
              disabled={uploading || !hasPending}
              style={{
                padding:      "10px 22px",
                borderRadius: 9,
                background:   uploading || !hasPending
                  ? (dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)")
                  : (dark ? "#e2e8f0" : "#0f172a"),
                color: uploading || !hasPending
                  ? (dark ? "#5a6a78" : "#94a3b8")
                  : (dark ? "#0f172a" : "#e2e8f0"),
                border:      "none",
                fontFamily:  "'DM Sans', sans-serif",
                fontSize:    13,
                fontWeight:  500,
                cursor:      uploading || !hasPending ? "not-allowed" : "pointer",
                display:     "flex",
                alignItems:  "center",
                gap:         8,
                transition:  "background 0.2s, color 0.2s",
                letterSpacing: "0.01em",
              }}
            >
              {uploading ? (
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
                  Ingesting…
                </>
              ) : (
                "Upload & Ingest →"
              )}
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* ── Success result banner ── */}
      <AnimatePresence>
        {ingestResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0  }}
            exit={  { opacity: 0        }}
            style={{
              marginTop:    20,
              padding:      "18px 22px",
              borderRadius: 14,
              background:   "rgba(34,197,94,0.05)",
              border:       "1px solid rgba(34,197,94,0.2)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 16, color: "#22c55e" }}>✓</span>
              <span style={{
                fontFamily:    "'DM Serif Display', Georgia, serif",
                fontSize:      17,
                fontStyle:     "italic",
                color:         "#22c55e",
                letterSpacing: "-0.01em",
              }}>
                Ingestion complete
              </span>
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              {[
                { k: "Files processed", v: ingestResult.processed },
                { k: "Nodes created",   v: ingestResult.nodes_created ?? "—" },
                { k: "Duration",        v: ingestResult.duration_seconds != null ? `${ingestResult.duration_seconds}s` : "—" },
              ].map(({ k, v }) => (
                <div key={k}>
                  <p style={{
                    fontFamily:    "'DM Mono', monospace",
                    fontSize:      9,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color:         dark ? "#5a6a78" : "#94a3b8",
                    marginBottom:  4,
                  }}>
                    {k}
                  </p>
                  <p style={{
                    fontFamily:    "'DM Serif Display', Georgia, serif",
                    fontSize:      22,
                    color:         dark ? "#e2e8f0" : "#0f172a",
                    letterSpacing: "-0.02em",
                    lineHeight:    1,
                    margin:        0,
                  }}>
                    {v}
                  </p>
                </div>
              ))}
            </div>

            {/* Per-file errors */}
            {ingestResult.errors?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <p style={{
                  fontFamily:    "'DM Mono', monospace",
                  fontSize:      9,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color:         "#f59e0b",
                  marginBottom:  6,
                }}>
                  Skipped files
                </p>
                {ingestResult.errors.map((err, i) => (
                  <p key={i} style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize:   12,
                    color:      dark ? "#64748b" : "#94a3b8",
                    lineHeight: 1.5,
                    margin:     i < ingestResult.errors.length - 1 ? "0 0 3px" : 0,
                    fontWeight: 300,
                  }}>
                    ⚠ {err}
                  </p>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
