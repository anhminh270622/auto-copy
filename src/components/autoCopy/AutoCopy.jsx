import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import CheckBox from "../checkbox/checkbox";
import "./AutoCopy.css";

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
    let lastMessage = "";

    // Electron (đặc biệt bản zip Windows): gọi IPC main process — ổn định hơn fetch localhost
    if (typeof window !== "undefined" && window.electronApp?.getTranscript) {
        try {
            const data = await window.electronApp.getTranscript(videoId, preferredLang);
            if (data?.transcript) {
                return {
                    transcript: data.transcript,
                    message: "",
                    language: data.language || "",
                    source: data.source || "",
                };
            }
            if (data?.message) {
                lastMessage = data.detail ? `${data.message} (${data.detail})` : data.message;
            }
        } catch {
            lastMessage = "Không thể kết nối API bản chép lời (IPC).";
        }
    }

    const urls = [
        API_BASE ? `${API_BASE}/api/transcript?${query}&debug=1` : "",
        `/api/transcript?${query}`,
    ].filter(Boolean);

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

async function isImageLoadable(url) {
    return new Promise((resolve) => {
        if (!url) {
            resolve(false);
            return;
        }
        const img = new Image();
        img.onload = () => {
            const w = img.naturalWidth || 0;
            const h = img.naturalHeight || 0;
            resolve(w >= 320 && h >= 180);
        };
        img.onerror = () => resolve(false);
        img.referrerPolicy = "no-referrer";
        img.src = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
    });
}

async function resolveBestThumbnail(videoId, noembedThumb) {
    const candidates = [
        `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        noembedThumb || "",
        `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    ].filter(Boolean);

    for (const url of candidates) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await isImageLoadable(url);
        if (ok) return url;
    }
    return candidates[candidates.length - 1] || "";
}

