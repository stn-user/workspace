import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOptionalBirthDate } from "../family-members.js";

test("keeps a family member birth date optional and validates calendar dates", () => {
  assert.equal(normalizeOptionalBirthDate(undefined), null);
  assert.equal(normalizeOptionalBirthDate(""), null);
  assert.equal(normalizeOptionalBirthDate("2020-02-29"), "2020-02-29");
  assert.throws(() => normalizeOptionalBirthDate("2019-02-29"), /date calendaire valide/);
  assert.throws(() => normalizeOptionalBirthDate("15/06/2021"), /date calendaire valide/);
});
