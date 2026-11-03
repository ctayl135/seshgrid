# SeshGrid

A free browser recording studio built with Next.js, React, TypeScript, Web Audio and Supabase. Phase 1 has no billing, subscriptions, or paid feature gates.

## Run locally

Use Node.js 24 and pnpm 11.25.0. Run `pnpm install`, then `pnpm dev`, and visit http://127.0.0.1:3000. Run `pnpm test`, `pnpm typecheck`, and `pnpm build` before shipping. Package versions and the package manager are pinned. GitHub Actions runs those checks on pushes and pull requests.

For a real-browser audio integration test without microphone permission, run `node scripts/browser-engine-test.mjs`, open http://127.0.0.1:3002, and click Run audio pipeline test. This isolated local server uses the production capture/mix code with an oscillator stream and verifies capture duration, signal level, WAV format and rendered stereo output. It is not a production app route. Stop it with Ctrl+C after testing.

## Essential workflow

1. Upload a beat (or multiple source files). Each file becomes a track with a waveform.
2. Add an empty vocal track and select it. Use headphones. Click the red record button, allow microphone access, and perform over the beat. Click stop to finish the take. Recording starts at the current timeline cursor.
3. Click the ruler while stopped to position the cursor. Play/pause or return to start. Select a clip to edit its start, source trim-in, and duration in seconds. Split at the cursor or delete a clip. Edits preserve original audio.
4. Select a track to change its name, volume, stereo pan, low/high shelf EQ and reverb. Mute/solo are included in playback and export. Multiple clips on a track can overlap and sum.
5. Name the session and click Save. Without an account, this commits audio and metadata to IndexedDB in this browser. With an account, it also saves privately to Supabase. A failed cloud save leaves the local copy intact and reports the error.
6. Open Projects, choose a saved session and reopen it, including audio and mix settings. Export WAV produces a 44.1 kHz 16-bit stereo mix plus a 1.5 second effect tail.
7. Use Backup to download a `.sesh` project containing source audio and all edits. Projects → Open project file restores it on another browser or after clearing browser storage. Downloading a backup does not mark browser/cloud changes saved. Projects → Duplicate session makes an independent copy for the next save.

Save reports success only after a local transaction or cloud commit finishes. Local storage operations time out rather than locking the studio forever. If both destinations fail, a backup download is started and the studio reports the failure; keep that file. In-app confirmations protect unsaved work when switching sessions. The timeline's Cursor field also supports precise, keyboard-accessible split positions.

Microphone recording uses an AudioWorklet producing lossless mono PCM WAV, aligned to the same audio clock as backing-track scheduling. Hardware input/output latency varies; adjust the clip Start field after recording when needed. Monitoring is deliberately disabled to avoid feedback. Tempo guides session metadata; this version does not stretch audio or provide a metronome.

## Supabase setup (required for accounts and cloud projects)

The SeshGrid workspace now has a provisioned Supabase Free project. Its owner-only project policies and private audio bucket are applied. Live cross-account privacy and sign-in/save/reopen checks passed. CLI-managed credentials stay in ignored local configuration; they are not part of the repository.

No service credentials are included. Create/connect a Supabase project, then:

1. Run `supabase/migrations/001_private_projects.sql` in its SQL editor (once, on a new project). It creates the projects table, private `project-audio` bucket, owner-only RLS policies, and explicit authenticated database grants. Never change this bucket to public.
2. Enable email authentication and email confirmation. Set the Auth Site URL to your deployment URL and allow your local/deployed URLs as redirect URLs. Configure an email provider if your usage requires it.
3. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from your project's API settings. These are browser-facing values whose access is constrained by RLS. Never put a service-role key, secret API key, database password, or email credentials in any `NEXT_PUBLIC_` variable.
4. Restart development/build after setting variables. Create an account, confirm email and sign in. A magic sign-in link is available for existing accounts.
5. Before public launch, test with two accounts: account B must neither list/read/update A's project rows nor download A's audio by known object path. Also verify anonymous requests fail. To run the included live checks, create two confirmed test accounts and put `SUPABASE_TEST_EMAIL_A`, `SUPABASE_TEST_PASSWORD_A`, `SUPABASE_TEST_EMAIL_B`, and `SUPABASE_TEST_PASSWORD_B` in ignored `.env.local`, then run `node scripts/verify-cloud.mjs`. It creates and cleans up its own temporary fixture. These checks require a configured Supabase project and are not replaced by unit tests. Test passwords must never use a `NEXT_PUBLIC_` prefix.

