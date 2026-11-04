import { test } from "node:test";
import assert from "node:assert/strict";
import {
  messageBody,
  conversationHeads,
  type Message,
} from "../src/lib/community";
test("direct messages reject empty and oversized bodies without altering valid content", () => {
  assert.equal(messageBody("  hi\nthere  "), "hi\nthere");
  assert.throws(() => messageBody(" \n "));
  assert.throws(() => messageBody("x".repeat(2001)));
});
test("conversation list groups both directions and keeps the latest reply first", () => {
  const rows = [
    {
      id: "1",
      sender_id: "me",
      recipient_id: "a",
      body: "old",
      created_at: "2026-01-01",
      read_at: null,
    },
    {
      id: "2",
      sender_id: "b",
      recipient_id: "me",
      body: "other",
      created_at: "2026-01-02",
      read_at: null,
    },
    {
      id: "3",
      sender_id: "a",
      recipient_id: "me",
      body: "new",
      created_at: "2026-01-03",
      read_at: null,
    },
  ] as Message[];
  assert.deepEqual(
    conversationHeads(rows, "me").map((h) => [h.id, h.message.body]),
    [
      ["a", "new"],
      ["b", "other"],
    ],
  );
});
