import { useEffect, useState } from "react";
import "./App.css";
import { ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';
import Sidebar from "./components/sidebar/Sidebar.jsx";
import AutoCopy from "./components/autoCopy/AutoCopy.jsx";
import DownloadYtb from "./components/downloadYtb/downloadYtb.jsx";
import ImageToVideoConverter from "./components/imgToVideoConvert/ImgToVideoConvert.jsx";
import DownloadVideo from "./components/downloadVideo/DownloadVideo.jsx";

export default function App() {
    const [activeTab, setActiveTab] = useState(() => {
        return localStorage.getItem('activeTab') || 'auto-copy';
    });
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('theme') || 'light';
    });
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        localStorage.setItem('activeTab', activeTab);
    }, [activeTab]);

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
            case 'youtube-thumbnail':
                return <DownloadYtb />;
            case 'img-to-video':
                return <ImageToVideoConverter />;
            case 'download-video':
                return <DownloadVideo />;
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
                />
                <main className="main-content">
                    <div className="mobile-header">
                        <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
                            ☰
                        </button>
                        <span className="mobile-title">Auto Copy</span>
                    </div>
                    <div className="content-wrapper">
                        {renderContent()}
                    </div>
                </main>
            </div>
        </>
    );
}
