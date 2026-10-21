import test from "node:test";
import assert from "node:assert";
import { calculateAlertType } from "../state.js";

test("Phase 7 - Alert Logic: calculates red for expired alerts", () => {
  // Mock today to 2026-10-19 via global date if needed, or rely on absolute dates if we mock Date
  const realDate = Date;
  global.Date = class extends Date {
    constructor(date) {
      if (date) return new realDate(date);
      return new realDate("2026-10-19T00:00:00Z");
    }
  };

  assert.strictEqual(calculateAlertType("2026-10-18"), "red");

  global.Date = realDate;
});

test("Phase 7 - Alert Logic: calculates amber for upcoming alerts (<= 30 days)", () => {
  const realDate = Date;
  global.Date = class extends Date {
    constructor(date) {
      if (date) return new realDate(date);
      return new realDate("2026-10-19T00:00:00Z");
    }
  };

  assert.strictEqual(calculateAlertType("2026-11-15"), "amber");

  global.Date = realDate;
});

test("Phase 7 - Alert Logic: calculates blue for future alerts (> 30 days)", () => {
  const realDate = Date;
  global.Date = class extends Date {
    constructor(date) {
      if (date) return new realDate(date);
      return new realDate("2026-10-19T00:00:00Z");
    }
  };

  assert.strictEqual(calculateAlertType("2026-12-01"), "blue");

  global.Date = realDate;
});
