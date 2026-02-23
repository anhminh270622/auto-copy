export default async function handler(req, res) {
    const videoId = req.query.v;
    if (!videoId) {
        return res.status(400).json({ error: 'Missing video ID' });
    }

    try {
        const oembed = await fetch(
            `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`
        );
        const data = await oembed.json();

        if (data.error) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const videoInfo = {
            title: data.title || '',
            thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            channel: data.author_name || '',
            duration: '',
        };

        const formats = [
            { format_id: '1080', quality: '1080p', ext: 'mp4', hasVideo: true, hasAudio: true, size: 'N/A' },
            { format_id: '720', quality: '720p', ext: 'mp4', hasVideo: true, hasAudio: true, size: 'N/A' },
            { format_id: '480', quality: '480p', ext: 'mp4', hasVideo: true, hasAudio: true, size: 'N/A' },
            { format_id: '360', quality: '360p', ext: 'mp4', hasVideo: true, hasAudio: true, size: 'N/A' },
            { format_id: 'audio', quality: 'Audio (MP3)', ext: 'mp3', hasVideo: false, hasAudio: true, size: 'N/A' },
        ];

        res.status(200).json({ info: videoInfo, formats });
    } catch (err) {
        console.error('download-info error:', err);
        res.status(500).json({ error: 'Không thể lấy thông tin video' });
    }
}
