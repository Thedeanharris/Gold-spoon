-- Row level security. Access is decided here, not in the browser.
-- Public sign ups should stay off, so every user is created by the studio.

create or replace function public.is_studio()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'studio');
$$;

create or replace function public.my_client_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select cu.client_id
  from public.client_users cu
  join public.clients c on c.id = cu.client_id
  where cu.user_id = auth.uid() and c.status = 'active';
$$;

create or replace function public.client_holds_niche(p_client uuid, p_niche text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.niches n
    join public.client_trades ct on ct.trade_id = n.trade_id
    where n.key = p_niche and ct.client_id = p_client
  );
$$;

alter table public.profiles enable row level security;
alter table public.trades enable row level security;
alter table public.niches enable row level security;
alter table public.clients enable row level security;
alter table public.client_users enable row level security;
alter table public.client_trades enable row level security;
alter table public.sites enable row level security;
alter table public.domains enable row level security;
alter table public.leads enable row level security;
alter table public.requests enable row level security;
alter table public.audit_log enable row level security;

-- profiles
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_studio());
create policy profiles_studio on public.profiles for all to authenticated
  using (public.is_studio()) with check (public.is_studio());

-- reference data
create policy trades_read on public.trades for select to authenticated using (true);
create policy niches_read on public.niches for select to authenticated using (true);
create policy trades_studio on public.trades for all to authenticated
  using (public.is_studio()) with check (public.is_studio());
create policy niches_studio on public.niches for all to authenticated
  using (public.is_studio()) with check (public.is_studio());

-- clients and what they hold
create policy clients_studio on public.clients for all to authenticated
  using (public.is_studio()) with check (public.is_studio());
create policy clients_own_read on public.clients for select to authenticated
  using (id in (select public.my_client_ids()));

create policy client_users_studio on public.client_users for all to authenticated
  using (public.is_studio()) with check (public.is_studio());
create policy client_users_own_read on public.client_users for select to authenticated
  using (user_id = auth.uid());

create policy client_trades_studio on public.client_trades for all to authenticated
  using (public.is_studio()) with check (public.is_studio());
create policy client_trades_own_read on public.client_trades for select to authenticated
  using (client_id in (select public.my_client_ids()));

-- sites: a client reaches a site only if the client is active, owns it, and holds its trade
create policy sites_studio on public.sites for all to authenticated
  using (public.is_studio()) with check (public.is_studio());
create policy sites_client_read on public.sites for select to authenticated
  using (client_id in (select public.my_client_ids()) and public.client_holds_niche(client_id, niche));
create policy sites_client_edit on public.sites for update to authenticated
  using (client_id in (select public.my_client_ids()) and public.client_holds_niche(client_id, niche))
  with check (client_id in (select public.my_client_ids()) and public.client_holds_niche(client_id, niche));

-- Clients may change the draft only. Everything else is reset unless the studio or the server does it.
create or replace function public.protect_site_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_studio() and coalesce(auth.role(), '') <> 'service_role' then
    new.client_id := old.client_id;
    new.niche := old.niche;
    new.slug := old.slug;
    new.status := old.status;
    new.published := old.published;
    new.version := old.version;
    new.published_at := old.published_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger sites_protect_columns before update on public.sites
  for each row execute function public.protect_site_columns();

-- domains
create policy domains_studio on public.domains for all to authenticated
  using (public.is_studio()) with check (public.is_studio());
create policy domains_client_read on public.domains for select to authenticated
  using (exists (
    select 1 from public.sites s
    where s.id = domains.site_id
      and s.client_id in (select public.my_client_ids())
      and public.client_holds_niche(s.client_id, s.niche)
  ));

-- leads: inserted by the edge worker with the service key, read and triaged by the client
create policy leads_studio on public.leads for all to authenticated
  using (public.is_studio()) with check (public.is_studio());
create policy leads_client_read on public.leads for select to authenticated
  using (exists (select 1 from public.sites s where s.id = leads.site_id and s.client_id in (select public.my_client_ids())));
create policy leads_client_update on public.leads for update to authenticated
  using (exists (select 1 from public.sites s where s.id = leads.site_id and s.client_id in (select public.my_client_ids())))
  with check (exists (select 1 from public.sites s where s.id = leads.site_id and s.client_id in (select public.my_client_ids())));

create or replace function public.protect_lead_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_studio() and coalesce(auth.role(), '') <> 'service_role' then
    new.site_id := old.site_id;
    new.name := old.name;
    new.email := old.email;
    new.phone := old.phone;
    new.message := old.message;
    new.source := old.source;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
create trigger leads_protect_columns before update on public.leads
  for each row execute function public.protect_lead_columns();

-- requests from clients to the studio
create policy requests_studio on public.requests for all to authenticated
  using (public.is_studio()) with check (public.is_studio());
create policy requests_client_read on public.requests for select to authenticated
  using (client_id in (select public.my_client_ids()));
create policy requests_client_insert on public.requests for insert to authenticated
  with check (client_id in (select public.my_client_ids()));

-- audit log: studio reads, nobody writes directly. Use log_action().
create policy audit_studio_read on public.audit_log for select to authenticated
  using (public.is_studio());
create or replace function public.log_action(p_action text, p_target text, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor, actor_label, action, target, meta)
  values (auth.uid(), (select full_name from public.profiles where id = auth.uid()), p_action, p_target, p_meta);
$$;
