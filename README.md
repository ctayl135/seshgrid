# SeshGrid

A free browser recording studio built with Next.js, React, TypeScript, Web Audio and Supabase. Phase 1 has no billing, subscriptions, or paid feature gates.

## Run locally

Use Node.js 24 and pnpm 11.25.0. Run `pnpm install`, then `pnpm dev`, and visit http://127.0.0.1:3000. Run `pnpm test`, `pnpm typecheck`, and `pnpm build` before shipping. Package versions and the package manager are pinned. GitHub Actions runs those checks on pushes and pull requests.

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

No service credentials are included. Create/connect a Supabase project, then:

1. Run `supabase/migrations/001_private_projects.sql` in its SQL editor (once, on a new project). It creates the projects table, private `project-audio` bucket, owner-only RLS policies, and explicit authenticated database grants. Never change this bucket to public.
2. Enable email authentication and email confirmation. Set the Auth Site URL to your deployment URL and allow your local/deployed URLs as redirect URLs. Configure an email provider if your usage requires it.
3. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from your project's API settings. These are browser-facing values whose access is constrained by RLS. Never put a service-role key, secret API key, database password, or email credentials in any `NEXT_PUBLIC_` variable.
4. Restart development/build after setting variables. Create an account, confirm email and sign in. A magic sign-in link is available for existing accounts.
5. Before public launch, test with two accounts: account B must neither list/read/update A's project rows nor download A's audio by known object path. Also verify anonymous requests fail. To run the included live checks, create two confirmed test accounts and put `SUPABASE_TEST_EMAIL_A`, `SUPABASE_TEST_PASSWORD_A`, `SUPABASE_TEST_EMAIL_B`, and `SUPABASE_TEST_PASSWORD_B` in ignored `.env.local`, then run `node scripts/verify-cloud.mjs`. It creates and cleans up its own temporary fixture. These checks require a configured Supabase project and are not replaced by unit tests. Test passwords must never use a `NEXT_PUBLIC_` prefix.

Cloud object paths are `user-id/project-id/asset-id`. Original assets are immutable. Each save uploads referenced audio first, then commits the manifest. Failed uploads cannot replace the previous cloud manifest. Orphaned files from partial saves/deleted clips are retained for recovery; future maintenance should implement owner-authorized garbage collection. Saving is explicit; there is no autosave or multi-device conflict resolution yet (last completed cloud save wins).

## Deploy through Vercel

Push this repository to GitHub, import it into Vercel, choose the Next.js preset and Node.js 24, and use `pnpm install --frozen-lockfile` and `pnpm build`. Add the two Supabase public environment variables to the desired environments and redeploy. Set Supabase Auth redirect URLs to match the resulting HTTPS domain. No application server secrets are needed. The studio needs HTTPS (localhost is permitted for development) for microphone access and AudioWorklet. Vercel documents Node.js 24 support at https://vercel.com/docs/functions/runtimes/node-js/node-js-versions.

The application is free to users. Hosting, storage, bandwidth and email remain operator resources subject to provider limits; this is not a promise of unlimited free infrastructure. No paid resources are automatically provisioned by this code.

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
