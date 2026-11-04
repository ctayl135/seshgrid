# Phase 1 validation

Validated on November 2, 2026 using the local Windows environment and the in-app Chromium browser.

## Automated checks

- TypeScript type check: passed.
- Thirteen tests: passed. Coverage includes binary WAV headers/interleaving/clipping; solo/mute selection; clip split invariants; malformed manifest rejection; binary project-file round trip and corruption rejection; PCM start-frame alignment, stereo downmix and final partial-buffer flushing; IndexedDB transaction persistence and project replacement; preset preservation, bypass, safe feedback and effect-tail bounds.
- Production build: passed, including the recording, backup and confirmation refinements.
- Live cloud privacy checks passed on the provisioned Supabase Free project. Anonymous and other-account reads, writes, deletes and cross-folder uploads were denied while owner access remained valid.
- Actual password sign-in, source-audio upload, repeated cloud saving, project listing, manifest restoration and byte-for-byte source-audio restoration passed using the application persistence module. Temporary accounts and test data were removed afterward.
- Production build with the provisioned public configuration passed. Ten browser JavaScript bundles were checked: the public URL/key were present and private database credentials were absent.

## Browser workflow checks

- Imported two generated three-second WAV files into separate tracks.
- Started multitrack playback and observed transport progress and automatic completion.
- Moved a vocal clip to 0.5 seconds, trimmed its source by 0.25 seconds, and shortened it to two seconds.
- Soloed and panned the vocal right. Exported WAV inspection confirmed 44.1 kHz, 16-bit stereo, no left-channel signal, and right-channel signal from approximately 0.50002 to 2.49998 seconds. This confirms the renderer respects editing, solo selection and pan.
- Saved to browser storage, listed the saved project and reopened it with source audio, positions and mix settings intact.
- Split the edited clip at 1.5 seconds. Backup inspection confirmed ranges `(start .5, offset .25, duration 1)` and `(start 1.5, offset 1.25, duration 1)`.
- Downloaded a `.sesh` project containing both source files and reopened it in a fresh studio tab. Split clips and mix settings were restored.
- The original native confirmation stalled the browser test tools. The application now uses in-app confirmations for session switching and track deletion.
- Retested the in-app confirmation: cancel preserved unsaved changes, and continuing restored the selected backup successfully.
- Retested the refined dry/wet mixing graph: the fully right-panned mono vocal rendered at the expected 4,800 PCM peak with a silent left channel, verifying the 0.8 track gain without unintended doubling.
- Real-browser synthetic capture integration passed: actual AudioWorklet → PCM WAV → decode → offline mix/export. Captured 0.900 seconds with RMS 0.0707; output was 44.1 kHz / 16-bit stereo, right peak 0.0500 and left peak 0.0000. The isolated test uses the production `MicrophoneCapture` and `AudioEngine` with an oscillator stream, not microphone permission or a simulated AudioWorklet.
- An earlier microphone startup reached the permission timeout. The studio recovered and showed a clear error. The subsequent live hardware check below passed after access was granted.

## Live microphone workflow — November 3, 2026

- Opened the protected HTTPS studio after the user signed into Vercel.
- Uploaded an original generated drum/bass beat and captured a real microphone take of approximately 19.7 seconds.
- The user confirmed that their voice was clear over the beat during playback.
- Adjusted beat gain to 0.7 and vocal reverb to 5%, saved locally and reopened the session.
- Compared project backups before and after reopening: all source audio bytes were preserved exactly, and the mix settings were restored.
- Exported the reopened mix: valid 44.1 kHz, 16-bit stereo PCM WAV, approximately 21.198 seconds including the effect tail, with non-silent audio.
- The session remains in browser storage and local Downloads backups. No recorded user audio or project backup was added to the repository or uploaded to Supabase during this test. Cloud persistence was verified separately with temporary test fixtures.

## Underground preset checks — November 3, 2026

