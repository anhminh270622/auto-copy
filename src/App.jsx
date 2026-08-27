import { useEffect, useState } from "react";
import "./App.css";
import { ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';
import Sidebar from "./components/sidebar/Sidebar.jsx";
import AutoCopy from "./components/autoCopy/AutoCopy.jsx";
import ImageToVideoConverter from "./components/imgToVideoConvert/ImgToVideoConvert.jsx";
import DownloadVideo from "./components/downloadVideo/DownloadVideo.jsx";
import SheetNote from "./components/sheetNote/SheetNote.jsx";

export default function App() {
    const [activeTab, setActiveTab] = useState(() => {
        const savedTab = localStorage.getItem('activeTab') || 'auto-copy';
        return ['youtube-thumbnail', 'api-probe'].includes(savedTab) ? 'auto-copy' : savedTab;
    });
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        return localStorage.getItem('sidebarCollapsed') === 'true';
    });
    const [theme, setTheme] = useState(() => {
        // Migrate existing users to the new dark default
        if (!localStorage.getItem('theme_v2')) {
            localStorage.setItem('theme_v2', '1');
            localStorage.setItem('theme', 'dark');
            return 'dark';
        }
        return localStorage.getItem('theme') || 'dark';
    });
    const [sidebarOpen, setSidebarOpen] = useState(false);
    // Giữ sheet trong DOM sau lần mở đầu — đổi menu không mất scroll/ô đang chọn
    const [sheetMounted, setSheetMounted] = useState(() => activeTab === 'sheet-note');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        localStorage.setItem('activeTab', activeTab);
        if (activeTab === 'sheet-note') setSheetMounted(true);
    }, [activeTab]);

    useEffect(() => {
        localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed));
    }, [sidebarCollapsed]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setSidebarOpen(false);
    };

    const renderOtherContent = () => {
        switch (activeTab) {
            case 'auto-copy':
                return <AutoCopy />;
            case 'img-to-video':
                return <ImageToVideoConverter />;
            case 'download-video':
                return <DownloadVideo />;
            default:
                return activeTab === 'sheet-note' ? null : <AutoCopy />;
        }
    };

    const sheetVisible = activeTab === 'sheet-note';

    return (
        <>
            <ToastContainer position="top-right" autoClose={2000} />
            <div className="app-layout">
                <Sidebar
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                    theme={theme}
                    onToggleTheme={toggleTheme}
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    isCollapsed={sidebarCollapsed}
                    onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
                />
                <main className="main-content">
                    <div className="mobile-header">
                        <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
                            ☰
                        </button>
                        <span className="mobile-title">Auto Copy</span>
                    </div>
                    <div className={`content-wrapper${sheetVisible ? ' content-wrapper--sheet' : ''}`}>
                        <div className="content-panels">
                            {!sheetVisible && (
                                <div className="content-panel content-panel--active">
                                    {renderOtherContent()}
                                </div>
                            )}
                            {sheetMounted && (
                                <div
                                    className={`content-panel content-panel--sheet${sheetVisible ? ' content-panel--active' : ' content-panel--parked'}`}
                                    aria-hidden={!sheetVisible}
                                >
                                    <SheetNote theme={theme} visible={sheetVisible} />
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </>
    );
}
