import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, LayoutGroup } from "framer-motion";


import WorkspaceModule from "./pages/Workspace.jsx";
import DashboardModule from "./pages/Dashboard.jsx";
import AuditModule     from "./pages/Audit.jsx";
import CompareModule from "./pages/Compare.jsx";
import AuthGuard  from "./components/AuthGuard.jsx";
import UserButton from "./components/UserButton.jsx";


// ─── API CONFIG ───────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:8000";

async function apiQuery(question) {
  const res = await fetch(`${API_BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiIngest(files) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const res = await fetch(`${API_BASE}/ingest`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return res.ok;
}

// ─── APP CONTEXT ────────────────────────────────────────────────────────────
import { AppContext, AppProvider, useApp } from "./context/AppContext.jsx";


// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const SECTIONS = ["home", "dashboard", "upload", "query", "compare", "audit"];

const BENTO_CARDS = [
  { id: "dashboard", label: "Dashboard", icon: "◈", desc: "At-a-glance analytics, approval rates, and trend charts.", size: "large", accent: "#8B8FA8" },
  { id: "workspace", label: "Workspace", icon: "⌖", desc: "Upload policy documents and query them — all in one place.", size: "large", accent: "#9CA3AF" },
  { id: "compare",   label: "Compare",   icon: "⇄", desc: "Side-by-side tabular diff across policy versions.",      size: "small",  accent: "#6B7280" },
  { id: "audit",     label: "Audit Log", icon: "≡", desc: "Searchable, high-density activity and decision log.",    size: "small",  accent: "#9CA3AF" },
];

const WALKTHROUGH_STEPS = [
  { num: "01", title: "Upload Your Policy Documents",   body: "Drag one or more insurance policy PDFs into the Upload zone. InsightAI parses clauses, exclusions, and riders in seconds.", tag: "Ingestion" },
  { num: "02", title: "Run a Natural-Language Query",   body: "Type a plain-English question — 'What is the waiting period for pre-existing diseases?' — and the Query engine returns a structured Decision Card with justifications drawn directly from the document.", tag: "Analysis" },
  { num: "03", title: "Compare Policy Versions",        body: "Select two documents and switch to Compare view. A tabular diff highlights additions, removals, and changed clauses row-by-row.", tag: "Comparison" },
  { num: "04", title: "Review the Audit Log",           body: "Every query, decision, and upload is timestamped and stored in the Audit Log. Filter by user, date range, or decision outcome.", tag: "Compliance" },
];

// ─── SHADER / FLUID BACKGROUND ───────────────────────────────────────────────
function FluidShader({ dark }) {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);
  const timeRef   = useRef(0);
  const frameRef  = useRef(0); // ✅ frame skipping

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let W, H;
    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener("resize", resize);

    // ✅ Reduced density (balanced)
    const COLS = 40, ROWS = 28;

    ctx.globalCompositeOperation = "lighter";

    const draw = () => {
      frameRef.current++;

      // ✅ Skip every alternate frame (~30 FPS)
      if (frameRef.current % 2 !== 0) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      timeRef.current += 0.002;
      const t = timeRef.current;

      ctx.clearRect(0, 0, W, H);

      const cellW = W / COLS;
      const cellH = H / ROWS;

      for (let r = 0; r <= ROWS; r++) {
        for (let c = 0; c <= COLS; c++) {

          const nx = c / COLS;
          const ny = r / ROWS;

          // ✅ Lighter wave calculation (less CPU heavy)
          const wave = Math.sin((nx + ny) * 6 + t * 1.5);

          // ✅ Organic jitter
          const jitterX =
            (Math.sin((r + c) * 2 + t * 2) + Math.cos(c * 3 + t)) * cellW * 0.25;

          const jitterY =
            (Math.cos((r - c) * 2 + t * 2) + Math.sin(r * 3 + t)) * cellH * 0.25;

          const x = c * cellW + jitterX;
          const y = r * cellH + jitterY;

          // ✅ Random size variation
          const randomFactor = Math.sin((c * 12.9898 + r * 78.233) * 43758.5453);
          const radius =
            (dark ? 1.1 : 1.3) +
            wave * 0.6 +
            (randomFactor % 1) * 0.6;

          // Colors
          const hue = (nx * 360 + t * 60 + wave * 40) % 360;
          
          const sat = dark
            ? 65 + Math.abs(wave) * 25
            : 75 + Math.abs(wave) * 20;

          const lum = dark 
            ? 35 + wave * 8
            : 50 + wave * 6;

          const alpha = dark
            ? 0.22 + Math.abs(wave) * 0.2
            : 0.35 + Math.abs(wave) * 0.25;

          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.4, radius), 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${alpha})`;

          // ❌ Removed heavy shadow blur (major lag source)
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };

  }, [dark]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
        opacity: dark ? 1 : 0.9
      }}
    />
  );
}

