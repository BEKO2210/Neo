-- Neo — durable storage schema.
--
-- Apply this once in the Supabase SQL editor (or via `supabase db push`) before
-- setting SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
--
-- Neo reaches these tables through PostgREST using the service role key from
-- the server only. Row Level Security stays enabled with no permissive policy,
-- so anon and authenticated clients get nothing even if the anon key leaks.

create table if not exists public.neo_nodes (
  id          text primary key,
  last_seen   timestamptz not null default now(),
  payload     jsonb       not null,
  updated_at  timestamptz not null default now()
);

create index if not exists neo_nodes_last_seen_idx on public.neo_nodes (last_seen desc);

create table if not exists public.neo_events (
  id        text primary key,
  at        timestamptz not null default now(),
  level     text        not null check (level in ('info', 'warn', 'error')),
  source    text        not null,
  message   text        not null
);

create index if not exists neo_events_at_idx on public.neo_events (at desc);

alter table public.neo_nodes  enable row level security;
alter table public.neo_events enable row level security;

-- Keep the event log from growing without bound. Call it from a scheduled job
-- (pg_cron) or whenever you feel like it.
create or replace function public.neo_prune_events(keep integer default 2000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  with doomed as (
    select id from public.neo_events order by at desc offset keep
  )
  delete from public.neo_events e using doomed d where e.id = d.id;
  get diagnostics removed = row_count;
  return removed;
end;
$$;
