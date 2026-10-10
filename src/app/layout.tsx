import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/layout/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const siteName = "Shelty — Nigerian Real Estate Marketplace";
const siteDescription =
  "Nigeria's trusted marketplace for property rentals, sales, and short-lets. Connect with verified landlords, agents, and real-estate companies across Lagos, Abuja, Port Harcourt, and beyond.";
const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: "%s · Shelty",
  },
  description: siteDescription,
  keywords: [
    "Nigeria real estate",
    "Lagos property",
    "Abuja property",
    "rent in Nigeria",
    "buy property Nigeria",
    "short let Nigeria",
    "Nigerian real estate agents",
    "property listings Nigeria",
  ],
  authors: [{ name: "Shelty" }],
  applicationName: "Shelty",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Shelty",
    title: siteName,
    description: siteDescription,
    locale: "en_NG",
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f5132" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1f17" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
