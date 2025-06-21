import { useEffect, useState } from "react";
import "./App.css"
import { toast, ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';
import CheckBox from "./components/checkbox/checkbox";
import DownloadYtb from "./components/downloadYtb/downloadYtb.jsx";

export default function App() {
    const [theme, setTheme] = useState(() => {
        const savedTheme = localStorage.getItem('theme');
        return savedTheme || 'dark';
    });
    const [title, setTitle] = useState("");
    const [editDescription, setEditDescription] = useState(false);
    const [editRequest, setEditRequest] = useState(false);

    const [request, setRequest] = useState("Viết bài viết");
    const [content, setContent] = useState("");
    const [autoCopy, setAutoCopy] = useState(true);
    const [combined, setCombined] = useState("");
    const [description, setDescription] = useState("không viết liền không tách dòng")
    const [lastState, setLastState] = useState(null);
    const [showUndo, setShowUndo] = useState(false);

    useEffect(() => {
        const saved = JSON.parse(localStorage.getItem("myAppData") || "{}");
        if (saved) {
            setTitle(saved.title || "");
            setContent(saved.content || "");
            setRequest(saved.request || "Viết bài viết");
            setDescription(saved.description || "không viết liền không tách dòng");
        }
    }, []);

    useEffect(() => {
        if (title && content) {
            const processedContent = content.replace(/(?!^)(\d{1,2}:\d{2})/g, "\n$1");
            const text = `${request} "${title}" ${description} \n ${processedContent}`;
            setCombined(text);

            if (autoCopy) {
                navigator.clipboard.writeText(text)
            }
        }
    }, [request, title, content, description, autoCopy]);

    useEffect(() => {
        localStorage.setItem("myAppData", JSON.stringify({ title, content, request, description }));
    }, [title, content, request, description]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const onReset = () => {
        setLastState({ title, content, request, description, autoCopy, combined });
        setTitle("");
        setContent("");
        setCombined("")
        setAutoCopy(true)
        setShowUndo(true);
        toast.info("Đã nhập lại. Bạn có thể hoàn tác !");
    }

    const onUndo = () => {
        if (lastState) {
            setTitle(lastState.title);
            setContent(lastState.content);
            setRequest(lastState.request);
            setDescription(lastState.description);
            setAutoCopy(lastState.autoCopy);
            setCombined(lastState.combined);
            setShowUndo(false);
            toast.success("Đã hoàn tác thành công !");
        }
    }

    const toggleTheme = () => {
        setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
    };

    return (
        <>
            <ToastContainer position="top-right" autoClose={2000}/>
            <div className="app-container">
                <div className="header">
                    <img src="/logo.png" alt="logo"/>
                    <h2 style={{ textAlign: "center", margin: 0 }}>Tự động sao chép</h2>
                    <button
                        className="btn-theme"
                        onClick={toggleTheme}
                    >
                        {theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                </div>
                <div className="app-main-row">
                    <div className="left">
                        <h3 className="title">✍️ Nhập thông tin:</h3>
                        <div style={{ marginBottom: 10 }}>
                            <strong>Viết yêu cầu</strong>
                            {editRequest
                                ? (
                                    <div className="flex-between">
                                        <textarea
                                            rows={2}
                                            value={request}
                                            onChange={(e) => setRequest(e.target.value)}
                                        />
                                        <button className="btn-copy" onClick={() => {
                                            setEditRequest(false)
                                            toast.success("Chỉnh sửa yêu cầu thành công")
                                        }
                                        }>
                                            💾 Lưu
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex-between">
                                        <p>{request}</p>
                                        <button className="btn-edit" onClick={() => setEditRequest(true)}>✏️ Edit
                                        </button>
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
                            {editDescription
                                ? (
                                    <div className="flex-between">
                                        <textarea
                                            maxWidth={100}
                                            rows={2}
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                        />
                                        <button className="btn-copy" onClick={() => {
                                            setEditDescription(false)
                                            toast.success("Chỉnh sửa mô tả thành công")
                                        }}>
                                            💾 Lưu
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex-between">
                                        <p>{description}</p>
                                        <button className="btn-edit" onClick={() => setEditDescription(true)}>✏️ Edit
                                        </button>
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
                                            toast.warning("Đã tắt tự động sao chép")
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
                        <div
                            className="result"
                        >
                            {combined || "📭 Chưa có nội dung nào được tạo. Vui lòng nhập thông tin bên trái."}
                        </div>
                    </div>
                </div>
                <div style={{ marginTop: 10, marginBottom: 10, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button
                        disabled={!(title || content)}
                        className={(title || content) ? "btn-delete" : "btn-disable"}
                        onClick={onReset}>
                        🔁 Nhập lại
                    </button>
                    {
                        !autoCopy && (title && content) && (
                            <button
                                className={"btn-copy"}
                                onClick={() => {
                                    navigator.clipboard.writeText(combined)
                                    toast.success("Copy thành công !")
                                }}>
                                📋 Copy kết quả
                            </button>
                        )
                    }

                    {showUndo && (
                        <button className="btn-edit" onClick={onUndo}>
                            ⬅️ Hoàn tác
                        </button>
                    )}
                </div>
                <hr/>
                <div className="downloadYtb">
                    <DownloadYtb/>
                </div>
            </div>

        </>
    )
}
