import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// `base` is the sub-path the site is served from. On GitHub Pages a project
// site lives at /<repo>/, so the deploy workflow passes VITE_BASE. Locally it
// defaults to "/".
const base = process.env.VITE_BASE || "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon.svg"],
      manifest: {
        name: "ChessMemo",
        short_name: "ChessMemo",
        description: "Spaced-repetition trainer for chess openings and tactics",
        theme_color: "#1f2933",
        background_color: "#1f2933",
        display: "standalone",
        orientation: "portrait",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
});
