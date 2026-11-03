import { spawn } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(resolve(root, ".env"));
} catch {}
const pkgPath = resolve(root, ".tools/vercel/node_modules/vercel/package.json");
try {
  await access(pkgPath);
} catch {
  throw new Error(
    "Install the Vercel CLI into .tools/vercel before deploying.",
  );
}
const pkg = JSON.parse(await readFile(pkgPath, "utf8")),
  cli = resolve(
    dirname(pkgPath),
    typeof pkg.bin === "string" ? pkg.bin : pkg.bin.vercel,
  );
if (
  !process.env.VERCEL_TOKEN ||
  !process.env.VERCEL_PROJECT_ID ||
  !process.env.VERCEL_ORG_ID
)
  throw new Error("Vercel provisioning is not configured.");
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: root,
  env: { ...process.env, VERCEL_TELEMETRY_DISABLED: "1", NO_COLOR: "1" },
  stdio: "inherit",
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
