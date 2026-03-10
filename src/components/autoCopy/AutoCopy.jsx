import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import CheckBox from "../checkbox/checkbox";

const runtimeApiBase =
    typeof window !== "undefined" && window.electronApp?.apiBase ? window.electronApp.apiBase : "";
const API_BASE = (runtimeApiBase || import.meta.env.VITE_DOWNLOAD_API_BASE || "").replace(/\/$/, "");

async function getTranscriptWithFallback(videoId) {
    const query = `v=${encodeURIComponent(videoId)}`;
    const urls = [
        `/api/transcript?${query}`,
        API_BASE ? `${API_BASE}/api/transcript?${query}` : "",
    ].filter(Boolean);

    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (!response.ok) continue;
            const data = await response.json();
            if (data?.transcript) return data.transcript;
        } catch {
            // Try next endpoint
        }
    }
    return "";
}

function extractVideoId(input) {
    if (!input) return null;
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const p of patterns) {
        const m = input.match(p);
        if (m) return m[1];
    }
    return null;
}

export default function AutoCopy() {
    const getSavedData = () => {
        const saved = JSON.parse(localStorage.getItem("myAppData") || "{}");
        return {
            title: saved.title || "",
            content: saved.content || "",
            request: saved.request || "Viết bài viết",
            description: saved.description || "không viết liền không tách dòng",
            combined: saved.combined || "",
            copyNoDescription: saved.copyNoDescription || ""
        };
    };

    const [editDescription, setEditDescription] = useState(false);
    const [editRequest, setEditRequest] = useState(false);
    const [autoCopy, setAutoCopy] = useState(true);
    const [lastState, setLastState] = useState(null);
    const [showUndo, setShowUndo] = useState(false);
    const [youtubeUrl, setYoutubeUrl] = useState("");
    const [loadingYoutube, setLoadingYoutube] = useState(false);
    const [thumbnailUrl, setThumbnailUrl] = useState("");
    const [channelName, setChannelName] = useState("");

    const savedData = getSavedData();
    const [title, setTitle] = useState(savedData.title);
    const [content, setContent] = useState(savedData.content);
    const [request, setRequest] = useState(savedData.request);
    const [description, setDescription] = useState(savedData.description);
    const [combined, setCombined] = useState(savedData.combined);
    const [copyNoDescription, setCopyNoDescription] = useState(savedData.copyNoDescription);

    useEffect(() => {
        if (title) {
            const processedContent = content ? content.replace(/(?!^)(\d{1,2}:\d{2})/g, "\n$1") : "";
            const text = `${request} "${title}" ${description} \n ${processedContent}`;
            const textNoDescription = `${request} "${title}"`;
            setCombined(text);
            setCopyNoDescription(textNoDescription);
            if (autoCopy) {
                navigator.clipboard.writeText(text);
            }
        } else {
            setCombined("");
            setCopyNoDescription("");
        }
    }, [request, title, content, description, autoCopy]);

    useEffect(() => {
        localStorage.setItem("myAppData", JSON.stringify({ title, content, request, description, copyNoDescription }));
    }, [title, content, request, description, copyNoDescription]);

    const onReset = () => {
        setLastState({
            title,
            content,
            request,
            description,
            autoCopy,
            combined,
            copyNoDescription,
            youtubeUrl,
            thumbnailUrl,
            channelName,
        });
        setTitle("");
        setContent("");
        setCombined("");
        setCopyNoDescription("");
        setAutoCopy(true);
        setYoutubeUrl("");
        setThumbnailUrl("");
        setChannelName("");
        setShowUndo(true);
        toast.info("Đã nhập lại. Bạn có thể hoàn tác !");
    };

    const onUndo = () => {
        if (lastState) {
            setTitle(lastState.title);
            setContent(lastState.content);
            setRequest(lastState.request);
            setDescription(lastState.description);
            setCopyNoDescription(lastState.copyNoDescription);
            setAutoCopy(lastState.autoCopy);
            setCombined(lastState.combined);
            setYoutubeUrl(lastState.youtubeUrl || "");
            setThumbnailUrl(lastState.thumbnailUrl || "");
            setChannelName(lastState.channelName || "");
            setShowUndo(false);
            toast.success("Đã hoàn tác thành công !");
        }
    };

    const handleFillFromYoutube = async (rawUrl) => {
        if (loadingYoutube) return;
        const inputUrl = (rawUrl ?? youtubeUrl).trim();
        const id = extractVideoId(inputUrl);
        if (!id) {
            toast.error("Link YouTube không hợp lệ");
            return;
        }

        setLoadingYoutube(true);
        try {
            const watchUrl = `https://www.youtube.com/watch?v=${id}`;
            const transcriptPromise = getTranscriptWithFallback(id);
            const [oembedRes, transcriptRes] = await Promise.allSettled([
                fetch(`https://noembed.com/embed?url=${encodeURIComponent(watchUrl)}`),
                transcriptPromise,
            ]);
            const data =
                oembedRes.status === "fulfilled" && oembedRes.value
                    ? await oembedRes.value.json()
                    : {};
            if (data?.error) {
                throw new Error(data.error);
            }

            const nextTitle = data?.title || "";
            const nextChannel = data?.author_name || "";
            const nextThumb = data?.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
            const transcriptText = transcriptRes.status === "fulfilled" ? transcriptRes.value || "" : "";

            const nextContent = transcriptText.trim() || [nextChannel ? `Kênh: ${nextChannel}` : "", `Link: ${watchUrl}`]
                .filter(Boolean)
                .join("\n");

            if (nextTitle) setTitle(nextTitle);
            setContent(nextContent);
            setChannelName(nextChannel);
            setThumbnailUrl(nextThumb);
            setYoutubeUrl(watchUrl);
            toast.success("Đã tự điền thông tin từ link YouTube");
        } catch {
            toast.error("Không lấy được thông tin từ YouTube");
        } finally {
            setLoadingYoutube(false);
        }
    };

    const handleYoutubePaste = (e) => {
        if (loadingYoutube) return;
        const pastedText = (e.clipboardData || window.clipboardData).getData("text");
        if (!pastedText) return;
        setYoutubeUrl(pastedText);
        setTimeout(() => {
            handleFillFromYoutube(pastedText);
        }, 0);
    };

    return (
        <>
            <div className={`youtube-auto-section ${loadingYoutube ? "is-loading" : ""}`} aria-busy={loadingYoutube}>
                <h3 className="title">🔗 Link YouTube</h3>
                <input
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    onPaste={handleYoutubePaste}
                    disabled={loadingYoutube}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            handleFillFromYoutube(e.currentTarget.value);
                        }
                    }}
                    placeholder="Dán link YouTube vào đây (paste là tự điền ngay)"
                />
                {loadingYoutube && (
                    <div className="youtube-loading-row">
                        <span className="youtube-spinner" />
                        <small className="youtube-helper">Đang gọi API và lấy thông tin video...</small>
                    </div>
                )}
                {!!thumbnailUrl && (
                    <div className="youtube-preview-row">
                        <img src={thumbnailUrl} alt="thumbnail" className="youtube-preview-thumb" />
                        <div className="youtube-preview-meta">
                            <strong>{title || "Đã nhận thông tin video"}</strong>
                            {channelName ? <small>Kênh: {channelName}</small> : null}
                            <small>Link: {youtubeUrl}</small>
                        </div>
                    </div>
                )}
            </div>
            <div className="app-main-row">
                <div className="left">
                    <h3 className="title">✍️ Nhập thông tin:</h3>
                    <div style={{ marginBottom: 10 }}>
                        <strong>Viết yêu cầu</strong>
                        {editRequest ? (
                            <div className="flex-between">
                                <textarea
                                    rows={2}
                                    value={request}
                                    onChange={(e) => setRequest(e.target.value)}
                                />
                                <button className="btn-copy" onClick={() => {
                                    setEditRequest(false);
                                    toast.success("Chỉnh sửa yêu cầu thành công");
                                }}>
                                    💾 Lưu
                                </button>
                            </div>
                        ) : (
                            <div className="flex-between">
                                <p>{request}</p>
                                <button className="btn-edit" onClick={() => setEditRequest(true)}>✏️ Edit</button>
                            </div>
                        )}
                    </div>
                    <label>
                        <strong>Tiêu đề bài viết:</strong>
                        <textarea
                            rows={3}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            style={{ minHeight: "60px" }}
                            placeholder="Vui lòng nhập tiêu đề bài viết"
                        />
                    </label>
                    <label>
                        <strong>Nội dung:</strong>
                        <textarea
                            rows={5}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            style={{ minHeight: "100px" }}
                            placeholder="Vui lòng nhập nội dung bài viết"
                        />
                    </label>
                    <div style={{ marginBottom: 10 }}>
                        <strong>Mô tả yêu cầu</strong>
                        {editDescription ? (
                            <div className="flex-between">
                                <textarea
                                    rows={2}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                                <button className="btn-copy" onClick={() => {
                                    setEditDescription(false);
                                    toast.success("Chỉnh sửa mô tả thành công");
                                }}>
                                    💾 Lưu
                                </button>
                            </div>
                        ) : (
                            <div className="flex-between">
                                <p>{description}</p>
                                <button className="btn-edit" onClick={() => setEditDescription(true)}>✏️ Edit</button>
                            </div>
                        )}
                    </div>
                    <div style={{ marginBottom: 10 }}>
                        <label className="checkbox">
                            <CheckBox
                                checked={autoCopy}
                                onChange={() => {
                                    setAutoCopy(!autoCopy);
                                    if (autoCopy) {
                                        toast.warning("Đã tắt tự động sao chép");
                                    } else {
                                        toast.success("Đã bật tự động sao chép");
                                    }
                                }}
                            />
                            Tự động sao chép khi nhập đủ thông tin
                        </label>
                    </div>
                </div>
                <div className="right">
                    <h3 className="title">📝 Kết quả gộp:</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div><strong>Có đẩy đủ:</strong></div>
                        <div className="result">
                            <button
                                className={`copy-icon-btn ${combined ? 'active' : ''}`}
                                onClick={() => {
                                    navigator.clipboard.writeText(combined);
                                    toast.success("Copy thành công!");
                                }}
                                title="Copy nội dung"
                            >
                                📄
                            </button>
                            {combined || "📭 Chưa có nội dung nào được tạo. Vui lòng nhập thông tin bên trái."}
                        </div>
                        <div><strong>Không nội dung & mô tả:</strong></div>
                        <div className="result">
                            <button
                                className={`copy-icon-btn ${copyNoDescription ? 'active' : ''}`}
                                onClick={() => {
                                    navigator.clipboard.writeText(copyNoDescription);
                                    toast.success("Copy thành công!");
                                }}
                                title="Copy nội dung"
                            >
                                📄
                            </button>
                            {copyNoDescription || "📭 Chưa có nội dung nào được tạo. Vui lòng nhập thông tin bên trái."}
                        </div>
                    </div>
                </div>
            </div>
            <div style={{ marginTop: 10, marginBottom: 10, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                    disabled={!(title || content)}
                    className={(title || content) ? "btn-delete" : "btn-disable"}
                    onClick={onReset}
                >
                    🔁 Nhập lại
                </button>
                {!autoCopy && (title && content) && (
                    <button
                        className="btn-copy"
                        onClick={() => {
                            navigator.clipboard.writeText(combined);
                            toast.success("Copy thành công !");
                        }}
                    >
                        📋 Copy kết quả
                    </button>
                )}
                {showUndo && (
                    <button className="btn-edit" onClick={onUndo}>
                        ⬅️ Hoàn tác
                    </button>
                )}
            </div>
        </>
    );
}
