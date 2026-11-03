import { projectId, vercelAPI } from "./vercel-api.mjs";
try {
  const initial = await vercelAPI(`/v9/projects/${projectId}`);
  if (initial.id !== projectId || !initial.name.startsWith("seshgrid"))
    throw new Error("Unexpected Vercel project");
  const updated = await vercelAPI(`/v9/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({
      framework: "nextjs",
      nodeVersion: "24.x",
      buildCommand: "pnpm build",
      installCommand: "pnpm install --frozen-lockfile",
      publicSource: false,
      ssoProtection: { deploymentType: "all" },
    }),
  });
  if (updated.ssoProtection?.deploymentType !== "all")
    throw new Error(
      "Private deployment protection was not confirmed. No deployment should proceed.",
    );
  const url =
      process.env.SUPABASE_PROJECT_URL ||
      process.env.STUDIO_SUPABASE_PROJECT_URL,
    key =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.STUDIO_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public configuration is missing");
  await vercelAPI(`/v10/projects/${projectId}/env?upsert=true`, {
    method: "POST",
    body: JSON.stringify([
      {
        key: "NEXT_PUBLIC_SUPABASE_URL",
        value: url,
        type: "plain",
        target: ["preview", "production"],
      },
      {
        key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        value: key,
        type: "plain",
        target: ["preview", "production"],
      },
    ]),
  });
  console.log(
    JSON.stringify({
      project: updated.name,
      nodeVersion: updated.nodeVersion,
      protection: updated.ssoProtection.deploymentType,
      publicVariables: [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      ],
      publicSource: updated.publicSource,
    }),
  );
} catch (error) {
  console.error(
    `Vercel setup failed (${error.code || error.name}). Credentials were not printed.`,
  );
  process.exitCode = 1;
}
