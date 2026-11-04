# NEW AGE NOIR — by New Age Music

A free browser recording studio built with Next.js, React, TypeScript, Web Audio and Supabase. Phase 1 has no billing, subscriptions, or paid feature gates.

Branded private studio: https://new-age-noir-ctayl135-6200-stripe.vercel.app. Existing browser projects remain available at https://seshgrid-lab-ctayl135-6200-stripe.vercel.app, which also runs the renamed app. Reuse this address for browser saves and recovery across preview updates. Projects stored at earlier deployment addresses remain there; transfer them using Backup → Open project file.

## Run locally

Use Node.js 24 and pnpm 11.25.0. Run `pnpm install`, then `pnpm dev`, and visit http://127.0.0.1:3000. Run `pnpm test`, `pnpm typecheck`, and `pnpm build` before shipping. Package versions and the package manager are pinned. GitHub Actions runs those checks on pushes and pull requests.

For a real-browser audio integration test without microphone permission, run `node scripts/browser-engine-test.mjs`, open http://127.0.0.1:3002, and click Run audio pipeline test. This isolated local server uses the production capture/mix code with an oscillator stream and verifies capture duration, signal level, WAV format and rendered stereo output. It is not a production app route. Stop it with Ctrl+C after testing.

## Essential workflow

1. Upload a beat (or multiple source files). Each file becomes a track with a waveform.
2. Add an empty vocal track and select it. Use headphones. Click the red record button, allow microphone access, and perform over the beat. Click stop to finish the take. Recording starts at the current timeline cursor.
3. Click the ruler while stopped to position the cursor. Play/pause or return to start. Select a clip to edit its start, source trim-in, and duration in seconds. Split at the cursor or delete a clip. Edits preserve original audio.
4. Select a track to change its name, volume, stereo pan, low/high shelf EQ and reverb. Mute/solo are included in playback and export. Multiple clips on a track can overlap and sum.
5. Name the session and click Save. Without an account, this commits audio and metadata to IndexedDB in this browser. With an account, it also saves privately to Supabase. A failed cloud save leaves the local copy intact and reports the error.
6. Open Projects, choose a saved session and reopen it, including audio and mix settings. Export WAV produces a 44.1 kHz 16-bit stereo mix with an effect tail of at least 1.5 seconds; echo feedback extends the tail automatically.
7. Use Backup to download a `.sesh` project containing source audio and all edits. Projects → Open project file restores it on another browser or after clearing browser storage. Downloading a backup does not mark browser/cloud changes saved. Projects → Duplicate session makes an independent copy for the next save.

Save reports success only after a local transaction or cloud commit finishes. Local storage operations time out rather than locking the studio forever. If both destinations fail, a backup download is started and the studio reports the failure; keep that file. In-app confirmations protect unsaved work when switching sessions. The timeline's Cursor field also supports precise, keyboard-accessible split positions.

Microphone recording uses an AudioWorklet producing lossless mono PCM WAV, aligned to the same audio clock as backing-track scheduling. Hardware input/output latency varies; adjust the clip Start field after recording when needed. Monitoring is deliberately disabled to avoid feedback. Tempo guides session metadata; this version does not stretch audio or provide a metronome.

## Underground vocal and adlib presets

Private preset build: https://seshgrid-93pf6niol-ctayl135-6200-stripe.vercel.app. This preview includes the new effects; the original stable deployment remains a separate build. Vercel Authentication protects the preview.

Select a vocal track, then choose a sound in the channel strip's **UNDERGROUND** preset selector. Presets apply immediately during playback and are included in WAV exports.

| Lead vocals | Adlibs and backing vocals |
| --- | --- |
| Dark Trap Lead — warm, controlled, short slap | Wide Doubles — short, wide stereo repeats |
| Rage Cut — bright compression and crunchy drive | Ping-Pong Throws — alternating left/right echo |
| Cloud Float — airy vocal, hazy room and echoes | Ghost Whisper — dark, thin and distant |
| Lo-Fi Phone — narrow, dusty phone-like tone | Basement Shout — compressed, dirty saturation |

**Shape this sound** opens adjustable low/high cuts, compression, drive, echo mix/time/feedback and echo width. Existing EQ/reverb controls remain available. Changing a parameter marks the sound as Custom settings. **Reset FX** returns the track to dry processing. Presets and reset preserve track volume, pan, mute/solo, clip edits and original recordings. Effects are not baked into microphone source files. Pitch stays as recorded; these are tone, dynamics and ambience presets rather than pitch correction.

