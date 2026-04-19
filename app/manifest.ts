import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Performance Tracker",
    short_name: "Tracker",
    description:
      "Lean-bulk, supplement, training and quit-tracking app for iPhone and Mac.",
    id: "/",
    scope: "/",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#071018",
    theme_color: "#071018",
    orientation: "portrait",
    lang: "de-DE",
    categories: ["health", "fitness", "lifestyle", "productivity"],
    icons: [
      {
        src: "/icons/app-icon-192.png",
        type: "image/png",
        sizes: "192x192",
        purpose: "any"
      },
      {
        src: "/icons/app-icon-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "any"
      },
      {
        src: "/icons/app-icon-maskable-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "maskable"
      }
    ]
  };
}
