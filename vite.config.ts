import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/Work_Note/react/",
  root: "react-work-note",
  plugins: [react()],
  build: {
    outDir: "../react",
    emptyOutDir: true
  }
});
