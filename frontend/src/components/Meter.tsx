import type { Tone } from '../format';

export function Meter({ value, tone = 'ok', label }: { value: number; tone?: Tone; label: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div
      className={`meter${tone === 'ok' ? '' : ` meter--${tone}`}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