// ─── API STATUS DOT ───────────────────────────────────────────────────────────
function ApiStatusDot({ dark }) {
  const [online, setOnline] = useState(null); // null=checking, true=up, false=down

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const ok = await apiHealth();
        if (active) setOnline(ok);
      } catch {
        if (active) setOnline(false);
      }
    };
    check();
    const interval = setInterval(check, 30000); // recheck every 30s
    return () => { active = false; clearInterval(interval); };
  }, []);

  const color = online === null ? "#f59e0b" : online ? "#22c55e" : "#ef4444";
  const label = online === null ? "Checking…" : online ? " " : " ";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }} title={label}>
      <motion.div
        animate={{ opacity: online === true ? [1, 0.3, 1] : 1 }}
        transition={{ repeat: Infinity, duration: 2 }}
        style={{ width: 7, height: 7, borderRadius: "50%", background: color }}
      />
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: dark ? "#334155" : "#94a3b8", letterSpacing: "0.04em" }}>
        {label}
      </span>
    </div>
  );
}

// ─── TITLE BAR ────────────────────────────────────────────────────────────────
function TitleBar({ dark, setDark, activeSection, setSection, notifications }) {
  const crumbs = activeSection === "home"
    ? ["Home"]
    : ["Home", BENTO_CARDS.find(c => c.id === activeSection)?.label ?? activeSection];

  return (
    <motion.header
      initial={{ y: -64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, height: 56, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px",
        background: dark ? "rgba(5,5,5,0.82)" : "rgba(249,250,251,0.82)",
        backdropFilter: "blur(20px) saturate(180%)",
        borderBottom: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.07)",
      }}
    >
      <button onClick={() => setSection("home")} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: dark ? "#1a1a2e" : "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", border: dark ? "1px solid rgba(255,255,255,0.12)" : "none" }}>
          <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 700 }}>Ai</span>
        </div>
        <span style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 15, fontWeight: 400, color: dark ? "#e2e8f0" : "#0f172a", letterSpacing: "0.02em" }}>InsightAI</span>
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'DM Mono', monospace", fontSize: 11, color: dark ? "#64748b" : "#94a3b8", letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {crumbs.map((c, i) => (
          <span key={c} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <span style={{ opacity: 0.4 }}>/</span>}
            <motion.span key={c} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ color: i === crumbs.length - 1 ? (dark ? "#cbd5e1" : "#334155") : undefined, cursor: i === 0 ? "pointer" : "default" }} onClick={i === 0 ? () => setSection("home") : undefined}>
              {c}
            </motion.span>
          </span>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <ApiStatusDot dark={dark} />
        <button style={{ position: "relative", background: "none", border: "none", cursor: "pointer", width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: dark ? "#64748b" : "#94a3b8" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" /></svg>
          {notifications > 0 && <span style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: "50%", background: "#ef4444", border: `1.5px solid ${dark ? "#050505" : "#f9fafb"}` }} />}
        </button>
        <button onClick={() => setDark(d => !d)} style={{ width: 44, height: 24, borderRadius: 12, background: dark ? "#1e293b" : "#e2e8f0", border: dark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)", cursor: "pointer", position: "relative", transition: "background 0.3s" }}>
          <motion.div animate={{ x: dark ? 22 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} style={{ position: "absolute", top: 2, width: 18, height: 18, borderRadius: "50%", background: dark ? "#94a3b8" : "#64748b" }} />
        </button>
        <UserButton dark={dark} />
      </div> 
    </motion.header>
  );
}

