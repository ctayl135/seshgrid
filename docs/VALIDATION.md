# Phase 1 validation

Validated on November 2, 2026 using the local Windows environment and the in-app Chromium browser.

## Automated checks

- TypeScript type check: passed.
- Nine tests: passed. Coverage includes binary WAV headers/interleaving/clipping; solo/mute selection; clip split invariants; malformed manifest rejection; binary project-file round trip and corruption rejection; PCM start-frame alignment, stereo downmix and final partial-buffer flushing; IndexedDB transaction persistence and project replacement.
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
- Microphone startup in the in-app browser reached the permission timeout. The studio recovered and showed a clear error; no microphone take was captured. Hardware recording still needs validation in a browser with microphone permission.

## Remaining release validation

Real microphone hardware and listening quality; microphone/device interruptions; latency compensation across devices; mobile/background behavior; browser storage/network failure recovery; custom SMTP confirmation-email delivery; deployed Auth redirects; and end-to-end Vercel smoke testing. Unit-level PCM verification does not substitute for microphone hardware checks.

## Repository

Source and CI are pushed to the private `ctayl135/seshgrid` GitHub repository. GitHub Actions passed on the implementation commits. No provider credentials, recorded user audio, generated test fixtures, or local project backups are tracked.
