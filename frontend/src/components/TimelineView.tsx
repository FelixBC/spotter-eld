import type { DutyStatus, LogSheet } from "../types/api";

interface TimelineViewProps {
  logSheets: LogSheet[];
}

const statusColors: Record<DutyStatus, string> = {
  off_duty: "bg-gray-200",
  sleeper_berth: "bg-purple-400",
  driving: "bg-blue-500",
  on_duty: "bg-yellow-400",
};

function dayRangePercent(start: string, end: string): { left: number; width: number } {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
  const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
  const left = (startMinutes / (24 * 60)) * 100;
  const width = (Math.max(endMinutes - startMinutes, 15) / (24 * 60)) * 100;
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
        {logSheets.map((sheet) => (
          <article
            key={sheet.date}
            className="rounded-lg border border-gray-200 bg-gray-50/40 p-4 dark:border-gray-700 dark:bg-gray-900/40"
          >
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
              {sheet.date}
            </h3>

            <div className="relative h-14 rounded-md border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900">
              {sheet.events.map((event, index) => {
                const { left, width } = dayRangePercent(event.start_time, event.end_time);
                return (
                  <div
                    key={`${event.start_time}-${index}`}
                    className={`absolute top-2 h-10 rounded-sm ${statusColors[event.status]}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${event.status}: ${event.location}`}
                  />
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-700 md:grid-cols-4 dark:text-gray-300">
              <p>
                <span className="font-semibold text-gray-900 dark:text-gray-100">Driving:</span>{" "}
                {(sheet.totals.driving ?? 0).toFixed(2)}h
              </p>
              <p>
                <span className="font-semibold text-gray-900 dark:text-gray-100">On-duty:</span>{" "}
                {(sheet.totals.on_duty ?? 0).toFixed(2)}h
              </p>
              <p>
                <span className="font-semibold text-gray-900 dark:text-gray-100">Off-duty:</span>{" "}
                {(sheet.totals.off_duty ?? 0).toFixed(2)}h
              </p>
              <p>
                <span className="font-semibold text-gray-900 dark:text-gray-100">Sleeper:</span>{" "}
                {(sheet.totals.sleeper_berth ?? 0).toFixed(2)}h
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