// ─── LEFT SIDEBAR ─────────────────────────────────────────────────────────────
function LeftSidebar({ activeSection, setSection, dark }) {
  const visible = activeSection !== "home";
  const items   = BENTO_CARDS.map(c => ({ id: c.id, label: c.label, icon: c.icon }));

  return (
    <AnimatePresence>
      {visible && (
        <motion.nav
          initial={{ x: -80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
          style={{ position: "fixed", left: 0, top: 56, bottom: 0, width: 200, zIndex: 90, display: "flex", flexDirection: "column", padding: "24px 0", background: dark ? "rgba(15,15,15,0.95)" : "rgba(255,255,255,0.95)", backdropFilter: "blur(24px) saturate(200%)", borderRight: dark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)", overflowY: "auto" }}
        >
          {items.map((item, i) => (
            <motion.button
              key={item.id}
              onClick={() => setSection(item.id)}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{
                background: activeSection === item.id ? (dark ? "rgba(148,163,184,0.12)" : "rgba(30,41,59,0.08)") : "transparent",
                border: activeSection === item.id ? (dark ? "1px solid rgba(148,163,184,0.2)" : "1px solid rgba(30,41,59,0.12)") : "1px solid transparent",
                color: activeSection === item.id ? (dark ? "#e2e8f0" : "#0f172a") : (dark ? "#475569" : "#94a3b8"),
                padding: "12px 16px",
                margin: "6px 12px",
                borderRadius: 10,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                fontWeight: activeSection === item.id ? 500 : 400,
                transition: "all 0.2s",
              }}
              whileHover={{ background: dark ? "rgba(148,163,184,0.08)" : "rgba(30,41,59,0.06)", paddingLeft: "20px" }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <span>{item.label}</span>
            </motion.button>
          ))}

          <div style={{ height: 1, background: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", margin: "12px 0" }} />

          <motion.button
            onClick={() => setSection("home")}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: items.length * 0.05 }}
            style={{
              background: "transparent",
              border: "1px solid transparent",
              color: dark ? "#475569" : "#94a3b8",
              padding: "12px 16px",
              margin: "6px 12px",
              borderRadius: 10,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14,
              fontWeight: 400,
              transition: "all 0.2s",
            }}
            whileHover={{ background: dark ? "rgba(148,163,184,0.08)" : "rgba(30,41,59,0.06)", paddingLeft: "20px" }}
          >
            <span style={{ fontSize: 16 }}>⌂</span>
            <span>Home</span>
          </motion.button>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}

// ─── FLOATING DOCK ────────────────────────────────────────────────────────────
function FloatingDock({ activeSection, setSection, dark }) {
  const visible = activeSection !== "home";
  const mouseX  = useMotionValue(Infinity);
  const items   = BENTO_CARDS.map(c => ({ id: c.id, label: c.label, icon: c.icon }));

  return (
    <AnimatePresence>
      {visible && (
        <motion.nav
          initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
          onMouseMove={(e) => mouseX.set(e.pageX)} onMouseLeave={() => mouseX.set(Infinity)}
          style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 200, display: "flex", alignItems: "flex-end", gap: 8, padding: "10px 16px", borderRadius: 20, background: dark ? "rgba(15,15,15,0.88)" : "rgba(255,255,255,0.88)", backdropFilter: "blur(24px) saturate(200%)", border: dark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)", boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.6)" : "0 8px 32px rgba(0,0,0,0.12)" }}
        >
          {items.map(item => <DockItem key={item.id} item={item} active={activeSection === item.id} dark={dark} mouseX={mouseX} onClick={() => setSection(item.id)} />)}
          <div style={{ width: 1, height: 32, alignSelf: "center", background: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", margin: "0 4px" }} />
          <DockItem item={{ id: "home", label: "Home", icon: "⌂" }} active={false} dark={dark} mouseX={mouseX} onClick={() => setSection("home")} />
        </motion.nav>
      )}
    </AnimatePresence>
  );
}

function DockItem({ item, active, dark, mouseX, onClick }) {
  const ref      = useRef(null);
  const distance = useMotionValue(Infinity);
  const size     = useSpring(useTransform(distance, [-120, 0, 120], [36, 52, 36]), { stiffness: 300, damping: 28 });

  useEffect(() => {
    const unsub = mouseX.on("change", (x) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      distance.set(x - (rect.left + rect.width / 2));
    });
    return unsub;
  }, [mouseX, distance]);

  return (
    <motion.button ref={ref} onClick={onClick} style={{ width: size, height: size, borderRadius: 10, background: active ? (dark ? "rgba(148,163,184,0.15)" : "rgba(30,41,59,0.08)") : "transparent", border: active ? (dark ? "1px solid rgba(148,163,184,0.2)" : "1px solid rgba(30,41,59,0.12)") : "1px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 2, color: active ? (dark ? "#e2e8f0" : "#0f172a") : (dark ? "#475569" : "#94a3b8"), transition: "color 0.2s, background 0.2s", fontSize: 16, flexShrink: 0 }} title={item.label}>
      <span style={{ fontSize: 14, lineHeight: 1 }}>{item.icon}</span>
    </motion.button>
  );
}

// ─── HERO SECTION ─────────────────────────────────────────────────────────────
function HeroSection({ dark, setSection }) {
  return (
    <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px 40px", position: "relative" }}>
      <motion.div initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} style={{ textAlign: "center", maxWidth: 680 }}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1, duration: 0.6 }} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 100, background: dark ? "rgba(148,163,184,0.07)" : "rgba(30,41,59,0.05)", border: dark ? "1px solid rgba(148,163,184,0.1)" : "1px solid rgba(30,41,59,0.08)", marginBottom: 32 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: dark ? "#64748b" : "#94a3b8" }}>Adaptive RAG · Insurance Intelligence</span>
        </motion.div>

        <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: "clamp(42px, 7vw, 88px)", fontWeight: 400, color: dark ? "#e2e8f0" : "#0f172a", margin: "0 0 24px", letterSpacing: "-0.04em", lineHeight: 1.05, fontStyle: "italic" }}>
          Understand every<br />policy clause.
        </h1>

        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, lineHeight: 1.75, color: dark ? "#475569" : "#64748b", margin: "0 0 40px", fontWeight: 300 }}>
          InsightAI parses Indian health insurance documents and answers natural-language queries with clause-level citations, confidence scores, and faithfulness audits.
        </p>

        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => setSection("workspace")} style={{ padding: "14px 40px", borderRadius: 12, background: dark ? "#e2e8f0" : "#0f172a", color: dark ? "#0f172a" : "#e2e8f0", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 500, cursor: "pointer", letterSpacing: "0.01em" }}>
          Let's get started →
        </motion.button>
      </motion.div>
    </section>
  );
}

