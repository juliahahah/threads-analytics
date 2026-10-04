-- ===========================================================================
-- Threads Analytics — schema + Row Level Security
--
-- Tables
--   profiles        使用者資料（對應 auth.users）
--   analysis_jobs   分析任務（一次爬取/匯入 + 分析）
--   posts           貼文資料（屬於某個 job）
--   analysis_results 彙總分析結果（每個 job 一筆 JSONB）
--
-- 權限模型：所有資料表都以 user_id 綁定擁有者，RLS 強制
-- `auth.uid() = user_id`，因此不同使用者無法互相讀寫。
-- ===========================================================================

-- --------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  display_name text,
  created_at  timestamptz not null default now()
);

comment on table public.profiles is '使用者資料，1:1 對應 auth.users';

-- 新使用者註冊時自動建立 profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------- analysis_jobs
create table if not exists public.analysis_jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  account      text not null,
  source       text not null default 'google_sheet'
               check (source in ('google_sheet', 'mock', 'threads_api', 'upload')),
  status       text not null default 'pending'
               check (status in ('pending', 'running', 'succeeded', 'failed')),
  error_message text,
  post_count   integer not null default 0,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

comment on table public.analysis_jobs is '分析任務：一次資料匯入 + 分析的執行紀錄';

create index if not exists analysis_jobs_user_created_idx
  on public.analysis_jobs (user_id, created_at desc);

-- ------------------------------------------------------------------ posts
create table if not exists public.posts (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.analysis_jobs (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  account         text not null,
  post_id         text not null,
  published_at    timestamptz not null,
  text            text not null,
  topic           text,
  format          text,
  post_type       text,
  likes           integer not null default 0 check (likes >= 0),
  replies         integer not null default 0 check (replies >= 0),
  reposts         integer not null default 0 check (reposts >= 0),
  quotes          integer not null default 0 check (quotes >= 0),
  total_engagement integer not null default 0,
  char_count      integer not null default 0,
  hashtag_count   integer not null default 0,
  mention_count   integer not null default 0,
  url_count       integer not null default 0,
  has_question    boolean not null default false,
  is_reply        boolean not null default false,
  is_synthetic    boolean not null default false,
  url             text,
  created_at      timestamptz not null default now(),
  -- 同一個 job 內以平台 post_id 去重（資料清理的第二道防線）
  unique (job_id, post_id)
);

comment on table public.posts is '貼文資料，unique(job_id, post_id) 作為去重保證';
comment on column public.posts.is_synthetic is 'true = 為滿足作業 30 則門檻而生成的補充資料，不納入洞察';

create index if not exists posts_job_idx on public.posts (job_id);
create index if not exists posts_user_idx on public.posts (user_id);
create index if not exists posts_engagement_idx
  on public.posts (job_id, total_engagement desc);

-- -------------------------------------------------------- analysis_results
create table if not exists public.analysis_results (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null unique references public.analysis_jobs (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  account    text not null,
  -- 完整分析輸出（overview / top_posts / timing / tier_analysis ...）
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.analysis_results is '彙總分析結果，payload 為 analyze.py 的完整輸出';

create index if not exists analysis_results_user_idx
  on public.analysis_results (user_id, created_at desc);

-- ===========================================================================
-- Row Level Security
--   每張表都啟用 RLS，且所有 policy 都以 auth.uid() = user_id 為條件，
--   確保使用者只能存取自己的資料。未登入者 auth.uid() 為 null，一律拒絕。
-- ===========================================================================
alter table public.profiles         enable row level security;
alter table public.analysis_jobs    enable row level security;
alter table public.posts            enable row level security;
alter table public.analysis_results enable row level security;

-- profiles：只能看到/修改自己
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- analysis_jobs
drop policy if exists "jobs_select_own" on public.analysis_jobs;
create policy "jobs_select_own" on public.analysis_jobs
  for select using (auth.uid() = user_id);

drop policy if exists "jobs_insert_own" on public.analysis_jobs;
create policy "jobs_insert_own" on public.analysis_jobs
  for insert with check (auth.uid() = user_id);

drop policy if exists "jobs_update_own" on public.analysis_jobs;
create policy "jobs_update_own" on public.analysis_jobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "jobs_delete_own" on public.analysis_jobs;
create policy "jobs_delete_own" on public.analysis_jobs
  for delete using (auth.uid() = user_id);

-- posts
drop policy if exists "posts_select_own" on public.posts;
create policy "posts_select_own" on public.posts
  for select using (auth.uid() = user_id);

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own" on public.posts
  for insert with check (auth.uid() = user_id);

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own" on public.posts
  for delete using (auth.uid() = user_id);

-- analysis_results
drop policy if exists "results_select_own" on public.analysis_results;
create policy "results_select_own" on public.analysis_results
  for select using (auth.uid() = user_id);

drop policy if exists "results_insert_own" on public.analysis_results;
create policy "results_insert_own" on public.analysis_results
  for insert with check (auth.uid() = user_id);

drop policy if exists "results_update_own" on public.analysis_results;
create policy "results_update_own" on public.analysis_results
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "results_delete_own" on public.analysis_results;
create policy "results_delete_own" on public.analysis_results
  for delete using (auth.uid() = user_id);
