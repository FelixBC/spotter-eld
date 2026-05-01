import type { DutyStatus, LogSheet, TimelineEvent } from "../types/api";
import { formatHM } from "../utils/formatDuration";

interface TimelineViewProps {
  logSheets: LogSheet[];
}

const statusColors: Record<DutyStatus, string> = {
  off_duty: "bg-gray-200",
  sleeper_berth: "bg-purple-400",
  driving: "bg-blue-500",
  on_duty: "bg-yellow-400",
};

const statusLabels: Record<DutyStatus, string> = {
  off_duty: "Off-Duty",
  sleeper_berth: "Sleeper Berth",
  driving: "Driving",
  on_duty: "On-Duty",
};

const REST_STATUSES: DutyStatus[] = ["off_duty", "sleeper_berth"];
const DAY_MINUTES = 24 * 60;
const MIN_VISUAL_MINUTES = 15;

function minuteOfDay(isoString: string): number {
  const match = isoString.match(/T(\d{2}):(\d{2})/);
  if (match) {
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }
  const d = new Date(isoString);
  return d.getHours() * 60 + d.getMinutes();
}

function formatClock(minute: number): string {
  const hours24 = Math.floor(minute / 60) % 24;
  const minutes = minute % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
}

function formatDuration(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

function isRestStatus(status: DutyStatus): boolean {
  return REST_STATUSES.includes(status);
}

function eventRange(event: TimelineEvent): { start: number; end: number } {
  const start = minuteOfDay(event.start_time);
  const endRaw = minuteOfDay(event.end_time);
  const end = endRaw <= start ? DAY_MINUTES : endRaw;
  return { start, end };
}

function trailingMidnightRestMinutes(sheet: LogSheet): number {
  let total = 0;
  let expectedEnd = DAY_MINUTES;

  for (let index = sheet.events.length - 1; index >= 0; index -= 1) {
    const event = sheet.events[index];
    const { start, end } = eventRange(event);

    // Only count a single contiguous block that directly touches midnight.
    if (end !== expectedEnd || !isRestStatus(event.status)) break;

    total += end - start;
    expectedEnd = start;
  }

  return total;
}

function leadingMidnightRestMinutes(sheet: LogSheet): number {
  let total = 0;
  let expectedStart = 0;

  for (const event of sheet.events) {
    const { start, end } = eventRange(event);

    // Only count a single contiguous block that begins at midnight.
    if (start !== expectedStart || !isRestStatus(event.status)) break;

    total += end - start;
    expectedStart = end;
  }

  return total;
}

function boundaryContinuousRestMinutes(current: LogSheet, next: LogSheet): number {
  const trailing = trailingMidnightRestMinutes(current);
  const leading = leadingMidnightRestMinutes(next);

  // A boundary-spanning continuous rest requires rest touching midnight
  // on BOTH sides of the day boundary.
  if (trailing === 0 || leading === 0) return 0;
  return trailing + leading;
}

function restPillClasses(totalRestMinutes: number): string {
  if (totalRestMinutes >= 34 * 60) {
    return "border-green-200 bg-green-50 text-green-700 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-300";
  }
  if (totalRestMinutes >= 10 * 60) {
    return "border-green-200 bg-green-50 text-green-700 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-300";
  }
  return "border-red-200 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300";
}

function dayRangePercent(start: string, end: string): { left: number; width: number } {
  const startMinutes = minuteOfDay(start);
  const endRaw = minuteOfDay(end);
  const endMinutes = endRaw <= startMinutes ? DAY_MINUTES : endRaw;
  const left = (startMinutes / DAY_MINUTES) * 100;
  const width = (Math.max(endMinutes - startMinutes, MIN_VISUAL_MINUTES) / DAY_MINUTES) * 100;
  return { left, width };
}

const legendItems: Array<{ status: DutyStatus; label: string }> = [
  { status: "driving", label: "Driving" },
  { status: "on_duty", label: "On-Duty" },
  { status: "off_duty", label: "Off-Duty" },
  { status: "sleeper_berth", label: "Sleeper" },
];

export function TimelineView({ logSheets }: TimelineViewProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Timeline View</h2>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600 dark:text-gray-300">
          {legendItems.map((item) => (
            <li key={item.status} className="flex items-center gap-1.5">
              <span
                className={`inline-block h-3 w-3 rounded-sm border border-gray-300 dark:border-gray-600 ${statusColors[item.status]}`}
                aria-hidden="true"
              />
              <span className="font-medium">{item.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-6">
        {logSheets.map((sheet, index) => {
          const nextSheet = logSheets[index + 1];
          const restAcrossBoundary = nextSheet ? boundaryContinuousRestMinutes(sheet, nextSheet) : 0;
          const restart34Met = restAcrossBoundary >= 34 * 60;
          const restResetMet = restAcrossBoundary >= 10 * 60;

          return (
            <div key={sheet.date} className="space-y-3">
              <article className="rounded-lg border border-gray-200 bg-gray-50/40 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                  {sheet.date}
                </h3>

                <div className="relative h-14 rounded-md border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900">
                  {sheet.events.map((event, eventIndex) => {
                    const { left, width } = dayRangePercent(event.start_time, event.end_time);
                    const { start, end } = eventRange(event);
                    const startLabel = start === 0 ? "Midnight" : formatClock(start);
                    const endLabel = end === DAY_MINUTES ? "Midnight" : formatClock(end);
                    return (
                      <div
                        key={`${event.start_time}-${eventIndex}`}
                        className={`absolute top-2 h-10 cursor-pointer rounded-sm transition-all duration-200 hover:-translate-y-0.5 hover:scale-y-110 hover:shadow-md ${statusColors[event.status]}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${statusLabels[event.status]}: ${startLabel} - ${endLabel} (${formatDuration(end - start)})`}
                      />
                    );
                  })}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-700 md:grid-cols-4 dark:text-gray-300">
                  <p>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Driving:</span>{" "}
                    {formatHM(sheet.totals.driving ?? 0)}
                  </p>
                  <p>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">On-duty:</span>{" "}
                    {formatHM(sheet.totals.on_duty ?? 0)}
                  </p>
                  <p>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Off-duty:</span>{" "}
                    {formatHM(sheet.totals.off_duty ?? 0)}
                  </p>
                  <p>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Sleeper:</span>{" "}
                    {formatHM(sheet.totals.sleeper_berth ?? 0)}
                  </p>
                </div>
              </article>

              {nextSheet ? (
                <div className="flex justify-center">
                  <div
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${restPillClasses(
                      restAcrossBoundary,
                    )}`}
                  >
                    ↓ {formatHM(restAcrossBoundary / 60)} continuous rest ·{" "}
                    {restart34Met
                      ? "34h restart ✓"
                      : `10h reset ${restResetMet ? "✓" : "×"}`}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}