- All eight presets pass manifest validation and retain source edits, volume, pan and mute/solo. Reset restores dry processing.
- Real-browser AudioWorklet and offline-render integration passes: every preset changes the rendered signal with finite samples; ping-pong echoes alternate left/right at expected times; dry mono and stereo levels are preserved. An initial mono upmix regression was caught and corrected by explicitly preserving the source channel count before panning.
- UI checks passed for applying lead/adlib presets, editing a preset into Custom settings, Reset FX, and saving/reopening Ping-Pong Throws with its parameters intact.
- Portable and IndexedDB round trips retain preset controls. Live Supabase sign-in, repeated save/reopen and byte-for-byte audio restoration passed with a preset-bearing manifest; temporary test accounts were removed afterward.
- Production build, TypeScript and browser credential-leak checks passed.
- Private preset preview deployed Ready at https://seshgrid-93pf6niol-ctayl135-6200-stripe.vercel.app with Vercel Authentication. The hosted studio, supporting assets and recording processor passed HTTPS checks.
- Opened the preview using the existing authenticated browser session, imported a local backup of the user's test take and duplicated it into a separate audition project. Applied Dark Trap Lead and saved locally. Its exported stereo WAV differs from the original mix as expected. No recorded user audio was added to source control or uploaded to cloud project storage during this audition.

## Remaining release validation

Microphone/device interruptions; latency compensation across devices; mobile/background behavior; browser storage/network failure recovery; custom SMTP confirmation-email delivery; and deployed Auth redirects. The baseline signed-in HTTPS recording workflow has passed, but broader device and browser coverage remains necessary before a public release.

## Private Vercel deployment — November 3, 2026

The free Hobby plan and SeshGrid project are provisioned. Next.js/Node.js 24 settings and Vercel Authentication for All Deployments were confirmed through the project API. The two public Supabase settings are configured for Preview and Production; database credentials stay local. A dry upload contains 20 source/configuration files totaling 126,239 bytes, with no credentials, database tools, audio fixtures or local provisioning state.

The user approved the first protected Production-labeled build. Deployment `dpl_B8gL66NnhmaMty46Z7Y79VPzErU3` is Ready at https://seshgrid.vercel.app, with generated URL https://seshgrid-pmnpi9jvx-ctayl135-6200-stripe.vercel.app. The initial alias verification returned 404; subsequent authenticated checks returned 200 without a source change. The page, eight JavaScript/CSS assets and `/recorder.js` passed the HTTPS asset check. An unauthenticated browser redirected to Vercel login, confirming the access gate. The user then signed in and completed the live microphone check above.

## Repository

Source and CI are pushed to the private `ctayl135/seshgrid` GitHub repository. GitHub Actions passed on the implementation commits. No provider credentials, recorded user audio, generated test fixtures, or local project backups are tracked.

## Undo and recovery checks — November 3, 2026

- All 20 tests pass, including bounded/grouped history, redo invalidation, independent-tab drafts, failed-checkpoint preservation and source audio round trips. TypeScript, production build and client credential scan pass.
- In the real browser, uploaded generated test audio, applied Ping-Pong Throws, undid to dry and redid to the preset. A fresh studio instance offered the unsaved draft and restored its title, track, preset and source audio.
- Recovered audio exported as a non-silent 44.1 kHz, 16-bit stereo WAV. Explicit Save succeeded; a fresh studio instance no longer offered the saved recovery draft. User recordings were not used in these tests.
- Recovery is separate from manual saves and cloud storage. History is session-only; checkpoints wait for recording/busy operations to finish. Sudden shutdown before a checkpoint and broader device interruptions remain limitations.

The recovery build is Ready at https://seshgrid-poi7dpjcb-ctayl135-6200-stripe.vercel.app. Stable private test alias: https://seshgrid-lab-ctayl135-6200-stripe.vercel.app (Vercel Authentication remains enabled for all deployments). Hosted audio import, preset undo/redo and local save passed. Production alias was not changed.

## Input selection and peak meters — November 3, 2026

- All 21 automated tests pass. TypeScript, production build and client credential scan pass.
- Real-browser oscillator capture verifies that the selected device constraint reaches getUserMedia, the input meter measures raw audio, the mix meter measures post-fader stereo peaks, and stopping releases metering nodes. Opposite-phase stereo channels remain visible on the mix meter. All eight preset renders, echo positions and WAV output remain correct.
- Browser UI shows the selected default input, refresh control, idle input meter and live mix levels during generated-beat playback. Input selection is disabled during playback. No real microphone permission or user recordings were used in this update's tests. Physical multi-device switching still needs hardware testing.
- Corrected the integration test's echo window calculation to use the decoded buffer's sample rate, so it works with both 44.1 kHz and 48 kHz output devices.

