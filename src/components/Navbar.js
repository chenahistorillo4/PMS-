import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useUserUnreadNotificationCount } from "../hooks/useUnreadNotificationCount";
import { NavNotificationBadge } from "./NotificationBadge";

function Navbar({ user }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const unreadNotificationCount = useUserUnreadNotificationCount(user?.uid);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleNavClick = () => {
    setSidebarOpen(false);
  };

  // Desktop Navbar
  if (!isMobile) {
    return (
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary px-4 navbar-custom">
        <div className="container-fluid">
          <Link className="navbar-brand fw-bold d-flex align-items-center" to="/" onClick={handleNavClick}>
            <div
              className="navbar-logo-shell"
              style={{
                width: "55px",
                height: "40px",
                borderRadius: "50px 50px 0 0",
                overflow: "hidden",
                marginRight: "clamp(8px, 2vw, 15px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(240, 248, 255, 0.9)",
                flexShrink: 0
              }}
            >
              <img
                src="/logoo.png"
                alt="PMS Port Logo"
                style={{
                  height: "35px",
                  objectFit: "contain",
                  transition: "height 0.3s ease"
                }}
              />
            </div>
            <span className="navbar-brand-text" style={{ fontSize: "clamp(1.2rem, 4vw, 1.5rem)" }}>
              PMS Port
            </span>
          </Link>

          <div className="collapse navbar-collapse justify-content-end">
            <ul className="navbar-nav gap-3">
              <li className="nav-item">
                <Link className="nav-link nav-link-custom" to="/" onClick={handleNavClick}>Home</Link>
              </li>

              <li className="nav-item">
                <Link className="nav-link nav-link-custom" to="/schedule" onClick={handleNavClick}>Schedule</Link>
              </li>

              <li className="nav-item">
                <Link className="nav-link nav-link-custom" to="/about" onClick={handleNavClick}>About</Link>
              </li>

              {user && (
                <>
                  <li className="nav-item">
                    <Link className="nav-link nav-link-custom" to="/booking" onClick={handleNavClick}>Book Ticket</Link>
                  </li>

                  <li className="nav-item">
                    <Link className="nav-link nav-link-custom" to="/manage" onClick={handleNavClick}>Manage</Link>
                  </li>

                  <li className="nav-item">
                    <Link className="nav-link nav-link-custom position-relative d-inline-flex align-items-center gap-2" to="/notifications" onClick={handleNavClick}>
                      Notifications
                      {unreadNotificationCount > 0 && (
                        <span
                          style={{
                            display: "inline-block",
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background: "#f44336",
                          }}
                        />
                      )}
                    </Link>
                  </li>

                  <li className="nav-item">
                    <Link className="nav-link nav-link-custom" to="/profile" onClick={handleNavClick}>Profile</Link>
                  </li>
                </>
              )}

              {!user && (
                <>
                  <li className="nav-item">
                    <Link className="nav-link nav-link-custom" to="/login" onClick={handleNavClick}>Login</Link>
                  </li>
                  <li className="nav-item">
                    <Link className="nav-link nav-link-custom" to="/register" onClick={handleNavClick}>Register</Link>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>
      </nav>
    );
  }

  // Mobile Sidebar Navigation
  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 998
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Top Bar with Logo and Hamburger */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "70px",
          background: "linear-gradient(135deg, #3b7ecc 0%, #4a8bd4 50%, #5a99db 100%)",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          zIndex: 1000,
          boxShadow: "0 4px 12px rgba(59, 126, 204, 0.2)"
        }}
      >
        {/* Logo */}
        <Link
          to="/"
          onClick={handleNavClick}
          style={{
            textDecoration: "none",
            color: "white",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexGrow: 1
          }}
        >
          <div
            style={{
              width: "45px",
              height: "35px",
              borderRadius: "45px 45px 0 0",
              backgroundColor: "rgba(255, 255, 255, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(255, 255, 255, 0.3)",
            }}
          >
            <img
              src="/logoo.png"
              alt="PMS Port Logo"
              style={{
                width: "35px",
                height: "25px",
                objectFit: "contain"
              }}
            />
          </div>
          <h3 style={{
            fontWeight: "900",
            fontSize: "1rem",
            margin: "0",
            color: "white",
            letterSpacing: "-0.3px"
          }}>
            PMS Port
          </h3>
        </Link>

        {/* Hamburger Menu Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            background: "transparent",
            border: "none",
            color: "white",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px",
            transition: "all 0.3s ease",
            position: "relative"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
          <NavNotificationBadge count={unreadNotificationCount} />
        </button>
      </div>

      {/* Mobile Sidebar Menu */}
      <div
        style={{
          width: "280px",
          background: "linear-gradient(135deg, #3b7ecc 0%, #4a8bd4 50%, #5a99db 100%)",
          color: "white",
          display: "flex",
          flexDirection: "column",
          padding: "80px 20px 25px 20px",
          overflowY: "auto",
          position: "fixed",
          height: "100vh",
          zIndex: 999,
          transition: "transform 0.3s ease",
          transform: !sidebarOpen ? "translateX(100%)" : "translateX(0)",
          boxShadow: "-4px 0 15px rgba(59, 126, 204, 0.15)",
          right: 0,
          top: 0
        }}
      >
        {/* Navigation Links */}
        <nav style={{ display: "flex", flexDirection: "column", gap: "8px", flexGrow: 1 }}>
          
          <Link
            to="/"
            onClick={handleNavClick}
            style={{
              padding: "12px 15px",
              borderRadius: "8px",
              textDecoration: "none",
              color: "rgba(255,255,255,0.8)",
              background: "transparent",
              fontWeight: 500,
              fontSize: "0.95rem",
              transition: "all 0.3s ease",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              borderLeft: "4px solid transparent"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            Home
          </Link>

          <Link
            to="/schedule"
            onClick={handleNavClick}
            style={{
              padding: "12px 15px",
              borderRadius: "8px",
              textDecoration: "none",
              color: "rgba(255,255,255,0.8)",
              background: "transparent",
              fontWeight: 500,
              fontSize: "0.95rem",
              transition: "all 0.3s ease",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              borderLeft: "4px solid transparent"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            Schedule
          </Link>

          <Link
            to="/about"
            onClick={handleNavClick}
            style={{
              padding: "12px 15px",
              borderRadius: "8px",
              textDecoration: "none",
              color: "rgba(255,255,255,0.8)",
              background: "transparent",
              fontWeight: 500,
              fontSize: "0.95rem",
              transition: "all 0.3s ease",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              borderLeft: "4px solid transparent"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            About
          </Link>

          {user && (
            <>
              <Link
                to="/booking"
                onClick={handleNavClick}
                style={{
                  padding: "12px 15px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  color: "rgba(255,255,255,0.8)",
                  background: "transparent",
                  fontWeight: 500,
                  fontSize: "0.95rem",
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  borderLeft: "4px solid transparent"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 11 12 14 22 4"></polyline>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
                Book Ticket
              </Link>

              <Link
                to="/manage"
                onClick={handleNavClick}
                style={{
                  padding: "12px 15px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  color: "rgba(255,255,255,0.8)",
                  background: "transparent",
                  fontWeight: 500,
                  fontSize: "0.95rem",
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  borderLeft: "4px solid transparent"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                </svg>
                Manage Bookings
              </Link>

              <Link
                to="/notifications"
                onClick={handleNavClick}
                style={{
                  padding: "12px 15px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  color: "rgba(255,255,255,0.8)",
                  background: "transparent",
                  fontWeight: 500,
                  fontSize: "0.95rem",
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  borderLeft: "4px solid transparent"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
                <span style={{ flex: 1 }}>Notifications</span>
                <NavNotificationBadge count={unreadNotificationCount} inline />
              </Link>

              <Link
                to="/profile"
                onClick={handleNavClick}
                style={{
                  padding: "12px 15px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  color: "rgba(255,255,255,0.8)",
                  background: "transparent",
                  fontWeight: 500,
                  fontSize: "0.95rem",
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  borderLeft: "4px solid transparent"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                Profile
              </Link>
            </>
          )}

          {!user && (
            <>
              <Link
                to="/login"
                onClick={handleNavClick}
                style={{
                  padding: "12px 15px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  color: "rgba(255,255,255,0.8)",
                  background: "transparent",
                  fontWeight: 500,
                  fontSize: "0.95rem",
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  borderLeft: "4px solid transparent"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3H9a6 6 0 0 0-6 6v12a6 6 0 0 0 6 6h6a6 6 0 0 0 6-6V9a6 6 0 0 0-6-6z"></path>
                  <path d="M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z"></path>
                </svg>
                Login
              </Link>

              <Link
                to="/register"
                onClick={handleNavClick}
                style={{
                  padding: "12px 15px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  color: "rgba(255,255,255,0.8)",
                  background: "transparent",
                  fontWeight: 500,
                  fontSize: "0.95rem",
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  borderLeft: "4px solid transparent"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                  <line x1="12" y1="12" x2="12" y2="18"></line>
                  <line x1="9" y1="15" x2="15" y2="15"></line>
                </svg>
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </>
  );
}

export default Navbar;
