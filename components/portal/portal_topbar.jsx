"use client";
/* eslint-disable @next/next/no-img-element -- company logos are arbitrary remote URLs */

import React from "react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { ArrowLeftRight, Check, CircleUserRound, LogOut, MessagesSquare, Moon, Sun } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ToggleGroup,
  ToggleGroupItem,
} from "@geiger/ui";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { initials } from "./portal_kit";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const itemStyle =
  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm cursor-default transition-colors outline-none hover:bg-surface-hover focus:bg-surface-hover text-muted-foreground hover:text-foreground focus:text-foreground";

// Company logo + name from Branding & Portals (falls back to the Geiger mark).
export function BrandMark({ member, compact = false }) {
  const brand = member?.brand || {};
  const name = brand.displayName || member?.projectName || "Geiger Property";
  return (
    <div className="flex min-w-0 items-center gap-2">
      {brand.logoUrl ? (
        <img src={brand.logoUrl} alt="" className="h-6 w-6 shrink-0 rounded object-contain" />
      ) : (
        <Image src={`${basePath}/logo1.svg`} alt="" width={20} height={20} className="geiger-logo h-5 w-5 shrink-0" />
      )}
      <span className="truncate text-sm font-semibold text-foreground">{name}</span>
      {!compact ? <span className="hidden truncate text-xs text-text-tertiary lg:inline">{member?.title}</span> : null}
    </div>
  );
}

function AccountMenu({ user, member, members, onSwitch, onNavigate, onSignOut }) {
  const { theme, setTheme } = useTheme();
  const others = members.filter((m) => m.id !== member.id);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-1 overflow-hidden rounded-full border border-border p-0 transition-colors hover:border-border-strong"
          aria-label="Account menu"
        >
          <Avatar className="size-full">
            <AvatarFallback className="border-0 bg-surface-strong text-sm font-semibold text-foreground">
              {initials(member.name, user.email).charAt(0)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-72 rounded-xl border border-border bg-background p-0 text-foreground shadow-xl" sideOffset={8} align="end">
        <div className="p-4 pb-3">
          <DropdownMenuLabel className="p-0">
            <div className="flex items-center gap-3">
              <Avatar className="size-10 border border-border">
                <AvatarFallback className="border-0 bg-surface-strong text-base font-semibold text-foreground">
                  {initials(member.name, user.email).charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-foreground">{member.name || "Your account"}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
            </div>
          </DropdownMenuLabel>
        </div>

        <DropdownMenuSeparator className="mx-0 bg-surface-hover" />

        <div className="p-1.5">
          <DropdownMenuGroup>
            <DropdownMenuItem className={itemStyle} onSelect={() => onNavigate("profile")}>
              <CircleUserRound className="size-4 text-muted-foreground" />
              <span>Profile & preferences</span>
            </DropdownMenuItem>
            <DropdownMenuItem className={itemStyle} onSelect={() => onNavigate("messages")}>
              <MessagesSquare className="size-4 text-muted-foreground" />
              <span>Message the office</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          {others.length ? (
            <>
              <DropdownMenuSeparator className="my-1 bg-surface-hover" />
              <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Switch portal</p>
              {[member, ...others].map((m) => (
                <DropdownMenuItem key={m.id} className={itemStyle} onSelect={() => onSwitch(m.id)}>
                  {m.id === member.id ? <Check className="size-4 text-foreground" /> : <ArrowLeftRight className="size-4 text-muted-foreground" />}
                  <span className="min-w-0 truncate">
                    {m.title}
                    {m.brand?.displayName || m.projectName ? ` · ${m.brand?.displayName || m.projectName}` : ""}
                  </span>
                </DropdownMenuItem>
              ))}
            </>
          ) : null}

          <DropdownMenuSeparator className="my-1 bg-surface-hover" />

          <DropdownMenuItem className="cursor-default p-2 hover:bg-transparent focus:bg-transparent">
            <ToggleGroup
              type="single"
              value={theme}
              onValueChange={(v) => v && setTheme(v)}
              className="flex w-full items-center justify-evenly rounded-lg border border-border bg-surface-subtle p-0.5"
            >
              <ToggleGroupItem
                value="light"
                className="h-7 flex-1 justify-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground data-[state=on]:bg-surface-active data-[state=on]:text-foreground dark:hover:bg-surface-card"
              >
                <Sun className="size-3.5" /> Light
              </ToggleGroupItem>
              <ToggleGroupItem
                value="dark"
                className="h-7 flex-1 justify-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground data-[state=on]:bg-surface-active data-[state=on]:text-foreground dark:hover:bg-surface-card"
              >
                <Moon className="size-3.5" /> Dark
              </ToggleGroupItem>
            </ToggleGroup>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1 bg-surface-hover" />

          <DropdownMenuItem
            className={`${itemStyle} group hover:bg-red-500/10 hover:text-red-600 focus:bg-red-500/10 focus:text-red-600 dark:hover:text-red-400 dark:focus:text-red-400`}
            onSelect={onSignOut}
          >
            <LogOut className="size-4 group-hover:text-red-600 group-focus:text-red-600 dark:group-hover:text-red-400 dark:group-focus:text-red-400" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </div>

        <div className="border-t border-border px-4 py-2.5">
          <div className="flex items-center justify-between text-[11px] text-text-secondary">
            <span>{member.title}</span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Signed in
            </span>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PortalTopbar({ user, member, members, onSwitch, onNavigate, onSignOut }) {
  return (
    <header className="relative z-20 flex h-14 w-full shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex min-w-0 items-center gap-1.5">
        <SidebarTrigger className="-ml-2 text-foreground md:hidden" />
        <div className="hidden min-w-0 md:flex">
          <BrandMark member={member} />
        </div>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 flex max-w-[60%] -translate-x-1/2 -translate-y-1/2 items-center md:hidden">
        <BrandMark member={member} compact />
      </div>

      <div className="flex items-center gap-1">
        <AccountMenu user={user} member={member} members={members} onSwitch={onSwitch} onNavigate={onNavigate} onSignOut={onSignOut} />
      </div>
    </header>
  );
}

export default PortalTopbar;