Meter build deployed Ready at https://seshgrid-mmpfvvvci-ctayl135-6200-stripe.vercel.app and assigned to the stable private lab alias. Reopened the previously saved Dark Trap Lead session at the lab address; audio, preset and mix settings persisted across the update. Hosted playback shows live mix levels and disables input changes. Vercel Authentication remains active; production alias was not changed.

## Projects and playlist — November 3, 2026

- All 25 tests pass, including automatic advance/end, pause position, stale completion cancellation, skipping during load, closing during load, queue uniqueness and recoverable loading errors. Production build, TypeScript and browser credential scan pass.
- Real-browser audio integration sequenced two songs using scheduled audio completion events, including their effect tails. Existing capture, stereo meters, all eight presets and export checks still pass.
- In the Projects view, queued two existing generated-audio projects, played to the final Playlist finished state, replayed from the first song and paused successfully. Playback leaves the editor session unchanged.
- The playlist uses a separate audio engine, loads private cloud sources on demand and does not create public media URLs. Cloud access policies are unchanged. Queue order is temporary; gapless playback and background/mobile continuity are not promised.

Projects playlist build is Ready at https://seshgrid-8npx5vubb-ctayl135-6200-stripe.vercel.app and the stable private lab alias. Hosted library retained the previous saved project; search and Play all passed. The existing studio session stayed untouched. Vercel Authentication remains active for all deployments.

## NEW AGE NOIR expansion — November 3, 2026

- Rebranded the product as NEW AGE NOIR by New Age Music. Kept original browser database and backup identifiers for compatibility.
- All 28 automated tests pass, including trimmed/multichannel normalization, bounded gain, source immutability, clip-level split/portable persistence and profile validation.
- Real-browser audio integration confirms that normalized clip gain reaches its expected exported peak while capture, all presets, stereo metering and playlist completion remain correct.
- Applied migration 002 to the existing Supabase Free project. Live checks passed for profile save, mix publish, member playback, anonymous denial, cross-owner profile/release edit denial, unpublish access denial and republish. Existing private project isolation and byte-exact source save/reopen still pass, now including clip gain and beat roles. An initial cached download after unpublish was caught and fixed by setting cacheControl=0 on new shared uploads.
- Browser UI checks passed for temporary account sign-in, profile save, Beat Lab presets, Normalize clip, Duplicate clip, explicit publication, actual feed audio playback and unpublish/republish controls. Only generated test audio was published. Temporary accounts and shared test files were removed. No user voice recordings were published or committed.
- The feed is a member-only discovery list prioritizing profile genre among the latest 100 releases. Four-minute/50 MB publishing safety limits, signed-link expiry and broader device testing remain documented.

Deployment dpl_HRf4T1eViHCMHu8wX26EFHvEdUxU is Ready. Both the existing private lab address and https://new-age-noir-ctayl135-6200-stripe.vercel.app point to the renamed app, protected by Vercel Authentication. Hosted studio import, independent beat/vocal sections, normalization, 0.27s → 0.5s beat snapping, local save and For You authentication gating passed. Production alias was not promoted. New hostnames have independent browser storage; use portable backups to transfer local projects.

## NOIR home and Sessions — November 4, 2026

- Shortened the app name to NOIR across studio, profile, feed and page metadata. Home is now /, Sessions is /sessions and recording/editing is /studio.
- All 28 tests, TypeScript, production build and browser credential scan pass.
- Browser checks passed for Home → Sessions, opening an existing saved source/preset project, New session creating a blank studio, saving a new named session with its own reopen URL, refresh/navigation, and the Open project backup shortcut entering the project importer. Existing project storage identifiers and source files remain unchanged.
- Session cards combine local and signed-in cloud projects and retain recovery entries. Cloud authorization remains enforced by the existing owner policies. Studio route changes do not publish or share projects.

