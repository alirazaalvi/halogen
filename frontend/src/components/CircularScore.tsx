interface Props {
  value: number;
  size?: number;
  label?: string;
}

export function CircularScore({ value, size = 180, label = "Family Score" }: Props) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  const color = value >= 85 ? "var(--color-leaf)" : value >= 70 ? "var(--color-sky-foreground)" : "var(--color-primary)";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-muted)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-display text-5xl tracking-tight">{value}</div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        </div>
      </div>
    </div>
  );
}
