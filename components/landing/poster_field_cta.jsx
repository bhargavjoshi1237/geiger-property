"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { PROPERTY_POSTERS } from "./property_posters";
import styles from "./landing.module.css";

// Closing CTA over a hand-placed (SSR-stable) property-card scatter; `d` is depth 1 (far) to 3 (near), `m` keeps the card on mobile.
const POSITIONS = [
  // Left flank
  { x: 8, y: 12, d: 2, r: -7, m: true },
  { x: 19, y: 27, d: 3, r: 5, m: false },
  { x: 4, y: 45, d: 1, r: 9, m: false },
  { x: 14, y: 63, d: 3, r: -4, m: false },
  { x: 24, y: 82, d: 2, r: 7, m: true },
  { x: 4, y: 89, d: 1, r: -6, m: false },
  // Right flank
  { x: 92, y: 14, d: 2, r: 6, m: true },
  { x: 80, y: 29, d: 3, r: -5, m: false },
  { x: 96, y: 47, d: 1, r: -9, m: false },
  { x: 86, y: 64, d: 3, r: 4, m: false },
  { x: 75, y: 84, d: 2, r: -7, m: true },
  { x: 96, y: 90, d: 1, r: 5, m: false },
  // Top band, free to cross the centre column since the copy starts below it
  { x: 38, y: 6, d: 1, r: 4, m: true },
  { x: 55, y: 4, d: 2, r: -6, m: true },
  { x: 68, y: 10, d: 1, r: 8, m: false },
  // Bottom band
  { x: 40, y: 94, d: 2, r: -5, m: true },
  { x: 58, y: 96, d: 1, r: 7, m: false },
  { x: 66, y: 90, d: 1, r: -3, m: false },
];

// Per-layer size, parallax travel and atmosphere; far cards move least.
const LAYERS = {
  1: { width: "clamp(4.5rem, 7vw, 7rem)", travel: 4, className: "opacity-40 blur-[1.5px]" },
  2: { width: "clamp(5.5rem, 9vw, 9.5rem)", travel: 10, className: "opacity-70 blur-[0.4px]" },
  3: { width: "clamp(6.5rem, 11vw, 12rem)", travel: 18, className: "opacity-100" },
};

// Light outer ring around a rounded tile so a flat card reads as a physical object.
function PosterCard({ children }) {
  return (
    <div className="rounded-[14%] bg-white/[0.07] p-[3.5%] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/[0.08]">
      {/* Card type is sized in % of the card via a container query, so it scales with every layer */}
      <div className="aspect-square overflow-hidden rounded-[11%] [container-type:inline-size]">
        <div className="h-full w-full" style={{ fontSize: "100cqw" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function PosterFieldCta({ dashboardHref = "/org" }) {
  const fieldRef = useRef(null);

  // Cursor parallax via two CSS custom properties, so pointer moves never re-render.
  useEffect(() => {
    const node = fieldRef.current;
    if (!node) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    if (!window.matchMedia?.("(pointer: fine)").matches) return undefined;

    let frame = 0;
    const onMove = (e) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = node.getBoundingClientRect();
        if (!box.width || !box.height) return;
        node.style.setProperty("--px", String(((e.clientX - box.left) / box.width - 0.5) * 2));
        node.style.setProperty("--py", String(((e.clientY - box.top) / box.height - 0.5) * 2));
      });
    };
    const onLeave = () => {
      node.style.setProperty("--px", "0");
      node.style.setProperty("--py", "0");
    };

    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    // Always dark: the cards are authored for a night backdrop in both themes.
    <section
      ref={fieldRef}
      className="dark relative isolate overflow-hidden border-t border-white/10 bg-[#080808] px-4 py-28 sm:px-6 sm:py-36"
      style={{ "--px": "0", "--py": "0" }}
    >
      <div aria-hidden className="absolute inset-0 -z-10">
        {POSITIONS.map((pos, i) => {
          const layer = LAYERS[pos.d];
          const { Art, key } = PROPERTY_POSTERS[i % PROPERTY_POSTERS.length];
          return (
            <div
              key={`${key}-${i}`}
              className={cn("absolute -translate-x-1/2 -translate-y-1/2", !pos.m && "hidden sm:block")}
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: layer.width }}
            >
              <div
                className={layer.className}
                style={{
                  transform: `translate3d(calc(var(--px) * ${layer.travel}px), calc(var(--py) * ${layer.travel}px), 0)`,
                  transition: "transform 400ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                <div
                  className={styles.posterDrift}
                  style={{ rotate: `${pos.r}deg`, animationDelay: `${(i % 7) * -1.9}s`, animationDuration: `${16 + (i % 5) * 3}s` }}
                >
                  <PosterCard>
                    <Art />
                  </PosterCard>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Holds the headline's contrast whatever card lands behind it */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_46%_54%_at_50%_50%,#080808_38%,#080808cc_58%,transparent_78%)]" />

      <div className="relative mx-auto flex max-w-2xl flex-col items-center text-center">
        <h2 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Bring your portfolio over</h2>
        <p className="mt-5 max-w-md text-balance text-sm text-zinc-400 sm:text-base">
          Add your first property now, and invite residents and owners when you&apos;re ready.
        </p>
        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row">
          <Link
            href={dashboardHref}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            Add a property
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="#playground"
            className="inline-flex h-11 items-center rounded-full border border-white/15 px-6 text-sm font-medium text-zinc-200 transition-colors hover:border-white/30 hover:bg-white/5"
          >
            Try the playground
          </Link>
        </div>
      </div>
    </section>
  );
}

export default PosterFieldCta;
