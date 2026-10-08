import type { Metadata, Viewport } from "next";
import SwUpdateBanner from '@/components/sw-update-banner'
import { Oswald } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
import { OG_IMAGE_ALT, OG_IMAGE_HEIGHT, OG_IMAGE_URL, OG_IMAGE_WIDTH, SITE_URL } from "@/lib/site-meta";
import "./globals.css";

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// No zoom restriction here: marketing and legal pages must allow pinch-zoom.
// The clip viewer and compare routes set their own viewport (zoom locked)
// per route segment.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
}

export const metadata: Metadata = {
  title: { default: "Release Point AI", template: "%s | Release Point AI" },
  description: "Baseball pitching and hitting mechanics analysis for coaches and players. Upload video, track pitch and swing data, and get AI-powered feedback.",
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: "Release Point AI",
    description: "Baseball video analysis and pitching and hitting metrics for coaches and players.",
    url: SITE_URL,
    siteName: "Release Point AI",
    type: "website",
    images: [
      {
        url: OG_IMAGE_URL,
        width: OG_IMAGE_WIDTH,
        height: OG_IMAGE_HEIGHT,
        alt: OG_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Release Point AI",
    description: "Baseball video analysis and pitching and hitting metrics for coaches and players.",
    images: [OG_IMAGE_URL],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Release Point AI",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${oswald.variable} ${GeistSans.variable} h-full`}>
      <body className="min-h-full antialiased">
        {children}
        <SpeedInsights />
        <SwUpdateBanner />
        <Script
          id="sw-register"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js?v=2',{updateViaCache:'none'})}`,
          }}
        />
      </body>
    </html>
  );
}
