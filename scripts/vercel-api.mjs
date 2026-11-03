try {
  process.loadEnvFile(".env");
} catch {}
export const projectId = process.env.VERCEL_PROJECT_ID;
export const teamId = process.env.VERCEL_ORG_ID || process.env.VERCEL_TEAM_ID;
const token = process.env.VERCEL_TOKEN;
export async function vercelAPI(path, options = {}) {
  if (!token || !projectId || !teamId)
    throw new Error("Vercel connection is not configured");
  const url = new URL(path, "https://api.vercel.com");
  if (url.origin !== "https://api.vercel.com")
    throw new Error("Unexpected Vercel API host");
  url.searchParams.set("teamId", teamId);
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(`Vercel API request failed: ${response.status}`),
      { code: data.error?.code || response.status },
    );
  return data;
}
