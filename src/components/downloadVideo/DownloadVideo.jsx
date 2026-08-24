import { useState } from "react";
import axios from "axios";
import { MdDownload, MdClose, MdLink, MdContentPaste } from "react-icons/md";
import './DownloadVideo.css';

const runtimeApiBase =
    typeof window !== "undefined" && window.electronApp?.apiBase
        ? window.electronApp.apiBase
        : "";
const API_BASE = (runtimeApiBase || import.meta.env.VITE_DOWNLOAD_API_BASE || "").replace(/\/$/, "");

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
            const res = await axios.get(`${API_BASE}/api/download-info?v=${id}`, { timeout: 30000 });
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
        a.href = `${API_BASE}/api/download?v=${videoId}&format_id=${fmt.format_id}&title=${title}&ext=${ext}`;
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
        if (fmt.hasVideo) return "Video Only";
        return "Audio Only";
    };

    const hasData = videoInfo || formats.length > 0;

    return (
        <div className="dl-page">
            <div className="dl-header">
                <h1 className="dl-title">Tải video YouTube</h1>
                <p className="dl-subtitle">Tải video độ phân giải cao hoặc âm thanh MP3 nhanh chóng</p>
            </div>

            {/* Input dán Link (Luôn cố định phía trên) */}
            <div className="dl-input-card">
                <div className="dl-input-row">
                    <div className="dl-input-wrap">
                        <MdLink className="dl-input-icon" />
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => { setUrl(e.target.value); setError(null); }}
                            onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                            placeholder="Dán link video YouTube vào đây (vd: https://youtube.com/watch?v=...)"
                            className="dl-input"
                            disabled={loading}
                        />
                        {url && !loading && (
                            <button
                                onClick={() => { setUrl(""); setError(null); }}
                                className="dl-clear-btn"
                            >
                                <MdClose />
                            </button>
                        )}
                    </div>
                    <button onClick={handlePaste} disabled={loading} className="dl-paste-btn" title="Dán từ clipboard">
                        <MdContentPaste />
                    </button>
                    <button
                        onClick={handleFetch}
                        disabled={!url.trim() || loading}
                        className="dl-fetch-btn"
                    >
                        {loading ? (
                            <>
                                <span className="dl-spinner" />
                                Đang quét...
                            </>
                        ) : (
                            <>
                                <MdDownload className="dl-fetch-icon" />
                                Quét link
                            </>
                        )}
                    </button>
                </div>

                {error && (
                    <div className="dl-error">
                        <p>{error}</p>
                    </div>
                )}
            </div>

            {/* Phần hiển thị nội dung bên dưới (Cuộn độc lập nếu tràn) */}
            {!hasData ? (
                <div className="dl-empty-state">
                    <svg viewBox="0 0 200 200" className="dl-empty-svg">
                        <circle cx="100" cy="100" r="70" fill="url(#circle-grad)" opacity="0.1" />
                        <g className="dl-svg-cloud">
                            <path d="M55 125 A 20 20 0 0 1 70 85 A 28 28 0 0 1 130 85 A 20 20 0 0 1 145 125 Z" fill="url(#cloud-grad)" />
                        </g>
                        <g className="dl-svg-arrow">
                            <path d="M100 90 L100 135 M88 123 L100 135 L112 123" stroke="url(#arrow-grad)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </g>
                        <defs>
                            <linearGradient id="circle-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="var(--btn-edit)" />
                                <stop offset="100%" stopColor="var(--btn-copy)" />
                            </linearGradient>
                            <linearGradient id="cloud-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#d1d5db" />
                                <stop offset="100%" stopColor="#9ca3af" />
                            </linearGradient>
                            <linearGradient id="arrow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="var(--btn-edit)" />
                                <stop offset="100%" stopColor="#3ea6ff" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <div className="dl-empty-title">Chờ dán link video</div>
                    <div className="dl-empty-desc">
                        Hãy dán đường dẫn video YouTube hợp lệ vào thanh tìm kiếm phía trên để lấy danh sách chất lượng video và âm thanh.
                    </div>
                </div>
            ) : (
                <div className="dl-main-row">
                    {/* Cột trái: Thông tin Video */}
                    {videoInfo && (
                        <div className="dl-col-left">
                            <div className="dl-preview-wrap">
                                <img src={videoInfo.thumbnail} alt="" className="dl-thumb" />
                                {videoInfo.duration && (
                                    <span className="dl-duration-tag">{videoInfo.duration}</span>
                                )}
                            </div>
                            <div className="dl-video-meta">
                                <h3 className="dl-video-title" title={videoInfo.title}>{videoInfo.title}</h3>
                                <p className="dl-video-channel">📺 Kênh: {videoInfo.channel}</p>
                            </div>
                            <a
                                href={`https://www.youtube.com/watch?v=${videoId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="dl-yt-btn"
                            >
                                🌐 Xem trên YouTube
                            </a>
                        </div>
                    )}

                    {/* Cột phải: Chọn chất lượng */}
                    {formats.length > 0 && (
                        <div className="dl-col-right">
                            <div className="dl-formats-header">
                                <h2>Lựa chọn chất lượng tải về</h2>
                            </div>
                            <div className="dl-formats-scroll">
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
                                                    Đuôi {fmt.ext?.toUpperCase()} · Dung lượng: {fmt.size}
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
                                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                                    Tìm thấy {formats.length} định dạng tải
                                </span>
                                <button onClick={reset} className="dl-reset-btn">
                                    🔁 Tải video khác
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DownloadVideo;
