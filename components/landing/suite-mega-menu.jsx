"use client";

import Link from "next/link";

import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ContainerIcon,
  Cpu,
  FileText,
  Layers,
  Library,
  Megaphone,
  Menu,
  MessageSquare,
  PenTool,
  Zap,
} from "lucide-react";

const products = [
  { icon: Zap, label: "Notes", description: "Write and collaborate.", href: "/notes" },
  { icon: ContainerIcon, label: "Flow", description: "Plan and track work.", href: "/flow" },
  { icon: Layers, label: "Assets", description: "Manage your media.", href: "/assets" },
  { icon: Cpu, label: "Grey", description: "AI workspace tools.", href: "/grey" },
  { icon: BriefcaseBusiness, label: "Office", description: "Run office workflows.", href: "/office" },
  { icon: FileText, label: "Forms", description: "Build forms and surveys.", href: "/forms" },
  { icon: CalendarDays, label: "Events", description: "Schedule and manage events.", href: "/events" },
  { icon: Library, label: "Content", description: "Create and organize content.", href: "/content" },
  { icon: Megaphone, label: "Campaign", description: "Run marketing campaigns.", href: "/campaign" },
  { icon: MessageSquare, label: "Chat", description: "Team messaging and communication.", href: "/chat" },
  { icon: PenTool, label: "Canvas", description: "Visual collaboration workspace.", href: "/canvas" },
  { icon: BookOpen, label: "Docs", description: "Create and share documents.", href: "/docs" },
];

const resources = [
  { label: "Documentation", href: "/docs" },
  { label: "Changelog", href: "/changelog" },
  { label: "Blog", href: "/blog" },
  { label: "GitHub Repository", href: "#" },
  { label: "Self Host Geiger", href: "#" },
  { label: "Free Image Tools", href: "/tools" },
];

function MenuPanel({ title, children, className = "" }) {
  return (
    <div className={`rounded-xl border border-border bg-surface-subtle p-4 shadow-xl ${className}`}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground0">{title}</p>
      {children}
    </div>
  );
}

export function SuiteMegaMenu() {
  const closeMenuOnMouseLeave = (event) => {
    const focusedElement = document.activeElement;
    if (focusedElement instanceof HTMLElement && event.currentTarget.contains(focusedElement)) {
      focusedElement.blur();
    }
  };

  return (
    <>
      <nav className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
        <div className="group relative" onMouseLeave={closeMenuOnMouseLeave}>
          <button type="button" aria-haspopup="true" className="flex items-center gap-1 py-6 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none">
            Products
            <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-180 group-focus-within:rotate-180" />
          </button>
          <div className="invisible absolute left-1/2 top-full w-[650px] -translate-x-1/2 translate-y-2 opacity-0 transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
            <MenuPanel title="Products">
              <div className="grid grid-cols-3 gap-1">
                {products.map((item) => {
                  const Icon = item.icon;
                  return (
                    <a href={item.href} key={item.label} className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none">
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">{item.label}</p>
                        <p className="truncate text-xs text-foreground0">{item.description}</p>
                      </div>
                    </a>
                  );
                })}
              </div>
            </MenuPanel>
          </div>
        </div>

        <div className="group relative" onMouseLeave={closeMenuOnMouseLeave}>
          <button type="button" aria-haspopup="true" className="flex items-center gap-1 py-6 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none">
            Resources
            <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-180 group-focus-within:rotate-180" />
          </button>
          <div className="invisible absolute left-1/2 top-full w-[280px] -translate-x-1/2 translate-y-2 opacity-0 transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
            <MenuPanel title="Resources" className="p-3">
              <div className="space-y-1">
                {resources.map((item) => (
                  <a href={item.href} key={item.label} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:bg-surface-hover focus-visible:text-foreground focus-visible:outline-none">
                    {item.label}
                    <ArrowRight className="h-3.5 w-3.5 text-foreground0" />
                  </a>
                ))}
              </div>
            </MenuPanel>
          </div>
        </div>

        <Link href="/pricing" className="py-6 transition-colors hover:text-foreground">Pricing</Link>
      </nav>

      <details className="group relative md:hidden">
        <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground [&::-webkit-details-marker]:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </summary>
        <div className="fixed inset-x-0 top-12 max-h-[calc(100dvh-3rem)] overflow-y-auto border-b border-border bg-background p-4 shadow-xl">
          <MenuPanel title="Products">
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {products.map((item) => {
                const Icon = item.icon;
                return (
                  <a href={item.href} key={item.label} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-surface-hover">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {item.label}
                  </a>
                );
              })}
            </div>
          </MenuPanel>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {resources.map((item) => <a href={item.href} key={item.label} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-surface-hover hover:text-foreground">{item.label}</a>)}
          </div>
          <Link href="/pricing" className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">View Pricing</Link>
        </div>
      </details>
    </>
  );
}


