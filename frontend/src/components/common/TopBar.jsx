import { useState, useEffect, useRef } from "react";
import { LayoutGrid, Bell, X, MessageSquare, ExternalLink, Mail, Menu } from "lucide-react";
import { buildJsonPostOptions } from "../../lib/appUtils";
import { PAGE_PATHS, appUrlForPage } from "../../lib/useHistoryNav";

function TopBar({ activePage, dashboard, handleLogout, navItems, setActivePage, userType, hideNav }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const drawerRef = useRef(null);

  useEffect(() => { setMenuOpen(false); }, [activePage]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const adminNavItems = [{ id: "admin", label: "Dashboard", icon: LayoutGrid }];
  const hodNavItems = [{ id: "hod", label: "Dashboard", icon: LayoutGrid }];
  const staffNavItems = [{ id: "staff", label: "Dashboard", icon: LayoutGrid }];

  const getNavItems = () => {
    if (userType === "admin") return adminNavItems;
    if (userType === "hod") return hodNavItems;
    if (userType === "staff" || userType === "director" || userType === "tpu" || userType === "ja") return staffNavItems;
    return navItems;
  };

  const items = getNavItems();

  return (
    <>
      <header className="topbar">
        {/* Left: Hamburger */}
        <div className="topbar-left">
          {!hideNav && (
            <button
              type="button"
              className={`hamburger-btn${menuOpen ? " open" : ""}`}
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle navigation"
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          )}
        </div>

        {/* Center: Brand */}
        <div className="brand-block">
          {(dashboard.institution?.name?.toLowerCase().includes("ramco") || dashboard.institution?.display_name?.toLowerCase().includes("ramco")) ? (
            <img
              src="/logo/logo.jpeg"
              alt="Ramco Logo"
              style={{ height: 75, width: "auto", objectFit: "contain" }}
            />
          ) : (dashboard.institution?.logo_url || dashboard.institution?.logo_display_url) ? (
            <img
              src={dashboard.institution.logo_url || dashboard.institution.logo_display_url}
              alt="Logo"
              style={{ height: 60, width: "auto", objectFit: "contain" }}
            />
          ) : (
            <div className="brand-badge" style={{ background: "var(--olive-900)", width: 48, height: 48, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
              🏛️
            </div>
          )}
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {(dashboard.institution?.name?.toLowerCase().includes("ramco") || dashboard.institution?.display_name?.toLowerCase().includes("ramco")) ? (
              <>
                <h1 style={{ color: "#dc2626", margin: 0, fontSize: "1.35rem", fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", lineHeight: 1.2 }}>
                  RAMCO INSTITUTE OF TECHNOLOGY
                </h1>
                <h2 style={{ color: "#eab308", margin: "2px 0", fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", lineHeight: 1.2 }}>
                  (AN AUTONOMOUS INSTITUTION)
                </h2>
                <div style={{ fontSize: "0.65rem", color: "#4b5563", lineHeight: 1.3, fontWeight: 500 }}>
                  <p style={{ margin: 0 }}>Approved By AICTE, New Delhi &amp; Affiliated to Anna University</p>
                  <p style={{ margin: 0 }}>NAAC Accredited with &apos;A+&apos; Grade &amp; An ISO 9001:2015 Certified Institution</p>
                  <p style={{ margin: 0 }}>Rajapalayam, Tamil Nadu, India - 626 117.</p>
                </div>
              </>
            ) : (
              <>
                <h1 style={{ color: "#dc2626", margin: 0, fontSize: "1.25rem", fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", lineHeight: 1.2 }}>
                  {dashboard.institution?.display_name || dashboard.institution?.name || "code-2day"}
                </h1>
                {dashboard.institution?.subheading && (
                  <h2 style={{ color: "#eab308", margin: "2px 0", fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", lineHeight: 1.2 }}>
                    {dashboard.institution.subheading}
                  </h2>
                )}
                {dashboard.institution?.address && (
                  <div style={{ fontSize: "0.65rem", color: "#4b5563", lineHeight: 1.3, fontWeight: 500 }}>
                    {dashboard.institution.address.split("\n").map((line, i) => (
                      <p key={i} style={{ margin: 0 }}>{line.trim ? line.trim() : line}</p>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: Account */}
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

      {/* Backdrop */}
      {!hideNav && menuOpen && (
        <div className="hamburger-overlay" onClick={() => setMenuOpen(false)} />
      )}

      {/* Slide-out nav drawer */}
      {!hideNav && (
        <nav className={`hamburger-drawer${menuOpen ? " open" : ""}`} ref={drawerRef} aria-hidden={!menuOpen}>
          <div className="hamburger-drawer-header">
            <div className="hamburger-drawer-brand">
              <span>🏛️</span>
              <span>code-2day</span>
            </div>
            <button type="button" className="hamburger-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
          </div>

          <div className="hamburger-nav">
            {items.map((item) =>
              item.dropdown ? (
                <div key={item.id} className="hamburger-nav-group">
                  <div className="hamburger-nav-group-label">
                    <item.icon size={15} />
                    {item.label}
                  </div>
                  {item.dropdown.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      className={`hamburger-nav-link hamburger-nav-sub${sub.id === activePage ? " active" : ""}`}
                      onClick={() => { setActivePage(sub.id); setMenuOpen(false); }}
                    >
                      <sub.icon size={15} />
                      <span>{sub.label}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  className={`hamburger-nav-link${item.id === activePage ? " active" : ""}`}
                  onClick={() => { setActivePage(item.id); setMenuOpen(false); }}
                >
                  {item.icon && <item.icon size={18} />}
                  <span>{item.label}</span>
                </button>
              )
            )}
          </div>
        </nav>
      )}
    </>
  );
}

function NotificationInbox() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef(null);

  useEffect(() => {
    fetchNotifications();
    const poller = setInterval(fetchNotifications, 60000);
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
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error("Failed to mark as read", err);
    }
  }

  function notificationHref(link) {
    if (!link) return "#";
    try {
      const parsed = new URL(link, window.location.origin);
      if (parsed.origin !== window.location.origin) return parsed.href;
      const cleanPath = parsed.pathname.replace(/\/+$/, "") || "/";
      const page = Object.keys(PAGE_PATHS).find((key) => PAGE_PATHS[key] === cleanPath);
      return page ? appUrlForPage(page) : parsed.href;
    } catch {
      const normalized = link.startsWith("/") ? link : `/${link}`;
      return new URL(normalized, window.location.origin).href;
    }
  }

  return (
    <div className="notification-wrapper" ref={dropdownRef}>
      <button
        className={`inbox-trigger${unreadCount > 0 ? " has-unread" : ""}`}
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
                <div key={n.id} className={`inbox-item${n.is_read ? "" : " unread"}`} onClick={() => markAsRead(n.id)}>
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
                      <a href={notificationHref(n.link)} className="inbox-link">
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
