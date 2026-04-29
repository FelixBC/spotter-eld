import type { DutyStatus, LogSheet as LogSheetType } from "../types/api";

interface LogSheetProps {
  logSheet: LogSheetType;
}

const statusRows: Array<{ key: DutyStatus; label: string; color: string }> = [
  { key: "off_duty", label: "Off Duty", color: "bg-gray-300" },
  { key: "sleeper_berth", label: "Sleeper Berth", color: "bg-purple-400" },
  { key: "driving", label: "Driving", color: "bg-blue-500" },
  { key: "on_duty", label: "On Duty (Not Driving)", color: "bg-yellow-400" },
];

function minuteOfDay(value: string): number {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildDaySlots(logSheet: LogSheetType): DutyStatus[] {
  const slots: DutyStatus[] = Array.from({ length: 96 }, () => "off_duty");

  logSheet.events.forEach((event) => {
    const startMinute = minuteOfDay(event.start_time);
    const rawEndMinute = minuteOfDay(event.end_time);
    const normalizedEnd = rawEndMinute <= startMinute ? rawEndMinute + 1440 : rawEndMinute;
    const endMinute = Math.max(startMinute + 1, normalizedEnd);
    const startSlot = clamp(Math.floor(startMinute / 15), 0, 95);
    const endSlot = clamp(Math.ceil(endMinute / 15), 0, 96);

    for (let slot = startSlot; slot < endSlot; slot += 1) {
      slots[slot] = event.status;
    }
  });

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

export function LogSheet({ logSheet }: LogSheetProps) {
  const slots = buildDaySlots(logSheet);
  const totals = totalsFromSlots(slots);
  const remarks = logSheet.events.map((event) => `${event.remark} (${event.location})`);
  const totalHours = statusRows.reduce((sum, row) => sum + totals[row.key], 0);

  return (
    <section className="rounded-xl border border-gray-300 bg-white p-3 shadow-lg">
      <h3 className="mb-2 text-lg font-semibold text-gray-900">Driver&apos;s Daily Log</h3>

      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-800">
        <span>
          <span className="font-semibold">Date:</span> {logSheet.date}
        </span>
        <span>
          <span className="font-semibold">Carrier:</span> Spotter ELD
        </span>
        <span>
          <span className="font-semibold">Total Miles:</span> {logSheet.total_miles.toFixed(1)}
        </span>
      </div>

      {/* Fluid layout: 24 hour bands × 4 fifteen-minute ticks — fits container width, no horizontal scroll */}
      <div className="w-full max-w-full overflow-hidden rounded border border-gray-300">
        <div className="flex min-h-[22px] border-b border-gray-300 bg-black text-[9px] font-semibold uppercase leading-none text-white">
          <div className="flex w-[5.25rem] shrink-0 items-center justify-center border-r border-gray-600 px-0.5 py-1">
            Status
          </div>
          <div className="flex min-w-0 flex-1">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="flex min-w-0 flex-1 items-center justify-center border-r border-gray-600 py-1 last:border-r-0"
              >
                {hour}
              </div>
            ))}
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
              {HOURS.map((hour) => (
                <div key={hour} className="flex min-w-0 flex-1 border-r border-gray-200 last:border-r-0">
                  {[0, 1, 2, 3].map((quarter) => {
                    const slot = hour * 4 + quarter;
                    const active = slots[slot] === row.key;
                    return (
                      <div
                        key={quarter}
                        className={`min-h-[14px] flex-1 border-r border-gray-200 last:border-r-0 ${
                          active ? row.color : "bg-gray-100"
                        }`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex w-14 shrink-0 items-center justify-center border-l border-gray-300 px-0.5 py-0.5 text-[11px] font-semibold tabular-nums">
              {totals[row.key].toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto] md:items-start">
        <div className="rounded border border-gray-300 px-2 py-1.5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-700">Remarks</p>
          <ul className="space-y-0.5 text-[11px] leading-snug text-gray-700">
            {remarks.map((remark, index) => (
              <li key={`${remark}-${index}`}>{remark}</li>
            ))}
          </ul>
        </div>
        <div className="rounded border border-gray-300 px-2 py-1.5 text-[11px] md:min-w-[11rem]">
          <p className="mb-1 font-semibold uppercase tracking-wide text-gray-700">Daily Check</p>
          <p className={Math.abs(totalHours - 24) <= 0.25 ? "font-semibold text-green-700" : "font-semibold text-red-700"}>
            Sum: {totalHours.toFixed(2)} / 24.00 h
          </p>
        </div>
      </div>
    </section>
  );
}
