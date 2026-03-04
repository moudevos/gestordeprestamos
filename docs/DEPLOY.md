# Deploy

## Supabase

1. Crear proyecto en Supabase.
2. Ejecutar las migraciones SQL del directorio `supabase/migrations`.
3. Habilitar Auth por email/password.
4. Configurar URL pública del proyecto y obtener `anon key` y `service_role key`.

## Vercel

1. Importar el repositorio.
2. Configurar root en `apps/web`.
3. Definir variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_VAPID_PUBLIC_KEY`
4. Build command: `pnpm build --filter @gestor-prestamos/web`
5. Output directory: `dist`

## Render

1. Crear un Web Service apuntando a `apps/worker`.
2. Build command: `pnpm install && pnpm build --filter @gestor-prestamos/worker`
3. Start command: `pnpm --filter @gestor-prestamos/worker start`
4. Variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `JOB_TOKEN`
   - `APP_BASE_URL`
5. Configurar cron externo o Render cron job llamando `POST /jobs/run` con header `x-job-token`.

## Local

1. `pnpm install`
2. Configurar `.env` en `apps/web` y `apps/worker`
3. `pnpm dev`
