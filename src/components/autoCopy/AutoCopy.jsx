import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import CheckBox from "../checkbox/checkbox";

const runtimeApiBase =
    typeof window !== "undefined" && window.electronApp?.apiBase ? window.electronApp.apiBase : "";
const API_BASE = (runtimeApiBase || import.meta.env.VITE_DOWNLOAD_API_BASE || "").replace(/\/$/, "");
const TRANSCRIPT_LANG_OPTIONS = [
    { value: "auto", label: "Tự động (Việt -> Anh)" },
    { value: "vi", label: "Chỉ ưu tiên tiếng Việt" },
    { value: "en", label: "Chỉ ưu tiên tiếng Anh" },
];

async function getTranscriptWithFallback(videoId, preferredLang = "auto") {
    const params = new URLSearchParams({ v: String(videoId) });
    if (preferredLang && preferredLang !== "auto") {
        params.set("lang", preferredLang);
    }
    const query = params.toString();
    const urls = [
        `/api/transcript?${query}`,
        API_BASE ? `${API_BASE}/api/transcript?${query}` : "",
    ].filter(Boolean);
    let lastMessage = "";

    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (!response.ok) continue;
            const data = await response.json();
            if (data?.transcript) {
                return {
                    transcript: data.transcript,
                    message: "",
                    language: data.language || "",
                    source: data.source || "",
                };
            }
            if (data?.message) {
                lastMessage = data.message;
            }
        } catch {
            // Try next endpoint
        }
    }
    return {
        transcript: "",
        message: lastMessage || "Không thể lấy bản chép lời cho video này.",
        language: "",
        source: "",
    };
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
    const [transcriptLang, setTranscriptLang] = useState(() => localStorage.getItem("transcriptLang") || "auto");
    const [transcriptHint, setTranscriptHint] = useState("");
    const [transcriptMeta, setTranscriptMeta] = useState({ language: "", source: "" });

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

    useEffect(() => {
        localStorage.setItem("transcriptLang", transcriptLang);
    }, [transcriptLang]);

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
            transcriptLang,
            transcriptHint,
            transcriptMeta,
        });
        setTitle("");
        setContent("");
        setCombined("");
        setCopyNoDescription("");
        setAutoCopy(true);
        setYoutubeUrl("");
        setThumbnailUrl("");
        setChannelName("");
        setTranscriptHint("");
        setTranscriptMeta({ language: "", source: "" });
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
            setTranscriptLang(lastState.transcriptLang || "auto");
            setTranscriptHint(lastState.transcriptHint || "");
            setTranscriptMeta(lastState.transcriptMeta || { language: "", source: "" });
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
            const transcriptPromise = getTranscriptWithFallback(id, transcriptLang);
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
            const transcriptData = transcriptRes.status === "fulfilled"
                ? transcriptRes.value
                : { transcript: "", message: "Không thể kết nối API bản chép lời.", language: "", source: "" };
            const transcriptText = transcriptData.transcript || "";

            const nextContent = transcriptText.trim() || [nextChannel ? `Kênh: ${nextChannel}` : "", `Link: ${watchUrl}`]
                .filter(Boolean)
                .join("\n");

            if (nextTitle) setTitle(nextTitle);
            setContent(nextContent);
            setChannelName(nextChannel);
            setThumbnailUrl(nextThumb);
            setYoutubeUrl(watchUrl);
            setTranscriptMeta({ language: transcriptData.language || "", source: transcriptData.source || "" });
            if (transcriptText.trim()) {
                setTranscriptHint("Đã lấy bản chép lời thành công.");
                toast.success("Đã tự điền thông tin + bản chép lời");
            } else {
                setTranscriptHint(transcriptData.message || "Không tìm thấy bản chép lời cho video này.");
                toast.warning(transcriptData.message || "Không tìm thấy bản chép lời, đã điền thông tin cơ bản.");
            }
        } catch {
            setTranscriptHint("Không lấy được thông tin từ YouTube hoặc API bản chép lời.");
            setTranscriptMeta({ language: "", source: "" });
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

    const handleCopyThumbnail = async () => {
        if (!thumbnailUrl) {
            toast.warning("Chưa có ảnh thumbnail để copy");
            return;
        }
        const toPngBlob = async (blob) =>
            new Promise((resolve, reject) => {
                const objectUrl = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => {
                    try {
                        const canvas = document.createElement("canvas");
                        canvas.width = img.naturalWidth || img.width;
                        canvas.height = img.naturalHeight || img.height;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) {
                            URL.revokeObjectURL(objectUrl);
                            reject(new Error("Không tạo được canvas"));
                            return;
                        }
                        ctx.drawImage(img, 0, 0);
                        canvas.toBlob((pngBlob) => {
                            URL.revokeObjectURL(objectUrl);
                            if (!pngBlob) {
                                reject(new Error("Không chuyển được ảnh PNG"));
                                return;
                            }
                            resolve(pngBlob);
                        }, "image/png");
                    } catch (err) {
                        URL.revokeObjectURL(objectUrl);
                        reject(err);
                    }
                };
                img.onerror = () => {
                    URL.revokeObjectURL(objectUrl);
                    reject(new Error("Ảnh không tải được"));
                };
                img.src = objectUrl;
            });

        if (window.electronApp?.copyImageFromDataUrl) {
            try {
                const dataUrl = await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => {
                        try {
                            const canvas = document.createElement("canvas");
                            canvas.width = img.naturalWidth || img.width;
                            canvas.height = img.naturalHeight || img.height;
                            const ctx = canvas.getContext("2d");
                            if (!ctx) {
                                reject(new Error("Không tạo được canvas"));
                                return;
                            }
                            ctx.drawImage(img, 0, 0);
                            resolve(canvas.toDataURL("image/png"));
                        } catch (err) {
                            reject(err);
                        }
                    };
                    img.onerror = () => reject(new Error("Ảnh không tải được"));
                    img.src = thumbnailUrl;
                });
                const copied = await window.electronApp.copyImageFromDataUrl(dataUrl);
                if (copied?.ok) {
                    toast.success("Đã copy ảnh thumbnail");
                    return;
                }
            } catch {
                // fallback below
            }
        }
        if (window.electronApp?.copyImageFromUrl) {
            try {
                const copied = await window.electronApp.copyImageFromUrl(thumbnailUrl);
                if (copied?.ok) {
                    toast.success("Đã copy ảnh thumbnail");
                    return;
                }
            } catch {
                // fallback below
            }
        }
        try {
            const proxyPaths = [
                `/api/thumbnail?url=${encodeURIComponent(thumbnailUrl)}`,
                API_BASE ? `${API_BASE}/api/thumbnail?url=${encodeURIComponent(thumbnailUrl)}` : "",
            ].filter(Boolean);
            let blob = null;
            for (const url of proxyPaths) {
                try {
                    const response = await fetch(url);
                    if (!response.ok) continue;
                    blob = await response.blob();
                    if (blob && blob.size > 0) break;
                } catch {
                    // try next endpoint
                }
            }
            if (!blob || blob.size === 0) {
                throw new Error("Không tải được ảnh qua proxy");
            }
            if (navigator.clipboard?.write && window.ClipboardItem) {
                const pngBlob = blob.type === "image/png" ? blob : await toPngBlob(blob);
                await navigator.clipboard.write([
                    new ClipboardItem({
                        "image/png": pngBlob,
                    }),
                ]);
                toast.success("Đã copy ảnh thumbnail");
                return;
            }
            if (window.electronApp?.copyText) {
                await window.electronApp.copyText(thumbnailUrl);
            } else {
                await navigator.clipboard.writeText(thumbnailUrl);
            }
            toast.info("Máy không hỗ trợ copy ảnh trực tiếp, đã copy link ảnh");
        } catch {
            try {
                if (window.electronApp?.copyText) {
                    await window.electronApp.copyText(thumbnailUrl);
                } else {
                    await navigator.clipboard.writeText(thumbnailUrl);
                }
                toast.info("Trình duyệt không cho ghi ảnh vào clipboard, đã copy link ảnh");
            } catch {
                toast.error("Không copy được ảnh. Hãy dùng Chrome/Edge trên HTTPS.");
            }
        }
    };

    return (
        <>
            <div className={`youtube-auto-section ${loadingYoutube ? "is-loading" : ""}`} aria-busy={loadingYoutube}>
                <h3 className="title">🔗 Link YouTube</h3>
                <div className="youtube-options-row">
                    <label htmlFor="transcriptLang" className="youtube-options-label">Ưu tiên bản chép lời:</label>
                    <select
                        id="transcriptLang"
                        className="youtube-options-select"
                        value={transcriptLang}
                        onChange={(e) => setTranscriptLang(e.target.value)}
                        disabled={loadingYoutube}
                    >
                        {TRANSCRIPT_LANG_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
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
                {!loadingYoutube && transcriptHint && (
                    <div className={`youtube-transcript-note ${transcriptMeta.language ? "is-ok" : "is-warn"}`}>
                        <small>{transcriptHint}</small>
                        {(transcriptMeta.language || transcriptMeta.source) && (
                            <small>
                                Ngôn ngữ: {transcriptMeta.language || "N/A"} · Nguồn: {transcriptMeta.source || "N/A"}
                            </small>
                        )}
                    </div>
                )}
                {!!thumbnailUrl && (
                    <div className="youtube-preview-row">
                        <img src={thumbnailUrl} alt="thumbnail" className="youtube-preview-thumb" />
                        <div className="youtube-preview-meta">
                            <strong>{title || "Đã nhận thông tin video"}</strong>
                            {channelName ? <small>Kênh: {channelName}</small> : null}
                            <small>Link: {youtubeUrl}</small>
                            <div className="youtube-preview-actions">
                                <button className="btn-copy" onClick={handleCopyThumbnail}>
                                    🖼️ Copy ảnh thumbnail
                                </button>
                            </div>
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
