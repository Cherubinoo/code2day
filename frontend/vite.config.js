import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function stripMonacoBrokenSourceMaps() {
  const monacoPathPattern = /monaco-editor[\\/](min|dev)[\\/]vs[\\/].+\.js$/;

  return {
    name: "strip-monaco-broken-sourcemaps",
    apply: "serve",
    transform(code, id) {
      if (!monacoPathPattern.test(id)) {
        return null;
      }

      return {
        code: code.replace(/\n\/\/# sourceMappingURL=.*$/g, ""),
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), stripMonacoBrokenSourceMaps()],
  server: {
    port: 5173,
    allowedHosts: ["code2day.ramcoad.com"],
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    allowedHosts: ["code2day.ramcoad.com"],
  },
  optimizeDeps: {
    include: ['@monaco-editor/react'],
    exclude: ['monaco-editor'],
    esbuildOptions: {
      target: 'es2020',
    },
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
