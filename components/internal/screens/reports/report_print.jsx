"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import { alignOf, cellText } from "@/lib/reports/format";
import { rowsWithTotals } from "@/lib/reports/csv";

// Print-optimized report layout. Mounted into <body> only while printing; the
// print stylesheet hides the rest of the app so the browser's "Save as PDF"
// produces a clean, paginated document. Uses a fixed light palette on purpose:
// paper output must not inherit the dark theme.

const PRINT_CSS = `
@media screen { [data-report-print-root] { display: none !important; } }
@media print {
  @page { margin: 14mm 12mm; }
  html, body { background: white !important; height: auto !important; overflow: visible !important; }
  body > *:not([data-report-print-root]) { display: none !important; }
  [data-report-print-root] { display: block !important; }
  [data-report-print-root] table { page-break-inside: auto; }
  [data-report-print-root] tr { page-break-inside: avoid; }
  [data-report-print-root] thead { display: table-header-group; }
}
`;

function PrintSection({ section }) {
  const rows = rowsWithTotals(section);
  return (
    <section className="mt-6 break-inside-avoid-page">
      <h2 className="text-sm font-semibold text-neutral-900">{section.title}</h2>
      {section.description ? <p className="mt-0.5 text-[11px] text-neutral-500">{section.description}</p> : null}
      <table className="mt-2 w-full border-collapse text-[11px]">
        <thead>
          <tr>
            {section.columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "border-b border-neutral-400 bg-neutral-100 px-1.5 py-1 font-semibold text-neutral-900",
                  alignOf(c) === "right" ? "text-right" : "text-left",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => {
              const total = r === section.totals;
              return (
                <tr key={r.id ?? i} className={total ? "font-semibold" : undefined}>
                  {section.columns.map((c, ci) => (
                    <td
                      key={c.key}
                      className={cn(
                        "border-b border-neutral-200 px-1.5 py-1 align-top text-neutral-900",
                        total && "border-t-2 border-t-neutral-800",
                        alignOf(c) === "right" ? "text-right tabular-nums" : "text-left",
                      )}
                    >
                      {total && ci === 0 ? r.label || r[c.key] || "Totals" : total && !r[c.key] && r[c.key] !== 0 ? "" : cellText(c, r)}
                    </td>
                  ))}
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={section.columns.length} className="px-1.5 py-2 text-neutral-500">
                {section.emptyTitle || "No rows"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

// Renders the report into a body-level portal, opens the print dialog, and
// calls onDone once the dialog closes.
export function ReportPrint({ title, subtitle, periodLabel, stats = [], sections = [], onDone }) {
  useEffect(() => {
    const done = () => onDone?.();
    window.addEventListener("afterprint", done, { once: true });
    const t = setTimeout(() => window.print(), 60);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [onDone]);

  const printable = sections.filter((s) => s.columns?.length);
  return createPortal(
    <div data-report-print-root className="bg-white p-0 font-sans text-neutral-900">
      <style>{PRINT_CSS}</style>
      <header className="border-b border-neutral-300 pb-3">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500">Geiger Property</p>
        <h1 className="mt-1 text-xl font-semibold">{title}</h1>
        <p className="mt-0.5 text-xs text-neutral-600">
          {[subtitle, periodLabel, `Generated ${new Date().toLocaleString("en-US")}`].filter(Boolean).join(" · ")}
        </p>
      </header>
      {stats.length ? (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded border border-neutral-300 px-2.5 py-2">
              <p className="text-[10px] text-neutral-500">{s.label}</p>
              <p className="text-sm font-semibold tabular-nums">{s.value}</p>
              {s.footer ? <p className="text-[10px] text-neutral-500">{s.footer}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
      {printable.map((s) => (
        <PrintSection key={s.key || s.title} section={s} />
      ))}
    </div>,
    document.body,
  );
}
