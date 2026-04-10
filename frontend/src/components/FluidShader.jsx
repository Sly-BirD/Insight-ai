/**
 * src/components/FluidShader.jsx
 * ─────────────────────────────────────────────────────────────
 * Animated canvas-based fluid particle background.
 * Extracted from InsightAI.jsx — original code by teammate.
 *
 * Only change: dark-mode alpha reduced ~30% so content panels
 * are readable without killing the visual effect.
 */

import { useEffect, useRef } from "react";

export default function FluidShader({ dark }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const timeRef = useRef(0);
  const frameRef = useRef(0);

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

    const COLS = 40, ROWS = 28;

    ctx.globalCompositeOperation = "lighter";

    const draw = () => {
      frameRef.current++;

      // Skip every alternate frame (~30 FPS)
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

          const wave = Math.sin((nx + ny) * 6 + t * 1.5);

          const jitterX =
            (Math.sin((r + c) * 2 + t * 2) + Math.cos(c * 3 + t)) * cellW * 0.25;

          const jitterY =
            (Math.cos((r - c) * 2 + t * 2) + Math.sin(r * 3 + t)) * cellH * 0.25;

          const x = c * cellW + jitterX;
          const y = r * cellH + jitterY;

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

          // Dark mode: reduced alpha so text stays readable
          const alpha = dark
            ? 0.15 + Math.abs(wave) * 0.12
            : 0.35 + Math.abs(wave) * 0.25;

          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.4, radius), 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${alpha})`;
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
        opacity: dark ? 0.9 : 0.85,
      }}
    />
  );
}
