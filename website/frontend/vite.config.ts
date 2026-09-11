import { resolve } from "path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import symfonyPlugin from "vite-plugin-symfony";

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [
    vue(),
    ...(!isSsrBuild
      ? [symfonyPlugin({ viteDevServerHostname: "localhost" })]
      : []),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  ...(isSsrBuild ? { ssr: { noExternal: true } } : {}),
  build: isSsrBuild
    ? {
        outDir: "../backend/ssr",
        emptyOutDir: true,
        target: "node20",
        rollupOptions: {
          input: resolve(__dirname, "src/ssr.ts"),
          output: {
            format: "esm",
          },
        },
      }
    : {
        outDir: "../backend/public/build",
        emptyOutDir: true,
        manifest: true,
        rollupOptions: {
          input: {
            app: resolve(__dirname, "src/app.ts"),
          },
        },
      },
  server: {
    port: 5173,
    strictPort: true,
    origin: "http://localhost:5173",
  },
}));
