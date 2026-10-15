// Orthographic (top-down) sedan drawn as a drafting blueprint, plus a radial gauge.
// Pure SVG so it stays crisp at any size and themes through CSS custom properties.

export const BLUEPRINT_PINS: Record<string, { x: number; y: number }> = {
  engine: { x: 340, y: 100 },
  brakes: { x: 320, y: 26 },
  tires: { x: 102, y: 174 },
};

type BlueprintProps = {
  label: string;
  activePin?: string | null;
  onPin?: (id: string) => void;
  pinLabels?: Record<string, string>;
};

export function CarBlueprint({ label, activePin, onPin, pinLabels = {} }: BlueprintProps) {
  return (
    <div className="lp-blueprint">
      <svg viewBox="0 0 420 200" role="img" aria-label={label} className="lp-blueprint__svg">
        <g className="lp-blueprint__lines" fill="none" strokeLinejoin="round" strokeLinecap="round">
          {/* wheels */}
          <rect x="78" y="18" width="48" height="16" rx="5" />
          <rect x="296" y="18" width="48" height="16" rx="5" />
          <rect x="78" y="166" width="48" height="16" rx="5" />
          <rect x="296" y="166" width="48" height="16" rx="5" />
          {/* body */}
          <path d="M40 60 C40 36 62 30 92 30 L330 30 C366 30 392 46 396 72 L398 100 L396 128 C392 154 366 170 330 170 L92 170 C62 170 40 164 40 140 Z" />
          {/* glasshouse */}
          <path d="M132 50 L262 50 C286 50 298 66 300 100 C298 134 286 150 262 150 L132 150 C116 150 108 134 108 100 C108 66 116 50 132 50 Z" />
          <path d="M262 50 C286 50 298 66 300 100 C298 134 286 150 262 150 L250 136 L250 64 Z" className="lp-blueprint__glass" />
          <path d="M132 50 C116 50 108 66 108 100 C108 134 116 150 132 150 L142 136 L142 64 Z" className="lp-blueprint__glass" />
          {/* hood and boot creases */}
          <path d="M310 52 C344 60 362 76 366 100 C362 124 344 140 310 148" />
          <path d="M84 56 C62 66 56 82 56 100 C56 118 62 134 84 144" />
          {/* mirrors */}
          <path d="M268 30 L276 18 L290 18 L286 30" />
          <path d="M268 170 L276 182 L290 182 L286 170" />
          {/* centre line + dimension marks */}
          <path d="M20 100 L408 100" className="lp-blueprint__dash" />
          <path d="M40 192 L398 192 M40 188 L40 196 M398 188 L398 196" className="lp-blueprint__dim" />
        </g>
      </svg>
      {onPin && Object.entries(BLUEPRINT_PINS).map(([id, { x, y }]) => (
        <button key={id} type="button" className="lp-hotspot lp-hotspot--blueprint"
          style={{ left: `${(x / 420) * 100}%`, top: `${(y / 200) * 100}%` }}
          aria-pressed={activePin === id} aria-label={pinLabels[id] ?? id} onClick={() => onPin(id)}>
          <span aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

type GaugeProps = { value: number; display: string; label: string; tone?: "emerald" | "obsidian" };

/** Radial SVG gauge; `value` is 0–100. */
export function RadialGauge({ value, display, label, tone = "emerald" }: GaugeProps) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(Math.max(value, 0), 100) / 100);
  return (
    <figure className={`lp-gauge lp-gauge--${tone}`}>
      <div className="lp-gauge__ring">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={radius} className="lp-gauge__track" />
          <circle cx="50" cy="50" r={radius} className="lp-gauge__value"
            strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 50 50)" />
        </svg>
        <strong>{display}</strong>
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}
