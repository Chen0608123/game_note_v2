-- 在 Supabase Dashboard > SQL Editor 執行整份檔案。
create extension if not exists pgcrypto;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  cover_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('note', 'memory')),
  entry_type text not null default '文字',
  title text not null check (char_length(title) between 1 and 150),
  content text not null default '',
  link_url text,
  created_at timestamptz not null default now()
);

create index if not exists games_user_id_idx on public.games(user_id);
create index if not exists entries_game_id_idx on public.entries(game_id);
create index if not exists entries_user_id_idx on public.entries(user_id);
alter table public.games enable row level security;
alter table public.entries enable row level security;
revoke all on public.games, public.entries from anon;
grant select, insert, update, delete on public.games, public.entries to authenticated;

create policy "users manage own games" on public.games
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users manage own entries" on public.entries
  for all to authenticated using (
    (select auth.uid()) = user_id and exists (
      select 1 from public.games g where g.id = game_id and g.user_id = (select auth.uid())
    )
  ) with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.games g where g.id = game_id and g.user_id = (select auth.uid())
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-covers', 'game-covers', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "authenticated users upload own covers" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'game-covers' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "owners update own covers" on storage.objects
  for update to authenticated using (
    bucket_id = 'game-covers' and owner_id = (select auth.uid())::text
  );
create policy "owners delete own covers" on storage.objects
  for delete to authenticated using (
    bucket_id = 'game-covers' and owner_id = (select auth.uid())::text
  );
