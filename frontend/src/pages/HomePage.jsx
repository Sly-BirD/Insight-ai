/**
 * src/pages/HomePage.jsx
 * ─────────────────────────────────────────────────────────────
 * Landing page — RESTORED to original design by teammate.
 * Only change: receives dark + setSection as props from parent.
 */

import { useState } from "react";
import { motion } from "framer-motion";

// ─── Constants ────────────────────────────────────────────────
const BENTO_CARDS = [
  { id: "dashboard", label: "Dashboard", icon: "◈", desc: "View your insurance trends and approval rates at a glance", size: "large", accent: "#8B8FA8" },
  { id: "workspace", label: "Workspace", icon: "⌖", desc: "Upload policies and ask questions — all in one place.", size: "large", accent: "#9CA3AF" },
  { id: "compare",   label: "Compare",   icon: "⇄", desc: "See exactly what changed between two policy versions", size: "small", accent: "#6B7280" },
  { id: "audit",     label: "Audit Log", icon: "≡", desc: "A secure log of all your previous searches and uploads.", size: "small", accent: "#9CA3AF" },
];

const WALKTHROUGH_STEPS = [
  { num: "01", title: "Upload Your Policies",  body: "Drag your insurance PDFs here. We'll read through the fine print for you in seconds.", tag: "Step 1" },
  { num: "02", title: "Ask Anything",          body: "Type a question like 'Is dental covered?' to get an instant answer backed by your document.", tag: "Step 2" },
  { num: "03", title: "Spot Differences",      body: "Compare two plans side-by-side to see new benefits or hidden removals.", tag: "Step 3" },
  { num: "04", title: "Keep Track",            body: "Every answer we provide is saved in your history so you can review it anytime.", tag: "Step 4" },
];

// ─── Hero Section ─────────────────────────────────────────────
function HeroSection({ dark, setSection }) {
  return (
    <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px 40px", position: "relative" }}>
      <motion.div initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} style={{ textAlign: "center", maxWidth: 680 }}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1, duration: 0.6 }} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 100, background: dark ? "rgba(148,163,184,0.07)" : "rgba(30,41,59,0.05)", border: dark ? "1px solid rgba(148,163,184,0.1)" : "1px solid rgba(30,41,59,0.08)", marginBottom: 32 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: dark ? "#64748b" : "#94a3b8" }}>Adaptive RAG · Insurance Intelligence</span>
        </motion.div>

        <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: "clamp(42px, 7vw, 88px)", fontWeight: 400, color: dark ? "#e2e8f0" : "#0f172a", margin: "0 0 24px", letterSpacing: "-0.04em", lineHeight: 1.05, fontStyle: "italic" }}>
          Your Policy, <br />Simplified.
        </h1>

        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, lineHeight: 1.75, color: dark ? "#475569" : "#64748b", margin: "0 0 40px", fontWeight: 300 }}>
          Stop digging through endless PDFs. Just ask about your plan like you're talking to a friend and get clear, verified answers straight from the source.
        </p>

        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => setSection("workspace")} style={{ padding: "14px 40px", borderRadius: 12, background: dark ? "#e2e8f0" : "#0f172a", color: dark ? "#0f172a" : "#e2e8f0", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 500, cursor: "pointer", letterSpacing: "0.01em" }}>
          Let's get started →
        </motion.button>
      </motion.div>
    </section>
  );
}

// ─── Bento Grid ───────────────────────────────────────────────
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

// ─── Walkthrough ──────────────────────────────────────────────
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

// ─── Footer ───────────────────────────────────────────────────
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

// ─── Main export ──────────────────────────────────────────────
export default function HomePage({ dark, setSection }) {
  return (
    <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
      <HeroSection dark={dark} setSection={setSection} />
      <BentoGrid dark={dark} setSection={setSection} />
      <Walkthrough dark={dark} />
      <Footer dark={dark} />
    </motion.div>
  );
}
