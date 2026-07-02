import {
  Geist,
  Geist_Mono,
  Space_Grotesk,
  Poppins,
  Playfair_Display,
  Merriweather,
} from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SystemFavicon } from "@/components/system-favicon";
import { Toaster } from "@/components/ui/sonner";
import { BannerProvider } from "@/context/banner-context";
import { GlobalBanner } from "@/components/internal/banner/global_banner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Extra brand fonts loaded here so their CSS variables are available app-wide
// (used by branded/white-label surfaces).
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const merriweather = Merriweather({
  variable: "--font-merriweather",
  weight: ["400", "700", "900"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "Property - Geiger Studio",
  description: "Geiger Studio - Property",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${poppins.variable} ${playfair.variable} ${merriweather.variable} antialiased`}
      >
        <SystemFavicon />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <BannerProvider>
            <div className="flex flex-col min-h-screen">
              <GlobalBanner />
              {children}
            </div>
            <Toaster />
          </BannerProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
