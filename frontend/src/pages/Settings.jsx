/**
 * src/pages/Settings.jsx
 * ─────────────────────────────────────────────────────────────
 * Fully functional Settings page with:
 *  - Profile & account info
 *  - Theme toggle
 *  - Document management (view, delete individual, purge all)
 *  - Chat history management (clear local sessions)
 *  - Query history management (clear server-side DB records)
 *  - System info & usage stats
 */

import { useState, useEffect, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, useUser } from "@clerk/clerk-react";
import { AppContext } from "../context/AppContext.jsx";
import { fetchDocuments, deleteDocument, deleteAllDocuments, clearHistory } from "../services/api.js";

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
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.95 }}
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
          <span className="text-body" style={{ margin: 0 }}>{toast.msg}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
  return { show, Toast };
}

// ─── Confirm Dialog ───────────────────────────────────────────
function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
    }}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="card-elevated" style={{ maxWidth: 420, width: "90%", padding: 32 }}>
        <div className="heading-section" style={{ fontSize: 20, marginBottom: 12 }}>{title}</div>
        <div className="text-body" style={{ marginBottom: 24 }}>{message}</div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm} style={{ background: "var(--color-error)", borderColor: "var(--color-error)" }}>
            Confirm
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────
function SettingsSection({ icon, title, desc, children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 18, color: "var(--color-text-muted)" }}>{icon}</span>
          <div className="heading-section" style={{ fontSize: 18 }}>{title}</div>
        </div>
        {desc && <div className="text-small">{desc}</div>}
      </div>
      {children}
    </motion.div>
  );
}

