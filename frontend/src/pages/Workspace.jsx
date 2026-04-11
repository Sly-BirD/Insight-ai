/**
 * src/pages/Workspace.jsx
 * ─────────────────────────────────────────────────────────────
 * Combined Upload + Query workspace.
 *
 * Updated for the SaaS architecture using theme.css classes.
 */

import { useState, useEffect, useRef, useCallback, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/clerk-react";
import { AppContext } from "../context/AppContext.jsx";
import { ingestFiles, runQuery, fetchDocuments } from "../services/api.js";

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
  const [cachedDocs, setCachedDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const fileInputRef = useRef(null);
  const { show, Toast } = useToast();

  useEffect(() => {
    async function loadDocs() {
      setLoadingDocs(true);
      try {
        const res = await fetchDocuments(getToken);
        if (res?.documents) {
          setCachedDocs(res.documents);
        }
      } catch (err) {
        console.error("Failed to fetch past documents", err);
      } finally {
        setLoadingDocs(false);
      }
    }
    loadDocs();
  }, [getToken]);

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

      {/* Previously Uploaded Panel */}
      {cachedDocs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="heading-section" style={{ fontSize: 16, marginBottom: 12, borderTop: "1px solid var(--color-border-subtle)", paddingTop: 16 }}>
            Recently Uploaded Library
          </div>
          <div className="text-small" style={{ marginBottom: 12, color: "var(--color-text-muted)" }}>
            These documents are already in your workspace and Ready to Query.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cachedDocs.map((docName, idx) => (
              <div key={idx} className="card-subtle" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
                <span style={{ color: "var(--color-success)" }}>✓</span>
                <span className="text-body" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {docName}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success result */}
      <AnimatePresence>
        {uploadResult && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="card" style={{ borderColor: "var(--color-success)", marginTop: uploadFiles.length > 0 ? 0 : 16 }}>
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

function QueryPanel({ messages, setMessages }) {
  const { getToken } = useAuth();
  const { hasDocuments, documentCount, addQuery } = useContext(AppContext);

  const [question, setQuestion] = useState("");
  const [loading,  setLoading]  = useState(false);
  const { show, Toast } = useToast();
  const textareaRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSubmit = async () => {
    const currentQ = question.trim();
    if (!currentQ || loading) return;
    
    const userMsg = { role: "user", content: currentQ };
    setMessages(prev => [...prev, userMsg]);
    setQuestion("");
    setLoading(true);

    try {
      const historyPayload = messages
        .filter(m => !m.isError)
        .map(m => ({ role: m.role, content: m.content }));
        
      const data = await runQuery(currentQ, historyPayload, getToken);
      setMessages(prev => [...prev, { role: "assistant", content: data.answer?.summary || "Evaluated.", data }]);
      addQuery?.(currentQ, data);
      show("Query complete", "success");
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: err.message, isError: true }]);
      show(err.message, "error");
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  const indexEmpty = hasDocuments === false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, height: "100%", maxHeight: "80vh" }}>
      <Toast />

      {/* Header Info */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <AnimatePresence>
          {indexEmpty && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="card-subtle" style={{ borderColor: "var(--color-warning)", padding: "12px", flex: 1 }}>
              <div className="heading-section" style={{ fontSize: 16, color: "var(--color-warning)" }}>
                ⚠ No documents indexed
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {hasDocuments && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-success)" }} />
            <span className="text-small">{documentCount.toLocaleString()} nodes indexed</span>
          </div>
        )}
      </div>

      {/* Chat Messages Area */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, paddingRight: 4 }}>
        {messages.length === 0 && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="text-small" style={{ marginBottom: 12 }}>Suggested Questions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {EXAMPLES.map(q => (
                <button key={q} onClick={() => { setQuestion(q); textareaRef.current?.focus(); }}
                  className="card-subtle"
                  style={{ textAlign: "left", cursor: "pointer", transition: "all var(--transition-fast)" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-border-strong)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border-subtle)"}>
                  <span className="text-body" style={{ margin: 0, pointerEvents: "none" }}>{q}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                style={{ alignSelf: "flex-end", maxWidth: "80%", background: "var(--color-border)", padding: "12px 16px", borderRadius: "16px 16px 0 16px", color: "var(--color-text-primary)" }}>
                <div className="text-body" style={{ margin: 0 }}>{msg.content}</div>
              </motion.div>
            );
          }

          if (msg.isError) {
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ borderColor: "var(--color-error)", alignSelf: "flex-start", maxWidth: "90%" }}>
                <div className="heading-section" style={{ fontSize: 16, color: "var(--color-error)", marginBottom: 8 }}>Error</div>
                <div className="text-body" style={{ margin: 0 }}>{msg.content}</div>
              </motion.div>
            );
          }

          const res = msg.data;
          const meta = dm(res?.answer?.decision);
          const auditScore = res?.audit?.score ?? null;

          return (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ alignSelf: "flex-start", width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="card-elevated" style={{ borderColor: meta.color }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontSize: 24, color: meta.color }}>{meta.icon}</div>
                    <div className="heading-section" style={{ fontSize: 20, color: meta.color }}>{meta.label}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="text-small">{res.answer?.confidence}% confidence</div>
                    {auditScore !== null && (
                      <div className="text-small" style={{ color: auditScore >= 85 ? "var(--color-success)" : "var(--color-warning)" }}>
                        Audit: {auditScore}/100
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-body" style={{ fontSize: 16 }}>{res.answer?.justification}</div>
              </div>

              {res.answer?.clauses?.length > 0 && (
                <div>
                  <div className="text-small" style={{ marginBottom: 8 }}>Supporting Context</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {res.answer.clauses.map((c, idx) => (
                      <div key={idx} className="card-subtle" style={{ padding: "8px 12px" }}>
                        <div className="text-body" style={{ margin: 0, fontSize: 14 }}>{c}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ alignSelf: "flex-start", padding: "12px 16px", background: "var(--color-bg-subtle)", borderRadius: "0 16px 16px 16px", color: "var(--color-text-muted)" }}>
            <div className="text-body" style={{ margin: 0, fontStyle: "italic" }}>Retrieving knowledge...</div>
          </motion.div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input box pinned to bottom */}
      <div className="card" style={{ padding: "8px", marginTop: "auto", flexShrink: 0 }}>
        <textarea
          ref={textareaRef}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey || e.key === "Enter") && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          disabled={loading}
          rows={2}
          placeholder={indexEmpty ? "Upload documents first…" : "Ask a follow-up question… (Enter)"}
          style={{
            width: "100%", padding: "12px", border: "none", resize: "none",
            background: "transparent", color: "var(--color-text-primary)",
            fontFamily: "var(--font-sans)", fontSize: 16, outline: "none",
            opacity: loading ? 0.6 : 1,
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 8px 8px" }}>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || !question.trim()}>
            {loading ? "Thinking…" : "Send →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── WORKSPACE ────────────────────────────────────────────────
export default function WorkspaceModule() {
  const [sessions, setSessions] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("insight_sessions"));
      return Array.isArray(stored) && stored.length > 0 ? stored : [];
    } catch {
      return [];
    }
  });

  const [activeSessionId, setActiveSessionId] = useState(() => {
    return sessions.length > 0 ? sessions[0].id : "default";
  });

  useEffect(() => {
    localStorage.setItem("insight_sessions", JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (sessions.length === 0) {
      const newSession = { id: Date.now().toString(), title: "New Chat", messages: [] };
      setSessions([newSession]);
      setActiveSessionId(newSession.id);
    }
  }, [sessions.length]);

  const activeSession = sessions.find(s => s.id === activeSessionId) || { id: "default", title: "New Chat", messages: [] };

  const handleNewChat = () => {
    const newSession = { id: Date.now().toString(), title: "New Chat", messages: [] };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  const handleDeleteChat = (e, sessionId) => {
    e.stopPropagation();
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== sessionId);
      if (filtered.length === 0) {
        const fresh = { id: Date.now().toString(), title: "New Chat", messages: [] };
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (sessionId === activeSessionId) {
        setActiveSessionId(filtered[0].id);
      }
      return filtered;
    });
  };

  const updateActiveSession = (newMessagesSetAction) => {
    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        const newMessages = typeof newMessagesSetAction === "function" ? newMessagesSetAction(s.messages) : newMessagesSetAction;
        let newTitle = s.title;
        if (s.title === "New Chat" && newMessages.length > 0 && newMessages[0].role === "user") {
          newTitle = newMessages[0].content.slice(0, 25) + (newMessages[0].content.length > 25 ? "..." : "");
        }
        return { ...s, messages: newMessages, title: newTitle };
      }
      return s;
    }));
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 8fr)", gap: 32, maxWidth: 1300, margin: "0 auto", padding: "0 0 100px", alignItems: "start" }}>
      {/* Left Base: Chat History + Upload */}
      <div style={{ display: "flex", flexDirection: "column", gap: 32, position: "sticky", top: 88 }}>
        
        {/* Chat Sessions History Panel */}
        <div className="card" style={{ padding: "16px 16px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="heading-section" style={{ fontSize: 18 }}>Chat History</div>
            <button className="btn btn-ghost" onClick={handleNewChat} style={{ padding: "4px 8px", fontSize: 13, border: "1px solid var(--color-border-strong)" }}>
              + New
            </button>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "35vh", overflowY: "auto", paddingRight: 4 }}>
            {sessions.map(s => (
              <div key={s.id} onClick={() => setActiveSessionId(s.id)}
                className="card-subtle"
                style={{
                  padding: "10px 12px",
                  cursor: "pointer",
                  transition: "all var(--transition-fast)",
                  borderColor: s.id === activeSessionId ? "var(--color-text-primary)" : "transparent",
                  backgroundColor: s.id === activeSessionId ? "var(--color-bg-subtle)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                }}
              >
                <div className="text-body" style={{ margin: 0, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, color: s.id === activeSessionId ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                  {s.title}
                </div>
                <button
                  onClick={(e) => handleDeleteChat(e, s.id)}
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: "2px 6px",
                    fontSize: 14, color: "var(--color-text-muted)", borderRadius: 4,
                    opacity: 0.5, transition: "all var(--transition-fast)", flexShrink: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "var(--color-error)"; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = "0.5"; e.currentTarget.style.color = "var(--color-text-muted)"; }}
                  title="Delete chat"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Upload Panel */}
        <div className="card" style={{ padding: "16px" }}>
          <div className="heading-section" style={{ fontSize: 18, marginBottom: 16 }}>Documents</div>
          <UploadPanel />
        </div>
      </div>

      {/* Right: Query Engine Window */}
      <div className="card" style={{ padding: "24px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div className="heading-section" style={{ fontSize: 22 }}>Query Engine</div>
          <div className="text-small" style={{ color: "var(--color-text-muted)" }}>{activeSession.title}</div>
        </div>
        <QueryPanel messages={activeSession.messages} setMessages={updateActiveSession} />
      </div>
    </div>
  );
}