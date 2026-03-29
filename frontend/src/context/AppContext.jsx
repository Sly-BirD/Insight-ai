/**
 * src/context/AppContext.jsx
 * ─────────────────────────────────────────────────────────────
 * Global app state for InsightAI.
 *
 * What lives here:
 *   dark / setDark          — theme toggle
 *   activeSection / setSection — navigation
 *   apiOnline               — live health-poll result
 *   hasDocuments            — true if Weaviate has ≥1 indexed node
 *   recentQueries / addQuery — query history for Audit page
 *
 *   ── Upload state (Step 4) ──────────────────────────────────
 *   uploadFiles             — file list with progress/status
 *   setUploadFiles
 *   uploadResult            — last ingest API response
 *   setUploadResult
 *   isUploading             — true while ingest is in flight
 *   setIsUploading
 *   These live here so UploadPanel state survives page switches.
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

// ─── context ──────────────────────────────────────────────────
export const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

// ─── provider ─────────────────────────────────────────────────
export function AppProvider({ children }) {

  // ── Theme ────────────────────────────────────────────────
  const [dark, setDark] = useState(true);

  // ── Navigation ───────────────────────────────────────────
  const [activeSection, setActiveSection] = useState("home");
  const setSection = useCallback((id) => {
    setActiveSection(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ── API health ───────────────────────────────────────────
  const [apiOnline, setApiOnline] = useState(null); // null=checking
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

  // ── Document index guard (Step 5) ────────────────────────
  // Checks whether Weaviate actually has indexed nodes.
  // Polled once at startup and again after every successful ingest.
  const [hasDocuments, setHasDocuments] = useState(null); // null=unknown
  const [documentCount, setDocumentCount] = useState(0);
  const checkDocumentsRef = useRef(null);

  const checkDocuments = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) { setHasDocuments(false); setDocumentCount(0); return; }
      const data = await res.json();
      const count = data?.node_count ?? 0;
      setDocumentCount(count);
      setHasDocuments(count > 0);
    } catch {
      // If /status fails, don't block the user — default to allowing queries
      // but we won't set hasDocuments to true either.
      setHasDocuments(null);
    }
  }, []);

  useEffect(() => {
    checkDocuments();
  }, [checkDocuments]);
  const { userId } = useAuth();
  useEffect(() => {
    setHasDocuments(false);
    setDocumentCount(0);
    setUploadFiles([]);
    setUploadResult(null);
  }, [userId]);

  // ── Upload state (Step 4) — survives page switches ───────
  // These are the source-of-truth for UploadPanel.
  // The component reads/writes these instead of local useState.
  const [uploadFiles, setUploadFiles] = useState([]); // {file,name,size,progress,status}
  const [uploadResult, setUploadResult] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  /**
   * Called by UploadPanel after a successful ingest.
   * Re-checks Weaviate node count so hasDocuments updates immediately.
   */
  const onIngestSuccess = useCallback((result) => {
    setUploadResult(result);
    if ((result?.processed ?? 0) > 0) {
      // Optimistically flag docs as available, then confirm via API
      setHasDocuments(true);
      checkDocuments();
    }
  }, [checkDocuments]);

  // ── Query history (for Audit page) ───────────────────────
  const [recentQueries, setRecentQueries] = useState([]);

  const addQuery = useCallback((question, apiResponse) => {
    setRecentQueries((prev) => [
      {
        id: String(Date.now()),
        question,
        decision: apiResponse?.answer?.decision ?? "informational",
        confidence: apiResponse?.answer?.confidence ?? 0,
        auditScore: apiResponse?.audit?.score ?? 0,
        timestamp: new Date().toISOString(),
        clauses: apiResponse?.answer?.clauses ?? [],
        justification: apiResponse?.answer?.justification ?? "",
      },
      ...prev.slice(0, 49),
    ]);
  }, []);

  // ── Derived ───────────────────────────────────────────────
  const notifications = recentQueries.length;

  // ── Context value ─────────────────────────────────────────
  const value = {
    // theme
    dark,
    setDark,

    // navigation
    activeSection,
    setSection,

    // api health
    apiOnline,

    // document index status
    hasDocuments,       // boolean | null
    documentCount,      // number of indexed nodes
    checkDocuments,     // call this to re-check manually

    // upload state (global — survives page switches)
    uploadFiles,
    setUploadFiles,
    uploadResult,
    setUploadResult,
    isUploading,
    setIsUploading,
    onIngestSuccess,    // call this instead of setUploadResult directly

    // query history
    recentQueries,
    addQuery,
    notifications,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}