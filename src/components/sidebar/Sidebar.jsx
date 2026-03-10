import './Sidebar.css';

const logoSrc = `${import.meta.env.BASE_URL}logo.png`;

const menuItems = [
    { id: 'auto-copy', label: 'Tự động sao chép', icon: '📋' },
    { id: 'img-to-video', label: 'Ảnh thành Video', icon: '🎬' },
    { id: 'download-video', label: 'Tải Video YouTube', icon: '⬇️' },
];

export default function Sidebar({
    activeTab,
    onTabChange,
    theme,
    onToggleTheme,
    isOpen,
    onClose,
    isCollapsed,
    onToggleCollapse
}) {
    return (
        <>
            {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
            <aside className={`sidebar ${isOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
                <div className="sidebar-header">
                    <button
                        className="sidebar-logo-btn"
                        onClick={isCollapsed ? onToggleCollapse : undefined}
                        title={isCollapsed ? "Mở rộng menu" : undefined}
                    >
                        <img src={logoSrc} alt="logo" className="sidebar-logo" />
                    </button>
                    <span className="sidebar-title">Auto Copy</span>
                    {!isCollapsed && (
                        <button
                            className="sidebar-collapse-btn"
                            onClick={onToggleCollapse}
                            title="Thu gọn menu"
                        >
                            ⬅️
                        </button>
                    )}
                    <button className="sidebar-close" onClick={onClose}>✕</button>
                </div>

                <nav className="sidebar-nav">
                    {menuItems.map(item => (
                        <button
                            key={item.id}
                            className={`sidebar-item ${activeTab === item.id ? 'active' : ''}`}
                            onClick={() => onTabChange(item.id)}
                            title={isCollapsed ? item.label : undefined}
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
