-- MiniCeliq backend — Supabase / Postgres schema.
-- Matches the column names used by backend/src/services/*.
-- Accessed ONLY by the backend via the service-role key (which bypasses RLS).
-- RLS is enabled with no public policies → no anon/authenticated access at all.
-- Idempotent: safe to run more than once.

-- 1) news_cache — RSS headline cache (GET /api/news). Upsert on id.
create table if not exists public.news_cache (
  id           text primary key,
  title        text not null,
  source       text not null,
  url          text not null,
  published_at timestamptz not null,
  content      text,
  cached_at    timestamptz not null default now()
);
create index if not exists news_cache_published_at_idx on public.news_cache (published_at desc);

-- 2) news_summaries — cached AI summaries (POST /api/news/summarize). Upsert on article_id.
create table if not exists public.news_summaries (
  article_id text primary key,
  summary    text not null,
  model      text not null,
  created_at timestamptz not null default now()
);

-- 3) summary_views — free-tier quota: distinct articles summarized per address per UTC day.
--    Upsert on (address, article_id, view_day).
create table if not exists public.summary_views (
  address    text not null,
  article_id text not null,
  view_day   date not null,
  created_at timestamptz not null default now(),
  primary key (address, article_id, view_day)
);
create index if not exists summary_views_addr_day_idx on public.summary_views (address, view_day);

-- 4) subscribed_events — indexed on-chain Subscribed events (GET /api/stats + indexer resume).
--    Upsert on (tx_hash, log_index).
create table if not exists public.subscribed_events (
  tx_hash       text not null,
  log_index     integer not null,
  block_number  bigint not null,
  user_address  text not null,
  plan          smallint not null,
  token_address text not null,
  amount        numeric not null,
  new_expiry    bigint not null,
  block_time    timestamptz not null,
  primary key (tx_hash, log_index)
);
create index if not exists subscribed_events_block_idx on public.subscribed_events (block_number desc);
create index if not exists subscribed_events_user_idx on public.subscribed_events (user_address);

-- 5) daily_brief — once-daily AI "Morning Brief" digest (GET /api/news/brief, subscribers only).
--    One row per UTC day. Upsert on brief_day.
create table if not exists public.daily_brief (
  brief_day    date primary key,
  brief        text not null,
  model        text,
  generated_at timestamptz not null default now()
);

-- RLS: enable on all tables, add NO policies → only the service-role key (the backend) can touch them.
alter table public.news_cache        enable row level security;
alter table public.news_summaries    enable row level security;
alter table public.summary_views     enable row level security;
alter table public.subscribed_events enable row level security;
alter table public.daily_brief       enable row level security;
