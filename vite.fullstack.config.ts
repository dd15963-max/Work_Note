import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: env.VITE_PUBLIC_BASE || "/Work_Note/fullstack-preview/",
    root: "react-work-note",
    envDir: "..",
    plugins: [react()],
    build: {
      outDir: "../fullstack-preview",
      emptyOutDir: true,
      chunkSizeWarningLimit: 750
    }
  };
});