create table if not exists bullpen_sessions (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references players(id) on delete cascade,
  coach_id     uuid not null,
  created_at   timestamptz not null default now(),
  session_date date,
  status       text not null default 'planned',
  pitches      jsonb not null default '[]',
  notes        text
);

create index if not exists bullpen_sessions_player_id_idx on bullpen_sessions(player_id);
create index if not exists bullpen_sessions_coach_id_idx  on bullpen_sessions(coach_id);
