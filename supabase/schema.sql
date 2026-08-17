-- ============================================================
-- CREADERO · REGISTRO DE CAPACITACIONES
-- Ejecutar completo en Supabase > SQL Editor > New query
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'user' check (role in ('admin','user')),
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.facilitators (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.training_records (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on update cascade on delete restrict,
  site text not null,
  training_date date not null,
  facilitator_id uuid not null references public.facilitators(id) on update cascade on delete restrict,
  start_time time not null,
  end_time time not null,
  duration_minutes integer not null check (duration_minutes > 0),
  activity_name text not null,
  participants_count integer check (participants_count is null or participants_count >= 0),
  observations text,
  attachment_path text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_training_records_date on public.training_records(training_date desc);
create index if not exists idx_training_records_client on public.training_records(client_id);
create index if not exists idx_training_records_facilitator on public.training_records(facilitator_id);

-- Actualiza updated_at automáticamente.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_training_records_updated_at on public.training_records;
create trigger trg_training_records_updated_at
before update on public.training_records
for each row execute function public.set_updated_at();

-- Crea un perfil básico al crear un usuario en Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1)),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Función segura para políticas de administrador.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.facilitators enable row level security;
alter table public.training_records enable row level security;

-- Perfiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Catálogos: todos los usuarios autenticados leen; solo admin modifica.
drop policy if exists "clients_read_authenticated" on public.clients;
create policy "clients_read_authenticated" on public.clients
for select to authenticated using (true);
drop policy if exists "clients_admin_insert" on public.clients;
create policy "clients_admin_insert" on public.clients
for insert to authenticated with check (public.is_admin());
drop policy if exists "clients_admin_update" on public.clients;
create policy "clients_admin_update" on public.clients
for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "clients_admin_delete" on public.clients;
create policy "clients_admin_delete" on public.clients
for delete to authenticated using (public.is_admin());

drop policy if exists "facilitators_read_authenticated" on public.facilitators;
create policy "facilitators_read_authenticated" on public.facilitators
for select to authenticated using (true);
drop policy if exists "facilitators_admin_insert" on public.facilitators;
create policy "facilitators_admin_insert" on public.facilitators
for insert to authenticated with check (public.is_admin());
drop policy if exists "facilitators_admin_update" on public.facilitators;
create policy "facilitators_admin_update" on public.facilitators
for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "facilitators_admin_delete" on public.facilitators;
create policy "facilitators_admin_delete" on public.facilitators
for delete to authenticated using (public.is_admin());

-- Registros: usuarios autenticados pueden leer/crear/editar; solo admin elimina.
drop policy if exists "training_read_authenticated" on public.training_records;
create policy "training_read_authenticated" on public.training_records
for select to authenticated using (true);
drop policy if exists "training_insert_authenticated" on public.training_records;
create policy "training_insert_authenticated" on public.training_records
for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "training_update_authenticated" on public.training_records;
create policy "training_update_authenticated" on public.training_records
for update to authenticated using (true) with check (true);
drop policy if exists "training_delete_admin" on public.training_records;
create policy "training_delete_admin" on public.training_records
for delete to authenticated using (public.is_admin());

-- Bucket privado para respaldos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'training-evidence',
  'training-evidence',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "evidence_read_authenticated" on storage.objects;
create policy "evidence_read_authenticated" on storage.objects
for select to authenticated
using (bucket_id = 'training-evidence');

drop policy if exists "evidence_insert_own_folder" on storage.objects;
create policy "evidence_insert_own_folder" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'training-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "evidence_update_owner_or_admin" on storage.objects;
create policy "evidence_update_owner_or_admin" on storage.objects
for update to authenticated
using (
  bucket_id = 'training-evidence'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
)
with check (bucket_id = 'training-evidence');

drop policy if exists "evidence_delete_owner_or_admin" on storage.objects;
create policy "evidence_delete_owner_or_admin" on storage.objects
for delete to authenticated
using (
  bucket_id = 'training-evidence'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

-- ============================================================
-- DESPUÉS DE CREAR EL PRIMER USUARIO EN AUTH:
-- Reemplaza el correo y ejecuta esta línea una sola vez.
-- update public.profiles set role = 'admin' where email = 'TU-CORREO@DOMINIO.CL';
--
-- Si el usuario fue creado ANTES de ejecutar este schema, crea su perfil así:
-- insert into public.profiles (id,email,full_name,role)
-- select id,email,split_part(email,'@',1),'admin' from auth.users
-- where email='TU-CORREO@DOMINIO.CL'
-- on conflict (id) do update set role='admin';
-- ============================================================
