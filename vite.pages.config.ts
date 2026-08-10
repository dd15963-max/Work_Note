import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/Work_Note/react/",
  root: "react-work-note",
  envDir: ".",
  plugins: [react()],
  build: {
    outDir: "../react",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1400,
  },
});