When using provisioned infrastructure, `next.config.ts` maps `SUPABASE_PROJECT_URL` and `SUPABASE_PUBLISHABLE_KEY` into the two public browser settings. Only those values are exposed. It also supports `STUDIO_`-prefixed names if the provisioning configuration uses them. Database connection strings and passwords stay server/local-only.

Run `node scripts/migrate-cloud.mjs` to apply the tracked migration once using the provisioned database connection. It tracks completed migrations and verifies the private bucket and policies. The connection verifies both TLS certificate trust and hostname; `supabase/certs/prod-ca-2021.crt` is the public Supabase root CA downloaded from https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt (SHA-256 `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`). This certificate is public trust material, not a credential.

For a fully automated integration check on this newly provisioned project, run `node --import tsx scripts/verify-provisioned-cloud.mjs`. It creates isolated temporary Auth database fixtures without sending email, then tests actual password sign-in, REST/storage policies, repeated studio saves and audio restoration. It removes its temporary accounts and data afterward. Run only against your intended development project; do not use this fixture helper against an unrelated production database.

**Before public sign-ups:** configure custom SMTP and verify confirmation-email delivery. The built-in Supabase sender is restricted to organization-team addresses, so enabling email/password sign-up alone does not enable registration for every musician. Keep email confirmation enabled. See https://supabase.com/docs/guides/auth/auth-smtp. Auth redirect URLs also need to match the deployed studio domain.

Cloud object paths are `user-id/project-id/asset-id`. Original assets are immutable. Each save uploads referenced audio first, then commits the manifest. Failed uploads cannot replace the previous cloud manifest. Orphaned files from partial saves/deleted clips are retained for recovery; future maintenance should implement owner-authorized garbage collection. Saving is explicit; there is no autosave or multi-device conflict resolution yet (last completed cloud save wins).

## Deploy through Vercel

Push this repository to GitHub, import it into Vercel, choose the Next.js preset and Node.js 24, and use `pnpm install --frozen-lockfile` and `pnpm build`. Add the two Supabase public environment variables to the desired environments and redeploy. Set Supabase Auth redirect URLs to match the resulting HTTPS domain. No application server secrets are needed. The studio needs HTTPS (localhost is permitted for development) for microphone access and AudioWorklet. Vercel documents Node.js 24 support at https://vercel.com/docs/functions/runtimes/node-js/node-js-versions.

You can alternatively configure only `SUPABASE_PROJECT_URL` and `SUPABASE_PUBLISHABLE_KEY` on Vercel; the build maps them to the browser configuration. Do not upload the whole provisioning `.env` or any database credentials to a browser/static artifact. `node scripts/check-client-bundle.mjs` verifies that the production browser bundles contain the public configuration and none of the configured private database credentials. Vercel's Hobby plan is restricted to personal, non-commercial use; review the appropriate operator plan before a commercial platform launch (https://vercel.com/docs/plans/hobby). No paid hosting plan is provisioned automatically by this repository.

The application is free to users. Hosting, storage, bandwidth and email remain operator resources subject to provider limits; this is not a promise of unlimited free infrastructure. No paid resources are automatically provisioned by this code.

### Private test deployment

A Vercel Hobby project is provisioned for private testing. Its framework is Next.js, Node.js is 24.x, and Vercel Authentication is configured for **All Deployments**. Public registration/email delivery remains deferred. Both Preview and Production have only the two public Supabase environment variables; private database credentials are not sent to hosting.

