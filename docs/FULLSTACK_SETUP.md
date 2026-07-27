# Supabase and Deployment Setup

## 1. Create a separate Supabase project

Use a new personal Supabase project for the full-stack preview. Do not reuse or alter the company repository deployment.

1. Create the project in Supabase.
2. Open SQL Editor.
3. Run `supabase/migrations/202607270001_work_note.sql` once.
4. In Authentication, create the personal user by invitation or dashboard user creation.
5. Keep email/password enabled. Magic-link login is also supported.
6. After the first login, approve exactly that account:

```sql
update public.profiles
set is_allowed = true
where lower(email) = lower('your-email@example.com');
```

Disable open public sign-up after the personal account is prepared. The app does not expose a sign-up form.

## 2. Authentication URLs

In Supabase Authentication URL Configuration, add the preview and production URLs that will be used. Examples:

```text
http://127.0.0.1:5173
https://your-preview.vercel.app
https://dd15963-max.github.io/Work_Note/fullstack-preview/
```

Use the exact deployed URL for magic-link redirects.

## 3. Environment variables

Copy `.env.example` to `.env.local` at the repository root and fill in only public client configuration:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
VITE_ALLOWED_EMAIL=your-email@example.com
VITE_SUPABASE_STORAGE_BUCKET=work-note-attachments
VITE_FULLSTACK_ENABLED=true
VITE_PUBLIC_BASE=/Work_Note/fullstack-preview/
```

For Vercel, set `VITE_PUBLIC_BASE=/`. The app also accepts the legacy `VITE_SUPABASE_ANON_KEY` as a fallback, but new projects should use the publishable key. Do not create `VITE_SUPABASE_SECRET_KEY` or `VITE_SUPABASE_SERVICE_ROLE_KEY` variables.

## 4. Local development

```powershell
npm.cmd install
npm.cmd run dev
```

Open the URL printed by Vite. The default local server binds to `127.0.0.1`.

## 5. Verification

```powershell
npm.cmd run verify:fullstack
npm.cmd audit
```

The verification command runs TypeScript, unit tests, the isolated production build, and static RLS/deployment safety checks.

## 6. Vercel preview deployment

Import the personal GitHub repository and select the `codex/fullstack-supabase` branch for a preview project.

- Build command: `npm run build`
- Output directory: `fullstack-preview`
- Framework: Vite
- Add all `VITE_*` variables listed above.
- Set `VITE_PUBLIC_BASE=/`.

`vercel.json` adds security headers. Keep this on a separate preview URL until migration and cross-device checks pass.

## 7. Same-origin GitHub preview

A build at `/Work_Note/fullstack-preview/` shares the `dd15963-max.github.io` origin with the existing `/Work_Note/react/` app, so it can detect that origin's localStorage and IndexedDB. Adding a preview path must not remove or overwrite `react/`.

The current build writes only to `fullstack-preview/`; `react/` remains the existing production artifact.