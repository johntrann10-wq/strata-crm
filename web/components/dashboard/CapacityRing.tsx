interface CapacityRingProps {
  bookedHours: number;
  totalHours: number;
  fetching: boolean;
}

export function CapacityRing({ bookedHours, totalHours, fetching }: CapacityRingProps) {
  const effectiveTotalHours = totalHours === 0 ? 8 : totalHours;
  const pct = Math.min(100, Math.max(0, Math.round((bookedHours / effectiveTotalHours) * 100)));

  const radius = 40;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - pct / 100);

  const arcColor = pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#22c55e';

  if (fetching) {
    return (
      <div className="flex items-center justify-center">
        <div className="rounded-full bg-muted animate-pulse w-24 h-24" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 96 96" width="96" height="96">
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
          />
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke={arcColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transform: 'rotate(-90deg)', transformOrigin: '48px 48px' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold">{pct}%</span>
          <span className="text-[10px] text-muted-foreground">capacity</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        {bookedHours}h / {effectiveTotalHours}h booked
      </p>
    </div>
  );
}