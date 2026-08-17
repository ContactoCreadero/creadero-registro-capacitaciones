# Creadero · Registro de Capacitaciones

Aplicación web para registrar capacitaciones realizadas a clientes, administrar las opciones fijas de **Cliente** y **Relator / Facilitador**, consultar y editar registros, seleccionar varios registros e imprimir fichas, y adjuntar respaldos.

## Funcionalidades incluidas

- Login con correo y contraseña usando Supabase Auth.
- Roles `admin` y `user`.
- Formulario de registro con:
  - Cliente (lista administrable).
  - Obra / faena / lugar.
  - Fecha.
  - Relator / facilitador (lista administrable).
  - Hora de inicio y término.
  - Duración calculada automáticamente.
  - Nombre de charla / curso / actividad.
  - Número de participantes opcional.
  - Observaciones opcionales.
  - Respaldo opcional PDF/JPG/PNG de hasta 10 MB.
- Historial con búsqueda y filtro por fechas.
- Selección individual y masiva.
- Impresión de uno o varios registros en formato A4 con gráfica Creadero.
- Edición de registros.
- Eliminación masiva para administradores.
- Administración de Clientes y Relatores/Facilitadores: agregar, renombrar, activar y desactivar.
- Supabase PostgreSQL + Auth + Storage.
- Preparado para GitHub + Vercel.

## 1. Abrir en VS Code

1. Descomprime el proyecto.
2. Abre la carpeta `creadero-registro-capacitaciones` en Visual Studio Code.
3. Abre **Terminal > New Terminal**.
4. Ejecuta:

```powershell
npm install
```

## 2. Crear/configurar Supabase

1. Crea un proyecto en Supabase.
2. Ve a **SQL Editor > New query**.
3. Copia todo el contenido de `supabase/schema.sql` y ejecútalo.
4. Ve a **Authentication > Users** y crea el usuario administrador con correo y contraseña.
5. Vuelve a SQL Editor y ejecuta, reemplazando el correo:

```sql
update public.profiles
set role = 'admin'
where email = 'TU-CORREO@DOMINIO.CL';
```

> Importante: conviene ejecutar `schema.sql` antes de crear el usuario para que el perfil se genere automáticamente.

## 3. Variables de entorno

Copia `.env.example` como `.env.local` y completa:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_ANON_KEY
```

En Supabase las encuentras en **Project Settings > API**.

No uses ni publiques la `service_role` key.

## 4. Probar localmente

```powershell
npm run dev
```

Luego abre `http://localhost:3000`.

Primero entra como administrador y agrega al menos un **Cliente** y un **Relator/Facilitador** desde el menú **Administración**.

## 5. Subir a GitHub

Desde la terminal de VS Code, dentro del proyecto:

```powershell
git init
git add .
git commit -m "Primera versión registro capacitaciones"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPOSITORIO.git
git push -u origin main
```

Si el repositorio ya fue creado y tiene archivos, usa el flujo Git correspondiente para evitar sobrescribir trabajo existente.

## 6. Publicar en Vercel

1. Entra a Vercel y selecciona **Add New > Project**.
2. Importa el repositorio GitHub.
3. Framework: Vercel debería detectar **Next.js** automáticamente.
4. En **Environment Variables** agrega:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Presiona **Deploy**.

Cada `git push` a la rama de producción generará un nuevo despliegue.

## 7. Gestión de usuarios

Los usuarios se crean en Supabase **Authentication > Users**. El trigger del schema crea su perfil como `user`.

Para convertir a alguien en administrador:

```sql
update public.profiles
set role = 'admin'
where email = 'correo@dominio.cl';
```

Un administrador ve el menú **Administración** y puede gestionar catálogos y eliminar registros.

## Notas de seguridad

- La aplicación utiliza Row Level Security (RLS).
- El bucket `training-evidence` es privado.
- Los respaldos se abren mediante URL firmada temporal.
- Los usuarios autenticados pueden registrar y editar capacitaciones; solo los administradores pueden eliminar registros y modificar catálogos.
- La clave `service_role` no se usa en el frontend.

## Gráfica

El proyecto incluye `public/logo.png` y una interfaz Creadero en blanco, rojo corporativo y gris grafito, con tarjetas limpias y una impresión A4 consistente con esa línea visual.
