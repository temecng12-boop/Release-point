import type { Metadata, Viewport } from "next";
import { Oswald, Inter } from "next/font/google";
import "./globals.css";

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export const metadata: Metadata = {
  title: { default: "Release Point", template: "%s | Release Point" },
  description: "Pitching and hitting mechanics analysis for coaches and players. Upload video, track Rapsodo data, and get AI-powered feedback.",
  metadataBase: new URL("https://release-point.vercel.app"),
  openGraph: {
    title: "Release Point",
    description: "Video analysis and Rapsodo metrics for baseball coaches and players.",
    url: "https://release-point.vercel.app",
    siteName: "Release Point",
    type: "website",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Release Point",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${oswald.variable} ${inter.variable} h-full`}>
      <body className="min-h-full antialiased">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js')}`,
          }}
        />
      </body>
    </html>
  );
}
