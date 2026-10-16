"use client";

// Advisory RBAC helpers for gated controls (see usePermission in context/rbac-context).

// Wraps a control disabled by role so its reason shows on hover (a disabled
// Button has pointer-events: none, so its own title never fires).
export function RoleGate({ allowed, reason, children }) {
  if (allowed) return children;
  return (
    <span title={reason} className="inline-flex cursor-not-allowed">
      {children}
    </span>
  );
}

// Short "why is this disabled" line inside a gated dialog or panel.
export function RoleNote({ children }) {
  return <p className="rounded-md border border-border bg-surface-card px-3 py-2 text-xs text-text-secondary">{children}</p>;
}
