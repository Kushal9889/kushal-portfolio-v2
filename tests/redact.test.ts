import assert from "node:assert/strict";
import { test } from "node:test";
import { find, redact } from "../lib/redact";

test("finds each kind and keeps the text around it", () => {
  const r = redact("Mail ana@example.com or call +1 (555) 010-0199 from 10.0.0.12.");
  assert.equal(r.text, "Mail [EMAIL_1] or call [PHONE_1] from [IP_1].");
});

test("a card number must pass Luhn; look-alike digits stay", () => {
  assert.deepEqual(find("card 4111 1111 1111 1111").map((h) => h.kind), ["CARD"]);
  assert.deepEqual(find("order 4111 1111 1111 1112").map((h) => h.kind), []);
});

test("the same value gets the same placeholder", () => {
  assert.equal(redact("a@b.io then c@d.io then a@b.io").text, "[EMAIL_1] then [EMAIL_2] then [EMAIL_1]");
});

test("keys and SSN-shaped values are caught", () => {
  const r = redact("key sk-test_abcdefghijklmnop1234 ssn 000-12-3456");
  assert.equal(r.text, "key [KEY_1] ssn [SSN_1]");
});

test("a card's placeholder keeps the space after it", () => {
  assert.equal(redact("card 4111 1111 1111 1111 and more").text, "card [CARD_1] and more");
});

import { publicRecordText } from "../lib/public-record";
test("public record serialization removes private names and PII consistently", () => {
  const raw = "Client Example uses email fixture@example.com. Client Example is private.";
  const publicText = publicRecordText(raw, ["Client Example"]);
  assert.ok(!publicText.includes("Client Example"));
  assert.ok(!publicText.includes("fixture@example.com"));
  assert.ok(publicText.includes("[client]"));
  assert.equal(publicRecordText("Public work.", []), "Public work.");
});
