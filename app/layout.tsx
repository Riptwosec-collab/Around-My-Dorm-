import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./premium-liquid-glass.css";
import "./premium-liquid-glass-geometry.css";
import "./premium-interactions.css";
import "./premium-map-sheets.css";
import "./premium-motion-v4.css";
import "./app-frame-sizing.css";
import "./render-stability.css";
import "./typography-clarity.css";
import "./icon-system.css";
import { PwaRuntime } from "@/components/PwaRuntime";

export const metadata: Metadata = {
  title: "Around My Dorm",
  description: "ค้นหาร้านและบริการรอบบ้านสุภาอพาร์ทเม้นต์",
  icons: {
    icon: [
      { url: "/icon-192.png?v=amd-nova-20261011", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png?v=amd-nova-20261011", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png?v=amd-nova-20261011", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Around My Dorm",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#02060D",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body>
        {children}
        <PwaRuntime />
      </body>
    </html>
  );
}
