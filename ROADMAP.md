# Phase 1 roadmap

## Milestone 1 — recording workflow

- [x] Next.js / React / TypeScript architecture and responsive dark studio.
- [x] Import source audio and draw waveforms.
- [x] Audio-clock scheduled multitrack playback and PCM microphone capture.
- [x] Add tracks, repeat takes, move, trim, split and delete clips.
- [x] Live volume, pan, mute, solo, shelf EQ and reverb.
- [x] Eight underground vocal/adlib presets with adjustable filters, compression, saturation and stereo echo.
- [x] Local project save/reopen and offline stereo WAV export.
- [x] Portable project backups, restore, and independent session copies.
- [x] Tests for PCM capture, WAV encoding, source edits, local persistence and backup integrity.
- [x] Real-browser synthetic capture, PCM encoding, decode, offline mixing and WAV export integration check.
- [x] Supabase email account integration and private project/audio persistence code.
- [x] Owner-scoped database/storage migration and deployment instructions.
- [x] Provision a Supabase Free project and verify live cross-user isolation.
- [x] Verify actual password sign-in, repeated cloud saves and source-audio restoration.
- [ ] Configure and test confirmation-email delivery for public sign-ups.
- [x] Validate real microphone capture, playback, mixing, local save/reopen and WAV export on the private HTTPS studio.
- [ ] Broaden interruption recovery, device/browser compatibility and latency testing.
- [x] Push the implementation and automated checks to the private GitHub repository.
- [x] Deploy a private Vercel build and verify HTTPS page/assets with access protection enabled.

## Stabilization

Add revision conflict detection, recovery/autosave, undo/redo, input device selection, level meters, export peak management, storage garbage collection and project deletion. Broaden browser/device testing. Improve keyboard navigation, modal focus management and timeline editing ergonomics.

## Future phases (out of Phase 1 scope)

Virtual instruments and MIDI; revisioned collaboration; separate licensed beat marketplace. Preserve free core studio access. No payment code is part of Phase 1.
