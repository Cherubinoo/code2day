import { useState } from "react";
import { ChevronDown, LayoutGrid } from "lucide-react";

function TopBar({ activePage, dashboard, handleLogout, navItems, setActivePage, userType }) {
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
    if (userType === "staff") return staffNavItems;
    return navItems;
  };
  
  const items = getNavItems();

  return (
    <header className="topbar">
      <div className="brand-block">
        <div className="brand-badge">C2D</div>
        <div>
          <strong>code-2day</strong>
          <p>{userType === "admin" ? "Admin Console" : userType === "hod" ? "HOD Dashboard" : userType === "staff" ? "Staff Dashboard" : "Meaningful campus coding practice"}</p>
        </div>
      </div>

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

      <div className="account-block">
        <div>
          <strong>{dashboard.user?.name || "Admin"}</strong>
          <p>{dashboard.user?.registerNumber || dashboard.user?.id || "0001"} | {userType === "admin" ? "Admin access" : userType === "hod" ? "HOD access" : userType === "staff" ? "Staff access" : "Private workspace"}</p>
        </div>
        <button type="button" className="ghost-button" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}

export default TopBar;
