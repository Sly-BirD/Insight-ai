/**
 * src/context/AppContext.jsx
 * ─────────────────────────────────────────────────────────────
 * Step 10: Updated with:
 *   - useAuth() reset on user change (session leakage fix)
 *   - Per-user /status check using Clerk userId
 *   - getToken passed through context for API calls
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "@clerk/clerk-react";

const API_BASE = "http://localhost:8000";

export const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export function AppProvider({ children }) {

  // ── Clerk auth ───────────────────────────────────────────
  // useAuth is safe here because AppProvider is rendered inside
  // ClerkProvider in main.jsx
  const { userId, getToken, isSignedIn } = useAuth();

  // ── Theme ────────────────────────────────────────────────
  const [dark, setDark] = useState(true);

  // ── Navigation ───────────────────────────────────────────
  const [activeSection, setActiveSection] = useState("home");
  const setSection = useCallback((id) => {
    setActiveSection(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ── API health ───────────────────────────────────────────
  const [apiOnline, setApiOnline] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) });
        if (active) setApiOnline(res.ok);
      } catch {
        if (active) setApiOnline(false);
      }
    };
    check();
    pollRef.current = setInterval(check, 30_000);
    return () => { active = false; clearInterval(pollRef.current); };
  }, []);

  // ── Document index guard — per-user (Step 5 + Step 10) ───
  const [hasDocuments,  setHasDocuments]  = useState(null);
  const [documentCount, setDocumentCount] = useState(0);

  const checkDocuments = useCallback(async () => {
    try {
      // Pass userId so backend checks this user's collection (Silo Pattern)
      const url = userId
        ? `${API_BASE}/status?user_id=${encodeURIComponent(userId)}`
        : `${API_BASE}/status`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) { setHasDocuments(false); setDocumentCount(0); return; }
      const data = await res.json();
      const count = data?.node_count ?? 0;
      setDocumentCount(count);
      setHasDocuments(count > 0);
    } catch {
      setHasDocuments(null);
    }
  }, [userId]);

  useEffect(() => {
    checkDocuments();
  }, [checkDocuments]);

  // ── Session leakage fix (Step 10) ────────────────────────
  // Reset ALL per-session state when the user changes.
  // This prevents user B from seeing user A's upload state or
  // inheriting hasDocuments=true from user A's session.
  useEffect(() => {
    setHasDocuments(false);
    setDocumentCount(0);
    setUploadFiles([]);
    setUploadResult(null);
    setIsUploading(false);
    setRecentQueries([]);
    // Re-check this user's actual documents after reset
    if (userId) {
      // Small delay to let Clerk finish the auth transition
      const t = setTimeout(checkDocuments, 500);
      return () => clearTimeout(t);
    }
  }, [userId]); // fires on login, logout, and account switch

  // ── Upload state (Step 4) — survives page switches ───────
  const [uploadFiles,  setUploadFiles]  = useState([]);
  const [uploadResult, setUploadResult] = useState(null);
  const [isUploading,  setIsUploading]  = useState(false);

  const onIngestSuccess = useCallback((result) => {
    setUploadResult(result);
    if ((result?.processed ?? 0) > 0) {
      setHasDocuments(true);
      checkDocuments(); // confirm with backend
    }
  }, [checkDocuments]);

  // ── Query history ─────────────────────────────────────────
  const [recentQueries, setRecentQueries] = useState([]);

  const addQuery = useCallback((question, apiResponse) => {
    setRecentQueries((prev) => [
      {
        id:            String(Date.now()),
        question,
        decision:      apiResponse?.answer?.decision      ?? "informational",
        confidence:    apiResponse?.answer?.confidence    ?? 0,
        auditScore:    apiResponse?.audit?.score          ?? 0,
        timestamp:     new Date().toISOString(),
        clauses:       apiResponse?.answer?.clauses       ?? [],
        justification: apiResponse?.answer?.justification ?? "",
        summary:       apiResponse?.answer?.summary       ?? "",
        duration_s:    apiResponse?.retrieval_info?.duration_s ?? 0,
      },
      ...prev.slice(0, 49),
    ]);
  }, []);

  const notifications = recentQueries.length;

  // ── Context value ─────────────────────────────────────────
  const value = {
    // theme
    dark, setDark,

    // navigation
    activeSection, setSection,

    // auth (pass getToken so pages can authenticate API calls)
    userId, getToken, isSignedIn,

    // api health
    apiOnline,

    // document index
    hasDocuments, documentCount, checkDocuments,

    // upload state
    uploadFiles, setUploadFiles,
    uploadResult, setUploadResult,
    isUploading, setIsUploading,
    onIngestSuccess,

    // query history
    recentQueries, addQuery, notifications,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
