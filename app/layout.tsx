import type { Metadata, Viewport } from "next";
import "./globals.css";

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
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#050812",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
