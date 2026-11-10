// watcher.ts — prioritized watcher filters, validation and config loading.
//
// A watcher config holds one top-level interval and an ordered list of
// filters. Filters are evaluated low index first; the first match decides
// whether the firing runs, and no match means the firing waits. The legacy
// single-window shape is normalized to a one-element filter list so existing
// workspace configs keep working without being edited.
import { readFileSync } from "node:fs";
import { getWindowStartIsoDate, isInTimeWindow } from "./time-window.js";

const TIME_FORMAT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_FORMAT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const INTERVAL_MIN_MINUTES = 1;
const INTERVAL_MAX_MINUTES = 525_600;

/** One prioritized execution filter. All present conditions must hold. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export interface WatcherFilter {
  /** Exact calendar dates (YYYY-MM-DD) on which the filter may match. */
  days?: string[];
  /** Allowed weekdays (0=Sunday..6=Saturday). */
  daysOfWeek?: number[];
  /** Window start "HH:mm". */
  startTime: string;
  /** Window end "HH:mm". */
  endTime: string;
}

/** The watcher configuration consumed by conver. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export interface WatcherConfig {
  /** IANA timezone name. */
  timezone: string;
  /** The single execution interval, in minutes, shared by every filter. */
  intervalMinutes: number;
  /** Optional package selection; empty or absent means every package. */
  packages?: string[];
  /** Ordered filters; lower index has higher priority. */
  filters: WatcherFilter[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** True only for a real calendar date in YYYY-MM-DD form. */
export function isRealIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_FORMAT_PATTERN.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Convert the legacy single-window shape into the filter array. The new shape
 * is returned unchanged (a defensive copy is not needed because the loader
 * validates before use and conver only reads the result).
 */
export function normalizeWatcherConfig(raw: unknown): WatcherConfig {
  const record = isRecord(raw) ? raw : {};
  let filters: WatcherFilter[];
  if (Array.isArray(record.filters)) {
    filters = record.filters as WatcherFilter[];
  } else if (typeof record.startTime === "string" && typeof record.endTime === "string") {
    filters = [{
      startTime: record.startTime,
      endTime: record.endTime,
      ...(Array.isArray(record.daysOfWeek) ? { daysOfWeek: record.daysOfWeek as number[] } : {}),
    }];
  } else {
    filters = [];
  }
  return {
    timezone: typeof record.timezone === "string" ? record.timezone : "",
    intervalMinutes: typeof record.intervalMinutes === "number" ? record.intervalMinutes : NaN,
    ...(Array.isArray(record.packages) ? { packages: record.packages as string[] } : {}),
    filters,
  };
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function validateDaysOfWeek(value: unknown, errors: string[], label: string): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return;
  }
  if (value.length === 0) {
    errors.push(`${label} must not be empty (omit it for every day)`);
    return;
  }
  const seen = new Set<number>();
  for (const item of value) {
    if (typeof item !== "number" || !Number.isInteger(item)) {
      errors.push(`${label} entries must be integers: ${String(item)}`);
    } else if (item < 0 || item > 6) {
      errors.push(`${label} entries must be 0..6: ${item}`);
    } else if (seen.has(item)) {
      errors.push(`${label} has a duplicate: ${item}`);
    } else {
      seen.add(item);
    }
  }
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function validateDays(value: unknown, errors: string[], label: string): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return;
  }
  if (value.length === 0) {
    errors.push(`${label} must not be empty (omit it for every date)`);
    return;
  }
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRealIsoDate(item)) {
      errors.push(`${label} entry is not a real YYYY-MM-DD date: ${String(item)}`);
    } else if (seen.has(item)) {
      errors.push(`${label} has a duplicate: ${item}`);
    } else {
      seen.add(item);
    }
  }
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function validateFilter(filter: unknown, index: number, errors: string[]): void {
  const label = `filters[${index}]`;
  if (!isRecord(filter)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (typeof filter.startTime !== "string" || !TIME_FORMAT_PATTERN.test(filter.startTime)) {
    errors.push(`${label}.startTime must be "HH:mm": ${String(filter.startTime)}`);
  }
  if (typeof filter.endTime !== "string" || !TIME_FORMAT_PATTERN.test(filter.endTime)) {
    errors.push(`${label}.endTime must be "HH:mm": ${String(filter.endTime)}`);
  }
  validateDaysOfWeek(filter.daysOfWeek, errors, `${label}.daysOfWeek`);
  validateDays(filter.days, errors, `${label}.days`);
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function validatePackages(value: unknown, errors: string[]): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    errors.push("packages must be an array");
    return;
  }
  if (value.length === 0) {
    errors.push("packages must not be empty (omit it for every package)");
    return;
  }
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "") {
      errors.push(`packages entries must be non-empty strings: ${String(item)}`);
    } else if (seen.has(item)) {
      errors.push(`packages has a duplicate: ${item}`);
    } else {
      seen.add(item);
    }
  }
}

/** Validate either the new filter shape or the legacy single-window shape. */
export function validateWatcherConfig(config: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(config)) {
    return { valid: false, errors: ["config must be an object"] };
  }

  const normalized = normalizeWatcherConfig(config);
  if (
    typeof normalized.intervalMinutes !== "number" ||
    !Number.isInteger(normalized.intervalMinutes) ||
    normalized.intervalMinutes < INTERVAL_MIN_MINUTES ||
    normalized.intervalMinutes > INTERVAL_MAX_MINUTES
  ) {
    errors.push(
      `intervalMinutes must be an integer ${INTERVAL_MIN_MINUTES}..${INTERVAL_MAX_MINUTES}`,
    );
  }
  if (typeof config.timezone !== "string" || config.timezone.trim() === "") {
    errors.push("timezone must be a non-empty string");
  } else if (!isValidTimezone(config.timezone)) {
    errors.push(`timezone is not a valid IANA timezone: ${config.timezone}`);
  }
  if (!Array.isArray(config.filters) && !(typeof config.startTime === "string" && typeof config.endTime === "string")) {
    errors.push("filters must be a non-empty array (or provide the legacy startTime/endTime)");
  }
  if (Array.isArray(config.filters) && config.filters.length === 0) {
    errors.push("filters must not be empty");
  }
  normalized.filters.forEach((filter, index) => validateFilter(filter, index, errors));
  validatePackages(config.packages, errors);

  return { valid: errors.length === 0, errors };
}

/** Load, validate and normalize a watcher config file. */
export function loadWatcherConfig(configPath: string): WatcherConfig {
  const raw: unknown = JSON.parse(readFileSync(configPath, "utf-8"));
  const validation = validateWatcherConfig(raw);
  if (!validation.valid) {
    throw new Error(
      `Watcher config validation failed: ${validation.errors.join("; ")}`,
    );
  }
  return normalizeWatcherConfig(raw);
}

/**
 * True when the instant matches at least one filter. Filters are evaluated in
 * order and the first match wins; no match means the firing waits.
 */
export function isWithinAnyFilter(config: WatcherConfig, now: Date): boolean {
  for (const filter of config.filters) {
    if (filter.days !== undefined) {
      const startDate = getWindowStartIsoDate(
        now,
        filter.startTime,
        filter.endTime,
        config.timezone,
      );
      if (!filter.days.includes(startDate)) continue;
    }
    if (
      !isInTimeWindow(
        now,
        filter.startTime,
        filter.endTime,
        config.timezone,
        filter.daysOfWeek,
      )
    ) {
      continue;
    }
    return true;
  }
  return false;
}