// ─── BENTO GRID ───────────────────────────────────────────────────────────────
function BentoGrid({ dark, setSection }) {
  return (
    <section style={{ padding: "0 24px 100px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "auto auto", gap: 12 }}>
        {BENTO_CARDS.map((card, i) => (
          <motion.div key={card.id} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }} whileHover={{ borderColor: dark ? "rgba(148,163,184,0.15)" : "rgba(30,41,59,0.15)", y: -2 }} onClick={() => setSection(card.id)}
            style={{ gridColumn: i === 0 ? "span 2" : "span 1", padding: i === 0 ? "32px" : "24px", borderRadius: 16, background: dark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.02)", border: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)", cursor: "pointer", position: "relative", overflow: "hidden", minHeight: i === 0 ? 180 : 150, transition: "border-color 0.3s" }}>
            <div style={{ position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: "50%", background: `radial-gradient(circle, ${card.accent}18, transparent 70%)`, pointerEvents: "none" }} />
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: i === 0 ? 24 : 18, color: dark ? "#475569" : "#94a3b8", marginBottom: 12, lineHeight: 1 }}>{card.icon}</div>
            <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: i === 0 ? 22 : 16, fontWeight: 400, color: dark ? "#e2e8f0" : "#1e293b", marginBottom: 8, letterSpacing: "-0.01em" }}>{card.label}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.6, color: dark ? "#334155" : "#94a3b8", fontWeight: 300 }}>{card.desc}</div>
            <div style={{ position: "absolute", bottom: 16, right: 16, fontFamily: "'DM Mono', monospace", fontSize: 10, color: dark ? "#1e293b" : "#e2e8f0", letterSpacing: "0.06em", textTransform: "uppercase" }}>Open →</div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ─── WALKTHROUGH ──────────────────────────────────────────────────────────────
