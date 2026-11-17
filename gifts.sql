-- Dárky: Supabase setup. Run once in Supabase → SQL Editor.
-- 1) Change the password on the line marked CHANGE ME before running.
-- 2) Then put the project URL and anon key into app.js (const DB).

create extension if not exists pgcrypto;

-- Wishes ---------------------------------------------------------------
create table if not exists public.gifts (
  id          uuid primary key default gen_random_uuid(),
  for_whom    text not null check (for_whom in ('bohousek','bozenka')),
  name        text not null check (length(name) between 1 and 200),
  price       integer check (price is null or price >= 0),
  category    text,
  url         text,
  note        text,
  photos      text[] not null default '{}',
  reserved    boolean not null default false,   -- "I'll buy this" by the other person
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- No direct table access: everything goes through the password-checked functions below.
alter table public.gifts enable row level security;
revoke all on public.gifts from anon, authenticated;

-- Shared password (stored as a bcrypt hash) ----------------------------
create table if not exists public.gift_settings (id int primary key default 1 check (id = 1), pass_hash text not null);
alter table public.gift_settings enable row level security;
revoke all on public.gift_settings from anon, authenticated;

insert into public.gift_settings (id, pass_hash)
values (1, crypt('CHANGE ME', gen_salt('bf')))            -- <<< CHANGE ME
on conflict (id) do update set pass_hash = excluded.pass_hash;

create or replace function public.gifts_check(pass text) returns boolean
language sql security definer set search_path = public, extensions as $$
  select exists (select 1 from gift_settings where pass_hash = crypt(pass, pass_hash));
$$;

-- List. The person a wish is for never sees whether it has been reserved.
create or replace function public.gifts_list(pass text, viewer text) returns setof jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not gifts_check(pass) then raise exception 'bad password'; end if;
  return query
    select to_jsonb(g) - 'reserved' || jsonb_build_object('reserved', case when g.for_whom = viewer then null else g.reserved end)
    from gifts g order by g.created_at desc;
end $$;

-- Insert (no id) or update (with id). You can only add/edit wishes for yourself.
create or replace function public.gifts_save(pass text, viewer text, gift jsonb) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare gid uuid;
begin
  if not gifts_check(pass) then raise exception 'bad password'; end if;
  if viewer not in ('bohousek','bozenka') then raise exception 'bad viewer'; end if;
  if gift ? 'id' and nullif(gift->>'id','') is not null then
    update gifts set
      name = gift->>'name', price = nullif(gift->>'price','')::int, category = nullif(gift->>'category',''),
      url = nullif(gift->>'url',''), note = nullif(gift->>'note',''),
      photos = coalesce(array(select jsonb_array_elements_text(gift->'photos')), '{}'), updated_at = now()
    where id = (gift->>'id')::uuid and for_whom = viewer
    returning id into gid;
    if gid is null then raise exception 'not found'; end if;
  else
    insert into gifts (for_whom, name, price, category, url, note, photos)
    values (viewer, gift->>'name', nullif(gift->>'price','')::int, nullif(gift->>'category',''),
            nullif(gift->>'url',''), nullif(gift->>'note',''),
            coalesce(array(select jsonb_array_elements_text(gift->'photos')), '{}'))
    returning id into gid;
  end if;
  return gid;
end $$;

create or replace function public.gifts_delete(pass text, viewer text, gift_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not gifts_check(pass) then raise exception 'bad password'; end if;
  delete from gifts where id = gift_id and for_whom = viewer;
end $$;

-- Reserve / un-reserve a wish of the other person.
create or replace function public.gifts_reserve(pass text, viewer text, gift_id uuid, val boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not gifts_check(pass) then raise exception 'bad password'; end if;
  update gifts set reserved = val where id = gift_id and for_whom <> viewer;
end $$;

grant execute on function public.gifts_check(text), public.gifts_list(text,text), public.gifts_save(text,text,jsonb),
  public.gifts_delete(text,text,uuid), public.gifts_reserve(text,text,uuid,boolean) to anon;

-- Photos: public bucket (file names are random), anyone with the anon key can upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gift-photos', 'gift-photos', true, 5242880, array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;

drop policy if exists "gift photos upload" on storage.objects;
create policy "gift photos upload" on storage.objects for insert to anon
  with check (bucket_id = 'gift-photos');
