import youtubedl from 'youtube-dl-exec';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export default async function handler(req, res) {
    const { v: videoId, format_id, title, ext } = req.query;

    if (!videoId || !format_id) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    try {
        const result = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
            getUrl: true,
            format: format_id,
            noWarnings: true,
            noCheckCertificates: true,
        });

        const directUrl = (typeof result === 'string' ? result : String(result)).trim();
        if (!directUrl || !directUrl.startsWith('http')) {
            return res.status(500).json({ error: 'Could not get download URL' });
        }

        const rawName = decodeURIComponent(title || 'video')
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
            .substring(0, 80) || 'video';
        const fileExt = ext || 'mp4';
        const asciiName = rawName.replace(/[^\x20-\x7E]/g, '_') + '.' + fileExt;
        const utf8Name = encodeURIComponent(rawName + '.' + fileExt);

        const upstream = await fetch(directUrl);
        if (!upstream.ok) {
            return res.status(502).json({ error: 'Upstream download failed' });
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition',
            `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`
        );
        if (upstream.headers.get('content-length')) {
            res.setHeader('Content-Length', upstream.headers.get('content-length'));
        }

        await pipeline(Readable.fromWeb(upstream.body), res);
    } catch (err) {
        console.error('download error:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed' });
        }
    }
}

export const config = {
    maxDuration: 60,
};
