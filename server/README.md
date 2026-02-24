## Download API Server

Standalone backend for YouTube download endpoints:

- `GET /health`
- `GET /api/download-info?v=<videoId>`
- `GET /api/download?v=<videoId>&format_id=<id>&title=<encoded>&ext=<mp4|m4a|...>`

### Run locally

1. Install deps in project root:
   - `npm install`
2. Start API:
   - `npm run api:dev`
3. Start frontend in another terminal:
   - `npm run dev`
4. Set frontend env:
   - `VITE_DOWNLOAD_API_BASE=http://localhost:8787`

### Environment variables

- `PORT` (default: `8787`)
- `YT_COOKIE` (optional but recommended for restricted videos)

`YT_COOKIE` is the full contents of your `cookies.txt` exported from YouTube login.
