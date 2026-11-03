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
