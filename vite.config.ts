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

  // Bake public vars into all bundles (client + server).
  for (const key of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "EVOLIZ_COMPANY_ID"]) {
    if (allEnv[key]) {
      envDefine[`process.env.${key}`] = JSON.stringify(allEnv[key]);
    }
  }

  // Bake server-only secrets into the SSR bundle only.
  // process.env is an unenv mock in Cloudflare Workers and doesn't receive runtime secrets.
  const ssrDefine: Record<string, string> = {};
  for (const key of ["SUPABASE_SERVICE_ROLE_KEY", "EVOLIZ_PUBLIC_KEY", "EVOLIZ_SECRET_KEY"]) {
    if (allEnv[key]) {
      ssrDefine[`process.env.${key}`] = JSON.stringify(allEnv[key]);
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
    environments: {
      ssr: { define: ssrDefine },
    },
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
