import { useState } from "react";
import axios from "axios";
import { MdDownload, MdClose, MdLink, MdContentPaste } from "react-icons/md";
import './DownloadVideo.css';

function extractVideoId(input) {
    if (!input) return null;
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const p of patterns) {
        const m = input.match(p);
        if (m) return m[1];
    }
    return null;
}

const DownloadVideo = () => {
    const [url, setUrl] = useState("");
    const [videoId, setVideoId] = useState(null);
    const [videoInfo, setVideoInfo] = useState(null);
    const [formats, setFormats] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [downloading, setDownloading] = useState(null);

    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            setUrl(text);
        } catch { /* clipboard access denied */ }
    };

    const handleFetch = async () => {
        const id = extractVideoId(url.trim());
        if (!id) {
            setError("Link không hợp lệ. Hãy dán link YouTube (vd: https://youtube.com/watch?v=...)");
            return;
        }
        setVideoId(id);
        setError(null);
        setLoading(true);
        setFormats([]);
        setVideoInfo(null);
        try {
            const res = await axios.get(`/api/download-info?v=${id}`, { timeout: 30000 });
            setFormats(res.data.formats || []);
            setVideoInfo(res.data.info || null);
            if (!res.data.formats?.length) {
                setError(res.data.message || "Không tìm thấy định dạng tải về");
            }
        } catch (err) {
            const apiError = err?.response?.data?.error || err?.response?.data?.message;
            setError(apiError || "Không thể lấy thông tin video. Hãy kiểm tra lại link.");
        } finally {
            setLoading(false);
        }
    };

    const startDownload = (fmt) => {
        if (!videoId) return;
        setDownloading(fmt.format_id);
        const title = encodeURIComponent(videoInfo?.title || "video");
        const ext = fmt.ext || "mp4";
        const fileName = (videoInfo?.title || "video").replace(/[<>:"/\\|?*]/g, "").substring(0, 80) + "." + ext;
        const a = document.createElement("a");
        a.href = `/api/download?v=${videoId}&format_id=${fmt.format_id}&title=${title}&ext=${ext}`;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => setDownloading(null), 3000);
    };

    const reset = () => {
        setUrl("");
        setVideoId(null);
        setVideoInfo(null);
        setFormats([]);
        setError(null);
        setDownloading(null);
    };

    const getBadgeClass = (fmt) => {
        if (fmt.hasVideo && fmt.hasAudio) return "dl-badge dl-badge-both";
        if (fmt.hasVideo) return "dl-badge dl-badge-video";
        return "dl-badge dl-badge-audio";
    };

    const getBadgeLabel = (fmt) => {
        if (fmt.hasVideo && fmt.hasAudio) return "Video + Audio";
        if (fmt.hasVideo) return "Video";
        return "Audio";
    };

    return (
        <div className="dl-page">
            <h1 className="dl-title">Tải video YouTube</h1>
            <p className="dl-subtitle">Dán link video YouTube vào ô bên dưới để tải về máy</p>

            <div className="dl-card">
                <div className="dl-input-row">
                    <div className="dl-input-wrap">
                        <MdLink className="dl-input-icon" />
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => { setUrl(e.target.value); setError(null); }}
                            onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                            placeholder="https://youtube.com/watch?v=..."
                            className="dl-input"
                        />
                        {url && (
                            <button
                                onClick={() => { setUrl(""); setError(null); }}
                                className="dl-clear-btn"
                            >
                                <MdClose />
                            </button>
                        )}
                    </div>
                    <button onClick={handlePaste} className="dl-paste-btn" title="Dán từ clipboard">
                        <MdContentPaste />
                    </button>
                </div>

                <button
                    onClick={handleFetch}
                    disabled={!url.trim() || loading}
                    className="dl-fetch-btn"
                >
                    {loading ? (
                        <>
                            <span className="dl-spinner" />
                            Đang lấy thông tin...
                        </>
                    ) : (
                        <>
                            <MdDownload className="dl-fetch-icon" />
                            Lấy link tải
                        </>
                    )}
                </button>

                {error && (
                    <div className="dl-error">
                        <p>{error}</p>
                    </div>
                )}
            </div>

            {videoInfo && (
                <div className="dl-card dl-video-info">
                    <img src={videoInfo.thumbnail} alt="" className="dl-thumb" />
                    <div className="dl-video-meta">
                        <h3 className="dl-video-title">{videoInfo.title}</h3>
                        <p className="dl-video-channel">{videoInfo.channel}</p>
                        {videoInfo.duration && (
                            <p className="dl-video-duration">{videoInfo.duration}</p>
                        )}
                    </div>
                </div>
            )}

            {formats.length > 0 && (
                <div className="dl-card dl-formats-card">
                    <div className="dl-formats-header">
                        <h2>Chọn chất lượng</h2>
                    </div>
                    <div className="dl-formats-list">
                        {formats.map((fmt) => (
                            <button
                                key={fmt.format_id}
                                onClick={() => startDownload(fmt)}
                                disabled={downloading === fmt.format_id}
                                className="dl-format-item"
                            >
                                <div className="dl-format-left">
                                    <span className={getBadgeClass(fmt)}>
                                        {getBadgeLabel(fmt)}
                                    </span>
                                    <div className="dl-format-detail">
                                        <span className="dl-format-quality">{fmt.quality}</span>
                                        <span className="dl-format-meta">
                                            {fmt.ext?.toUpperCase()} · {fmt.size}
                                        </span>
                                    </div>
                                </div>
                                <div className="dl-format-action">
                                    {downloading === fmt.format_id ? (
                                        <span className="dl-spinner dl-spinner-small" />
                                    ) : (
                                        <MdDownload className="dl-format-dl-icon" />
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                    <div className="dl-formats-footer">
                        <button onClick={reset} className="dl-reset-btn">
                            Tải video khác
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DownloadVideo;
