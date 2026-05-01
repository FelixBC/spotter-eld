import type { DutyStatus, LogSheet as LogSheetType } from "../types/api";

interface LogSheetProps {
  logSheet: LogSheetType;
}

const statusRows: Array<{ key: DutyStatus; label: string; color: string }> = [
  { key: "off_duty", label: "Off Duty", color: "bg-slate-400" },
  { key: "sleeper_berth", label: "Sleeper Berth", color: "bg-purple-500" },
  { key: "driving", label: "Driving", color: "bg-blue-500" },
  { key: "on_duty", label: "On Duty (Not Driving)", color: "bg-amber-400" },
];

/**
 * Extract minutes-of-day from an ISO 8601 string by reading the T##:## part
 * directly, bypassing any browser timezone conversion. The backend always
 * serializes timestamps in America/Chicago local time, so this gives the
 * correct Chicago clock value regardless of where the browser is running.
 */
function minuteOfDay(isoString: string): number {
  const match = isoString.match(/T(\d{2}):(\d{2})/);
  if (match) {
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }
  // Unreachable in practice; fall back to local-time parse if format is unexpected.
  const d = new Date(isoString);
  return d.getHours() * 60 + d.getMinutes();
}

interface DaySegment {
  status: DutyStatus;
  start: number;
  end: number;
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

function segmentTitle(label: string, start: number, end: number): string {
  const startLabel = start === 0 ? "Midnight" : formatClock(start);
  const endLabel = end === 24 * 60 ? "Midnight" : formatClock(end);
  return `${label}: ${startLabel} - ${endLabel} (${formatDuration(end - start)})`;
}

function buildDaySegments(logSheet: LogSheetType): DaySegment[] {
  return logSheet.events.map((event) => {
    const start = minuteOfDay(event.start_time);
    const rawEnd = minuteOfDay(event.end_time);
    const end = rawEnd <= start ? 24 * 60 : Math.max(start + 1, rawEnd);
    return { status: event.status, start, end };
  });
}

function buildDaySlots(logSheet: LogSheetType): DutyStatus[] {
  const slots: DutyStatus[] = Array.from({ length: 96 }, () => "off_duty");

  // Pre-compute each event's [startMinute, endMinute) in Chicago local time.
  // Events that cross midnight are clamped to [0, 1440).
  const boundaries = logSheet.events.map((event) => {
    const start = minuteOfDay(event.start_time);
    const rawEnd = minuteOfDay(event.end_time);
    // If rawEnd <= start the event crosses midnight; cap at 1440 (end of day).
    const end = rawEnd <= start ? 1440 : Math.max(start + 1, rawEnd);
    return { status: event.status, start, end };
  });

  // For each 15-minute slot, find the first event whose window covers it.
  // Events are chronological and non-overlapping, so the first match is correct.
  for (let slot = 0; slot < 96; slot++) {
    const slotStart = slot * 15;
    const slotMid = slotStart + 7; // use slot midpoint to avoid rounding edge cases
    for (const ev of boundaries) {
      if (ev.start <= slotMid && slotMid < ev.end) {
        slots[slot] = ev.status;
        break;
      }
    }
  }

  return slots;
}

function totalsFromSlots(slots: DutyStatus[]): Record<DutyStatus, number> {
  const totals: Record<DutyStatus, number> = {
    off_duty: 0,
    sleeper_berth: 0,
    driving: 0,
    on_duty: 0,
  };

  slots.forEach((status) => {
    totals[status] += 0.25;
  });

  return totals;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const HOUR_LABELS: string[] = [
  "Mid-\nnght", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11",
  "Noon",       "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11",
];

export function LogSheet({ logSheet }: LogSheetProps) {
  const segments = buildDaySegments(logSheet);
  const slots = buildDaySlots(logSheet);
  const totals = totalsFromSlots(slots);
  const remarks = logSheet.events.map((event) => `${event.remark} (${event.location})`);
  const totalHours = statusRows.reduce((sum, row) => sum + totals[row.key], 0);

  return (
    <section className="rounded-xl border border-gray-300 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-gray-200 pb-2 dark:border-gray-700">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Driver&apos;s Daily Log
          </h3>
          <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            (One per 24-hour period)
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-800 dark:text-gray-200">
          <span>
            <span className="font-semibold">Date:</span> {logSheet.date}
          </span>
          <span>
            <span className="font-semibold">Carrier:</span> Spotter ELD
          </span>
          <span>
            <span className="font-semibold">Total Miles:</span>{" "}
            {logSheet.total_miles.toFixed(1)}
          </span>
        </div>
      </div>

      {/* FMCSA-style identification fields. Blank lines preserve the look of the
          paper form; values are intentionally empty in this app. */}
      <div className="mb-3 grid gap-2 text-[11px] text-gray-800 sm:grid-cols-2 dark:text-gray-200">
        <div className="flex items-end gap-2 border-b border-gray-300 pb-0.5 dark:border-gray-600">
          <span className="font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
            Driver:
          </span>
          <span className="flex-1">&nbsp;</span>
        </div>
        <div className="flex items-end gap-2 border-b border-gray-300 pb-0.5 dark:border-gray-600">
          <span className="font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
            Co-Driver:
          </span>
          <span className="flex-1 text-gray-500 dark:text-gray-500">N/A</span>
        </div>
        <div className="flex items-end gap-2 border-b border-gray-300 pb-0.5 dark:border-gray-600">
          <span className="font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
            Vehicle No:
          </span>
          <span className="flex-1">&nbsp;</span>
        </div>
        <div className="flex items-end gap-2 border-b border-gray-300 pb-0.5 dark:border-gray-600">
          <span className="font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
            Trailer No:
          </span>
          <span className="flex-1">&nbsp;</span>
        </div>
      </div>

      {/* Fluid layout: 24 hour bands × 4 fifteen-minute ticks — fits container
          width, no horizontal scroll. The grid is intentionally anchored to a
          white "paper" surface even in dark mode, matching the FMCSA paper
          form — it sits inside the dark card like a printed sheet. */}
      <div className="w-full max-w-full overflow-hidden rounded border border-gray-300 bg-white text-gray-900 dark:border-gray-600">
        <div className="flex min-h-[24px] border-b border-gray-300 bg-black text-[10px] font-semibold leading-none text-white">
          <div className="flex w-[5.25rem] shrink-0 items-center justify-center border-r border-gray-600 px-0.5 py-1">
            Status
          </div>
          {/* 24 hour-label cells matching the 24 hour columns in the data
              rows below, plus a fixed-width "Mid-nght" boundary marker on the
              right. The data rows have a matching empty spacer of the same
              width so the 24 hour columns stay aligned with their labels. */}
          <div className="flex min-w-0 flex-1">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className={`flex min-w-0 flex-1 items-center justify-center whitespace-pre-line border-r border-gray-600 py-0.5 text-center leading-tight ${
                  hour === 0 || hour === 12 ? "text-[9px] font-bold text-yellow-300" : ""
                }`}
              >
                {HOUR_LABELS[hour]}
              </div>
            ))}
            <div className="flex w-10 shrink-0 items-center justify-center whitespace-pre-line py-0.5 text-center text-[9px] font-bold leading-tight text-yellow-300">
              {"Mid-\nnght"}
            </div>
          </div>
          <div className="flex w-14 shrink-0 items-center justify-center border-l border-gray-600 px-0.5 py-1">
            Hrs
          </div>
        </div>

