// Coded property-card art for the closing CTA's scattered field: gradients, type and CSS buildings, no image assets.

import { cn } from "@/lib/utils";

// A tower facade; `lit` picks which windows read as leased.
function Tower({ cols = 4, rows = 5, lit = 3, className }) {
  return (
    <div className={cn("grid h-full gap-[7%] rounded-t-[4%] border border-current/40 p-[7%]", className)} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
      {Array.from({ length: cols * rows }, (_, i) => <i key={i} className={cn("block rounded-[1px]", i % lit === 1 ? "border border-current/40" : "bg-current/85")} />)}
    </div>
  );
}

const ROOF = "polygon(50% 0, 100% 40%, 100% 100%, 0 100%, 0 40%)";

// A row of townhouses with peaked roofs.
function Row({ count = 3 }) {
  return (
    <div className="flex h-full items-end gap-[5%]">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn("relative flex-1 bg-current/85", i % 2 ? "h-[80%]" : "h-full")} style={{ clipPath: ROOF }}>
          <span className="absolute bottom-0 left-1/2 h-[30%] w-[26%] -translate-x-1/2 bg-black/45" />
        </div>
      ))}
    </div>
  );
}

// A sawtooth-roofed loft or warehouse conversion.
function Loft() {
  return (
    <div className="flex h-full flex-col">
      <div className="h-[22%] bg-current/85" style={{ clipPath: "polygon(0 100%, 0 0, 25% 100%, 25% 0, 50% 100%, 50% 0, 75% 100%, 75% 0, 100% 100%)" }} />
      <div className="grid flex-1 grid-cols-3 gap-[6%] border border-current/40 p-[6%]">
        {Array.from({ length: 6 }, (_, i) => <i key={i} className={cn("block rounded-[1px]", i === 4 ? "border border-current/40" : "bg-current/80")} />)}
      </div>
    </div>
  );
}

// Shared ground: the card's gradient, its name up top and the building on the baseline.
function Sheet({ className, name, meta, children }) {
  return (
    <div className={cn("relative flex h-full w-full flex-col overflow-hidden p-[9%] leading-none", className)}>
      <span className="text-[11%] font-semibold tracking-tight">{name}</span>
      <span className="mt-[4%] text-[6.5%] opacity-65">{meta}</span>
      <div className="absolute inset-x-[12%] bottom-0 h-[50%]">{children}</div>
    </div>
  );
}

export const PROPERTY_POSTERS = [
  { key: "harbor", Art: () => <Sheet name="Harbor Lofts" meta="48 units · 96% leased" className="bg-[linear-gradient(160deg,#16324a,#0a1826)] text-sky-100"><Tower cols={5} rows={5} lit={4} /></Sheet> },
  { key: "maple", Art: () => <Sheet name="Maple Court" meta="12 townhomes" className="bg-[linear-gradient(155deg,#3d2a14,#1d1309)] text-amber-200"><Row count={3} /></Sheet> },
  { key: "foundry", Art: () => <Sheet name="The Foundry" meta="Mixed-use · 9 suites" className="bg-[linear-gradient(150deg,#2b2b2b,#121212)] text-zinc-200"><Loft /></Sheet> },
  { key: "elm", Art: () => <Sheet name="Elm St Duplex" meta="2 units · owner Rao" className="bg-[linear-gradient(160deg,#173a2c,#0a1d15)] text-emerald-100"><Row count={2} /></Sheet> },
  { key: "pacific", Art: () => <Sheet name="Pacific Tower" meta="120 units · 18 floors" className="bg-[linear-gradient(165deg,#2a1d45,#120c22)] text-violet-200"><Tower cols={3} rows={6} lit={5} className="mx-auto w-[62%]" /></Sheet> },
  { key: "linden", Art: () => <Sheet name="Linden Row" meta="6 homes · 1 vacant" className="bg-[linear-gradient(150deg,#4a1f22,#200d0f)] text-rose-100"><Row count={4} /></Sheet> },
  { key: "dock", Art: () => <Sheet name="Dockside" meta="Warehouse lofts" className="bg-[linear-gradient(160deg,#123a3d,#071c1e)] text-teal-100"><Loft /></Sheet> },
  { key: "cedar", Art: () => <Sheet name="Cedar House" meta="24 units · renewals due" className="bg-[linear-gradient(155deg,#3a3418,#1b180a)] text-yellow-100"><Tower cols={4} rows={4} lit={3} /></Sheet> },
  { key: "north", Art: () => <Sheet name="Northgate" meta="Portfolio · 62 units" className="bg-[linear-gradient(160deg,#1f2a44,#0c1220)] text-indigo-100"><Tower cols={4} rows={5} lit={6} className="mx-auto w-[80%]" /></Sheet> },
];

export default PROPERTY_POSTERS;
