'use client';

import { MODE_LABEL, MODES } from '@/lib/course-rounds';
import { FORMATS, PACES, type CourseSpec, type LobbySettings, type Visibility } from '@/lib/mp/protocol';
import { courseChoice, FORMAT_LABEL, PACE_LABEL, REAL_COURSES, specFor } from '@/lib/mp/lobby-ui';

// The host's controls for the lobby's game: course (and holes), format, pace and who can join.
function Seg<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="club-lobby-field" role="group" aria-label={label}>
      <span className="club-lobby-label">{label}</span>
      <span className="club-lobby-seg">
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => o.value !== value && onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </span>
    </div>
  );
}

export default function SettingsEditor({ settings, visibility, today, onChange }: {
  settings: LobbySettings; visibility: Visibility; today: string;
  onChange: (s: LobbySettings, v: Visibility) => void;
}) {
  const spec = settings.spec;
  const setSpec = (next: CourseSpec) => onChange({ ...settings, spec: next }, visibility);
  return (
    <div className="club-lobby-settings">
      <div className="club-lobby-field">
        <label className="club-lobby-label" htmlFor="lobby-course">Course</label>
        <select
          id="lobby-course"
          className="club-lobby-input"
          value={courseChoice(spec)}
          onChange={(e) => setSpec(specFor(e.target.value, spec.kind === 'real' ? spec.mode : 'front', today))}
        >
          <option value="daily">Today’s daily nine</option>
          <option value="random">A random nine</option>
          {REAL_COURSES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {spec.kind === 'real' && (
        <Seg label="Holes" value={spec.mode} options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
          onChange={(mode) => setSpec({ ...spec, mode, day: today })} />
      )}
      {spec.kind === 'random' && (
        <div className="club-lobby-field">
          <span className="club-lobby-label">Random nine</span>
          <button type="button" className="club-lobby-quiet" onClick={() => setSpec(specFor('random', 'front', today))}>Deal another</button>
        </div>
      )}
      <Seg label="Format" value={settings.format} options={FORMATS.map((f) => ({ value: f, label: FORMAT_LABEL[f] }))}
        onChange={(format) => onChange({ ...settings, format }, visibility)} />
      <Seg label="Pace" value={settings.pace} options={PACES.map((p) => ({ value: p, label: PACE_LABEL[p] }))}
        onChange={(pace) => onChange({ ...settings, pace }, visibility)} />
      <Seg label="Who can join" value={visibility}
        options={[{ value: 'private', label: 'Link only' }, { value: 'public', label: 'Public' }]}
        onChange={(v) => onChange(settings, v)} />
    </div>
  );
}
