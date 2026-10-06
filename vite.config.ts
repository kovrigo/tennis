import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Database writes and scratch files must not wake the bundler.
    watch: { ignored: ["**/data/**", "**/tmp/**"] },
    // The dev server must not hand out the database, uploads or scratch files. Vite's defaults kept.
    fs: { deny: [".env", ".env.*", "*.{crt,pem,key,p12,pfx,cer,der}", ".npmrc", ".yarnrc.yml", "**/.git/**", "**/data/**", "**/tmp/**"] },
  },
});
