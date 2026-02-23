export default async function handler(req, res) {
    const { v: videoId, format_id } = req.query;

    if (!videoId || !format_id) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    try {
        const isAudio = format_id === 'audio';

        const cobaltRes = await fetch('https://api.cobalt.tools/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                url: `https://www.youtube.com/watch?v=${videoId}`,
                videoQuality: isAudio ? '720' : format_id,
                downloadMode: isAudio ? 'audio' : 'auto',
                filenameStyle: 'pretty',
            }),
        });

        const data = await cobaltRes.json();

        if (data.status === 'error') {
            return res.status(500).json({ error: data.error?.code || 'Download failed' });
        }

        const downloadUrl = data.url;
        if (!downloadUrl) {
            return res.status(500).json({ error: 'Không lấy được link tải' });
        }

        res.redirect(302, downloadUrl);
    } catch (err) {
        console.error('download error:', err);
        res.status(500).json({ error: 'Download failed' });
    }
}

export const config = {
    maxDuration: 30,
};