Settings are stored in an optional `fx` field in the existing version-1 track manifest. Older projects without this field stay dry, and save/reopen/portable backups preserve the new controls. Playback and offline export use the same effect graph. Echo feedback is bounded for stability and the exporter retains the decaying tail.

## Artist profiles and For You

The app is now branded **NEW AGE NOIR**, by **New Age Music**. The existing repository, internal browser database and .sesh backup format retain their identifiers so previous sessions keep working.

Profile lets a signed-in artist save a display name, bio and preferred genre. For You lists opted-in releases from members, putting the listener's genre first, with a genre filter and artist profile links. It is a simple discovery feed over the latest 100 releases, not a trained recommendation system. Artist pages display their releases; owners can unpublish and republish.

To share: create your profile, open an audio session, click Publish, choose title/genre and explicitly confirm sharing permission. Only a rendered stereo mix is uploaded to the separate private shared-mixes bucket. Individual takes and project manifests remain owner-only. During private testing the feed requires a signed-in account and Vercel access; public signup/email configuration remains deferred. Feed playback uses one-minute signed URLs. New uploads use cacheControl=0; unpublishing blocks new member downloads while already issued playback links can last up to one minute. A listener may keep any audio they have already downloaded.

The first release supports up to four minutes and 50 MB per published WAV. This is a browser/memory and storage safety limit, not a paid tier. Run migrations in order, including supabase/migrations/002_artist_feed.sql, or use node scripts/migrate-cloud.mjs, which now tracks all numbered SQL migrations. Migration 002 adds artist profiles, release metadata, indexes and owner/member-scoped storage policies without changing private project policies. No new API key is needed.

## Beat Lab and clip tools

Imported audio starts as a beat track. Choose Beat, Lead vocal or Adlib in Track type for existing tracks. The sidebar separates Beats, Vocals and Adlibs. Beat Lab provides low/high cuts, glue compression, saturation and Clean beat, 808 weight and Dusty tape starting sounds. Each track has independent volume, EQ, effects and mute/solo controls; a beat change does not alter the vocal settings.

Select a clip and choose Normalize clip to bring its loudest source sample toward -1 dBFS before track effects. The calculation respects source trim and all channels, rejects silence and caps gain at 32x. Original source bytes stay intact. Reset clip gain, undo/redo, save/reopen, portable backups, cloud persistence and WAV export all retain this non-destructive clip level. This is peak normalization, not loudness matching or automatic mastering; track EQ/effects and overlapping clips can still create clipping. Duplicate clip places a copy directly after the selected clip; Snap start to beat rounds its timeline start to the nearest beat at the session tempo without time-stretching its source.

## Projects and playlist

Open Projects for the saved-song library. Search your projects, open one in the studio, or choose Play all. Queue adds individual songs; move songs up or remove them while playback is stopped. Pause/Resume, Next song and Stop control the playlist. The next song starts automatically after the current mix and its effects finish; the final song ends the playlist.

Playback uses the saved source audio, edits and effects without replacing the current studio session or saving unsaved changes. The library combines browser saves and signed-in private cloud projects, showing the newer saved copy when the same project exists in both. Cloud songs load privately when needed. Loading can add a pause between songs; this is sequential playback, not gapless playback. Missing or empty projects report an error and can be skipped. Closing Projects stops playback and clears the temporary queue. Projects saved at another site address must be transferred with Backup → Open project file.

## Microphone and level meters

Choose a microphone in Recording setup before recording, or keep System default. Refresh inputs updates the list without opening the microphone. Browsers may hide device names until Record is used and permission is granted. Input selection stays locked during playback, recording and busy operations. If a selected device disappears, recording reports the issue instead of silently using another input; reconnect it or choose System default.

Input shows the raw mono signal being captured while recording. Mix measures the louder of the stereo output channels after track volume and effects during playback. A sampled peak near 0 dBFS holds a red CLIP warning for two seconds. Lower your microphone/interface gain for input clipping, or track volumes for mix clipping. Vocal presets cannot repair already clipped input. These are sampled peak meters, not true-peak or loudness meters; brief peaks may be missed. Input is never monitored through the speakers. Device choice is kept only in the current studio tab and is not included in cloud projects.

## Undo and local recovery

