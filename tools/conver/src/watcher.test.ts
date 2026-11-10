// watcher.test.ts — prioritized filters, days and legacy config normalization.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isWithinAnyFilter,
  loadWatcherConfig,
  normalizeWatcherConfig,
  validateWatcherConfig,
} from "./watcher.js";
import type { WatcherConfig } from "./watcher.js";

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function config(overrides: Partial<WatcherConfig> = {}): WatcherConfig {
  return {
    timezone: "Asia/Tokyo",
    intervalMinutes: 5,
    filters: [{ startTime: "09:00", endTime: "18:00" }],
    ...overrides,
  };
}

/** 2026-11-10T03:00:00Z = 2026-11-10 12:00 Asia/Tokyo */
const NOON_TOKYO = new Date("2026-11-10T03:00:00Z");
/** 2026-11-10T14:00:00Z = 2026-11-10 23:00 Asia/Tokyo */
const LATE_TOKYO = new Date("2026-11-10T14:00:00Z");
/** 2026-11-10T17:00:00Z = 2026-11-11 02:00 Asia/Tokyo */
const AFTER_MIDNIGHT_TOKYO = new Date("2026-11-10T17:00:00Z");

describe("validateWatcherConfig", () => {
  it("accepts the new filter shape", () => {
    const result = validateWatcherConfig(config());
    assert.deepStrictEqual(result, { valid: true, errors: [] });
  });

  it("accepts days and daysOfWeek together", () => {
    const result = validateWatcherConfig(
      config({
        filters: [
          {
            days: ["2026-11-10", "2026-11-11"],
            daysOfWeek: [1, 2, 3],
            startTime: "09:00",
            endTime: "18:00",
          },
        ],
      }),
    );
    assert.strictEqual(result.valid, true);
  });

  it("rejects a missing or invalid intervalMinutes", () => {
    for (const intervalMinutes of [undefined, 0, 1.5, "5", 525_601]) {
      const result = validateWatcherConfig({ ...config(), intervalMinutes });
      assert.strictEqual(result.valid, false);
    }
  });

  it("rejects an empty filters array", () => {
    const result = validateWatcherConfig(config({ filters: [] }));
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("filters")));
  });

  it("rejects an invalid time in a filter", () => {
    const result = validateWatcherConfig(
      config({ filters: [{ startTime: "25:00", endTime: "18:00" }] }),
    );
    assert.strictEqual(result.valid, false);
  });

  it("rejects invalid days: bad format, impossible date, duplicate, empty", () => {
    const invalidDays = [
      ["2026/11/10"],
      ["2026-02-30"],
      ["2026-11-10", "2026-11-10"],
      [],
    ];
    for (const days of invalidDays) {
      const result = validateWatcherConfig(
        config({ filters: [{ days, startTime: "09:00", endTime: "18:00" }] }),
      );
      assert.strictEqual(result.valid, false, JSON.stringify(days));
    }
  });

  it("rejects a duplicated or invalid daysOfWeek", () => {
    for (const daysOfWeek of [[7], [1, 1], [1.5], []]) {
      const result = validateWatcherConfig(
        config({ filters: [{ daysOfWeek, startTime: "09:00", endTime: "18:00" }] }),
      );
      assert.strictEqual(result.valid, false, JSON.stringify(daysOfWeek));
    }
  });

  it("rejects packages that are not an array of non-empty strings", () => {
    for (const packages of [[], "", ["a", "a"], [1]]) {
      const result = validateWatcherConfig({ ...config(), packages });
      assert.strictEqual(result.valid, false, JSON.stringify(packages));
    }
  });
});

describe("normalizeWatcherConfig", () => {
  it("normalizes the legacy single-window shape to one filter", () => {
    const normalized = normalizeWatcherConfig({
      intervalMinutes: 60,
      startTime: "09:00",
      endTime: "19:00",
      timezone: "Asia/Tokyo",
      daysOfWeek: [1, 2, 3, 4, 5],
    });
    assert.strictEqual(normalized.filters.length, 1);
    assert.deepStrictEqual(normalized.filters[0], {
      startTime: "09:00",
      endTime: "19:00",
      daysOfWeek: [1, 2, 3, 4, 5],
    });
  });

  it("keeps the new filter shape unchanged", () => {
    const normalized = normalizeWatcherConfig(config());
    assert.deepStrictEqual(normalized.filters, config().filters);
  });
});

describe("loadWatcherConfig", () => {
  it("loads and normalizes a legacy config file", () => {
    const directory = mkdtempSync(join(tmpdir(), "watcher-"));
    const file = join(directory, "watcher.json");
    writeFileSync(
      file,
      JSON.stringify({
        intervalMinutes: 5,
        startTime: "19:30",
        endTime: "09:30",
        timezone: "Asia/Tokyo",
        daysOfWeek: [1, 2, 3, 4, 5],
      }),
    );
    const loaded = loadWatcherConfig(file);
    assert.strictEqual(loaded.filters.length, 1);
    assert.strictEqual(loaded.filters[0]?.startTime, "19:30");
  });

  it("throws when the file is missing or invalid", () => {
    assert.throws(() => loadWatcherConfig("/no/such/watcher.json"), /ENOENT/);
  });
});

describe("isWithinAnyFilter", () => {
  it("returns true when the first filter matches", () => {
    assert.strictEqual(isWithinAnyFilter(config(), NOON_TOKYO), true);
  });

  it("returns false when no filter matches", () => {
    assert.strictEqual(
      isWithinAnyFilter(config({ filters: [{ startTime: "20:00", endTime: "22:00" }] }), NOON_TOKYO),
      false,
    );
  });

  it("uses the first matching filter and ignores later ones", () => {
    const firstOnly = config({
      filters: [
        { startTime: "09:00", endTime: "18:00" },
        { startTime: "12:00", endTime: "13:00" },
      ],
    });
    assert.strictEqual(isWithinAnyFilter(firstOnly, NOON_TOKYO), true);
  });

  it("ANDs days with daysOfWeek", () => {
    const filtered = config({
      filters: [
        {
          days: ["2026-11-10"],
          daysOfWeek: [2],
          startTime: "09:00",
          endTime: "18:00",
        },
      ],
    });
    assert.strictEqual(isWithinAnyFilter(filtered, NOON_TOKYO), true);
    const wrongWeekday = config({
      filters: [
        {
          days: ["2026-11-10"],
          daysOfWeek: [1],
          startTime: "09:00",
          endTime: "18:00",
        },
      ],
    });
    assert.strictEqual(isWithinAnyFilter(wrongWeekday, NOON_TOKYO), false);
  });

  it("attributes a cross-midnight window to its start date for days", () => {
    const crossMidnight = config({
      filters: [
        {
          days: ["2026-11-10"],
          startTime: "22:00",
          endTime: "06:00",
        },
      ],
    });
    assert.strictEqual(isWithinAnyFilter(crossMidnight, LATE_TOKYO), true);
    assert.strictEqual(isWithinAnyFilter(crossMidnight, AFTER_MIDNIGHT_TOKYO), true);
    assert.strictEqual(
      isWithinAnyFilter(crossMidnight, new Date("2026-11-10T16:00:00Z")),
      true,
    );
  });

  it("rejects an after-midnight time whose start date is the previous day", () => {
    const crossMidnight = config({
      filters: [
        {
          days: ["2026-11-11"],
          startTime: "22:00",
          endTime: "06:00",
        },
      ],
    });
    assert.strictEqual(isWithinAnyFilter(crossMidnight, AFTER_MIDNIGHT_TOKYO), false);
  });
});
