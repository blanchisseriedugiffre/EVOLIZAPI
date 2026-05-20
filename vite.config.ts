import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";

export default defineConfig(async ({ command, mode }) => {
  // Load VITE_ vars for client bundle injection
  const viteEnv = loadEnv(mode, process.cwd(), "VITE_");
  // Load all vars to bake non-secret server vars into the SSR bundle
  const allEnv = loadEnv(mode, process.cwd(), "");
  const envDefine: Record<string, string> = {};

  for (const [key, value] of Object.entries(viteEnv)) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  // SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are not secret (same as VITE_ versions).
  // Bake them into the SSR bundle so auth middleware works even if process.env is unavailable.
  for (const key of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "EVOLIZ_COMPANY_ID"]) {
    if (allEnv[key]) {
      envDefine[`process.env.${key}`] = JSON.stringify(allEnv[key]);
    }
  }

  const plugins = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    react(),
  ];

  if (command === "build") {
    const { cloudflare } = await import("@cloudflare/vite-plugin");
    plugins.push(cloudflare({ viteEnvironment: { name: "ssr" } }));
  }

  return {
    plugins,
    define: envDefine,
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
  };
});
