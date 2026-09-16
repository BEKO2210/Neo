-- Neo — database schema.
--
-- Apply this once in the Supabase SQL editor (or via `supabase db push`) before
-- setting SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
--
-- Neo reaches these tables through PostgREST using the service role key, from
-- the server only. Row Level Security stays enabled with no permissive policy,
-- so the anon and authenticated roles get nothing even if the anon key leaks.
-- Account isolation is enforced in the application by user_id on every query.

-- --------------------------------------------------------------------------
-- Accounts
-- --------------------------------------------------------------------------

create table if not exists public.neo_users (
  id             uuid primary key,
  email          text        not null unique,
  password_hash  text        not null,
  role           text        not null default 'member' check (role in ('owner', 'member')),
  created_at     timestamptz not null default now()
);

-- Emails are lower-cased by the application before they get here; this index
-- makes the uniqueness case-insensitive regardless.
create unique index if not exists neo_users_email_lower_idx on public.neo_users (lower(email));

-- --------------------------------------------------------------------------
-- Per-account provider keys, encrypted with AES-256-GCM before insert
-- --------------------------------------------------------------------------

create table if not exists public.neo_user_keys (
  user_id     uuid        not null references public.neo_users (id) on delete cascade,
  provider    text        not null check (provider in ('anthropic', 'openai', 'google', 'github')),
  ciphertext  text        not null,
  iv          text        not null,
  tag         text        not null,
  hint        text        not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, provider)
);

-- --------------------------------------------------------------------------
-- Machine tokens — only the SHA-256 digest is stored
-- --------------------------------------------------------------------------

create table if not exists public.neo_agent_tokens (
  id            uuid        primary key,
  user_id       uuid        not null references public.neo_users (id) on delete cascade,
  token_hash    text        not null unique,
  label         text        not null,
  hint          text        not null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists neo_agent_tokens_user_idx on public.neo_agent_tokens (user_id);

-- --------------------------------------------------------------------------
-- Usage metering
-- --------------------------------------------------------------------------

create table if not exists public.neo_usage (
  id             bigserial   primary key,
  user_id        uuid        not null references public.neo_users (id) on delete cascade,
  at             timestamptz not null default now(),
  provider       text        not null,
  model          text        not null,
  input_tokens   integer     not null default 0,
  output_tokens  integer     not null default 0,
  cost_usd       numeric(12, 6),
  kind           text        not null check (kind in ('chat', 'mission'))
);

create index if not exists neo_usage_user_at_idx on public.neo_usage (user_id, at desc);

-- --------------------------------------------------------------------------
-- Fleet, scoped to one account
-- --------------------------------------------------------------------------

create table if not exists public.neo_nodes (
  user_id    uuid        not null references public.neo_users (id) on delete cascade,
  id         text        not null,
  last_seen  timestamptz not null default now(),
  payload    jsonb       not null,
  primary key (user_id, id)
);

create index if not exists neo_nodes_last_seen_idx on public.neo_nodes (user_id, last_seen desc);

create table if not exists public.neo_events (
  id       text        primary key,
  user_id  uuid        not null references public.neo_users (id) on delete cascade,
  at       timestamptz not null default now(),
  level    text        not null check (level in ('info', 'warn', 'error')),
  source   text        not null,
  message  text        not null
);

create index if not exists neo_events_user_at_idx on public.neo_events (user_id, at desc);

-- --------------------------------------------------------------------------
-- Lock everything down
-- --------------------------------------------------------------------------

alter table public.neo_users        enable row level security;
alter table public.neo_user_keys    enable row level security;
alter table public.neo_agent_tokens enable row level security;
alter table public.neo_usage        enable row level security;
alter table public.neo_nodes        enable row level security;
alter table public.neo_events       enable row level security;

-- --------------------------------------------------------------------------
-- Housekeeping: keep the event log and usage history from growing unbounded.
-- Call from a scheduled job (pg_cron) or by hand.
-- --------------------------------------------------------------------------

create or replace function public.neo_prune(keep_events integer default 2000, keep_usage_days integer default 400)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
  total   integer := 0;
begin
  with doomed as (
    select id from public.neo_events order by at desc offset keep_events
  )
  delete from public.neo_events e using doomed d where e.id = d.id;
  get diagnostics removed = row_count;
  total := total + removed;

  delete from public.neo_usage where at < now() - make_interval(days => keep_usage_days);
  get diagnostics removed = row_count;
  return total + removed;
end;
$$;