function Walkthrough({ dark }) {
  return (
    <section style={{ padding: "60px 24px 100px", maxWidth: 760, margin: "0 auto" }}>
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }} style={{ marginBottom: 56, textAlign: "center" }}>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: dark ? "#334155" : "#94a3b8", marginBottom: 16 }}>Implementation Flow</p>
        <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 400, color: dark ? "#e2e8f0" : "#0f172a", margin: 0, fontStyle: "italic", letterSpacing: "-0.02em" }}>How InsightAI works</h2>
      </motion.div>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 28, top: 0, bottom: 0, width: 1, background: dark ? "linear-gradient(to bottom, transparent, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.06) 80%, transparent)" : "linear-gradient(to bottom, transparent, rgba(0,0,0,0.06) 20%, rgba(0,0,0,0.06) 80%, transparent)" }} />
        {WALKTHROUGH_STEPS.map((step, i) => (
          <motion.div key={step.num} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }} style={{ display: "flex", gap: 32, marginBottom: 48, alignItems: "flex-start" }}>
            <div style={{ width: 56, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: dark ? "#334155" : "#cbd5e1", border: dark ? "2px solid #1e293b" : "2px solid #f1f5f9", position: "relative", zIndex: 1 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: dark ? "#1e293b" : "#e2e8f0", letterSpacing: "0.08em" }}>{step.num}</span>
                <span style={{ padding: "2px 8px", borderRadius: 4, background: dark ? "rgba(148,163,184,0.06)" : "rgba(30,41,59,0.04)", border: dark ? "1px solid rgba(148,163,184,0.1)" : "1px solid rgba(30,41,59,0.08)", fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: dark ? "#64748b" : "#94a3b8" }}>{step.tag}</span>
              </div>
              <h3 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 20, fontWeight: 400, color: dark ? "#cbd5e1" : "#1e293b", margin: "0 0 10px", letterSpacing: "-0.01em" }}>{step.title}</h3>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.75, color: dark ? "#475569" : "#64748b", margin: 0, fontWeight: 300 }}>{step.body}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ─── FOOTER ───────────────────────────────────────────────────────────────────
