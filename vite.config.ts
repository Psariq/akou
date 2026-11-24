import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Content Security Policy for the production build.
 *
 * The page may only load its own bundled code and may only connect to:
 *   - api.anthropic.com  (lesson generation and grading)
 *   - el.wikipedia.org   (Greek Wikipedia articles)
 * and may only play audio from www.greek-language.gr (original recordings).
 * Even if a malicious script somehow ended up in the page, the browser would
 * refuse to send data (such as the API key) to any other host.
 *
 * It is injected only at build time because the Vite dev server relies on
 * inline scripts for hot reloading.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self' https://api.anthropic.com https://el.wikipedia.org",
  "img-src 'self' data:",
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  // Original recordings from the Centre for the Greek Language's multimedia bank (audio only; no data is sent).
  "media-src https://www.greek-language.gr",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "akou-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "<!--CSP-->",
        `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  // Relative base so the build works on any static host and sub-path
  // (e.g. https://<user>.github.io/akou/).
  base: "./",
  plugins: [react(), contentSecurityPolicy()],
  build: {
    target: "es2022",
    sourcemap: false,
    // The Anthropic SDK is large; keep it in its own long-cached chunk.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          anthropic: ["@anthropic-ai/sdk"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
} as Parameters<typeof defineConfig>[0]);
