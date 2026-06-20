interface Props {
  value: number;
  tone?: "primary" | "leaf" | "sky";
}

export function ScoreBar({ value, tone = "primary" }: Props) {
  const color =
    tone === "leaf"
      ? "var(--color-leaf)"
      : tone === "sky"
        ? "var(--color-sky-foreground)"
        : "var(--color-primary)";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full transition-[width] duration-700"
        style={{ width: `${value}%`, background: color }}
      />
    </div>
  );
}
