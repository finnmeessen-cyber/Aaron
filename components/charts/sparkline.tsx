import { cn } from "@/lib/utils";

type SparklineProps = {
  values: Array<number | null>;
  className?: string;
  stroke?: string;
};

export function Sparkline({
  values,
  className,
  stroke = "currentColor"
}: SparklineProps) {
  const clean = values.map((value) => value ?? 0);
  const max = Math.max(...clean, 1);
  const min = Math.min(...clean, 0);
  const range = max - min || 1;
  const points = clean
    .map((value, index) => {
      const x = (index / Math.max(clean.length - 1, 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn("h-16 w-full text-primary", className)}
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
