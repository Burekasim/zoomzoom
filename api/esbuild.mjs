import * as esbuild from "esbuild";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
if (existsSync(dist)) rmSync(dist, { recursive: true });
mkdirSync(dist, { recursive: true });

const handlers = ["api", "reminders"];

for (const name of handlers) {
  const outdir = join(dist, name);
  mkdirSync(outdir, { recursive: true });
  await esbuild.build({
    entryPoints: [join(here, `src/handlers/${name}.ts`)],
    outfile: join(outdir, "index.mjs"),
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    sourcemap: true,
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
    external: ["@aws-sdk/*"],
  });
  // zip from inside the directory so paths are flat (index.mjs at zip root)
  execSync(`cd "${outdir}" && zip -qr ../${name}.zip .`, { stdio: "inherit" });
}

console.log("✓ Lambda bundles built in", dist);
