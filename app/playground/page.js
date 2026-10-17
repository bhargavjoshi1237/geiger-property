import PropertyPlaygroundLoader from "@/components/landing/playground/property_playground_loader";

// The live workspace playground on its own route, iframed by our landing page and geiger-dash so neither keeps a copy; the frame keeps portalled dialogs, sheets and toasts inside the showcase card.
export const metadata = {
  title: "Property Playground - Geiger Studio",
  robots: { index: false, follow: false },
};

export default function PropertyPlaygroundPage() {
  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-background">
      <PropertyPlaygroundLoader />
    </div>
  );
}
