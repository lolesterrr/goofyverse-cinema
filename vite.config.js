import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves this project at /goofyverse-cinema/, so every asset path needs that base.
export default defineConfig({
  base: "/goofyverse-cinema/",
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.{js,jsx}"],
  },
});
