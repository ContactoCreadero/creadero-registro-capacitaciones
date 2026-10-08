-- ============================================================
-- CREADERO · REGISTRO DE CAPACITACIONES
-- Estructura de la base de datos en Supabase.
-- Refleja la base de PRODUCCIÓN al 08-10-2026.
--
-- ⚠ NO EJECUTAR EN PRODUCCIÓN: la base de producción es la referencia.
--   Este archivo sirve para documentarla y para crear una base NUEVA
--   (por ejemplo, un proyecto de pruebas) en Supabase > SQL Editor.
--   Si cambias la base de producción, actualiza también este archivo.
--
-- Nota: producción tiene además la función rls_auto_enable (activa RLS
-- automáticamente en las tablas nuevas de "public" mediante un event
-- trigger). No se recrea aquí: es una configuración del proyecto y todas
-- las tablas de este archivo ya activan RLS explícitamente.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- TABLAS
-- ------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'user' check (role in ('admin','user')),
  created_at timestamptz not null default now()
);

-- Catálogo antiguo de clientes: la app ahora registra el cliente como texto
-- (training_records.client_name). Se mantiene porque existe en producción
-- y el Inicio cuenta los clientes activos.
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- Relatores / facilitadores (el nombre se guarda en MAYÚSCULAS, ver triggers).
create table if not exists public.facilitators (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- Capacitaciones registradas.
--   client_id y attachment_path: columnas antiguas, ya no las usa la app
--   (el cliente va en client_name y los adjuntos en training_attachments).
--   client_name quedó al final porque se agregó después en producción.
--   activity_type (tipo de actividad): CHARLA, CURSO o el texto libre que
--   se escribe al elegir "OTRO". Se agregó el 08-10-2026; los registros
--   anteriores a esa fecha lo tienen vacío (NULL).
create table if not exists public.training_records (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on update cascade on delete restrict,
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
  updated_at timestamptz not null default now(),
  client_name text,
  activity_type text
);

-- Adjuntos (respaldos) de cada capacitación. El archivo está en Storage,
-- bucket "training-evidence", ruta: <id usuario>/<id capacitación>/<archivo>.
create table if not exists public.training_attachments (
  id uuid primary key default gen_random_uuid(),
  training_record_id uuid not null references public.training_records(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_training_records_date on public.training_records(training_date desc);
create index if not exists idx_training_records_client on public.training_records(client_id);
create index if not exists idx_training_records_facilitator on public.training_records(facilitator_id);
create index if not exists idx_training_attachments_record on public.training_attachments(training_record_id);

-- ------------------------------------------------------------
-- FUNCIONES Y TRIGGERS
-- ------------------------------------------------------------

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

-- Guarda en MAYÚSCULAS los textos de cada capacitación.
create or replace function public.training_records_to_uppercase()
returns trigger
language plpgsql
as $$
begin

  new.client_name :=
    upper(trim(new.client_name));

  new.site :=
    upper(trim(new.site));

  new.activity_name :=
    upper(trim(new.activity_name));

  if new.observations is not null then
    new.observations :=
      upper(trim(new.observations));
  end if;

  return new;

end;
$$;

drop trigger if exists trg_training_records_to_uppercase on public.training_records;
create trigger trg_training_records_to_uppercase
before insert or update on public.training_records
for each row execute function public.training_records_to_uppercase();

-- Guarda en MAYÚSCULAS el nombre de cada relator / facilitador.
create or replace function public.facilitators_to_uppercase()
returns trigger
language plpgsql
as $$
begin

  new.name :=
    upper(trim(new.name));

  return new;

end;
$$;

drop trigger if exists trg_facilitators_to_uppercase on public.facilitators;
create trigger trg_facilitators_to_uppercase
before insert or update on public.facilitators
for each row execute function public.facilitators_to_uppercase();

-- Crea un perfil básico (rol "user") al crear un usuario en Supabase Auth.
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
for each row execute function public.handle_new_user();

-- ¿El usuario conectado es administrador? (se usa en las reglas de seguridad)
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

revoke all on function public.is_admin() from public, anon, service_role;
grant execute on function public.is_admin() to authenticated;

-- ------------------------------------------------------------
-- SEGURIDAD: RLS Y REGLAS (POLICIES)
-- ------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.facilitators enable row level security;
alter table public.training_records enable row level security;
alter table public.training_attachments enable row level security;

-- Perfiles: cada usuario ve el suyo; el administrador ve y cambia todos.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Clientes (catálogo antiguo): todos leen; solo el administrador modifica.
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

-- Relatores: todos leen; cualquier usuario puede AGREGAR uno a su nombre
-- (opción "OTROS" del formulario); renombrar, desactivar y eliminar,
-- solo el administrador.
drop policy if exists "facilitators_read_authenticated" on public.facilitators;
create policy "facilitators_read_authenticated" on public.facilitators
for select to authenticated using (true);

drop policy if exists "facilitators_admin_insert" on public.facilitators;
create policy "facilitators_admin_insert" on public.facilitators
for insert to authenticated with check (public.is_admin());

drop policy if exists "facilitators_user_insert_own" on public.facilitators;
create policy "facilitators_user_insert_own" on public.facilitators
for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "facilitators_admin_update" on public.facilitators;
create policy "facilitators_admin_update" on public.facilitators
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "facilitators_admin_delete" on public.facilitators;
create policy "facilitators_admin_delete" on public.facilitators
for delete to authenticated using (public.is_admin());

-- Capacitaciones: todos leen; cada usuario crea, edita y elimina las suyas;
-- el administrador edita y elimina todas.
drop policy if exists "training_read_authenticated" on public.training_records;
create policy "training_read_authenticated" on public.training_records
for select to authenticated using (true);

drop policy if exists "training_insert_authenticated" on public.training_records;
create policy "training_insert_authenticated" on public.training_records
for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "training_update_admin" on public.training_records;
create policy "training_update_admin" on public.training_records
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "training_update_own" on public.training_records;
create policy "training_update_own" on public.training_records
for update to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

drop policy if exists "training_delete_admin" on public.training_records;
create policy "training_delete_admin" on public.training_records
for delete to authenticated using (public.is_admin());

drop policy if exists "training_delete_own" on public.training_records;
create policy "training_delete_own" on public.training_records
for delete to authenticated using (created_by = auth.uid());

-- Adjuntos: todos leen; se agregan a capacitaciones propias (o cualquiera
-- si es administrador); se eliminan los de capacitaciones propias (o
-- cualquiera si es administrador); solo el administrador los modifica.
drop policy if exists "attachments_read_authenticated" on public.training_attachments;
create policy "attachments_read_authenticated" on public.training_attachments
for select to authenticated using (true);

drop policy if exists "attachments_insert_owner_or_admin" on public.training_attachments;
create policy "attachments_insert_owner_or_admin" on public.training_attachments
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    public.is_admin()
    or exists (
      select 1 from public.training_records tr
      where tr.id = training_attachments.training_record_id
        and tr.created_by = auth.uid()
    )
  )
);

drop policy if exists "attachments_update_admin" on public.training_attachments;
create policy "attachments_update_admin" on public.training_attachments
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "attachments_delete_admin" on public.training_attachments;
create policy "attachments_delete_admin" on public.training_attachments
for delete to authenticated using (public.is_admin());

drop policy if exists "attachments_delete_own_record" on public.training_attachments;
create policy "attachments_delete_own_record" on public.training_attachments
for delete to authenticated
using (
  exists (
    select 1 from public.training_records tr
    where tr.id = training_attachments.training_record_id
      and tr.created_by = auth.uid()
  )
);

-- ------------------------------------------------------------
-- STORAGE: bucket privado para los respaldos
-- ------------------------------------------------------------

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

-- Archivos: todos leen; cada usuario sube y elimina en su propia carpeta;
-- el administrador modifica y elimina cualquiera.
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

drop policy if exists "evidence_update_admin" on storage.objects;
create policy "evidence_update_admin" on storage.objects
for update to authenticated
using (bucket_id = 'training-evidence' and public.is_admin())
with check (bucket_id = 'training-evidence' and public.is_admin());

drop policy if exists "evidence_delete_admin" on storage.objects;
create policy "evidence_delete_admin" on storage.objects
for delete to authenticated
using (bucket_id = 'training-evidence' and public.is_admin());

drop policy if exists "evidence_delete_own_folder" on storage.objects;
create policy "evidence_delete_own_folder" on storage.objects
for delete to authenticated
using (
  bucket_id = 'training-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- SOLO AL CREAR UNA BASE NUEVA, DESPUÉS DE CREAR EL PRIMER USUARIO EN AUTH:
-- Reemplaza el correo y ejecuta esta línea una sola vez.
-- update public.profiles set role = 'admin' where email = 'TU-CORREO@DOMINIO.CL';
--
-- Si el usuario fue creado ANTES de ejecutar este archivo, crea su perfil así:
-- insert into public.profiles (id,email,full_name,role)
-- select id,email,split_part(email,'@',1),'admin' from auth.users
-- where email='TU-CORREO@DOMINIO.CL'
-- on conflict (id) do update set role='admin';
-- ============================================================
