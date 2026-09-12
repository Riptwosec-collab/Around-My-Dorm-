import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./premium-liquid-glass.css";
import "./premium-liquid-glass-geometry.css";
import "./premium-interactions.css";
import "./premium-map-sheets.css";
import { PwaRuntime } from "@/components/PwaRuntime";
import { GoogleBulkPhotoRuntimeControl } from "@/components/GoogleBulkPhotoRuntimeControl";

export const metadata: Metadata = {
  title: "Around My Dorm",
  description: "ค้นหาร้านและบริการรอบบ้านสุภาอพาร์ทเม้นต์",
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
      <body>{children}<PwaRuntime /><GoogleBulkPhotoRuntimeControl /></body>
    </html>
  );
}
