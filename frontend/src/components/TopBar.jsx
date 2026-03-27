function TopBar({ activePage, dashboard, handleLogout, navItems, setActivePage }) {
  return (
    <header className="topbar">
      <div className="brand-block">
        <div className="brand-badge">C2D</div>
        <div>
          <strong>code-2day</strong>
          <p>Meaningful campus coding practice</p>
        </div>
      </div>

      <nav className="topnav">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === activePage ? "nav-link active" : "nav-link"}
            onClick={() => setActivePage(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="account-block">
        <div>
          <strong>{dashboard.user.name}</strong>
          <p>{dashboard.user.registerNumber} | Private workspace</p>
        </div>
        <button type="button" className="ghost-button" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}

export default TopBar;
