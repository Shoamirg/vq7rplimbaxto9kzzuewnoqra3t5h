import { useId } from 'react';

export type TelemetrySystem = { name: string; label: string; score: number | null };

/** Generic schematic, not a photograph of the customer's particular vehicle. */
export function VehicleSchematic({ leaders = false }: { leaders?: boolean }) {
  const id = useId().replace(/:/g, '');
  return <svg className="vehicle-schematic" viewBox="0 0 640 260" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-body`} x1="0" y1="80" x2="0" y2="205" gradientUnits="userSpaceOnUse"><stop stopColor="#FFFFFF"/><stop offset=".55" stopColor="#D8DCDF"/><stop offset="1" stopColor="#949A9F"/></linearGradient>
      <linearGradient id={`${id}-glass`} x1="0" y1="85" x2="0" y2="155" gradientUnits="userSpaceOnUse"><stop stopColor="#4C525A"/><stop offset="1" stopColor="#181B20"/></linearGradient>
      <filter id={`${id}-shadow`} x="-20%" y="-100%" width="140%" height="300%"><feGaussianBlur stdDeviation="7"/></filter>
    </defs>
    {leaders && <g stroke="currentColor" strokeOpacity=".35" strokeWidth="1"><path d="M160 162 125 55H42M460 176 506 54h90M255 110 230 30h-58M350 184 392 236h162"/><circle cx="160" cy="162" r="4"/><circle cx="460" cy="176" r="4"/><circle cx="255" cy="110" r="4"/></g>}
    <ellipse className="vehicle-ground" cx="324" cy="220" rx="260" ry="12" filter={`url(#${id}-shadow)`}/>
    <path d="M55 179 67 150Q79 140 152 130L224 86Q240 78 276 78h123q41 0 88 56l70 14q22 6 24 28v24H55Z" fill={`url(#${id}-body)`} stroke="#949A9F"/>
    <path d="m174 129 58-35q9-6 38-6h30v41Zm138-41h75q34 0 77 41H312Z" fill={`url(#${id}-glass)`} stroke="#686E76"/>
    <path d="M65 181h86m84 0h195m88 0h57M303 134v65M474 140l7 59M243 141h24m123 0h24M81 153l53-8-6 13H77m475-6 17 4v12h-14" stroke="#686E76" strokeWidth="2"/>
    <path d="M58 198h524v8H58Z" fill="#2B3036"/>
    {[190,474].map(x=><g key={x}><circle cx={x} cy="193" r="34" fill="#181B20"/><circle cx={x} cy="193" r="24" fill="#686E76" stroke="#D0D5DD" strokeWidth="2"/><circle cx={x} cy="193" r="9" fill="#181B20"/>{[0,60,120].map(a=><path key={a} d={`M${x-21} 193h42`} stroke="#D0D5DD" strokeWidth="3" transform={`rotate(${a} ${x} 193)`}/>)}</g>)}
  </svg>;
}

export function TelemetryGauge({ score }: { score: number | null }) {
  const value = score !== null && Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null;
  return <div className="telemetry-gauge">
    <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
      <circle cx="42" cy="42" r="39" fill="none" stroke="currentColor" opacity=".12"/>
      <circle cx="42" cy="42" r="33" fill="none" stroke="currentColor" opacity=".12" strokeWidth="4"/>
      {value !== null && <circle cx="42" cy="42" r="33" fill="none" stroke="currentColor" strokeWidth="4" pathLength="100" strokeDasharray={`${value} 100`} transform="rotate(-90 42 42)"/>}
    </svg>
    <span>{value === null ? '—' : Math.round(value)}{value !== null && <small>%</small>}</span>
  </div>;
}

/** Labels and measurements come from the owning API and locale, never examples. */
export function VehicleTelemetryBlueprint({ title, systems = [], onSelect, active, className = '' }: {
  title: string; systems?: TelemetrySystem[]; onSelect?: (name: string) => void; active?: string | null; className?: string;
}) {
  return <section className={`vehicle-blueprint ${className}`} aria-label={title}>
    <p className="telemetry-label">{title}</p>
    <VehicleSchematic leaders />
    {systems.length > 0 && <div className="telemetry-systems">
      {systems.map(system => onSelect ? <button type="button" data-testid="vic-hotspot" key={system.name} className="telemetry-system" aria-pressed={active === system.name} onClick={() => onSelect(system.name)} aria-label={`${system.label} ${system.score === null ? '—' : Math.round(system.score)}`}>
        <TelemetryGauge score={system.score}/><span className="telemetry-label">{system.label}</span>
      </button> : <div key={system.name} className="telemetry-system"><TelemetryGauge score={system.score}/><span className="telemetry-label">{system.label}</span></div>)}
    </div>}
  </section>;
}
