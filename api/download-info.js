import youtubedl from 'youtube-dl-exec';

function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return 'N/A';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

export default async function handler(req, res) {
    const videoId = req.query.v;
    if (!videoId) {
        return res.status(400).json({ error: 'Missing video ID' });
    }

    try {
        const info = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
            dumpSingleJson: true,
            noWarnings: true,
            noCheckCertificates: true,
            preferFreeFormats: true,
        });

        const videoInfo = {
            title: info.title || '',
            thumbnail: info.thumbnail || '',
            channel: info.channel || info.uploader || '',
            duration: formatDuration(info.duration || 0),
        };

        const seen = new Set();
        const formats = (info.formats || [])
            .filter(f => {
                if (!f.format_id || seen.has(f.format_id)) return false;
                seen.add(f.format_id);
                const hasVideo = f.vcodec && f.vcodec !== 'none';
                const hasAudio = f.acodec && f.acodec !== 'none';
                return hasVideo || hasAudio;
            })
            .map(f => {
                const hasVideo = f.vcodec && f.vcodec !== 'none';
                const hasAudio = f.acodec && f.acodec !== 'none';
                return {
                    format_id: f.format_id,
                    quality: f.format_note || f.resolution || 'Unknown',
                    ext: f.ext || 'mp4',
                    hasVideo,
                    hasAudio,
                    size: formatBytes(f.filesize || f.filesize_approx || 0),
                };
            })
            .sort((a, b) => {
                if (a.hasVideo && a.hasAudio && !(b.hasVideo && b.hasAudio)) return -1;
                if (!(a.hasVideo && a.hasAudio) && b.hasVideo && b.hasAudio) return 1;
                if (a.hasVideo && !b.hasVideo) return -1;
                if (!a.hasVideo && b.hasVideo) return 1;
                return 0;
            });

        res.status(200).json({ info: videoInfo, formats });
    } catch (err) {
        console.error('download-info error:', err.message);
        res.status(500).json({ error: 'Không thể lấy thông tin video' });
    }
}

export const config = {
    maxDuration: 30,
};