Provisioning writes the Vercel token, project ID and organization ID into ignored local configuration. `scripts/vercel-cli.mjs` loads them into the CLI process environment, never command arguments. Install the official Vercel CLI separately in ignored `.tools/vercel`; the project currently uses CLI 65.9.0. Do not edit CLI-managed `.vercel` files.

Before uploading, run `node scripts/configure-vercel.mjs` to verify access protection and settings, then `node scripts/check-vercel-upload.mjs`. The upload check verifies that source audio, credentials, database tools, local infrastructure state and dependencies are excluded. Default to `node scripts/vercel-cli.mjs deploy --yes --environment preview --verify --json` for later test deployments. The CLI's verification checks HTTPS with deployment protection intact.

The initial protected build was approved and deployed on November 3, 2026. Open https://seshgrid.vercel.app and sign into Vercel with access to the SeshGrid project. Vercel required the initial build to be labeled Production; All Deployments authentication protects the stable URL and generated deployment URLs. Later test builds can use the Preview target. Public sign-ups remain deferred.

The authenticated HTTPS check passed for the page, eight JavaScript/CSS assets and `/recorder.js`. An unauthenticated browser was sent to Vercel's login page. The first automatic alias check briefly returned 404; subsequent checks returned 200 without a source change. `node scripts/check-hosted-studio.mjs https://seshgrid.vercel.app` repeats the authenticated asset check without printing response bodies or credentials.

The baseline hardware check passed on November 3, 2026: an original test beat was uploaded, a real microphone take was captured, and the user confirmed clear voice playback. Beat volume and vocal reverb were adjusted, the session was saved locally and reopened, and a valid stereo WAV was exported. Source audio remained byte-for-byte unchanged after reopening. Cloud save/reopen passed separately with temporary test accounts; the real microphone session used browser storage and local backup files. Recorded user audio is not tracked in this repository.

To repeat the check, use a browser with microphone access and headphones: upload a beat, add/select an empty vocal track, record a short take, stop, play it back, adjust the mix, save, reopen, and export a WAV. Browser microphone permission and the Vercel sign-in require the tester's interaction. Broader hardware, interruption and latency testing remains in the roadmap.

## Architecture

- `src/app`: Next.js App Router entry point and responsive dark theme.
- `src/components`: client studio, timeline, waveform and account/project UI.
- `src/lib/model.ts`: versioned, non-destructive project model and validation.
- `src/lib/audio.ts`: Web Audio scheduling, live channel graphs, OfflineAudioContext rendering.
- `public/recorder.js`: AudioWorklet microphone PCM capture.
- `src/lib/storage.ts`: IndexedDB and Supabase persistence; account tokens managed by Supabase Auth.
- `supabase/migrations`: owner-scoped SQL and storage policies.
- `tests`: model invariants and binary WAV encoding tests.

Assets and clips are separate so later phases can add different source types. MIDI/instruments should extend a versioned track model and scheduling adapter. Collaboration requires revisioned persistence and conflict resolution rather than sharing the current mutable manifest. A marketplace should remain a separate domain from private project assets.

## Current limits and release checks

Source files/takes are limited to 50 MB, with a 30-minute export guard to protect browser memory. These are technical safeguards, not premium restrictions. Projects currently live in memory while editing; save frequently. Browser data clearing deletes local projects. Source audio is decoded in RAM, and long or numerous tracks may exhaust device memory. Codec support follows the browser. Keep levels below clipping; no limiter/normalizer is included. Desktop Chromium is the initial validation target; mobile/background recording and device interruptions need additional manual testing.

Before calling Phase 1 production-ready, validate real microphone hardware, input latency, interruptions, multi-track playback and exported listening quality; execute the two-account Supabase privacy matrix; test deployment redirects, storage quota/network failures and recovery. See ROADMAP.md for progress and follow-on work.
