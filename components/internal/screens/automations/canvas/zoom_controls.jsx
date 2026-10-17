"use client";

import { Panel, useReactFlow } from "@xyflow/react";
import { Lock, LockOpen, Magnet, Maximize, Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { CANVAS_FIT_VIEW, SNAP_SIZES } from "./graph";

const BTN = "p-2 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground";
const ON = "bg-surface-active text-foreground";

// Floating canvas controls (mirrors geiger-events / Notes): zoom in, out and fit, the snap toggle and grid size, and a
// lock that freezes nodes for read-only panning.
export function ZoomControls({ snap, onSnapChange, snapSize, onSnapSizeChange, locked, onLockedChange }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  // Cycles 8 → 16 → 24 → 8; changing the size implies snapping on.
  const cycleSnapSize = () => {
    onSnapSizeChange(SNAP_SIZES[(SNAP_SIZES.indexOf(snapSize) + 1) % SNAP_SIZES.length]);
    if (!snap) onSnapChange(true);
  };

  return (
    <Panel position="bottom-left">
      <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface-card/80 shadow-xl backdrop-blur-md">
        <button type="button" aria-label="Zoom in" onClick={() => zoomIn({ duration: 300 })} className={BTN}>
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomOut({ duration: 300 })} className={cn(BTN, "border-t border-border")}>
          <Minus className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Fit view" onClick={() => fitView({ duration: 300, ...CANVAS_FIT_VIEW })} className={cn(BTN, "border-t border-border")}>
          <Maximize className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={snap ? "Turn snapping off" : "Turn snapping on"}
          aria-pressed={snap}
          onClick={() => onSnapChange(!snap)}
          className={cn(BTN, "border-t border-border-strong", snap && ON)}
        >
          <Magnet className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={`Snap grid: ${snapSize}px — change`}
          onClick={cycleSnapSize}
          className={cn(BTN, "border-t border-border text-center text-[11px] font-medium leading-4 tabular-nums", snap && ON)}
        >
          {snapSize}
        </button>
        <button
          type="button"
          aria-label={locked ? "Unlock canvas" : "Lock canvas"}
          aria-pressed={locked}
          onClick={() => onLockedChange(!locked)}
          className={cn(BTN, "border-t border-border-strong", locked && ON)}
        >
          {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
        </button>
      </div>
    </Panel>
  );
}

export default ZoomControls;
