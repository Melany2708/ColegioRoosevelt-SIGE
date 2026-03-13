create table if not exists app_users (
  id text primary key,
  username text not null unique,
  password_hash text not null,
  full_name text not null,
  role text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_sessions (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  session_token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ip_address text,
  user_agent text
);
create index if not exists app_sessions_expires_at_idx on app_sessions (expires_at);
create index if not exists app_sessions_user_id_idx on app_sessions (user_id);

create table if not exists app_snapshots (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text references app_users(id) on delete set null,
  snapshot_source text not null default 'database'
);

create table if not exists audit_logs (
  id text primary key,
  user_id text references app_users(id) on delete set null,
  actor_username text not null,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  ip_address text,
  user_agent text
);
create index if not exists audit_logs_created_at_idx on audit_logs (created_at desc);
create index if not exists audit_logs_user_id_idx on audit_logs (user_id);