        {statusRows.map((row) => (
          <div key={row.key} className="flex border-b border-gray-300 bg-white last:border-b-0">
            <div className="flex w-[5.25rem] shrink-0 items-center border-r border-gray-300 px-1 py-0.5 text-[10px] font-medium leading-tight text-gray-900">
              {row.label}
            </div>
            <div className="flex min-w-0 flex-1">
              <div className="relative min-w-0 flex-1">
                <div className="flex min-w-0 flex-1">
                  {HOURS.map((hour) => (
                    <div key={hour} className="flex min-w-0 flex-1 border-r border-gray-300">
                      {[0, 1, 2, 3].map((quarter) => (
                        <div
                          key={quarter}
                          className="min-h-[14px] flex-1 border-r border-gray-200 bg-gray-100 last:border-r-0"
                        />
                      ))}
                    </div>
                  ))}
                </div>

                {/* Duty periods rendered as continuous overlays so each entire
                    section can be hovered and emphasized as one visual block. */}
                <div className="pointer-events-none absolute inset-0">
                  {segments
                    .filter((segment) => segment.status === row.key)
                    .map((segment, index) => (
                      <div
                        key={`${row.key}-${segment.start}-${segment.end}-${index}`}
                        className={`pointer-events-auto absolute bottom-0 top-0 cursor-pointer rounded-[1px] transition-all duration-200 hover:z-20 hover:scale-y-125 hover:shadow-sm ${row.color}`}
                        style={{
                          left: `${(segment.start / (24 * 60)) * 100}%`,
                          width: `${((segment.end - segment.start) / (24 * 60)) * 100}%`,
                        }}
                        title={segmentTitle(row.label, segment.start, segment.end)}
                      />
                    ))}
                </div>
              </div>
              {/* Empty spacer matching the right "Mid-nght" header cell so the
                  24 hour columns stay perfectly aligned with the labels above. */}
              <div className="w-10 shrink-0 bg-white" aria-hidden="true" />
            </div>
            <div className="flex w-14 shrink-0 items-center justify-center border-l border-gray-300 px-0.5 py-0.5 text-[11px] font-semibold tabular-nums">
              {totals[row.key].toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto] md:items-start">
        <div className="rounded border border-gray-300 px-2 py-1.5 dark:border-gray-600 dark:bg-gray-900/40">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
            Remarks
          </p>
          <ul className="space-y-0.5 text-[11px] leading-snug text-gray-700 dark:text-gray-200">
            {remarks.map((remark, index) => (
              <li key={`${remark}-${index}`}>{remark}</li>
            ))}
          </ul>
        </div>
        <div className="rounded border border-gray-300 px-2 py-1.5 text-[11px] md:min-w-[11rem] dark:border-gray-600 dark:bg-gray-900/40">
          <p className="mb-1 font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
            Daily Check
          </p>
          <p
            className={
              Math.abs(totalHours - 24) <= 0.25
                ? "font-semibold text-green-700 dark:text-green-400"
                : "font-semibold text-red-700 dark:text-red-400"
            }
          >
            Sum: {totalHours.toFixed(2)} / 24.00 h
          </p>
        </div>
      </div>
    </section>
  );
}
