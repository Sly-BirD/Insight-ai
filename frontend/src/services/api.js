/**
 * src/services/api.js
 * ─────────────────────────────────────────────────────────────
 * Fetch wrappers for the InsightAI FastAPI backend.
 * Step 9: All protected endpoints now send the Clerk JWT token
 * in the Authorization header.
 *
 * Usage:
 *   import { runQuery, ingestFiles, checkHealth } from "../services/api";
 *
 *   // Pass getToken from useAuth() for protected calls:
 *   const { getToken } = useAuth();
 *   const result = await runQuery(question, getToken);
 */

const BASE_URL = import.meta.env?.VITE_API_BASE ?? "http://localhost:8000";

// ─── helpers ─────────────────────────────────────────────────

async function handleResponse(res) {
  let body;
  const ct = res.headers.get("content-type") ?? "";
  try {
    body = ct.includes("application/json") ? await res.json() : await res.text();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const detail =
      (body && typeof body === "object" && (body.detail ?? body.error)) ||
      (typeof body === "string" && body) ||
      `HTTP ${res.status} ${res.statusText}`;
    throw new Error(String(detail));
  }
  return body;
}

/**
 * Build Authorization header from Clerk getToken function.
 * Falls back gracefully if getToken is not provided (public endpoints).
 */
async function authHeaders(getToken) {
  if (!getToken) return {};
  try {
    const token = await getToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

// ─── GET /health (public) ─────────────────────────────────────

export async function checkHealth() {
  try {
    const res = await fetch(`${BASE_URL}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    const body = await handleResponse(res);
    return body?.status === "ok";
  } catch {
    return false;
  }
}

// ─── GET /status (public) ─────────────────────────────────────

export async function checkStatus() {
  try {
    const res = await fetch(`${BASE_URL}/status`, {
      signal: AbortSignal.timeout(5_000),
    });
    return handleResponse(res);
  } catch {
    return { has_documents: false, node_count: 0 };
  }
}

// ─── GET /analytics (protected) ──────────────────────────────

export async function fetchAnalytics(getToken) {
  const res = await fetch(`${BASE_URL}/analytics`, {
    headers: await authHeaders(getToken),
    signal: AbortSignal.timeout(10_000),
  });
  return handleResponse(res);
}

// ─── POST /query (protected) ─────────────────────────────────

export async function runQuery(question, getToken) {
  if (!question?.trim()) throw new Error("Question must not be empty.");
  const res = await fetch(`${BASE_URL}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders(getToken)),
    },
    body: JSON.stringify({ question: question.trim() }),
    signal: AbortSignal.timeout(120_000),
  });
  return handleResponse(res);
}

// ─── POST /ingest (protected) ────────────────────────────────

export async function ingestFiles(files, getToken) {
  if (!files?.length) throw new Error("No files provided.");
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const res = await fetch(`${BASE_URL}/ingest`, {
    method: "POST",
    headers: await authHeaders(getToken),
    body: form,
    signal: AbortSignal.timeout(600_000),
  });
  return handleResponse(res);
}

// ─── POST /compare (protected) ───────────────────────────────

export async function compareFiles(fileA, fileB, getToken) {
  const form = new FormData();
  form.append("files", fileA);
  form.append("files", fileB);
  const res = await fetch(`${BASE_URL}/compare`, {
    method: "POST",
    headers: await authHeaders(getToken),
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  return handleResponse(res);
}