import { readFile, writeFile } from "node:fs/promises";
import { databaseClient } from "./database-client.mjs";
const db = await databaseClient();
try {
  const rows = [];
  for (const [file, name] of [
    ["noir-ui-fixture.json", "NOIR Demo Artist"],
    ["noir-ui-peer.json", "NOIR Demo Producer"],
  ]) {
    const a = JSON.parse(await readFile("test-results/" + file, "utf8"));
    if (
      !a.email.startsWith("noir-ui-") ||
      !a.email.endsWith("@example.invalid")
    )
      throw Error("Unexpected fixture");
    const match = await db.query(
      "select id from auth.users where id=$1 and email=$2",
      [a.id, a.email],
    );
    if (match.rowCount !== 1) throw Error("Fixture missing");
    await db.query(
      "insert into public.artist_profiles(id,display_name,bio,genre) values($1,$2,'Demo account for testing NOIR. No real artist affiliation.','Underground') on conflict(id) do update set display_name=excluded.display_name,bio=excluded.bio",
      [a.id, name],
    );
    rows.push(name + "\nEmail: " + a.email + "\nPassword: " + a.password);
  }
  await writeFile(
    "test-results/NOIR-demo-accounts.txt",
    "NOIR sample accounts — private test credentials\nSign in: https://new-age-noir.vercel.app/studio?account=1\nThese generated example.invalid email addresses cannot receive email.\n\n" +
      rows.join("\n\n") +
      "\n",
  );
  console.log(
    "Two labeled demo profiles are ready. Credentials saved only in ignored local test-results/NOIR-demo-accounts.txt.",
  );
} finally {
  await db.end();
}
