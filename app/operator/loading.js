import { LogoLoading } from "@geiger/ui/logo-loading";

// Route-level loader while the operator view reads its events.
export default function Loading() {
  return (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-background">
      <LogoLoading size={88} aria-label="Loading operator events" />
    </div>
  );
}
