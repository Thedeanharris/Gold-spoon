-- Tables for the studio platform. Row level security is added in 0002.
create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('studio', 'client');
create type public.account_status as enum ('active', 'paused');
create type public.site_status as enum ('draft', 'published', 'paused');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'client',
  full_name text,
  created_at timestamptz not null default now()
);

create table public.trades (
  id text primary key,
  name text not null
);

create table public.niches (
  key text primary key,
  name text not null,
  trade_id text not null references public.trades (id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  status public.account_status not null default 'active',
  all_styles boolean not null default false,
  remove_credit boolean not null default false,
  licence_key text not null unique default (
    'STU-' || upper(encode(extensions.gen_random_bytes(4), 'hex')) || '-' || upper(encode(extensions.gen_random_bytes(4), 'hex'))
  ),
  created_at timestamptz not null default now()
);

create table public.client_users (
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (client_id, user_id)
);

create table public.client_trades (
  client_id uuid not null references public.clients (id) on delete cascade,
  trade_id text not null references public.trades (id),
  primary key (client_id, trade_id)
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  company text not null,
  niche text not null references public.niches (key),
  slug text not null unique,
  status public.site_status not null default 'draft',
  draft jsonb not null,
  published jsonb,
  version integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.domains (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  hostname text not null unique,
  cf_hostname_id text,
  status text not null default 'pending' check (status in ('pending', 'active', 'failed')),
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  name text,
  email text,
  phone text,
  message text,
  source text not null default 'website form',
  status text not null default 'new' check (status in ('new', 'contacted', 'won', 'lost')),
  created_at timestamptz not null default now()
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  message text not null,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid references auth.users (id),
  actor_label text,
  action text not null,
  target text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index sites_client_idx on public.sites (client_id);
create index domains_site_idx on public.domains (site_id);
create index leads_site_idx on public.leads (site_id, created_at desc);
create index requests_client_idx on public.requests (client_id, created_at desc);
