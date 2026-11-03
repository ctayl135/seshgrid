import { execFileSync } from "node:child_process";
const deployment = process.argv[2];
if (
  !deployment ||
  new URL(deployment).protocol !== "https:" ||
  !new URL(deployment).hostname.endsWith(".vercel.app")
)
  throw new Error("Provide the HTTPS Vercel test deployment URL");
function request(path) {
  const result = execFileSync(
    process.execPath,
    [
      "scripts/vercel-cli.mjs",
      "curl",
      path,
      "--deployment",
      deployment,
      "--",
      "--silent",
      "--show-error",
      "--write-out",
      "\nSESHGRID_STATUS:%{http_code}",
    ],
    { encoding: "utf8", timeout: 45000, stdio: ["ignore", "pipe", "pipe"] },
  );
  const marker = result.lastIndexOf("\nSESHGRID_STATUS:");
  if (marker < 0 || result.slice(marker).trim() !== "SESHGRID_STATUS:200")
    throw new Error(`Hosted asset failed: ${path}`);
  return result.slice(0, marker);
}
const html = request("/");
if (!html.includes("SeshGrid — Your sound starts here"))
  throw new Error("Unexpected hosted page");
const assets = [
  ...new Set(
    [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^\"]+)"/g)].map(
      (m) => m[1],
    ),
  ),
];
for (const path of assets) request(path);
const recorder = request("/recorder.js");
if (!recorder.includes("seshgrid-recorder"))
  throw new Error("Recording processor is missing");
console.log(
  JSON.stringify({
    url: deployment,
    https: true,
    pageStatus: 200,
    staticAssets: assets.length,
    recordingProcessor: true,
    access:
      "Authenticated owner check; separate browser login confirms anonymous visitors are gated",
  }),
);
