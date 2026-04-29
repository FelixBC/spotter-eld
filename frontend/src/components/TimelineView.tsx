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

export function TimelineView({ logSheets }: TimelineViewProps) {
  return (
    <section className="rounded-xl bg-white p-6 shadow-lg">
      <h2 className="mb-4 text-2xl font-semibold text-gray-900">Timeline View</h2>

      <div className="space-y-6">
        {logSheets.map((sheet) => (
          <article key={sheet.date} className="rounded-lg border border-gray-200 p-4">
            <h3 className="mb-3 text-lg font-medium text-gray-800">{sheet.date}</h3>

            <div className="relative h-14 rounded-md border border-gray-300 bg-gray-50">
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

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-700 md:grid-cols-4">
              <p>Driving: {(sheet.totals.driving ?? 0).toFixed(2)}h</p>
              <p>On-duty: {(sheet.totals.on_duty ?? 0).toFixed(2)}h</p>
              <p>Off-duty: {(sheet.totals.off_duty ?? 0).toFixed(2)}h</p>
              <p>Sleeper: {(sheet.totals.sleeper_berth ?? 0).toFixed(2)}h</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
