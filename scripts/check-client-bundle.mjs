import { readdir, readFile } from "node:fs/promises";
try {
  process.loadEnvFile(".env.local");
} catch {}
try {
  process.loadEnvFile(".env");
} catch {}
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory()
          ? files(`${dir}/${e.name}`)
          : e.name.endsWith(".js")
            ? [`${dir}/${e.name}`]
            : [],
      ),
    )
  ).flat();
}
const paths = await files(".next/static");
const secrets = [
  "SUPABASE_DB_PASS",
  "SUPABASE_DB_URL",
  "SUPABASE_POOLER_URL",
  "STUDIO_SUPABASE_DB_PASS",
  "STUDIO_SUPABASE_DB_URL",
  "STUDIO_SUPABASE_POOLER_URL",
]
  .map((k) => process.env[k])
  .filter(Boolean);
const publicURL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.STUDIO_SUPABASE_PROJECT_URL ||
  process.env.SUPABASE_PROJECT_URL;
const publicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.STUDIO_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY;
let urlFound = false,
  keyFound = false;
for (const path of paths) {
  const text = await readFile(path, "utf8");
  if (secrets.some((s) => text.includes(s)))
    throw new Error(
      "A private database credential was found in a browser bundle. Do not deploy.",
    );
  urlFound ||= !!publicURL && text.includes(publicURL);
  keyFound ||= !!publicKey && text.includes(publicKey);
}
if (publicURL && publicKey && (!urlFound || !keyFound))
  throw new Error(
    "The browser bundle is missing the configured public Supabase settings.",
  );
console.log(
  JSON.stringify({
    javascriptFilesChecked: paths.length,
    privateCredentialsExposed: false,
    cloudBrowserConfigurationVerified:
      !!publicURL && !!publicKey && urlFound && keyFound,
  }),
);
