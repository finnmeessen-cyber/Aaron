import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Sora } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

import { OfflineBanner } from "@/components/pwa/offline-banner";
import { PwaRegistrar } from "@/components/pwa/pwa-registrar";
import { SupabaseAuthListener } from "@/components/providers/supabase-auth-listener";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { APP_NAME } from "@/lib/constants";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap"
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  display: "swap"
});

export const metadata: Metadata = {
  title: APP_NAME,
  description:
    "Personal performance dashboard for lean bulk, supplements, training and cannabis quit progress.",
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_NAME
  },
  formatDetection: {
    telephone: false
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "mobile-web-app-capable": "yes"
  },
  icons: {
    icon: [
      { url: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/app-icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#071018" },
    { media: "(prefers-color-scheme: light)", color: "#f5f8fb" }
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body
        className={`${sora.variable} ${plexMono.variable} min-h-screen bg-background font-sans text-foreground antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <SupabaseAuthListener />
          <PwaRegistrar />
          <OfflineBanner />
          <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 md:px-6 md:py-8">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
