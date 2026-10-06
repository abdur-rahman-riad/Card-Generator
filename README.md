# Gen-Z Gamers – Player Card Generator

Static web app (no build step, no backend). Players upload a photo, enter Name / Device / eFootball ID, and download a Winter Arc Tournament player card. Photo editor (drag, zoom, nudge) and optional on-device background change are included.

## Structure
```
index.html            page
css/style.css         styles
js/app.js             card renderer, photo editor, background removal
assets/template.jpg   card artwork (1122x1402) – replace to re-skin
assets/logo.png       club logo + icons
models/rvm.json|bin   background-matting model (runs in the browser)
vendor/tf.min.js      TensorFlow.js 4.22.0 (self-hosted)
manifest.webmanifest  installable-app metadata
```

## Run locally
It must be served over http (browsers block canvas export and model loading from `file://`):
```
python3 -m http.server 8080      # then open http://localhost:8080
# or: npx serve .
```

## Deploy (any static host)
- **Netlify:** drag the folder onto app.netlify.com/drop (netlify.toml included).
- **Vercel:** `npx vercel --prod` in this folder (vercel.json included).
- **Cloudflare Pages / GitHub Pages / S3 / any web server:** upload the folder contents as-is. HTTPS is recommended (needed for sharing on phones).

## Customising
Text positions are in `draw()` in `js/app.js` (coordinates are on the 1122x1402 template). Colours are CSS variables at the top of `css/style.css`.

## Notes
- All processing happens on the user's device; photos are never uploaded.
- The first background change downloads ~3.7 MB of model data once (cached afterwards).
- Fonts (Rajdhani, Inter) load from Google Fonts with system fallbacks; self-host them if you need fully offline use.
