import { useState, useEffect, useRef } from "react";
import { ChevronDown, LayoutGrid, Bell, X, MessageSquare, ExternalLink, Mail } from "lucide-react";
import { buildJsonPostOptions } from "../../lib/appUtils";

function TopBar({ activePage, dashboard, handleLogout, navItems, setActivePage, userType, hideNav }) {
  const [manageOpen, setManageOpen] = useState(false);

  // Admin navigation items
  const adminNavItems = [
    { id: "admin", label: "Dashboard", icon: LayoutGrid },
  ];

  // HOD navigation items
  const hodNavItems = [
    { id: "hod", label: "Dashboard", icon: LayoutGrid },
  ];

  // Staff navigation items
  const staffNavItems = [
    { id: "staff", label: "Dashboard", icon: LayoutGrid },
  ];

  // Select navigation based on user type
  const getNavItems = () => {
    if (userType === "admin") return adminNavItems;
    if (userType === "hod") return hodNavItems;
    if (userType === "staff" || userType === "director" || userType === "tpu" || userType === "ja") return staffNavItems;
    return navItems;
  };
  
  const items = getNavItems();

  const getDashboardTitle = () => {
    if (userType === "admin") return "Admin Console";
    if (userType === "director") return "Director Dashboard";
    if (userType === "tpu") return "TPU Dashboard";
    if (userType === "ja") return "Admin Console";
    if (userType === "hod") return "HOD Dashboard";
    if (userType === "staff") return "Staff Dashboard";
    return "Meaningful practice, not random scrolling.";
  };

  return (
    <header className="topbar">
      <div className="brand-block">
        {dashboard.institution?.logo_url || dashboard.institution?.logo_display_url ? (
          <img 
            src={dashboard.institution.logo_url || dashboard.institution.logo_display_url} 
            alt="Logo" 
            style={{ height: 32, width: 'auto', marginRight: 12, objectFit: 'contain' }}
          />
        ) : (
          <div className="brand-badge" style={{ background: 'var(--olive-900)' }}>
            {dashboard.institution?.short_code?.substring(0, 2).toUpperCase() || 'C2D'}
          </div>
        )}
        <div className="brand-text">
          <strong style={{ color: 'var(--olive-950)', fontSize: '1rem', fontWeight: 800 }}>
            {dashboard.institution?.display_name || dashboard.institution?.name || "code-2day"}
          </strong>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-soft)', margin: 0 }}>
            {getDashboardTitle()}
          </p>
        </div>
      </div>

      {!hideNav && (
        <nav className="topnav">
          {items.map((item) => (
            <div key={item.id} className="nav-item-wrapper">
              {item.dropdown ? (
                <div className="nav-dropdown">
                  <button
                    type="button"
                    className={`nav-link ${item.dropdown.some(d => d.id === activePage) ? "active" : ""}`}
                    onClick={() => setManageOpen(!manageOpen)}
                  >
                    <item.icon className="nav-icon" size={16} />
                    {item.label}
                    <ChevronDown size={14} className={`dropdown-chevron ${manageOpen ? "open" : ""}`} />
                  </button>
                  {manageOpen && (
                    <div className="dropdown-menu">
                      {item.dropdown.map((subItem) => (
                        <button
                          key={subItem.id}
                          type="button"
                          className={subItem.id === activePage ? "dropdown-item active" : "dropdown-item"}
                          onClick={() => {
                            setActivePage(subItem.id);
                            setManageOpen(false);
                          }}
                        >
                          <subItem.icon size={14} />
                          {subItem.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className={item.id === activePage ? "nav-link active" : "nav-link"}
                  onClick={() => setActivePage(item.id)}
                >
                  {item.icon && <item.icon className="nav-icon" size={16} />}
                  {item.label}
                </button>
              )}
            </div>
          ))}
        </nav>
      )}

      <div className="account-block">
        <NotificationInbox />


        <div className="account-info">
          <strong>{dashboard.user?.name || "User"}</strong>
          <p>
            {dashboard.user?.facultyId || dashboard.user?.registerNumber || "N/A"}
            {" | "}
            {userType?.toUpperCase()} Access
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}

function NotificationInbox() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    fetchNotifications();
    const poller = setInterval(fetchNotifications, 60000); // Poll every minute
    return () => clearInterval(poller);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications/", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    }
  }

  async function markAsRead(id) {
    try {
      const res = await fetch(`/api/notifications/${id}/read/`, buildJsonPostOptions({}));
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error("Failed to mark as read", err);
    }
  }

  return (
    <div className="notification-wrapper" ref={dropdownRef}>
      <button 
        className={`inbox-trigger ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell size={20} />
        {unreadCount > 0 && <span className="unread-dot">{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="inbox-dropdown surface-card">
          <div className="inbox-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && <span className="unread-label">{unreadCount} new</span>}
          </div>
          
          <div className="inbox-list scroll-column">
            {notifications.length > 0 ? (
              notifications.map((n) => (
                <div key={n.id} className={`inbox-item ${n.is_read ? '' : 'unread'}`} onClick={() => markAsRead(n.id)}>
                  <div className="inbox-item-icon">
                    {n.is_read ? <Mail size={16} /> : <MessageSquare size={16} />}
                  </div>
                  <div className="inbox-item-content">
                    <div className="inbox-item-top">
                      <strong>{n.title}</strong>
                      <span>{n.time}</span>
                    </div>
                    <p>{n.message}</p>
                    {n.link && (
                      <a href={n.link} className="inbox-link">
                        View Detail <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="inbox-empty">
                <Bell size={32} />
                <p>No messages yet</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TopBar;
