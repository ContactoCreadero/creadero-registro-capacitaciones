# Creadero · Registro de Capacitaciones

Aplicación web para registrar capacitaciones realizadas a clientes, administrar relatores/facilitadores, consultar registros, imprimir fichas y almacenar múltiples respaldos.

## Funcionalidades incluidas

- Login con correo y contraseña usando Supabase Auth.
- Roles `admin` y `user`.
- Cliente como campo libre.
- Relator / facilitador como lista administrable, con opción **OTROS**.
- Horario en formato 24 horas y duración calculada automáticamente.
- Múltiples adjuntos PDF/JPG/PNG de hasta 10 MB por archivo.
- Historial con búsqueda, filtro por fechas y orden por:
  - fecha más reciente;
  - fecha más antigua;
  - cliente A–Z;
  - cliente Z–A.
- Selección individual y masiva.
- Impresión de uno o varios registros en formato A4.
- Usuario `user`: puede crear, ver e imprimir; no puede editar, eliminar ni administrar.
- Usuario `admin`: puede editar, eliminar y administrar relatores/facilitadores.
- Correo automático al crear una nueva capacitación mediante Resend.
- Supabase PostgreSQL + Auth + Storage.
- GitHub + Vercel.

## Variables de entorno

Copia `.env.example` como `.env.local` y completa:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_ANON_KEY

RESEND_API_KEY=re_xxxxxxxxx
TRAINING_NOTIFICATION_EMAIL=tu-correo@dominio.cl
RESEND_FROM_EMAIL="Creadero <notificaciones@tu-dominio.cl>"
```

`TRAINING_NOTIFICATION_EMAIL` también puede contener varios destinatarios separados por coma.

No publiques `RESEND_API_KEY` ni uses la `service_role` de Supabase en el frontend.

## Correo automático

Cuando se crea una capacitación nueva y termina correctamente la carga de sus adjuntos, la aplicación llama a `/api/notify-training`. La ruta valida la sesión con Supabase y envía un correo con cliente, lugar, fecha, relator, horario, duración, actividad, participantes, cantidad de adjuntos, observaciones y usuario que registró la capacitación.

El envío utiliza una clave de idempotencia basada en el ID del registro para reducir el riesgo de correos duplicados por reintentos.

Para producción, configura en Resend un dominio remitente verificado y usa ese correo en `RESEND_FROM_EMAIL`.

## Probar localmente

```powershell
npm install
npm run dev
```

Luego abre `http://localhost:3000`.

## Publicar en Vercel

En **Project Settings → Environment Variables** agrega también:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `RESEND_API_KEY`
- `TRAINING_NOTIFICATION_EMAIL`
- `RESEND_FROM_EMAIL`

Después ejecuta un nuevo deployment o haz `git push` al repositorio conectado.

## Nota sobre Supabase

El archivo `supabase/schema.sql` corresponde a una versión anterior del proyecto y debe actualizarse antes de usarlo como respaldo completo para una instalación desde cero. La base de producción actual fue evolucionando mediante SQL posteriores durante el desarrollo.
