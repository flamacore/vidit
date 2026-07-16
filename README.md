
# Vidit

Desktop non-linear video editor for Windows, built with **Electron**, **React**, **Vite**, **Zustand**, and native **FFmpeg**.
<img width="1070" height="699" alt="electron_jv6IAOPSAr" src="https://github.com/user-attachments/assets/8616a985-d04a-4de9-b322-006948ce61cf" />

## AI-assisted development

This project was built with substantial help from AI coding tools (Cursor / agent-assisted workflows). Architecture choices, feature implementation, debugging, and iteration were done in collaboration with AI — treat the codebase as human-directed, AI-accelerated work, not as a fully hand-written greenfield app.

## Features

- Media bin (import, multi-select, drag onto the timeline)
- Multi-track timeline (video, audio, text) with trim, blade, snap, zoom, and ripple insert
- Realtime preview with H.264 proxy generation for phone/HEVC footage
- Layer compositing (upper tracks over lower), transforms, crop, opacity
- On-canvas transform handles (multi-select / group transform)
- Text overlays with color alpha, outline, drop shadow, and bevel
- Preview audio with selectable output device
- Project save/load (`.vidit`) and cross-project copy/paste of layers
- Export to MP4/MOV with H.264, H.265, or ProRes

## Develop

```bash
npm install
npm run dev
```

This starts Vite and opens the **Electron** window (not a browser tab). Import and media preview require the Electron preload bridge.

## Test

```bash
npm run test:e2e
```

Playwright drives the Electron app (import, timeline, preview, export smoke coverage).

## Build

```bash
npm run build:dir   # unpackaged app under release/
npm run build       # Windows NSIS installer under release/
```

Installer artifact: `release/Vidit-<version>-setup.exe` (unsigned — SmartScreen may warn).

## Releases

Releases are **deliberate**, not automatic on every push (same idea as a tag-gated pipeline).

1. When you want a release, bump and review notes locally:

   ```bash
   npm run release:prepare -- 0.2.0
   ```

2. Commit any pending work (including the version bump), then tag and push **only the tag** to publish:

   ```bash
   git tag -a v0.2.0 -m "Vidit v0.2.0"
   git push origin HEAD
   git push origin v0.2.0
   ```

3. GitHub Actions (`.github/workflows/release.yml`) builds the NSIS installer and creates a GitHub Release. Notes are auto-generated from commits since the previous `v*` tag, so one release collects everything since the last version.

Or run **Actions → Release → Run workflow** and pass a tag such as `v0.2.0` (that only creates/pushes the tag; the installer build runs from the tag push).

Ordinary pushes to `main` do **not** create releases.

## Stack

| Area | Tech |
|------|------|
| Shell | Electron |
| UI | React 19 + Vite |
| State | Zustand + Immer |
| Media | ffmpeg-static / ffprobe-static |
| Preview | Chromium `<video>` + H.264 proxies over `vidit-media://` |

## License

Private — all rights reserved unless otherwise noted.
