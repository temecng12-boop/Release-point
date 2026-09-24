create table if not exists player_teams (
  player_id uuid not null references players(id) on delete cascade,
  team_id   uuid not null references teams(id)   on delete cascade,
  primary key (player_id, team_id)
);
