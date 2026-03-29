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
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ['@monaco-editor/react', 'monaco-editor'],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
