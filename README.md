# Auto Copy

React + Vite app with YouTube tools and optional Electron desktop packaging.

## Run web app

```bash
npm install
npm run dev
```

## Run desktop app in development

The Electron app starts the download API internally at `http://127.0.0.1:8787`.

```bash
npm install
npm run electron:dev
```

## Build Windows app

Portable folder:

```bash
npm run electron:pack
```

Output:

- `dist/win-unpacked/Auto Copy.exe`

Installer:

```bash
npm run electron:dist
```

## Environment variables

- `YT_COOKIE`: optional YouTube `cookies.txt` content for better access to restricted videos.
- `VITE_DOWNLOAD_API_BASE`: optional external API base in web mode.
