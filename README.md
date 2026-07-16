# Vidit

Desktop non-linear video editor for Windows, built with **Electron**, **React**, **Vite**, **Zustand**, and native **FFmpeg**.

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
npm run build       # full installer
```

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