Private deployment dpl_4fwg1bQJWd5esvnRsSQF8PZdV3Mg is Ready and assigned to both existing test addresses. Hosted Home and Sessions navigation, saved-project visibility and recovery-draft visibility passed. The app name is NOIR; browser storage stays at its existing origins.

## Community and collaboration — November 4, 2026

- All 30 automated tests pass, including message validation and bidirectional conversation ordering. TypeScript, production build and client credential scan pass.
- Applied migrations 003–007. Live three-account tests pass for private DMs, sender impersonation denial, owner-only notifications/read status, beat posting/import, pending invite source denial, wrong-user acceptance denial, accepted editor source upload/save, owner immutability, stale-save rejection, viewer write denial and revocation. Existing source-byte save/reopen, anonymous denial and feed publication checks still pass.
- A shared-source policy lookup initially resolved an ambiguous name against the project row; migration 005 explicitly qualifies the storage object path. Authorized reads now use fresh signed URLs rather than relying on previously cached authenticated-download responses. Shared manifest updates require revision checks; migration 007 preserves legacy private-owner saves while denying direct shared updates.
- Browser checks passed for posting generated WAV audio with usage permission, opening that beat in a new session, cloud save, sending a DM to a temporary artist, sending an editor invitation, viewing recipient message/invitation notifications and acceptance. No user music or messages to real artists were used.
- Current limits: signed-in private testing, four-minute/50 MB beat uploads, 15-second visible-page inbox polling, recent-message history bounds and asynchronous shared saves. No live simultaneous edit merging, browser push or email notifications.

The browser recipient accepted the invitation, reopened the shared source audio and successfully saved a title edit to the owner’s cloud project. Temporary UI accounts, beat posts, shared source files, messages and invitations were removed after verification.

Community deployment dpl_7SKr3CWqNxPTrBC3o2BireHm8Kzq is Ready and assigned to both existing private studio addresses. Hosted Home → Beats → DMs → Notifications navigation and account gating passed. Vercel Authentication remains enabled, and public signup remains deferred. No new API keys or paid resources were required.

## Recording and stock plugins — November 4, 2026

- All 36 automated tests, TypeScript and production build pass; browser bundle scan finds no private credentials. Tests cover pitch accuracy/duration, stereo phase, unvoiced noise, bypass, cleanup processing, take switching, count-in scheduling and backup validation.
- Actual browser AudioWorklet integration passes generated-input count-in capture, muted-take mixing, Pitch Lock WAV export, loop wrap/stop, existing effects and playlist completion. No user voice was used.
- Browser UI checks pass synthetic session import, take switching, A-minor Smooth minor settings, loop play/pause and local save/reopen. Live cloud round-trip includes plugin settings/take metadata and byte-exact source restoration; the existing three-account privacy, DM, beat, invitation and revision matrix passes. Temporary cloud fixtures were removed.
- Pitch correction currently processes playback/export, not live input. Physical microphone latency, subjective vocal quality, mobile/background behavior and interruption recovery still need broader device testing. Loops audition a fixed rendered region; recording remains linear.

Private deployment dpl_HFZDfEAJA1rveXGFKhRLhDwTssq3 is Ready and assigned to both existing private studio addresses. Hosted synthetic session import, Hard tune/key/scale controls and actual WAV download passed. Vercel Authentication remains enabled. No new keys, migrations or paid resources were required.

## Expanded tuning chains — November 4, 2026

- Added six distinct Pitch Lock effect chains, preserving selected key/scale and channel volume/pan. Added independently adjustable chorus doubler, 5 Hz tremolo and digital crusher. Optional model fields keep older sessions compatible; processing cache includes all new controls.
- All 38 tests pass, including distinct chain validation and color processing/bypass/source preservation. Production build, TypeScript, credential scan and upload exclusion check pass.
- Private deployment dpl_4AARcKwSscexPPkNmk6cK2ZJgsLn is Ready at both stable private aliases. Hosted generated-audio Neon Robot WAV export and local save/reopen restore chorus 15%, tremolo 40%, crusher 80% and tuning settings. No user microphone or voice was used. Processing remains playback/export only.

