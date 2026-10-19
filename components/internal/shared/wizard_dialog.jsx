"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@geiger/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@geiger/ui/dialog";
import { cn } from "@/lib/utils";
import { FieldsForm, missingRequired } from "@/components/internal/screens/entity/fields_form";

// Multi-step dialog for lifecycle flows (move-out, renewal, eviction…).
// steps: [{ key, title, description?, fields?, render?({ values, set }), validate?(values) → message }]
// onFinish(values) → truthy on success (dialog closes) or falsy to stay open.
const GHOST = "text-muted-foreground hover:bg-surface-active hover:text-foreground";

export function WizardDialog({
  open,
  onOpenChange,
  title,
  description,
  steps,
  initial = {},
  onFinish,
  finishLabel = "Finish",
}) {
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);

  // Reset whenever the dialog reopens (render-phase reset).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setIndex(0);
      setValues(initial);
      setBusy(false);
    }
  }

  const visibleSteps = steps.filter((s) => (s.showIf ? s.showIf(values) : true));
  const step = visibleSteps[Math.min(index, visibleSteps.length - 1)];
  const last = index >= visibleSteps.length - 1;
  const set = (partial) => setValues((v) => ({ ...v, ...partial }));

  const check = () => {
    const missing = step.fields ? missingRequired(values, step.fields, true) : [];
    if (missing.length) {
      toast.error(`Fill in ${missing.join(", ")}.`);
      return false;
    }
    const message = step.validate?.(values);
    if (message) {
      toast.error(message);
      return false;
    }
    return true;
  };

  const next = async () => {
    if (!check()) return;
    if (!last) {
      setIndex((i) => i + 1);
      return;
    }
    setBusy(true);
    const ok = await onFinish?.(values);
    setBusy(false);
    if (ok !== false) onOpenChange(false);
  };

  if (!step) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="gap-0 overflow-hidden bg-background p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-0.5 border-b border-border p-5 text-left">
          <DialogTitle className="text-base">{title}</DialogTitle>
          {description ? <DialogDescription className="text-xs">{description}</DialogDescription> : null}
        </DialogHeader>

        {visibleSteps.length > 1 ? (
          <ol className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface-subtle/30 px-5 py-3">
            {visibleSteps.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold",
                    i < index && "border-border-strong bg-surface-active text-foreground",
                    i === index && "border-border-strong bg-primary text-primary-foreground",
                    i > index && "border-border text-text-tertiary",
                  )}
                >
                  {i < index ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className={i === index ? "font-medium text-foreground" : "text-text-secondary"}>
                  {s.title}
                </span>
              </li>
            ))}
          </ol>
        ) : null}

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-5">
          {step.description ? <p className="text-sm text-text-secondary">{step.description}</p> : null}
          {step.fields ? (
            <FieldsForm item={values} fields={step.fields} onPatch={set} onCommit={set} flat />
          ) : null}
          {step.render ? step.render({ values, set }) : null}
        </div>

        <DialogFooter className="border-t border-border bg-surface-subtle/40 px-5 py-4">
          {index > 0 ? (
            <Button variant="ghost" className={GHOST} disabled={busy} onClick={() => setIndex((i) => i - 1)}>
              Back
            </Button>
          ) : (
            <Button variant="ghost" className={GHOST} disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={next}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {last ? finishLabel : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default WizardDialog;
