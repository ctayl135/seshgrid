import { test } from "node:test";
import assert from "node:assert/strict";
import { accountDetails } from "../src/lib/social";
test("account details normalize usernames and reject invalid handles and unsafe website links", () => {
  assert.deepEqual(accountDetails(" My_Name ", "https://example.com"), {
    username: "my_name",
    website: "https://example.com",
  });
  for (const name of ["ab", "bad name", "bad-name", "x".repeat(25)])
    assert.throws(() => accountDetails(name, ""));
  for (const link of [
    "javascript:alert(1)",
    "http://example.com",
    "https://user:pass@example.com",
  ])
    assert.throws(() => accountDetails("valid_name", link));
});