## Public production launch — November 4, 2026

Deployment dpl_2EdMywgWvH8UmLtvjQrP7MEuTTHB is Ready in production. Standard Vercel protection allows public production domains and retains preview protection. Both public home/studio and beats/sessions routes return HTTP 200 without cookies, authorization headers or protection bypass tokens. Confirmed NOIR title rather than a Vercel authentication page. The NOIR alias is now a project domain following production. Re-ran the live three-account privacy, source round-trip, DM, beat, invitation and revision matrix successfully; temporary fixtures removed. Public signup remains deferred, private sources remain protected and GitHub stays private.

## Artist follows — November 4, 2026

Migration 008 adds member-readable follows with owner-only insert/delete, a composite uniqueness key, self-follow rejection and profile foreign keys. Profile/For You now include artist discovery (100 recent profiles, local name filter), counts and follow/unfollow controls. Profiles and releases remain member-only; private project/source policies are unchanged.

All 38 automated tests, production build, TypeScript and credential scan pass. Live three-account tests confirm follow counts, duplicate safety, own unfollow, self-follow/impersonation/anonymous denial and cross-account delete denial, alongside the existing privacy, publishing, beat, DM and collaborative-save matrix. Hosted UI test confirms profile save, discovery, following another temporary artist and count changing to one. Production deployment dpl_PJhzLJ21oYqaucoZCbZ3oV5FBVeh is Ready at the public NOIR address. Direct Auxd release integration is pending the requested exact service link/API; no external upload connection is claimed.

## Underground preset library — November 4, 2026

All 39 automated tests, production build, TypeScript, client credential and upload exclusion checks pass. All 16 presets validate, preserve key/scale, gain/pan/source edits and produce finite, unchanged-length generated audio. Live three-account studio save/reopen/source-byte restoration, follow, privacy, publishing, beat, DM and collaboration matrix passes; generated integration-test accounts removed.

Hosted browser verified library search plus Adlibs filtering, Boofpaxkmooky Dream echoes opening a new armed adlib track with 90% correction/65 ms retune and 80% chorus, and sample artist sign-in. Two explicitly requested demo accounts remain, labeled as demos with no real artist affiliation; credentials stored only in ignored local test storage. Production dpl_Cky7b922d5Ei3iz3bdJaWxqugXer is Ready at the existing public domains. Artist-inspired chains are creative starting points; actual vocal listening quality still depends on the recording and song key.

## Instant signup fix and profile onboarding — November 4, 2026

Applied migration 009 and confirmed auth settings allow signup with mailer_autoconfirm=true. Live tests created two real signUp sessions, verified unique/editable usernames, website/profile updates, photo upload, cross-owner avatar upload denial and anonymous storage denial, then removed the fixtures. All previous 39 tests plus account validation pass, as do production build/TypeScript and credential scan. Browser signup from the deployed form reached /profile?welcome=1 immediately with artist name populated. Invalid image decoding is rejected before upload. Production dpl_9MF1ps4YS5X6JZLgvRhxVdyBwqa2 is Ready at the public NOIR account link.

## Artist search and suggested accounts — November 4, 2026

Migration 010 adds member-only literal display-name/username discovery and suggestions excluding self and existing follows. UI provides searchable account cards, profile photos/initials, usernames, direct follow/unfollow, loading and empty states, and genre-prioritized suggestions. All 40 tests, production build and credential scan pass. Live checks cover username search, literal punctuation, anonymous denial, suggestion limits/self-exclusion and the existing privacy/follow/community matrix. Generated integration-test users were removed. Hosted browser checked For You account search using the existing demo artist.

## Follow notification delivery — November 4, 2026

Migration 011 creates unread recipient notifications after new follow inserts; all follow entry points share this database trigger. The inbox supports safe follower-profile links and labels them View artist. Live three-account tests confirm exactly one notice for duplicate requests, correct follower name/link, unread state, and denial of actor/third-party reads. Existing privacy, follow, discovery, DM, beat, release and collaborative-save checks pass; generated accounts removed. Production build/TypeScript and client credential scan pass. Existing 15-second visible-page notification refresh applies; this does not add push/email notifications or historical backfill.

