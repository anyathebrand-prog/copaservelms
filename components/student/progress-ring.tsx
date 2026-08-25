/** Animated progress ring (PRD §9.1). Pure SVG — no client JS needed. */
export function ProgressRing({ value, size = 128 }: { value: number; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${clamped}% complete`}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" strokeWidth="10" className="stroke-border"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" strokeWidth="10" strokeLinecap="round"
          className="stroke-brand transition-[stroke-dashoffset] duration-1000 ease-out"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute font-display text-2xl font-bold">{clamped}%</span>
    </div>
  );
}