function Footer({ dark }) {
  const [hoveredChar, setHoveredChar] = useState(null);
  const brand = "InsightAI";
  return (
    <footer style={{ borderTop: dark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.06)", padding: "80px 24px 48px", position: "relative", overflow: "hidden" }}>
      <div style={{ textAlign: "center", marginBottom: 48, userSelect: "none" }}>
        <div style={{ display: "inline-flex", fontFamily: "'DM Serif Display', Georgia, serif", fontSize: "clamp(56px, 10vw, 120px)", fontWeight: 400, letterSpacing: "-0.04em", fontStyle: "italic", lineHeight: 1 }}>
          {brand.split("").map((char, i) => (
            <motion.span key={i} onHoverStart={() => setHoveredChar(i)} onHoverEnd={() => setHoveredChar(null)} animate={{ color: hoveredChar === i ? (dark ? "#94a3b8" : "#475569") : dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", y: hoveredChar === i ? -8 : 0, scale: hoveredChar === i ? 1.05 : 1 }} transition={{ duration: 0.2 }} style={{ display: "inline-block", cursor: "default" }}>{char}</motion.span>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 32, maxWidth: 900, margin: "0 auto 48px" }}>
        {[{ label: "Product", links: ["Dashboard", "Upload", "Query", "Compare", "Audit Log"] }, { label: "Company", links: ["About", "Blog", "Careers", "Press"] }, { label: "Legal", links: ["Privacy", "Terms", "Security", "Compliance"] }, { label: "Support", links: ["Docs", "Status", "Contact", "API Reference"] }].map(col => (
          <div key={col.label}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: dark ? "#334155" : "#94a3b8", marginBottom: 16 }}>{col.label}</p>
            {col.links.map(link => <div key={link} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: dark ? "#475569" : "#64748b", marginBottom: 10, cursor: "pointer", fontWeight: 300 }}>{link}</div>)}
          </div>
        ))}
      </div>
      <div style={{ borderTop: dark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.05)", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 900, margin: "0 auto", flexWrap: "wrap", gap: 12 }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: dark ? "#7a808bc3" : "#2d333b8f", letterSpacing: "0.04em" }}>© 2025 InsightAI Inc.</span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: dark ? "#7a808bc3" : "#2d333b8f", letterSpacing: "0.04em" }}>v2.0.0 · Adaptive RAG</span>
      </div>
    </footer>
  );
}

// ─── DASHBOARD MODULE (static — future: connect to real metrics) ──────────────


// ─── UPLOAD MODULE — connected to POST /ingest ────────────────────────────────


// ─── QUERY MODULE — connected to POST /query ──────────────────────────────────


// ─── COMPARE MODULE (static UI — future: accept two uploaded docs) ────────────


// ─── AUDIT MODULE (static UI — future: pull from backend audit log) ───────────


// ─── MODULE WRAPPER ────────────────────────────────────────────────────────────
const MODULE_MAP = {
  dashboard: DashboardModule,
  workspace: WorkspaceModule,  // ← replaces upload + query
  compare:   CompareModule,
  audit:     AuditModule,
};


function ModuleView({ id, dark, setSection }) {
  const Component = MODULE_MAP[id];
  const card      = BENTO_CARDS.find(c => c.id === id);
  return (
    <motion.div key={id} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} style={{ padding: "80px 24px 0" }}>
      <div style={{ maxWidth: 960, margin: "0 auto 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, color: dark ? "#334155" : "#94a3b8" }}>{card?.icon}</span>
          <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 32, fontWeight: 400, fontStyle: "italic", color: dark ? "#e2e8f0" : "#0f172a", margin: 0, letterSpacing: "-0.02em" }}>{card?.label}</h2>
        </div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 300, color: dark ? "#334155" : "#94a3b8", margin: 0 }}>{card?.desc}</p>
      </div>
      {Component && <Component dark={dark} setSection={setSection} />}
    </motion.div>
  );
}

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
function HomePage({ dark, setSection }) {
  return (
    <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
      <HeroSection dark={dark} setSection={setSection} />
      <BentoGrid dark={dark} setSection={setSection} />
      <Walkthrough dark={dark} />
      <Footer dark={dark} />
    </motion.div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
// export default function App() {
//   const [dark,          setDark]          = useState(true);
//   const [activeSection, setActiveSection] = useState("home");
//   const [notifications]                  = useState(3);

//   const setSection = useCallback((id) => {
//     setActiveSection(id);
//     window.scrollTo({ top: 0, behavior: "smooth" });
//   }, []);

//   return (
//     <AppProvider>
//       <AppContext.Provider value={{ dark, setDark, activeSection, setSection }}>
//         <style>{`
//           @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');
//           *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
//           html { scroll-behavior: smooth; }
//           body { overflow-x: hidden; }
//           input::placeholder { color: inherit; opacity: 0.4; }
//           @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
//           ::-webkit-scrollbar { width: 4px; }
//           ::-webkit-scrollbar-track { background: transparent; }
//           ::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.15); border-radius: 2px; }
//         `}</style>

//         <div style={{ minHeight: "100vh", background: dark ? "#050505" : "#F9FAFB", color: dark ? "#e2e8f0" : "#0f172a", transition: "background 0.4s, color 0.4s", position: "relative" }}>
//           <FluidShader dark={dark} />
//           <div style={{ position: "relative", zIndex: 1, marginLeft: activeSection !== "home" ? 200 : 0, transition: "margin-left 0.3s" }}>
//             <TitleBar dark={dark} setDark={setDark} activeSection={activeSection} setSection={setSection} notifications={notifications} />
//             <LayoutGroup>
//               <AnimatePresence mode="wait">
//                 {activeSection === "home" ? <HomePage key="home" dark={dark} setSection={setSection} /> : <ModuleView key={activeSection} id={activeSection} dark={dark} setSection={setSection} />}
//               </AnimatePresence>
//             </LayoutGroup>
//           </div>
//           <LeftSidebar activeSection={activeSection} setSection={setSection} dark={dark} />
//         </div>
//       </AppContext.Provider>
//     </AppProvider>
//   );
// }

// Inner component — can safely call useApp() because it's inside AppProvider
function AppInner() {
  const { dark, setDark, activeSection, setSection, notifications } = useApp();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { overflow-x: hidden; }
        input::placeholder { color: inherit; opacity: 0.4; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.15); border-radius: 2px; }
      `}</style>
      <div style={{ minHeight: "100vh", background: dark ? "#050505" : "#F9FAFB", color: dark ? "#e2e8f0" : "#0f172a", transition: "background 0.4s, color 0.4s", position: "relative" }}>
        <FluidShader dark={dark} />
        <div style={{ position: "relative", zIndex: 1, marginLeft: activeSection !== "home" ? 200 : 0, transition: "margin-left 0.3s" }}>
          <TitleBar dark={dark} setDark={setDark} activeSection={activeSection} setSection={setSection} notifications={notifications} />
          <LayoutGroup>
            <AnimatePresence mode="wait">
              {activeSection === "home"
                ? <HomePage key="home" dark={dark} setSection={setSection} />
                : (
                  <AuthGuard dark={dark}>
                    <ModuleView key={activeSection} id={activeSection} dark={dark} setSection={setSection} />
                  </AuthGuard>
                )}
            </AnimatePresence>
          </LayoutGroup>
        </div>
        <LeftSidebar activeSection={activeSection} setSection={setSection} dark={dark} />
      </div>
    </>
  );
}

// Outer shell — just provides context, no state of its own
export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}