Follow-notification correction: migration 012 backfills missing inbox entries for pre-trigger follows, preserving their original follow time and avoiding duplicates. Verified no existing follows remain without a recipient notification. This corrects the initial no-backfill limitation.

## Multi-format audio — November 4, 2026

All 40 tests, TypeScript and production build pass. Real Chromium worker tests encode and decode generated stereo audio in WAV, MP3, M4A, FLAC, OGG, AAC and AIFF, verifying nonempty output, finite/non-silent audio, channels and duration (1.000–1.045 seconds for a one-second source). Opus failed a round-trip and is intentionally not offered for export. Studio loading now falls back to local conversion after native decode failure. Beat uploads transcode supported input to WAV before publishing. Vercel upload exclusions pass; no private files included. Production dpl_8Uh5qM6eCa46jjWoE2txM8HDCxmB is Ready.

Hosted studio verification also passed: imported a generated portable session, selected MP3, downloaded the real converted MP3, and uploaded it back as a new playable track. FLAC selector updates the Export button. No user recordings were used for conversion tests.

## Timeline tools — November 4, 2026

All 44 automated tests, TypeScript, production build and credential scan pass. New checks cover reversed/overlapping range selection, endpoint exclusions, grouped moves clamped at zero, source/spacing preservation, copy/paste identities and take detachment, paste bounds and tempo/subdivision snapping. Hosted browser verified numeric highlight selection, selecting three overlapping clips, copying/pasting the group, undo restoring original clips, selection loop 0–3 seconds, and 2× zoom. Used generated audio only. Deployment dpl_HMob1avVxyTHS3zTKH1kAWX7qnq4 is Ready in production.

Ruler pointer-drag check also passed in the hosted studio: dragging across the ruler selected 0.5–2.5 seconds with beat snapping and retained the intersecting clip selection.

## Highlight mini menu — November 4, 2026

The range pointer-up gesture opens a viewport-bounded Selection actions popup with Copy, Cut, Paste at selection start, Loop selection, mute/unmute, delete and six tool modes. Escape/outside-click/close dismiss it; right-click reopens it. Hosted generated-audio test passed: highlight selects three clips and opens menu; Copy closes it; highlighting empty time enables Paste at selection start; paste inserts the copied group at four seconds; Undo restores original arrangement. Build/TypeScript and credential scan pass. Production dpl_6FQzzynBCdrpRSHKtE1sVL2rK5Y4 is Ready.

## Direct highlighted-clip dragging — November 4, 2026

Highlight / Select now supports direct clip dragging with a visual group preview and edge scrolling, using existing snapped/clamped move logic. One drop creates one undo entry; cancelled gestures discard the preview. Browser test passed with three selected generated clips: dragging 64 pixels moved start times from 0/0.5/0.5 seconds to 2/2.5/2.5 seconds while Highlight remained active; one Undo restored the original arrangement. Build/TypeScript and client credential scan pass. Production dpl_9aZic16Yh9zcRcmsfBFuefwQWoj8 is Ready.

## Volume Motion — November 4, 2026

All 46 tests, TypeScript, production build and credential scan pass. Tests cover interpolation, seeking into a curve, unity outside the region, scheduling a future region without an early ramp, validation and portable persistence. Actual browser audio-engine integration confirms the exported late fade window has over three times the RMS of the early window. Existing capture, effects, metering, playlist and loop regression checks pass. UI checks confirm a two-second fade/visible motion strip, four-point ducking curve and local save/reopen retaining point times and values. Cloud round-trip fixture includes Volume Motion metadata and byte-exact source restoration. Production dpl_GkNVPGKmy1RGubbnCqSt7wg1SSu5 is Ready.

## Monochrome branding — November 4, 2026

Replaced interface color accents, tracks, waveform strokes and motion curves with grayscale values; established black backgrounds and white primary/selected controls. Added an original vector N/music-note mark for navigation and favicon. Production build/TypeScript and client credential scan pass. Hosted home screenshot confirms readable black/white controls, waveform artwork and logo. No recording, account or storage behavior changed. Production dpl_Hyo6JAnDaFR1yH9qugxHcxuQAq26 is Ready.
