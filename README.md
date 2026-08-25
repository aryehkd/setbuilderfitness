# setbuilder.fitness

Trainers build weight-training programs and assign them to clients by date. Clients open the
assigned workout, see exactly what to do, and log weights, reps, and total time.

Stack: React + Vite (SPA), Netlify Functions (API), Netlify Database (Postgres), Netlify Identity
(Google sign-in).

## Local development

```bash
npm install
npm run dev                              # http://localhost:5173
npx netlify database migrations apply    # first run only, while the dev server is up
```

The movement catalog (~95 lifts) seeds itself on the first authenticated API call.

### Signing in locally

**Netlify Identity has no local backend.** It is a hosted service, so `/.netlify/identity/*` does
not resolve on localhost and Google sign-in only works on a deployed site.

To keep local work unblocked, the API accepts a **dev persona** instead. An amber bar at the top of
the app (dev builds only) switches between `Dev Trainer` and `Dev Client`, signs out, or resets the
current persona so the onboarding wizard can be replayed.

The bypass is gated on `NETLIFY_LOCAL === 'true' && CONTEXT === 'dev'`, both of which are injected
only by the local Netlify emulator. It cannot activate on a deployed site, and the client-side half
is stripped from production builds by `import.meta.env.DEV`. See
[`netlify/lib/devAuth.ts`](netlify/lib/devAuth.ts).

## Deploying

```bash
npx netlify init      # create and link the site
npx netlify deploy    # preview deploy
```

Migrations in `netlify/database/migrations/` are applied automatically during deploys.

Then, in the Netlify dashboard at `https://app.netlify.com/projects/<slug>/configuration/identity`:

- [ ] Identity → Enable
- [ ] Registration → Open
- [ ] External providers → Add Google ("Use Netlify's app" needs no credentials)

Netlify Database requires a credit-based plan. Once auth works on the preview URL, run
`npx netlify deploy --prod` and attach the `setbuilder.fitness` domain.

## Layout

| Path                              | What                                                        |
| --------------------------------- | ----------------------------------------------------------- |
| `src/pages/`                      | Screens: login, onboarding, trainer/client home, builder     |
| `src/lib/auth.tsx`                | Session state, sourced from `/api/me`                        |
| `netlify/functions/api.ts`        | Single function routing all of `/api/*`                      |
| `netlify/lib/handlers.ts`         | Request handlers and SQL                                     |
| `netlify/database/migrations/`    | Schema, applied by Netlify on deploy                         |
| `shared/types.ts`                 | Types shared by the client and the API                       |

## Scripts

- `npm run dev` — Vite plus the Netlify emulator (functions, database)
- `npm run build` — typecheck and build to `dist/`
- `npm run lint` — oxlint
