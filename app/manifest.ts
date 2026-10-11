import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  const value = {
    name: "Around My Dorm",
    short_name: "Around Dorm",
    description: "ค้นหาร้าน ที่จอดรถ และบริการรอบบ้านสุภาอพาร์ทเม้นต์",
    start_url: "/",
    display: "standalone",
    background_color: "#02060D",
    theme_color: "#02060D",
    orientation: "portrait-primary",
    lang: "th",
    categories: ["navigation", "food", "lifestyle", "travel"],
    shortcuts: [
      { name: "ค้นหาใกล้หอ", short_name: "ค้นหา", description: "ค้นหาร้านและบริการรอบหอ", url: "/?share-text=ใกล้สุด", icons: [{ src: "/icon-192.png?v=amd-nova-20261011", sizes: "192x192", type: "image/png" }] },
      { name: "แผนที่", short_name: "แผนที่", description: "เปิดแผนที่รอบหอ", url: "/map/", icons: [{ src: "/icon-192.png?v=amd-nova-20261011", sizes: "192x192", type: "image/png" }] },
      { name: "ที่จอดรถ", short_name: "ที่จอด", description: "ค้นหาที่จอดรถใกล้หอ", url: "/?share-text=ที่จอดรถ ใกล้สุด", icons: [{ src: "/icon-192.png?v=amd-nova-20261011", sizes: "192x192", type: "image/png" }] },
      { name: "บันทึก", short_name: "Saved", description: "เปิดสถานที่ที่บันทึกไว้", url: "/saved/", icons: [{ src: "/icon-192.png?v=amd-nova-20261011", sizes: "192x192", type: "image/png" }] },
    ],
    share_target: {
      action: "/",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: {
        title: "share-title",
        text: "share-text",
        url: "share-url",
      },
    },
    icons: [
      { src: "/icon-192.png?v=amd-nova-20261011", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png?v=amd-nova-20261011", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png?v=amd-nova-20261011", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return value as MetadataRoute.Manifest;
}
