import './Sidebar.css';

const menuItems = [
    { id: 'auto-copy', label: 'Tự động sao chép', icon: '📋' },
    { id: 'youtube-thumbnail', label: 'Ảnh từ YouTube', icon: '🖼️' },
    { id: 'img-to-video', label: 'Ảnh thành Video', icon: '🎬' },
    { id: 'download-video', label: 'Tải Video YouTube', icon: '⬇️' },
];

export default function Sidebar({ activeTab, onTabChange, theme, onToggleTheme, isOpen, onClose }) {
    return (
        <>
            {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
            <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <img src="/logo.png" alt="logo" className="sidebar-logo" />
                    <span className="sidebar-title">Auto Copy</span>
                    <button className="sidebar-close" onClick={onClose}>✕</button>
                </div>

                <nav className="sidebar-nav">
                    {menuItems.map(item => (
                        <button
                            key={item.id}
                            className={`sidebar-item ${activeTab === item.id ? 'active' : ''}`}
                            onClick={() => onTabChange(item.id)}
                        >
                            <span className="sidebar-icon">{item.icon}</span>
                            <span className="sidebar-label">{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <button className="sidebar-theme-btn" onClick={onToggleTheme}>
                        {theme === 'dark' ? '☀️ Chế độ sáng' : '🌙 Chế độ tối'}
                    </button>
                </div>
            </aside>
        </>
    );
}
