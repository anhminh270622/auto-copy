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

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        localStorage.setItem('activeTab', activeTab);
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

    const renderContent = () => {
        switch (activeTab) {
            case 'auto-copy':
                return <AutoCopy />;
            case 'img-to-video':
                return <ImageToVideoConverter />;
            case 'download-video':
                return <DownloadVideo />;
            case 'sheet-note':
                return <SheetNote theme={theme} />;
            default:
                return <AutoCopy />;
        }
    };

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
                    <div className={`content-wrapper${activeTab === 'sheet-note' ? ' content-wrapper--sheet' : ''}`}>
                        {renderContent()}
                    </div>
                </main>
            </div>
        </>
    );
}
