-- 修復已存在但欄位不完整的舊資料表。
-- 請在 Supabase Dashboard > SQL Editor 執行整份檔案。

create extension if not exists pgcrypto;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid()
);

alter table public.games add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.games add column if not exists name text;
alter table public.games add column if not exists cover_url text;
alter table public.games add column if not exists created_at timestamptz default now();

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid()
);

alter table public.entries add column if not exists game_id uuid references public.games(id) on delete cascade;
alter table public.entries add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.entries add column if not exists kind text;
alter table public.entries add column if not exists entry_type text default '文字';
alter table public.entries add column if not exists title text;
alter table public.entries add column if not exists content text default '';
alter table public.entries add column if not exists link_url text;
alter table public.entries add column if not exists created_at timestamptz default now();

create index if not exists games_user_id_idx on public.games(user_id);
create index if not exists entries_game_id_idx on public.entries(game_id);
create index if not exists entries_user_id_idx on public.entries(user_id);

alter table public.games enable row level security;
alter table public.entries enable row level security;
revoke all on public.games, public.entries from anon;
grant select, insert, update, delete on public.games, public.entries to authenticated;

drop policy if exists "users manage own games" on public.games;
create policy "users manage own games" on public.games
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users manage own entries" on public.entries;
create policy "users manage own entries" on public.entries
  for all to authenticated
  using (
    (select auth.uid()) = user_id and exists (
      select 1 from public.games g
      where g.id = game_id and g.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.games g
      where g.id = game_id and g.user_id = (select auth.uid())
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'game-covers',
  'game-covers',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated users upload own covers" on storage.objects;
create policy "authenticated users upload own covers" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'game-covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "owners update own covers" on storage.objects;
create policy "owners update own covers" on storage.objects
  for update to authenticated using (
    bucket_id = 'game-covers' and owner_id = (select auth.uid())::text
  );

drop policy if exists "owners delete own covers" on storage.objects;
create policy "owners delete own covers" on storage.objects
  for delete to authenticated using (
    bucket_id = 'game-covers' and owner_id = (select auth.uid())::text
  );

-- 要求 Supabase Data API 立即重新讀取資料表結構。
notify pgrst, 'reload schema';
