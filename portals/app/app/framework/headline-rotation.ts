/**
 * Workspace headline schedule shared by the app and HTML template.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Model
 * @author AI-Generated
 * @date 2026-11-26
 */

// Configuration

export const DEFAULT_HEADLINES = [
  "\u4ece\u8fd9\u91cc\uff0c\u5f00\u59cb\u4eca\u5929\u7684\u5de5\u4f5c",
  "\u628a\u8ba1\u5212\u53d8\u6210\u4eca\u5929\u7684\u884c\u52a8",
  "\u7406\u6e05\u624b\u5934\u7684\u4e8b\uff0c\u518d\u5f80\u524d\u4e00\u6b65",
  "\u4eca\u5929\uff0c\u5148\u505a\u597d\u4e00\u4ef6\u91cd\u8981\u7684\u4e8b",
  "\u628a\u4eca\u5929\u7684\u91cd\u70b9\u6392\u4e00\u6392",
  "\u63a5\u7740\u4e0a\u6b21\u7684\u8fdb\u5ea6\uff0c\u7ee7\u7eed\u5411\u524d",
  "\u628a\u590d\u6742\u7684\u4e8b\u62c6\u6210\u4e0b\u4e00\u6b65",
  "\u96c6\u4e2d\u7cbe\u529b\uff0c\u89e3\u51b3\u773c\u524d\u7684\u95ee\u9898",
  "\u68b3\u7406\u8fdb\u5c55\uff0c\u5b89\u6392\u4e0b\u4e00\u6b65",
  "\u6309\u81ea\u5df1\u7684\u8282\u594f\uff0c\u628a\u4e8b\u60c5\u63a8\u8fdb",
  "\u4ece\u4e0a\u6b21\u505c\u4e0b\u7684\u5730\u65b9\u7ee7\u7eed",
  "\u7559\u70b9\u65f6\u95f4\uff0c\u60f3\u6e05\u695a\u4e0b\u4e00\u6b65",
] as const;

const DAY_MINUTES = 1440;
const MINUTE_MS = 60_000;
const DAY_MS = DAY_MINUTES * MINUTE_MS;

export type HeadlineSettings = {
  readonly pool: readonly string[];
  readonly intervalMinutes: number;
};

/**
 * Resolve an optional headline override against the product defaults.
 * @param value - The product's headline configuration.
 * @returns A unique title pool and rotation interval in minutes.
 * @throws {TypeError} If the configuration cannot be scheduled.
 */
export function parseHeadlineSettings(value?: unknown): HeadlineSettings {
  if (
    value !== undefined &&
    (typeof value !== "object" || value === null || Array.isArray(value))
  ) {
    throw new TypeError("homeHeadline must be an object");
  }
  const options = (value ?? {}) as Record<string, unknown>;
  const invalidKey = Object.keys(options).find(
    (key) => key !== "pool" && key !== "intervalMinutes",
  );
  if (invalidKey)
    throw new TypeError("Unknown homeHeadline setting: " + invalidKey);

  const rawPool = options.pool === undefined ? DEFAULT_HEADLINES : options.pool;
  if (!Array.isArray(rawPool))
    throw new TypeError("homeHeadline.pool must be an array");
  const pool = rawPool.map((entry: unknown) => {
    if (typeof entry !== "string")
      throw new TypeError("Each headline must be text");
    const title = entry
      .trim()
      .replace(/\u3002+$/u, "")
      .trimEnd();
    if (!title || /[\u0000-\u001f\u007f]/.test(title))
      throw new TypeError("Each headline must be a single nonempty line");
    return title;
  });
  if (pool.length < 10 || new Set(pool).size !== pool.length) {
    throw new TypeError(
      "homeHeadline.pool needs at least 10 distinct headlines",
    );
  }

  const intervalMinutes =
    options.intervalMinutes === undefined
      ? DAY_MINUTES
      : options.intervalMinutes;
  if (
    typeof intervalMinutes !== "number" ||
    !Number.isInteger(intervalMinutes) ||
    intervalMinutes < 1 ||
    intervalMinutes > DAY_MINUTES
  ) {
    throw new TypeError(
      "homeHeadline.intervalMinutes must be an integer from 1 to 1440",
    );
  }
  return { pool, intervalMinutes };
}

// Scheduling

/**
 * Get the rotation index and next local boundary for the given instant.
 * @param settings - Normalized headline settings.
 * @param now - Reference instant in the user's local time zone.
 * @returns The index into the shuffled order and next boundary timestamp.
 */
export function headlineSlot(
  settings: HeadlineSettings,
  now: Date,
): { index: number; nextAt: number } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const today = new Date(year, month, day).getTime();
  const tomorrow = new Date(year, month, day + 1).getTime();
  const civilDay = Date.UTC(year, month, day) / DAY_MS;
  const interval = settings.intervalMinutes * MINUTE_MS;
  const elapsedSlot =
    interval === DAY_MS ? 0 : Math.floor((now.getTime() - today) / interval);
  const dailySlots = Math.ceil(DAY_MS / interval);
  const nextAt =
    interval === DAY_MS
      ? tomorrow
      : Math.min(tomorrow, today + (elapsedSlot + 1) * interval);
  const count = settings.pool.length;
  const modulo = (position: number) => ((position % count) + count) % count;
  const position = modulo(civilDay * dailySlots + elapsedSlot);
  const tomorrowFirst = modulo((civilDay + 1) * dailySlots);
  // A daylight-saving transition can change the count of elapsed slots.
  const index =
    elapsedSlot > 0 && nextAt === tomorrow && position === tomorrowFirst
      ? modulo(position + 1)
      : position;
  return { index, nextAt };
}

function shuffledOrder(count: number, storageKey: string): number[] {
  try {
    const saved: unknown = JSON.parse(
      window.localStorage.getItem(storageKey) ?? "null",
    );
    if (
      Array.isArray(saved) &&
      saved.length === count &&
      new Set(saved).size === count &&
      saved.every(
        (index: unknown) =>
          typeof index === "number" &&
          Number.isInteger(index) &&
          index >= 0 &&
          index < count,
      )
    ) {
      return saved as number[];
    }
  } catch {
    // A disabled or invalid store still permits an in-memory shuffle.
  }

  const order = Array.from({ length: count }, (_, index) => index);
  for (let index = count - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(order));
  } catch {
    // Keep the same in-memory sequence for the life of this page.
  }
  return order;
}

/**
 * Create a stable randomized sequence and a boundary timer for a surface.
 * @param settings - Normalized headline settings.
 * @param storageKey - Product-specific browser storage key.
 * @returns A current title reader and a clock subscription.
 */
export function createHeadlineRotation(
  settings: HeadlineSettings,
  storageKey: string,
) {
  const order = shuffledOrder(settings.pool.length, storageKey);

  return {
    current(now = new Date()) {
      return settings.pool[order[headlineSlot(settings, now).index]];
    },
    watch(onTitle: (title: string) => void) {
      let timer: number;
      function update() {
        window.clearTimeout(timer);
        const now = new Date();
        const slot = headlineSlot(settings, now);
        onTitle(settings.pool[order[slot.index]]);
        timer = window.setTimeout(
          update,
          Math.max(1, slot.nextAt - Date.now()),
        );
      }
      function updateWhenVisible() {
        if (!document.hidden) update();
      }
      update();
      window.addEventListener("pageshow", update);
      window.addEventListener("focus", update);
      document.addEventListener("visibilitychange", updateWhenVisible);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener("pageshow", update);
        window.removeEventListener("focus", update);
        document.removeEventListener("visibilitychange", updateWhenVisible);
      };
    },
  };
}