// ─── Settings ─────────────────────────────────────────────────
export default function SettingsModule() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const { dark, setDark, hasDocuments, documentCount, checkDocuments } = useContext(AppContext);
  const { show, Toast } = useToast();

  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [deletingDoc, setDeletingDoc] = useState(null);
  const [confirm, setConfirm] = useState(null);

  // Chat sessions from localStorage
  const [chatCount, setChatCount] = useState(0);
  useEffect(() => {
    try {
      const sessions = JSON.parse(localStorage.getItem("insight_sessions")) || [];
      setChatCount(sessions.length);
    } catch {
      setChatCount(0);
    }
  }, []);

  // Fetch documents
  useEffect(() => {
    async function load() {
      setLoadingDocs(true);
      try {
        const res = await fetchDocuments(getToken);
        setDocs(res?.documents || []);
      } catch { setDocs([]); }
      finally { setLoadingDocs(false); }
    }
    load();
  }, [getToken]);

  // Handlers
  const handleDeleteDoc = async (docName) => {
    setDeletingDoc(docName);
    try {
      await deleteDocument(docName, getToken);
      setDocs(prev => prev.filter(d => d !== docName));
      show(`Removed "${docName}"`, "success");
      checkDocuments();
    } catch (err) {
      show(err.message, "error");
    } finally {
      setDeletingDoc(null);
    }
  };

  const handlePurgeAllDocs = async () => {
    setConfirm(null);
    try {
      await deleteAllDocuments(getToken);
      setDocs([]);
      show("All documents purged", "success");
      checkDocuments();
    } catch (err) {
      show(err.message, "error");
    }
  };

  const handleClearChatHistory = () => {
    localStorage.removeItem("insight_sessions");
    setChatCount(0);
    show("Chat sessions cleared", "success");
    setConfirm(null);
  };

  const handleClearQueryHistory = async () => {
    setConfirm(null);
    try {
      await clearHistory(getToken);
      show("Query history cleared from database", "success");
    } catch (err) {
      show(err.message, "error");
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 0 100px", display: "flex", flexDirection: "column", gap: 24 }}>
      <Toast />
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title || ""}
        message={confirm?.message || ""}
        onConfirm={confirm?.onConfirm || (() => setConfirm(null))}
        onCancel={() => setConfirm(null)}
      />

      {/* ── Profile Section ──────────────────────────────── */}
      <SettingsSection icon="◉" title="Account" desc="Your profile and authentication details.">
        <div className="card-subtle" style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {user?.imageUrl && (
            <img src={user.imageUrl} alt="Avatar"
              style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--color-border)" }} />
          )}
          <div style={{ flex: 1 }}>
            <div className="text-body" style={{ margin: 0, fontWeight: 500, fontSize: 16 }}>
              {user?.firstName} {user?.lastName}
            </div>
            <div className="text-small">{user?.primaryEmailAddress?.emailAddress || "—"}</div>
          </div>
          <div className="text-small" style={{ color: "var(--color-success)", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-success)" }} />
            Authenticated
          </div>
        </div>
      </SettingsSection>

      {/* ── Appearance ────────────────────────────────────── */}
      <SettingsSection icon="◑" title="Appearance" desc="Customize the look and feel of the application.">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="text-body" style={{ margin: 0 }}>Theme</div>
            <div className="text-small">Switch between light and dark mode</div>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => setDark(!dark)}
            style={{ border: "1px solid var(--color-border-strong)", padding: "8px 16px", display: "flex", gap: 8, alignItems: "center" }}
          >
            <span>{dark ? "🌙" : "☀️"}</span>
            <span>{dark ? "Dark Mode" : "Light Mode"}</span>
          </button>
        </div>
      </SettingsSection>

      {/* ── Document Management ────────────────────────── */}
      <SettingsSection icon="◈" title="Document Management" desc={`${docs.length} document(s) in your workspace · ${documentCount} nodes indexed`}>
        {loadingDocs ? (
          <div className="text-small" style={{ fontStyle: "italic" }}>Loading documents…</div>
        ) : docs.length === 0 ? (
          <div className="card-subtle" style={{ textAlign: "center", padding: 24 }}>
            <div className="text-body" style={{ margin: 0, color: "var(--color-text-muted)" }}>No documents uploaded yet</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {docs.map(docName => (
                <div key={docName} className="card-subtle" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, overflow: "hidden" }}>
                    <span style={{ color: "var(--color-success)", flexShrink: 0 }}>✓</span>
                    <span className="text-body" style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {docName}
                    </span>
                  </div>
                  <button
                    className="btn btn-ghost"
                    onClick={() => handleDeleteDoc(docName)}
                    disabled={deletingDoc === docName}
                    style={{ padding: "4px 10px", fontSize: 13, color: "var(--color-error)", border: "1px solid var(--color-error)", opacity: deletingDoc === docName ? 0.5 : 1 }}
                  >
                    {deletingDoc === docName ? "…" : "Remove"}
                  </button>
                </div>
              ))}
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => setConfirm({
                title: "Purge All Documents",
                message: "This will permanently delete ALL uploaded documents from your workspace and wipe the vector database. This action cannot be undone.",
                onConfirm: handlePurgeAllDocs,
              })}
              style={{ color: "var(--color-error)", border: "1px solid var(--color-error)", alignSelf: "flex-start" }}
            >
              Purge All Documents
            </button>
          </>
        )}
      </SettingsSection>

      {/* ── Chat History ───────────────────────────────── */}
      <SettingsSection icon="⌖" title="Chat Sessions" desc={`${chatCount} conversation(s) stored locally in your browser.`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="text-body" style={{ margin: 0 }}>Local Chat History</div>
            <div className="text-small">Clears all saved conversation threads from this browser</div>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => setConfirm({
              title: "Clear Chat Sessions",
              message: "This will permanently delete all saved chat conversations from your browser. This cannot be undone.",
              onConfirm: handleClearChatHistory,
            })}
            style={{ color: "var(--color-warning)", border: "1px solid var(--color-warning)" }}
          >
            Clear Chats
          </button>
        </div>
      </SettingsSection>

      {/* ── Query History ──────────────────────────────── */}
      <SettingsSection icon="≡" title="Query History" desc="Server-side encrypted query records stored in Supabase.">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="text-body" style={{ margin: 0 }}>Database Records</div>
            <div className="text-small">Permanently delete all query history from the encrypted database</div>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => setConfirm({
              title: "Clear Query History",
              message: "This will permanently delete all query records from the Supabase database. Dashboard analytics will reset. This cannot be undone.",
              onConfirm: handleClearQueryHistory,
            })}
            style={{ color: "var(--color-error)", border: "1px solid var(--color-error)" }}
          >
            Clear History
          </button>
        </div>
      </SettingsSection>

      {/* ── System Information ─────────────────────────── */}
      <SettingsSection icon="⚙" title="System Information" desc="Technical details about your InsightAI instance.">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Primary LLM", value: "Llama 3.3 70B Versatile" },
            { label: "Fallback LLM", value: "Llama 3.3 70B (Separate Key)" },
            { label: "Embedding Model", value: "BAAI/bge-base-en-v1.5" },
            { label: "Vector Database", value: "Weaviate (Hybrid Search)" },
            { label: "Search Strategy", value: "Vector + BM25 (α=0.65)" },
            { label: "Max Upload Size", value: "25 MB per PDF" },
            { label: "Retrieval Top-K", value: "15 chunks" },
            { label: "Encryption", value: "AES-256-GCM (per-user keys)" },
          ].map(item => (
            <div key={item.label} className="card-subtle" style={{ padding: "10px 14px" }}>
              <div className="text-small" style={{ marginBottom: 2 }}>{item.label}</div>
              <div className="text-body" style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}
