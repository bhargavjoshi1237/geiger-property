"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { MousePointer2, Pause, Play } from "lucide-react";
import { Button } from "@geiger/ui/button";
import { cn } from "@/lib/utils";
import { FRONT_PREVIEWS } from "./scenes";
import { AUTOMATION_PREVIEWS } from "./scenes_automation";
import { LEASING_PREVIEWS } from "./scenes_leasing";
import { OPERATIONS_PREVIEWS } from "./scenes_operations";

const PREVIEWS = { ...FRONT_PREVIEWS, ...AUTOMATION_PREVIEWS, ...LEASING_PREVIEWS, ...OPERATIONS_PREVIEWS };

// Timing: the cursor travels, presses, types a character at a time, then the result holds (holds are scaled by HOLD_SCALE).
const TICK_MS = 40;
const MOVE_MS = 480;
const PRESS_MS = 180;
const CHAR_MS = 34;
const HOLD_SCALE = 0.85;

function timing(entry) {
  const move = entry.cursor ? MOVE_MS : 0;
  const press = entry.click || entry.type ? PRESS_MS : 0;
  const typing = entry.type ? entry.state[entry.type].length * CHAR_MS : 0;
  return { move, press, total: move + press + typing + (entry.hold ?? 1200) * HOLD_SCALE };
}

// What the scene shows `ms` into a step: the previous state until the press lands, then the step's state (typed text revealed gradually).
function frameAt(script, step, ms) {
  const entry = script[step];
  const { move, press } = timing(entry);
  const acted = ms >= move + press;
  let state = acted ? entry.state : script[Math.max(0, step - 1)].state;
  if (entry.type && acted) {
    const full = entry.state[entry.type];
    state = { ...entry.state, [entry.type]: full.slice(0, Math.min(full.length, Math.floor((ms - move - press) / CHAR_MS) + 1)) };
  }
  return {
    state,
    pressing: Boolean(entry.click || entry.type) && ms >= move && !acted,
    highlight: entry.type && acted ? entry.type : entry.highlight,
  };
}

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const subscribeReducedMotion = (onChange) => {
  const media = window.matchMedia(reducedMotionQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const usePrefersReducedMotion = () => useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(reducedMotionQuery).matches, () => false);

// Plays a script while it is on screen; reduced motion shows each chosen point fully settled instead.
function useTimeline(script, ref) {
  const [time, setTime] = useState({ step: 0, ms: 0, loops: 0 });
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const reduced = usePrefersReducedMotion();
  const running = visible && !paused && !reduced;

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.4 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => {
      setTime(({ step, ms, loops }) => {
        if (ms + TICK_MS < timing(script[step]).total) return { step, ms: ms + TICK_MS, loops };
        const next = (step + 1) % script.length;
        return { step: next, ms: 0, loops: next === 0 ? loops + 1 : loops };
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [running, script]);

  const shown = reduced ? { step: paused ? time.step : script.length - 1, ms: Number.MAX_SAFE_INTEGER, loops: 0 } : time;
  return { time: shown, setTime, paused, setPaused, reduced };
}

// `onComplete` fires each time the script finishes a full loop, so a parent can move on to the next preview.
export default function AutoplayPreview({ demo, onComplete }) {
  const { script, Scene } = PREVIEWS[demo];
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const cursorRef = useRef(null);
  const targetRef = useRef(null);
  const { time, setTime, paused, setPaused, reduced } = useTimeline(script, rootRef);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { if (time.loops > 0) onCompleteRef.current?.(); }, [time.loops]);
  const entry = script[time.step];
  const frame = frameAt(script, time.step, time.ms);
  const usesCursor = script.some((s) => s.cursor);

  const chapters = [...new Set(script.map((s) => s.chapter))];
  const chapterIndex = chapters.indexOf(entry.chapter);
  const chapterProgress = (chapter) => {
    const steps = script.map((s, index) => ({ s, index })).filter(({ s }) => s.chapter === chapter);
    const total = steps.reduce((sum, { s }) => sum + timing(s).total, 0);
    const done = steps.reduce((sum, { s, index }) => sum + (index < time.step ? timing(s).total : index === time.step ? Math.min(time.ms, timing(s).total) : 0), 0);
    return done / total;
  };
  const jumpTo = (chapter) => { setTime(({ loops }) => ({ step: script.findIndex((s) => s.chapter === chapter), ms: 0, loops })); setPaused(reduced); };

  // Moves the cursor onto the current target; positions are written to the DOM so measuring never re-renders.
  const placeCursor = useCallback(() => {
    const stage = stageRef.current;
    const cursor = cursorRef.current;
    if (!stage || !cursor) return;
    const box = stage.getBoundingClientRect();
    const target = targetRef.current && stage.querySelector(`[data-part="${CSS.escape(targetRef.current)}"]`);
    if (!target) {
      cursor.style.transform = `translate(${box.width * 0.82}px, ${box.height * 0.9}px)`;
      return;
    }
    const rect = target.getBoundingClientRect();
    cursor.style.transform = `translate(${rect.left - box.left + Math.min(rect.width * 0.5, 120)}px, ${rect.top - box.top + rect.height * 0.55}px)`;
  }, []);

  useLayoutEffect(() => {
    if (entry.cursor || time.step === 0) targetRef.current = entry.cursor ?? null;
    placeCursor();
  }, [entry.cursor, time.step, placeCursor]);

  useEffect(() => {
    const observer = new ResizeObserver(placeCursor);
    if (stageRef.current) observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, [placeCursor]);

  return (
    <div ref={rootRef} className="flex w-full max-w-[420px] flex-col items-center gap-4">
      <div ref={stageRef} className="relative flex w-full justify-center">
        <Scene view={{ state: frame.state, highlight: frame.highlight }} />
        {usesCursor && !reduced ? (
          <div ref={cursorRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-20 transition-transform duration-[480ms] ease-[cubic-bezier(.45,0,.2,1)]">
            {frame.pressing ? <span className="absolute -left-2.5 -top-2.5 size-5 animate-ping rounded-full bg-foreground/30" /> : null}
            <MousePointer2 className={cn("size-5 fill-foreground text-background drop-shadow-md transition-transform duration-150", frame.pressing && "scale-[.82]")} />
          </div>
        ) : null}
      </div>
      <div className="w-full">
        <div className="flex items-start gap-3">
          <div className="flex flex-1 gap-1.5" role="group" aria-label="Preview steps">
            {chapters.map((chapter, index) => {
              const label = chapter.startsWith("step-") ? null : chapter;
              const fill = index < chapterIndex ? 1 : index === chapterIndex ? chapterProgress(chapter) : 0;
              return (
                <button key={chapter} type="button" onClick={() => jumpTo(chapter)} aria-label={`Play from ${label ?? `step ${index + 1}`}`} aria-current={index === chapterIndex ? "step" : undefined} className="group flex flex-1 flex-col gap-1.5 pt-2.5 text-left">
                  <span className="relative h-1 w-full overflow-hidden rounded-full bg-border transition-colors group-hover:bg-border-strong">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-foreground" style={{ width: `${fill * 100}%` }} />
                  </span>
                  {label ? <span className={cn("text-xs", index === chapterIndex ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span> : null}
                </button>
              );
            })}
          </div>
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setPaused(!paused)} aria-label={paused ? "Play preview" : "Pause preview"}>
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </Button>
        </div>
        <p className="mt-2 min-h-10 text-sm text-foreground" aria-live="polite">{entry.caption}</p>
      </div>
    </div>
  );
}
