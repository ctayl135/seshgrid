import { execFileSync } from "node:child_process";
const result = JSON.parse(
  execFileSync(
    process.execPath,
    ["scripts/vercel-cli.mjs", "deploy", "--dry", "--json"],
    { encoding: "utf8", timeout: 90000, stdio: ["ignore", "pipe", "inherit"] },
  ),
);
const forbidden = result.files.filter((f) =>
  /^(\.env|\.projects(?:\/|$)|\.tools(?:\/|$)|\.pnpm-store(?:\/|$)|scripts(?:\/|$)|supabase(?:\/|$)|node_modules(?:\/|$)|test-results(?:\/|$))/.test(
    f.path,
  ),
);
if (forbidden.length)
  throw new Error(
    "Private files were included in the Vercel upload. Deployment stopped.",
  );
if (
  !result.files.some((f) => f.path === "public/recorder.js") ||
  !result.files.some((f) => f.path === "src/components/Studio.tsx")
)
  throw new Error("Studio sources are missing from the upload");
console.log(
  JSON.stringify({
    framework: result.framework.slug,
    files: result.fileCount,
    bytes: result.totalSize,
    privateFilesIncluded: false,
  }),
);
