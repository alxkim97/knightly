# Supabase setup for Knightly sync

Knightly syncs into the **WorkLog** Supabase project (`uhlbrxyvhfmfeakckzlu`), alongside Vetted's `rm_*` tables. You sign in with your WorkLog account (email and password).

Unlike Vetted's tables, which every WorkLog member shares, Knightly's data is **personal**. Each signed-in user can only read and write their own rows. Anyone with dashboard access to the project can still see every row.

The app only uses the public (publishable) key, so Row Level Security is what protects the data.

## One-time setup

Open the [SQL Editor](https://supabase.com/dashboard/project/uhlbrxyvhfmfeakckzlu/sql/new), paste the whole block and run it. It can be run again safely.

```sql
-- One row per piece of progress (a solved puzzle, a lesson, a review item,
-- a history entry, one device's counters for one day, the settings).
-- See src/rowsShape.js for the kinds.
create table if not exists public.knightly_items (
  user_id    uuid    not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text    not null,
  key        text    not null,
  data       jsonb   not null default '{}'::jsonb,
  deleted    boolean not null default false,
  client_at  bigint  not null default 0,          -- the writing device's clock (ms)
  updated_at timestamptz not null default now(),  -- server time, used for catch-up
  primary key (user_id, kind, key)
);
create index if not exists knightly_items_user_updated_idx on public.knightly_items (user_id, updated_at);

-- Let signed-in users reach the table through the API (RLS below still limits
-- them to their own rows). Newer projects don't grant this automatically.
grant select, insert, update, delete on public.knightly_items to authenticated;

-- Own rows only.
alter table public.knightly_items enable row level security;
drop policy if exists "own rows" on public.knightly_items;
create policy "own rows" on public.knightly_items for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Server time on every write.
create or replace function public.knightly_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists knightly_items_touch on public.knightly_items;
create trigger knightly_items_touch before insert or update on public.knightly_items
  for each row execute function public.knightly_touch();

-- Upload a batch of rows. A row only replaces the stored one if it is at
-- least as new (client_at), so an old offline edit can't undo a newer one.
-- security invoker: runs as the signed-in user, so the policy above applies.
create or replace function public.knightly_push(items jsonb) returns integer
language sql security invoker set search_path = '' as $$
  with up as (
    insert into public.knightly_items as t (user_id, kind, key, data, deleted, client_at)
    select auth.uid(), i->>'kind', i->>'key', coalesce(i->'data', '{}'::jsonb),
           coalesce((i->>'deleted')::boolean, false), coalesce((i->>'client_at')::bigint, 0)
    from jsonb_array_elements(items) as i
    on conflict (user_id, kind, key) do update
      set data = excluded.data, deleted = excluded.deleted, client_at = excluded.client_at
      where t.client_at <= excluded.client_at
    returning 1
  )
  select count(*)::integer from up;
$$;
revoke all on function public.knightly_push(jsonb) from public, anon;
grant execute on function public.knightly_push(jsonb) to authenticated;

-- Live updates between devices.
do $$ begin
  alter publication supabase_realtime add table public.knightly_items;
exception when duplicate_object then null;
end $$;
```

## Check it worked

```sql
select tablename, rowsecurity from pg_tables where tablename = 'knightly_items';
select policyname, roles, cmd, qual from pg_policies where tablename = 'knightly_items';
select pubname from pg_publication_tables where tablename = 'knightly_items';
```

What you should see:
- `rowsecurity = true`
- exactly one policy, `own rows`, for `{authenticated}`, with `qual = (auth.uid() = user_id)`
- `supabase_realtime` listed

## Removing it

To remove Knightly sync completely (this deletes all synced progress for every user):

```sql
drop function if exists public.knightly_push(jsonb);
drop table if exists public.knightly_items;
drop function if exists public.knightly_touch();
```