Use the arrangement Undo/Redo buttons, Ctrl/Command Z, Ctrl/Command Shift Z, or Ctrl Y. History retains up to 60 edits, including takes, clip edits, track deletion and preset changes. Rapid changes to one control are grouped. History resets when opening or creating a session; it is not saved in project files.

After edits pause for 1.5 seconds, the studio writes a separate recovery checkpoint with its source audio to this browser. Recording and other busy operations pause checkpointing. Returning to the same studio URL offers Restore draft; earlier drafts are also in Projects. Restoration remains unsaved until you click Save. A successful explicit save clears that session's recovery drafts without replacing other tabs' work.

Recovery is best effort and local to this browser and exact site address. Closing before the checkpoint finishes, clearing browser storage, private browsing or storage failure can lose unsaved changes. Save and download backups regularly. Cloud saving remains explicit.

## Supabase setup (required for accounts and cloud projects)

The SeshGrid workspace now has a provisioned Supabase Free project. Its owner-only project policies and private audio bucket are applied. Live cross-account privacy and sign-in/save/reopen checks passed. CLI-managed credentials stay in ignored local configuration; they are not part of the repository.

No service credentials are included. Create/connect a Supabase project, then:

1. Run `supabase/migrations/001_private_projects.sql` and then `supabase/migrations/002_artist_feed.sql` in its SQL editor (once, on a new project). It creates the projects table, private `project-audio` bucket, owner-only RLS policies, and explicit authenticated database grants. Never change this bucket to public.
2. Enable email authentication and email confirmation. Set the Auth Site URL to your deployment URL and allow your local/deployed URLs as redirect URLs. Configure an email provider if your usage requires it.
3. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from your project's API settings. These are browser-facing values whose access is constrained by RLS. Never put a service-role key, secret API key, database password, or email credentials in any `NEXT_PUBLIC_` variable.
4. Restart development/build after setting variables. Create an account, confirm email and sign in. A magic sign-in link is available for existing accounts.
5. Before public launch, test with two accounts: account B must neither list/read/update A's project rows nor download A's audio by known object path. Also verify anonymous requests fail. To run the included live checks, create two confirmed test accounts and put `SUPABASE_TEST_EMAIL_A`, `SUPABASE_TEST_PASSWORD_A`, `SUPABASE_TEST_EMAIL_B`, and `SUPABASE_TEST_PASSWORD_B` in ignored `.env.local`, then run `node scripts/verify-cloud.mjs`. It creates and cleans up its own temporary fixture. These checks require a configured Supabase project and are not replaced by unit tests. Test passwords must never use a `NEXT_PUBLIC_` prefix.

When using provisioned infrastructure, `next.config.ts` maps `SUPABASE_PROJECT_URL` and `SUPABASE_PUBLISHABLE_KEY` into the two public browser settings. Only those values are exposed. It also supports `STUDIO_`-prefixed names if the provisioning configuration uses them. Database connection strings and passwords stay server/local-only.

Run `node scripts/migrate-cloud.mjs` to apply the tracked migration once using the provisioned database connection. It tracks completed migrations and verifies the private bucket and policies. The connection verifies both TLS certificate trust and hostname; `supabase/certs/prod-ca-2021.crt` is the public Supabase root CA downloaded from https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt (SHA-256 `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`). This certificate is public trust material, not a credential.

For a fully automated integration check on this newly provisioned project, run `node --import tsx scripts/verify-provisioned-cloud.mjs`. It creates isolated temporary Auth database fixtures without sending email, then tests actual password sign-in, REST/storage policies, repeated studio saves and audio restoration. It removes its temporary accounts and data afterward. Run only against your intended development project; do not use this fixture helper against an unrelated production database.

**Before public sign-ups:** configure custom SMTP and verify confirmation-email delivery. The built-in Supabase sender is restricted to organization-team addresses, so enabling email/password sign-up alone does not enable registration for every musician. Keep email confirmation enabled. See https://supabase.com/docs/guides/auth/auth-smtp. Auth redirect URLs also need to match the deployed studio domain.

Cloud object paths are `user-id/project-id/asset-id`. Original assets are immutable. Each save uploads referenced audio first, then commits the manifest. Failed uploads cannot replace the previous cloud manifest. Orphaned files from partial saves/deleted clips are retained for recovery; future maintenance should implement owner-authorized garbage collection. Saving is explicit; cloud autosave and multi-device conflict resolution are not implemented (last completed cloud save wins).

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
