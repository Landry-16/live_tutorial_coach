import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backend = `http://localhost:${process.env.PORT ?? 8787}`;

export default defineConfig({
  // HTTPS so the phone on the same Wi-Fi may use the camera and mic (self-signed: accept the warning once).
  // HTTP=1 serves plain http, enough on localhost (a secure context) and for browser automation.
  plugins: [react(), ...(process.env.HTTP ? [] : [basicSsl()])],
  server: {
    fs: { allow: [".."] },
    proxy: {
      "/api": backend,
      "/media": backend,
      "/ws": { target: backend, ws: true },
    },
  },
});
