'use client';

import { MODE_LABEL, MODES } from '@/lib/course-rounds';
import { FORMATS, PACES, PLAYER_COUNTS, type PlayerCount, type TeamMode, type CourseSpec, type LobbySettings, type Visibility } from '@/lib/mp/protocol';
import { courseChoice, DEFAULT_SIDES, FORMAT_LABEL, PLAYABLE_TEAM_MODES, PACE_LABEL, REAL_COURSES, specFor } from '@/lib/mp/lobby-ui';
import { TEAM_LABEL } from '@/lib/mp/finish-core';

// The host's controls for the lobby's game: course (and holes), format, pace and who can join.
function Seg<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="club-lobby-field" role="group" aria-label={label}>
      <span className="club-lobby-label">{label}</span>
      <span className="club-lobby-seg">
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} disabled={o.disabled} onClick={() => o.value !== value && onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </span>
    </div>
  );
}

// present: players in the lobby now, so the host can't make it smaller than that.
export default function SettingsEditor({ settings, visibility, today, present, onChange }: {
  settings: LobbySettings; visibility: Visibility; today: string; present: number;
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
      <Seg label="Players" value={String(settings.maxPlayers)}
        options={PLAYER_COUNTS.map((n) => ({ value: String(n), label: String(n), disabled: n < present }))}
        onChange={(v) => {
          const next: LobbySettings = { ...settings, maxPlayers: Number(v) as PlayerCount };
          if (next.maxPlayers !== 4) delete next.teams; // teams need four
          if (next.maxPlayers > 2 && !next.teams) next.format = 'stroke'; // match play: one against one, or side against side
          onChange(next, visibility);
        }} />
      {settings.maxPlayers === 4 && (
        <Seg label="Teams" value={settings.teams?.mode ?? 'off'}
          options={[{ value: 'off', label: 'Off' }, ...PLAYABLE_TEAM_MODES.map((m) => ({ value: m, label: TEAM_LABEL[m] }))]}
          onChange={(v) => {
            const next: LobbySettings = { ...settings, teams: { mode: v as TeamMode, sides: settings.teams?.sides ?? DEFAULT_SIDES } };
            if (v === 'off') { delete next.teams; next.format = 'stroke'; }
            onChange(next, visibility);
          }} />
      )}
      <Seg label="Format" value={settings.format}
        // match play is one against one, or side against side in a 2v2
        options={FORMATS.map((f) => ({ value: f, label: FORMAT_LABEL[f], disabled: f === 'match' && settings.maxPlayers > 2 && !settings.teams }))}
        onChange={(format) => onChange({ ...settings, format }, visibility)} />
      <Seg label="Pace" value={settings.pace} options={PACES.map((p) => ({ value: p, label: PACE_LABEL[p] }))}
        onChange={(pace) => onChange({ ...settings, pace }, visibility)} />
      <Seg label="Who can join" value={visibility}
        options={[{ value: 'private', label: 'Link only' }, { value: 'public', label: 'Public' }]}
        onChange={(v) => onChange(settings, v)} />
    </div>
  );
}
