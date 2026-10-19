"use client";

import React, { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, FileText, KeyRound, Loader2, Mail, Wrench, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@geiger/ui/button";
import { portalApi } from "@/lib/portal/portal_fetch";

const FEATURES = [
  { icon: Wallet, label: "Balances, statements and payments" },
  { icon: Wrench, label: "Maintenance requests and work orders" },
  { icon: FileText, label: "Leases, documents and insurance" },
];

// Mockup-styled field (matches the suite members-portal sign-in).
const FIELD_CLASS =
  "h-[52px] w-full rounded-[14px] border border-border bg-surface-card px-4 text-[16px] text-foreground shadow-none outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/50";

const CTA_CLASS =
  "h-[52px] w-full rounded-[14px] bg-primary text-[17px] font-semibold tracking-[-0.01em] text-primary-foreground hover:bg-primary/90";

const LINK_ERRORS = {
  link: "That sign-in link has expired or was opened on another device. Request a new one below.",
};

// Passwordless portal sign-in: email → magic link or one-time code (shared suite auth).
export function LoginScreen({ initialEmail = "", initialError = "" }) {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(LINK_ERRORS[initialError] || "");
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  const sendLink = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    const res = await portalApi("/api/portal/auth/otp", { method: "POST", body: { email } });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setStep("code");
    toast.success("Check your email for a sign-in link.");
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await portalApi("/api/portal/auth/verify", { method: "POST", body: { email, token: code } });
    if (!res.ok) {
      setBusy(false);
      return toast.error(res.error);
    }
    window.location.href = `${basePath}/portal`;
  };

  return (
    <div className="dark relative flex min-h-[100dvh] flex-col bg-background">
      <main className="mx-auto w-full max-w-sm flex-1 px-6 pb-12 pt-[max(6rem,16dvh)]">
        <Image src={`${basePath}/logo1.svg`} alt="Geiger Property" width={36} height={22} className="geiger-logo mb-10" priority />
        <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-foreground">
          Your home,
          <br />
          one sign-in away.
        </h1>

        {step === "email" ? (
          <>
            <p className="mt-4 max-w-[21rem] text-[15px] leading-relaxed text-text-secondary">
              Use the email your property manager invited. We&apos;ll send you a secure sign-in link — no password needed.
            </p>
            <form onSubmit={sendLink} className="mt-7 space-y-5">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  autoFocus
                  required
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  aria-label="Email"
                  autoComplete="email"
                  className={cn(FIELD_CLASS, "pl-11")}
                />
              </div>
              {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
              <Button type="submit" disabled={busy} className={CTA_CLASS}>
                Email Me a Sign-In Link
                {busy ? <Loader2 className="size-[18px] animate-spin" /> : <ArrowRight className="size-[18px]" />}
              </Button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-4 max-w-[22rem] text-[15px] leading-relaxed text-text-secondary">
              We sent a link to <span className="text-foreground">{email}</span>. Open it on this device, or enter the code
              from the email.
            </p>
            <form onSubmit={verify} className="mt-7 space-y-5">
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
                <input
                  value={code}
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="6-digit code"
                  aria-label="Sign-in code"
                  className={cn(FIELD_CLASS, "pl-11 tracking-[0.3em]")}
                />
              </div>
              <Button type="submit" disabled={busy || code.length < 6} className={CTA_CLASS}>
                Sign in
                {busy ? <Loader2 className="size-[18px] animate-spin" /> : <ArrowRight className="size-[18px]" />}
              </Button>
              <div className="flex items-center justify-between pt-1 text-xs text-text-tertiary">
                <button type="button" onClick={() => setStep("email")} className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
                  <ArrowLeft className="h-3.5 w-3.5" /> Use another email
                </button>
                <button type="button" onClick={sendLink} disabled={busy} className="transition-colors hover:text-foreground">
                  Resend email
                </button>
              </div>
            </form>
          </>
        )}
      </main>

      <footer className="mx-auto w-full max-w-sm shrink-0 px-6 pb-[calc(1.75rem+env(safe-area-inset-bottom))]">
        <ul className="space-y-3">
          {FEATURES.map((f) => (
            <li key={f.label} className="flex items-center gap-3 text-[13px] text-text-secondary">
              <f.icon className="size-4 shrink-0 text-muted-foreground" />
              {f.label}
            </li>
          ))}
        </ul>
      </footer>
    </div>
  );
}

export default LoginScreen;
