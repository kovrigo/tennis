import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Database writes and scratch files must not wake the bundler.
    watch: { ignored: ["**/data/**", "**/tmp/**"] },
  },
});
