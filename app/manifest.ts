import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Around My Dorm",
    short_name: "Around Dorm",
    description: "ค้นหาร้านและบริการรอบบ้านสุภาอพาร์ทเม้นต์",
    start_url: "/",
    display: "standalone",
    background_color: "#02060D",
    theme_color: "#02060D",
    orientation: "portrait-primary",
    lang: "th",
    categories: ["navigation", "food", "lifestyle", "travel"],
  };
}
