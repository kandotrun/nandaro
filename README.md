# Nandaro

Browser-only image compression MVP.

<iframe data-testid="embed-iframe" style="border-radius:12px" src="https://open.spotify.com/embed/track/2x7eU1kw78pVAW9MGNWhp7?utm_source=generator" width="100%" height="352" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>

## What it does

- Drag and drop multiple images
- Compress locally in the browser
- Choose output format: Auto, WebP, JPEG
- Adjust quality
- Resize by max edge
- Strip original metadata by re-encoding in canvas
- Download each file or all files as a ZIP

## Stack

- Vite
- React
- TypeScript
- JSZip

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Notes

This is the first image-only MVP.
It is intentionally client-side only, so there is no server upload step for compression.

Next likely upgrades:

- Better PNG-specific compression
- AVIF support
- Side-by-side preview diff
- Batch presets for web, SNS, and thumbnails
- Worker-based processing for large batches
