import { Innertube, Platform } from 'youtubei.js';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

Platform.shim.eval = async (data, env) => {
    const props = [];
    if (env.n) props.push(`n: exportedVars.nFunction("${env.n}")`);
    if (env.sig) props.push(`sig: exportedVars.sigFunction("${env.sig}")`);
    const code = `${data.output}\nreturn { ${props.join(', ')} }`;
    return new Function(code)();
};

export default async function handler(req, res) {
    const { v: videoId, format_id, title, ext } = req.query;
    if (!videoId || !format_id) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    try {
        const yt = await Innertube.create({ client_type: 'ANDROID' });
        const info = await yt.getBasicInfo(videoId);

        const allFormats = [
            ...(info.streaming_data?.formats || []),
            ...(info.streaming_data?.adaptive_formats || []),
        ];
        const fmt = allFormats.find(f => String(f.itag) === format_id);
        if (!fmt) {
            return res.status(404).json({ error: 'Format not found' });
        }

        const url = await fmt.decipher(yt.session.player);
        const dlUrl = url instanceof URL ? url.toString() : String(url);

        const upstream = await fetch(dlUrl);
        if (!upstream.ok) {
            return res.status(502).json({ error: 'Failed to fetch video stream' });
        }

        const rawName = decodeURIComponent(title || 'video')
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
            .substring(0, 80) || 'video';
        const fileExt = ext || 'mp4';
        const asciiName = rawName.replace(/[^\x20-\x7E]/g, '_') + '.' + fileExt;
        const utf8Name = encodeURIComponent(rawName + '.' + fileExt);

        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
            ...(upstream.headers.get('content-length')
                ? { 'Content-Length': upstream.headers.get('content-length') }
                : {}),
        });

        const readable = Readable.fromWeb(upstream.body);
        await pipeline(readable, res);
    } catch (err) {
        console.error('download error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed' });
        }
    }
}

export const config = { maxDuration: 60 };
