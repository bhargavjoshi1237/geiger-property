// Public leasing pages (LEAS-01): a minimal, mobile-first frame on the suite tokens, without workspace chrome.

export const metadata = {
  robots: { index: true, follow: true },
};

export default function PublicLeasingLayout({ children }) {
  return <div className="flex min-h-screen flex-col bg-background text-foreground">{children}</div>;
}