export default function AutoCopy() {
    const [tabs, setTabs] = useState(() => {
        const savedTabs = localStorage.getItem("autoCopyTabs");
        if (savedTabs) {
            try {
                const parsed = JSON.parse(savedTabs);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                }
            } catch (e) {
                console.error(e);
            }
        }

        // Migrate from single myAppData or create default tab
        const oldSaved = JSON.parse(localStorage.getItem("myAppData") || "{}");
        const initialTab = {
            id: "tab-" + Date.now(),
            name: oldSaved.title ? (oldSaved.title.substring(0, 15) + "...") : "Tab 1",
            title: oldSaved.title || "",
            content: oldSaved.content || "",
            request: oldSaved.request || "Viết bài viết",
            description: oldSaved.description || "không viết liền không tách dòng",
            youtubeUrl: oldSaved.youtubeUrl || "",
            thumbnailUrl: oldSaved.thumbnailUrl || "",
            channelName: oldSaved.channelName || "",
            transcriptLang: localStorage.getItem("transcriptLang") || "auto",
            transcriptHint: "",
            transcriptMeta: { language: "", source: "" },
            autoCopy: true,
            showUndo: false,
            lastState: null
        };
        return [initialTab];
    });

    const [activeTabId, setActiveTabId] = useState(() => {
        const savedActiveId = localStorage.getItem("activeTabId");
        return savedActiveId || "";
    });

    const [editingTabId, setEditingTabId] = useState(null);
    const [editingName, setEditingName] = useState("");
    const [loadingTabs, setLoadingTabs] = useState({});

    const [editDescription, setEditDescription] = useState(false);
    const [editRequest, setEditRequest] = useState(false);

    // Save tabs to localStorage
    useEffect(() => {
        localStorage.setItem("autoCopyTabs", JSON.stringify(tabs));
    }, [tabs]);

    // Save activeTabId to localStorage
    useEffect(() => {
        if (activeTabId) {
            localStorage.setItem("activeTabId", activeTabId);
        }
    }, [activeTabId]);

    // Fallback activeTabId if not valid or empty
    useEffect(() => {
        if (tabs.length > 0) {
            const ids = tabs.map(t => t.id);
            if (!ids.includes(activeTabId)) {
                setActiveTabId(tabs[0].id);
            }
        } else {
            const newId = "tab-" + Date.now();
            setTabs([{
                id: newId,
                name: "Tab 1",
                title: "",
                content: "",
                request: "Viết bài viết",
                description: "không viết liền không tách dòng",
                youtubeUrl: "",
                thumbnailUrl: "",
                channelName: "",
                transcriptLang: "auto",
                transcriptHint: "",
                transcriptMeta: { language: "", source: "" },
                autoCopy: true,
                showUndo: false,
                lastState: null
            }]);
            setActiveTabId(newId);
        }
    }, [tabs, activeTabId]);

    // Reset inline edit states when changing tab
    useEffect(() => {
        setEditDescription(false);
        setEditRequest(false);
    }, [activeTabId]);

    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0] || {};
    const loadingYoutube = !!loadingTabs[activeTabId];

    // Compute dynamic combined content
    const processedContent = activeTab.content ? activeTab.content.replace(/(?!^)(\d{1,2}:\d{2})/g, "\n$1") : "";
    const combined = activeTab.title ? `${activeTab.request || "Viết bài viết"} "${activeTab.title}" ${activeTab.description || "không viết liền không tách dòng"} \n ${processedContent}` : "";
    const copyNoDescription = activeTab.title ? `${activeTab.request || "Viết bài viết"} "${activeTab.title}"` : "";

    // Auto copy text on change
    useEffect(() => {
        if (!activeTab || !activeTab.id) return;
        const { title, autoCopy } = activeTab;
        if (tabs.length < 2 && title && autoCopy) {
            const processed = activeTab.content ? activeTab.content.replace(/(?!^)(\d{1,2}:\d{2})/g, "\n$1") : "";
            const text = `${activeTab.request || "Viết bài viết"} "${title}" ${activeTab.description || "không viết liền không tách dòng"} \n ${processed}`;
            navigator.clipboard.writeText(text);
        }
    }, [
        activeTabId,
        activeTab?.title,
        activeTab?.content,
        activeTab?.request,
        activeTab?.description,
        activeTab?.autoCopy,
        tabs.length
    ]);

    const updateActiveTab = (updates) => {
        setTabs(prevTabs => prevTabs.map(t => {
            if (t.id === activeTabId) {
                return { ...t, ...updates };
            }
            return t;
        }));
    };

    const createNewTab = () => {
        const newId = "tab-" + Date.now();
        // find a unique number for naming
        let newTabNum = 1;
        while (tabs.some(t => t.name === `Tab ${newTabNum}`)) {
            newTabNum++;
        }
        const newTab = {
            id: newId,
            name: `Tab ${newTabNum}`,
            title: "",
            content: "",
            request: "Viết bài viết",
            description: "không viết liền không tách dòng",
            youtubeUrl: "",
            thumbnailUrl: "",
            channelName: "",
            transcriptLang: "auto",
            transcriptHint: "",
            transcriptMeta: { language: "", source: "" },
            autoCopy: true,
            showUndo: false,
            lastState: null
        };
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newId);
        toast.success(`Đã thêm Tab ${newTabNum}`);
    };

    const closeTab = (tabId, e) => {
        e.stopPropagation();
        if (tabs.length === 1) {
            toast.warning("Không thể xóa tab duy nhất");
            return;
        }

        const tabIndex = tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return;

        const newTabs = tabs.filter(t => t.id !== tabId);
        setTabs(newTabs);

        if (activeTabId === tabId) {
            const nextActiveIndex = Math.max(0, tabIndex - 1);
            setActiveTabId(newTabs[nextActiveIndex].id);
        }

        if (loadingTabs[tabId]) {
            setLoadingTabs(prev => {
                const next = { ...prev };
                delete next[tabId];
                return next;
            });
        }
        toast.info("Đã đóng tab");
    };

    const renameTab = (tabId, newName) => {
        if (!newName.trim()) return;
        setTabs(prev => prev.map(t => {
            if (t.id === tabId) {
                return { ...t, name: newName.trim() };
            }
            return t;
        }));
    };

    const handleTabDoubleClick = (tab) => {
        setEditingTabId(tab.id);
        setEditingName(tab.name);
    };

    const onReset = () => {
        updateActiveTab({
            lastState: {
                title: activeTab.title || "",
                content: activeTab.content || "",
                request: activeTab.request || "Viết bài viết",
                description: activeTab.description || "không viết liền không tách dòng",
                autoCopy: activeTab.autoCopy !== false,
                youtubeUrl: activeTab.youtubeUrl || "",
                thumbnailUrl: activeTab.thumbnailUrl || "",
                channelName: activeTab.channelName || "",
                transcriptLang: activeTab.transcriptLang || "auto",
                transcriptHint: activeTab.transcriptHint || "",
                transcriptMeta: activeTab.transcriptMeta || { language: "", source: "" },
            },
            showUndo: true,
            title: "",
            content: "",
            youtubeUrl: "",
            thumbnailUrl: "",
            channelName: "",
            transcriptHint: "",
            transcriptMeta: { language: "", source: "" },
            autoCopy: true,
        });
        toast.info("Đã nhập lại. Bạn có thể hoàn tác !");
    };

    const onUndo = () => {
        if (activeTab && activeTab.lastState) {
            updateActiveTab({
                title: activeTab.lastState.title,
                content: activeTab.lastState.content,
                request: activeTab.lastState.request,
                description: activeTab.lastState.description,
                autoCopy: activeTab.lastState.autoCopy,
                youtubeUrl: activeTab.lastState.youtubeUrl,
                thumbnailUrl: activeTab.lastState.thumbnailUrl,
                channelName: activeTab.lastState.channelName,
                transcriptLang: activeTab.lastState.transcriptLang,
                transcriptHint: activeTab.lastState.transcriptHint,
                transcriptMeta: activeTab.lastState.transcriptMeta,
                showUndo: false,
                lastState: null,
            });
            toast.success("Đã hoàn tác thành công !");
        }
    };

    const handleFillFromYoutube = async (rawUrl) => {
        if (loadingYoutube) return;
        const inputUrl = (rawUrl ?? (activeTab.youtubeUrl || "")).trim();
        const id = extractVideoId(inputUrl);
        if (!id) {
            toast.error("Link YouTube không hợp lệ");
            return;
        }

        setLoadingTabs(prev => ({ ...prev, [activeTabId]: true }));
        try {
            const watchUrl = `https://www.youtube.com/watch?v=${id}`;
            const preferredLang = activeTab.transcriptLang || "auto";
            const transcriptPromise = getTranscriptWithFallback(id, preferredLang);
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
            const nextThumb = await resolveBestThumbnail(
                id,
                data?.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
            );
            const transcriptData = transcriptRes.status === "fulfilled"
                ? transcriptRes.value
                : { transcript: "", message: "Không thể kết nối API bản chép lời.", language: "", source: "" };
            const transcriptText = transcriptData.transcript || "";

            const nextContent = transcriptText.trim() || [nextChannel ? `Kênh: ${nextChannel}` : "", `Link: ${watchUrl}`]
                .filter(Boolean)
                .join("\n");

            // Auto-rename tab based on video title or channel
            let nextTabName = activeTab.name;
            if (nextTitle) {
                nextTabName = nextTitle.length > 20 ? nextTitle.substring(0, 18) + "..." : nextTitle;
            } else if (nextChannel) {
                nextTabName = nextChannel.length > 20 ? nextChannel.substring(0, 18) + "..." : nextChannel;
            }

            updateActiveTab({
                name: nextTabName,
                title: nextTitle || activeTab.title,
                content: nextContent,
                channelName: nextChannel,
                thumbnailUrl: nextThumb,
                youtubeUrl: watchUrl,
                transcriptHint: transcriptText.trim()
                    ? "Đã lấy bản chép lời thành công."
                    : (transcriptData.message || "Không tìm thấy bản chép lời cho video này."),
                transcriptMeta: { language: transcriptData.language || "", source: transcriptData.source || "" }
            });

            if (transcriptText.trim()) {
                toast.success("Đã tự điền thông tin + bản chép lời");
            } else {
                toast.warning(transcriptData.message || "Không tìm thấy bản chép lời, đã điền thông tin cơ bản.");
            }
        } catch {
            updateActiveTab({
                transcriptHint: "Không lấy được thông tin từ YouTube hoặc API bản chép lời.",
                transcriptMeta: { language: "", source: "" }
            });
            toast.error("Không lấy được thông tin từ YouTube");
        } finally {
            setLoadingTabs(prev => ({ ...prev, [activeTabId]: false }));
        }
    };

    const handleYoutubePaste = (e) => {
        if (loadingYoutube) return;
        const pastedText = (e.clipboardData || window.clipboardData).getData("text");
        if (!pastedText) return;
        updateActiveTab({ youtubeUrl: pastedText });
        setTimeout(() => {
            handleFillFromYoutube(pastedText);
        }, 0);
    };

    const handleCopyThumbnail = async () => {
        const currentThumb = activeTab.thumbnailUrl;
        if (!currentThumb) {
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
                    img.src = currentThumb;
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
                const copied = await window.electronApp.copyImageFromUrl(currentThumb);
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
                `/api/thumbnail?url=${encodeURIComponent(currentThumb)}`,
                API_BASE ? `${API_BASE}/api/thumbnail?url=${encodeURIComponent(currentThumb)}` : "",
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
                await window.electronApp.copyText(currentThumb);
            } else {
                await navigator.clipboard.writeText(currentThumb);
            }
            toast.info("Máy không hỗ trợ copy ảnh trực tiếp, đã copy link ảnh");
        } catch {
            try {
                if (window.electronApp?.copyText) {
                    await window.electronApp.copyText(currentThumb);
                } else {
                    await navigator.clipboard.writeText(currentThumb);
                }
                toast.info("Trình duyệt không cho ghi ảnh vào clipboard, đã copy link ảnh");
            } catch {
                toast.error("Không copy được ảnh. Hãy dùng Chrome/Edge trên HTTPS.");
            }
        }
    };

    return (
        <div className="autocopy-container">
            {/* Tabs Navigation */}
            <div className="autocopy-tabs-container">
                <div className="autocopy-tabs-list">
                    {tabs.map((tab) => (
                        <div
                            key={tab.id}
                            className={`autocopy-tab ${tab.id === activeTabId ? "active" : ""}`}
                            onClick={() => setActiveTabId(tab.id)}
                            onDoubleClick={() => handleTabDoubleClick(tab)}
                        >
                            {editingTabId === tab.id ? (
                                <input
                                    ref={(el) => el && el.focus()}
                                    className="autocopy-tab-input"
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    onBlur={() => {
                                        renameTab(tab.id, editingName);
                                        setEditingTabId(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            renameTab(tab.id, editingName);
                                            setEditingTabId(null);
                                        } else if (e.key === "Escape") {
                                            setEditingTabId(null);
                                        }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <span className="autocopy-tab-title">{tab.name}</span>
                            )}
                            <span
                                className="autocopy-tab-close"
                                onClick={(e) => closeTab(tab.id, e)}
                                title="Đóng tab"
                            >
                                ✕
                            </span>
                        </div>
                    ))}
                </div>
                <button
                    className="autocopy-tab-add"
                    onClick={createNewTab}
                    title="Thêm tab mới"
                >
                    +
                </button>
            </div>

            <div className="autocopy-scroll-content">
                <div className={`youtube-auto-section ${loadingYoutube ? "is-loading" : ""}`} aria-busy={loadingYoutube}>
                <h3 className="title">🔗 Link YouTube</h3>
                <div className="youtube-options-row">
                    <label htmlFor="transcriptLang" className="youtube-options-label">Ưu tiên bản chép lời:</label>
                    <select
                        id="transcriptLang"
                        className="youtube-options-select"
                        value={activeTab.transcriptLang || "auto"}
                        onChange={(e) => updateActiveTab({ transcriptLang: e.target.value })}
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
                    value={activeTab.youtubeUrl || ""}
                    onChange={(e) => updateActiveTab({ youtubeUrl: e.target.value })}
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
                {!loadingYoutube && activeTab.transcriptHint && (
                    <div className={`youtube-transcript-note ${(activeTab.transcriptMeta?.language) ? "is-ok" : "is-warn"}`}>
                        <small>{activeTab.transcriptHint}</small>
                        {(activeTab.transcriptMeta?.language || activeTab.transcriptMeta?.source) && (
                            <small>
                                Ngôn ngữ: {activeTab.transcriptMeta.language || "N/A"} · Nguồn: {activeTab.transcriptMeta.source || "N/A"}
                            </small>
                        )}
                    </div>
                )}
                {!!activeTab.thumbnailUrl && (
                    <div className="youtube-preview-row">
                        <img src={activeTab.thumbnailUrl} alt="thumbnail" className="youtube-preview-thumb" />
                        <div className="youtube-preview-meta">
                            <strong>{activeTab.title || "Đã nhận thông tin video"}</strong>
                            {activeTab.channelName ? <small>Kênh: {activeTab.channelName}</small> : null}
                            <small>Link: {activeTab.youtubeUrl}</small>
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
                                    value={activeTab.request || "Viết bài viết"}
                                    onChange={(e) => updateActiveTab({ request: e.target.value })}
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
                                <p>{activeTab.request || "Viết bài viết"}</p>
                                <button className="btn-edit" onClick={() => setEditRequest(true)}>✏️ Edit</button>
                            </div>
                        )}
                    </div>
                    <label>
                        <strong>Tiêu đề bài viết:</strong>
                        <textarea
                            rows={3}
                            value={activeTab.title || ""}
                            onChange={(e) => updateActiveTab({ title: e.target.value })}
                            style={{ minHeight: "60px" }}
                            placeholder="Vui lòng nhập tiêu đề bài viết"
                        />
                    </label>
                    <label>
                        <strong>Nội dung:</strong>
                        <textarea
                            rows={5}
                            value={activeTab.content || ""}
                            onChange={(e) => updateActiveTab({ content: e.target.value })}
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
                                    value={activeTab.description || "không viết liền không tách dòng"}
                                    onChange={(e) => updateActiveTab({ description: e.target.value })}
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
                                <p>{activeTab.description || "không viết liền không tách dòng"}</p>
                                <button className="btn-edit" onClick={() => setEditDescription(true)}>✏️ Edit</button>
                            </div>
                        )}
                    </div>
                    <div style={{ marginBottom: 10 }}>
                        <label className="checkbox">
                            <CheckBox
                                checked={tabs.length < 2 && activeTab.autoCopy !== false}
                                disabled={tabs.length >= 2}
                                onChange={() => {
                                    if (tabs.length >= 2) return;
                                    const nextVal = !(activeTab.autoCopy !== false);
                                    updateActiveTab({ autoCopy: nextVal });
                                    if (!nextVal) {
                                        toast.warning("Đã tắt tự động sao chép");
                                    } else {
                                        toast.success("Đã bật tự động sao chép");
                                    }
                                }}
                            />
                            Tự động sao chép khi nhập đủ thông tin {tabs.length >= 2 && <span style={{ color: "var(--text-secondary)", fontSize: "0.85em", marginLeft: 4 }}>(tạm tắt khi có từ 2 tab trở lên)</span>}
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
            </div>

            <div className="autocopy-actions-bar">
                <button
                    disabled={!(activeTab.title || activeTab.content)}
                    className={(activeTab.title || activeTab.content) ? "btn-delete" : "btn-disable"}
                    onClick={onReset}
                >
                    🔁 Nhập lại
                </button>
                {((activeTab.autoCopy === false) || tabs.length >= 2) && (activeTab.title && activeTab.content) && (
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
                {activeTab.showUndo && (
                    <button className="btn-edit" onClick={onUndo}>
                        ⬅️ Hoàn tác
                    </button>
                )}
            </div>
        </div>
    );
}
