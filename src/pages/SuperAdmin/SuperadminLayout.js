import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";

function SuperadminLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const navigate = useNavigate();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      // Close sidebar when resizing to desktop
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      alert("Logout failed: " + error.message);
      setIsLoggingOut(false);
      setShowLogoutModal(false);
    }
  };

  const cancelLogout = () => {
    setShowLogoutModal(false);
  };

  const handleNavClick = () => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      backgroundColor: "#f8f9fa",
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      width: "100%",
      overflowX: "hidden",
      overflowY: "auto"
    }}>
      {/* Sidebar Overlay for Mobile */}
      {isMobile && sidebarOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            zIndex: 999,
            cursor: "pointer",
            backdropFilter: "blur(4px)",
            animation: "fadeIn 0.3s ease"
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div style={{
        background: "linear-gradient(135deg, #3b7ecc 0%, #4a8bd4 50%, #5a99db 100%)",
        width: !isMobile ? "280px" : "260px",
        padding: !isMobile ? "30px 20px 20px" : "20px",
        color: "white",
        position: "fixed",
        height: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        zIndex: isMobile ? 1000 : 10,
        left: isMobile ? (sidebarOpen ? "0" : "-260px") : "0",
        top: "0",
        transition: "left 0.3s ease, box-shadow 0.3s ease",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: !isMobile ? "2px 0 12px rgba(59, 126, 204, 0.18)" : "0 4px 12px rgba(0,0,0,0.3)",
        flexShrink: 0
      }}>
        <div>
          {/* Logo Section */}
          <div style={{
            paddingBottom: "25px",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            marginBottom: "12px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px"
          }}>
            <div style={{
              width: "100px",
              height: "70px",
              borderRadius: "100px 100px 0 0",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.15)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.25)"
            }}>
              <img 
                src="/logoo.png" 
                alt="PMS Port Logo"
                style={{
                  width: "80px",
                  height: "60px",
                  objectFit: "contain"
                }}
              />
            </div>
            <div style={{
              textAlign: "center"
            }}>
              <h3 style={{
                fontWeight: "900",
                fontSize: "1.3rem",
                margin: "0",
                color: "white",
                letterSpacing: "-0.3px"
              }}>
                PMS Port
              </h3>
              <p style={{
                fontSize: "0.75rem",
                color: "rgba(255,255,255,0.7)",
                margin: "4px 0 0 0",
                fontWeight: "500",
                letterSpacing: "0.3px",
                textTransform: "uppercase"
              }}>
                Superadmin Portal
              </p>
            </div>
          </div>

          {/* Navigation */}
          <h6 style={{
            fontSize: "0.7rem",
            fontWeight: "900",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.6)",
            letterSpacing: "1px",
            margin: "0 10px 15px"
          }}>
            Main Menu
          </h6>
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            margin: "0 10px"
          }}>
            <NavLink
              to="/superadmin-dashboard"
              onClick={handleNavClick}
              style={({ isActive }) => ({
                padding: "12px 0",
                borderRadius: "8px",
                textDecoration: "none",
                color: isActive ? "white" : "rgba(255,255,255,0.85)",
                backgroundColor: isActive ? "rgba(255,255,255,0.2)" : "transparent",
                borderLeft: isActive ? "3px solid white" : "3px solid transparent",
                fontWeight: isActive ? "700" : "600",
                fontSize: "0.95rem",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                display: "block",
                position: "relative"
              })}
              onMouseEnter={(e) => {
                if (!e.currentTarget.style.backgroundColor.includes("0.2")) {
                  e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)";
                }
                e.currentTarget.style.transform = "translateX(4px)";
              }}
              onMouseLeave={(e) => {
                if (!e.currentTarget.style.backgroundColor.includes("0.2")) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
                e.currentTarget.style.transform = "translateX(0)";
              }}
            >
              Overview
            </NavLink>
            <NavLink
              to="/superadmin-reports"
              onClick={handleNavClick}
              style={({ isActive }) => ({
                padding: "12px 0",
                borderRadius: "8px",
                textDecoration: "none",
                color: isActive ? "white" : "rgba(255,255,255,0.85)",
                backgroundColor: isActive ? "rgba(255,255,255,0.2)" : "transparent",
                borderLeft: isActive ? "3px solid white" : "3px solid transparent",
                fontWeight: isActive ? "700" : "600",
                fontSize: "0.95rem",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                display: "block",
                position: "relative"
              })}
              onMouseEnter={(e) => {
                if (!e.currentTarget.style.backgroundColor.includes("0.2")) {
                  e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)";
                }
                e.currentTarget.style.transform = "translateX(4px)";
              }}
              onMouseLeave={(e) => {
                if (!e.currentTarget.style.backgroundColor.includes("0.2")) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
                e.currentTarget.style.transform = "translateX(0)";
              }}
            >
              Reports & Analytics
            </NavLink>
            <NavLink
              to="/manage-admins"
              onClick={handleNavClick}
              style={({ isActive }) => ({
                padding: "12px 0",
                borderRadius: "8px",
                textDecoration: "none",
                color: isActive ? "white" : "rgba(255,255,255,0.85)",
                backgroundColor: isActive ? "rgba(255,255,255,0.2)" : "transparent",
                borderLeft: isActive ? "3px solid white" : "3px solid transparent",
                fontWeight: isActive ? "700" : "600",
                fontSize: "0.95rem",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                display: "block",
                position: "relative"
              })}
              onMouseEnter={(e) => {
                if (!e.currentTarget.style.backgroundColor.includes("0.2")) {
                  e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)";
                }
                e.currentTarget.style.transform = "translateX(4px)";
              }}
              onMouseLeave={(e) => {
                if (!e.currentTarget.style.backgroundColor.includes("0.2")) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
                e.currentTarget.style.transform = "translateX(0)";
              }}
            >
              Manage Admins
            </NavLink>
            <NavLink
              to="/manage-port-staff"
              onClick={handleNavClick}
              style={({ isActive }) => ({
                padding: "12px 0",
                borderRadius: "8px",
                textDecoration: "none",
                color: isActive ? "white" : "rgba(255,255,255,0.85)",
                backgroundColor: isActive ? "rgba(255,255,255,0.2)" : "transparent",
                borderLeft: isActive ? "3px solid white" : "3px solid transparent",
                fontWeight: isActive ? "700" : "600",
                fontSize: "0.95rem",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                display: "block",
                position: "relative"
              })}
              onMouseEnter={(e) => {
                if (!e.currentTarget.style.backgroundColor.includes("0.2")) {
                  e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)";
                }
                e.currentTarget.style.transform = "translateX(4px)";
              }}
              onMouseLeave={(e) => {
                if (!e.currentTarget.style.backgroundColor.includes("0.2")) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
                e.currentTarget.style.transform = "translateX(0)";
              }}
            >
              Manage Port Staff
            </NavLink>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          style={{
            backgroundColor: "#e53935",
            color: "white",
            border: "none",
            padding: "10px 14px",
            borderRadius: "8px",
            fontWeight: "700",
            cursor: "pointer",
            width: "100%",
            fontSize: "0.85rem",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            marginTop: "20px",
            boxSizing: "border-box",
            flexShrink: 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#c62828";
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 8px 16px rgba(229, 57, 53, 0.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#e53935";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          Logout
        </button>
      </div>

      {/* Main Content Wrapper */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        width: !isMobile ? "calc(100% - 280px)" : "100%",
        minWidth: 0,
        boxSizing: "border-box",
        minHeight: "100vh",
        marginLeft: !isMobile ? "280px" : "0",
        overflowX: "hidden"
      }}>
        {/* Header */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: isMobile ? "14px 15px" : "18px 30px",
          backgroundColor: "white",
          borderBottom: "1px solid #e8eef5",
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
          backdropFilter: "blur(10px)",
          marginLeft: !isMobile ? "280px" : "0",
          width: !isMobile ? "calc(100% - 280px)" : "100%"
        }}>
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                backgroundColor: "transparent",
                border: "none",
                fontSize: "1.5rem",
                color: "#3b7ecc",
                cursor: "pointer",
                padding: "8px",
                borderRadius: "8px",
                transition: "all 0.3s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "40px",
                minHeight: "40px"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(59, 126, 204, 0.1)";
                e.currentTarget.style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
          )}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: isMobile ? "10px" : "16px",
            flex: 1,
            marginLeft: isMobile ? "10px" : "0"
          }}>
            <img
              src="/logoo.png"
              alt="PMS Port Logo"
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "8px",
                objectFit: "contain",
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.08)",
                flexShrink: 0
              }}
            />
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "2px",
              overflow: "hidden"
            }}>
              <h2 style={{
                fontWeight: "900",
                fontSize: isMobile ? "0.95rem" : "1.1rem",
                color: "#1a1a1a",
                margin: "0",
                letterSpacing: "-0.2px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}>
                PMS Port
              </h2>
              <p style={{
                fontSize: "0.7rem",
                color: "#999",
                margin: "0",
                fontWeight: "500",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}>
                Superadmin Portal
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          padding: isMobile ? "20px 16px" : "30px",
          paddingTop: isMobile ? "100px" : "110px",
          overflowY: "auto",
          overflowX: "hidden",
          width: "100%",
          boxSizing: "border-box",
          background: "linear-gradient(135deg, rgba(15, 107, 127, 0.08) 0%, rgba(13, 79, 161, 0.08) 100%), url('/bg5.avif') center/cover fixed",
          position: "relative"
        }}>
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(255, 255, 255, 0.72)",
            pointerEvents: "none",
            zIndex: 0
          }} />
          <div style={{
            position: "relative",
            zIndex: 1,
            minHeight: "100%",
            width: "100%",
            boxSizing: "border-box"
          }}>
            {children}
          </div>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          zIndex: 2000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backdropFilter: "blur(4px)",
          padding: isMobile ? "16px" : "0"
        }}>
          <div style={{
            backgroundColor: "white",
            borderRadius: "16px",
            boxShadow: "0 10px 40px rgba(0, 0, 0, 0.2)",
            padding: isMobile ? "20px" : "40px",
            maxWidth: "420px",
            width: "100%",
            textAlign: "center",
            animation: "slideUp 0.3s ease-out"
          }}>
            <h3 style={{
              margin: "0 0 16px 0",
              color: "#1a1a1a",
              fontSize: isMobile ? "1.2rem" : "1.4rem",
              fontWeight: "700",
              letterSpacing: "-0.3px"
            }}>
              Confirm Logout
            </h3>
            <p style={{
              color: "#666",
              margin: "0 0 20px 0",
              fontSize: isMobile ? "0.8rem" : "0.95rem",
              lineHeight: "1.6",
              fontWeight: "400"
            }}>
              Are you sure you want to log out?
            </p>
            <div style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: isMobile ? "nowrap" : "wrap"
            }}>
              <button
                onClick={cancelLogout}
                disabled={isLoggingOut}
                style={{
                  flex: isMobile ? "1" : "0 1 auto",
                  padding: isMobile ? "10px 16px" : "12px 32px",
                  backgroundColor: "#e8e8e8",
                  color: "#333",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: "600",
                  cursor: isLoggingOut ? "not-allowed" : "pointer",
                  fontSize: isMobile ? "0.85rem" : "0.95rem",
                  transition: "all 0.3s ease",
                  minWidth: isMobile ? "auto" : "130px",
                  opacity: isLoggingOut ? 0.6 : 1,
                  whiteSpace: "nowrap"
                }}
                onMouseEnter={(e) => {
                  if (!isLoggingOut) {
                    e.target.style.backgroundColor = "#d0d0d0";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoggingOut) {
                    e.target.style.backgroundColor = "#e8e8e8";
                  }
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                disabled={isLoggingOut}
                style={{
                  flex: isMobile ? "1" : "0 1 auto",
                  padding: isMobile ? "10px 16px" : "12px 32px",
                  backgroundColor: "#d84545",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: "600",
                  cursor: isLoggingOut ? "not-allowed" : "pointer",
                  fontSize: isMobile ? "0.85rem" : "0.95rem",
                  transition: "all 0.3s ease",
                  minWidth: isMobile ? "auto" : "130px",
                  opacity: isLoggingOut ? 0.7 : 1,
                  whiteSpace: "nowrap"
                }}
                onMouseEnter={(e) => {
                  if (!isLoggingOut) {
                    e.target.style.backgroundColor = "#c53535";
                    e.target.style.transform = "translateY(-1px)";
                    e.target.style.boxShadow = "0 4px 12px rgba(216, 69, 69, 0.3)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoggingOut) {
                    e.target.style.backgroundColor = "#d84545";
                    e.target.style.transform = "translateY(0)";
                    e.target.style.boxShadow = "none";
                  }
                }}
              >
                {isLoggingOut ? "Logging out..." : "Yes, Log Out"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

export default SuperadminLayout;
