import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { useAdminUnreadNotificationCount } from "../../hooks/useUnreadNotificationCount";
import { NavNotificationBadge } from "../../components/NotificationBadge";
import { useAuthReloadKey, useAuthUser } from "../../hooks/useAuthUser";
import { useAuth } from "../../hooks/AuthContext";
import { getStaffAccount } from "../../utils/staffAccount";

function AdminLayout({ children, active }) {
  const navigate = useNavigate();
  const [adminData, setAdminData] = useState(null);
  const [adminId, setAdminId] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  const { user, authReady } = useAuthUser();
  const { role } = useAuth();
  const reloadKey = useAuthReloadKey();
  const unreadNotificationCount = useAdminUnreadNotificationCount(
    role === "portstaff" ? null : adminData?.assignedBoat,
    role === "portstaff" ? null : adminId
  );

  const handlePortStaffSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Unable to sign out Port Staff:", error);
      alert(`Unable to sign out: ${error.message}`);
    }
  };

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch current admin info from Firestore
  useEffect(() => {
    if (!authReady) return;

    const fetchAdminData = async () => {
      if (!user) {
        setAdminId(null);
        setAdminData(null);
        return;
      }

      setAdminId(user.uid);

      try {
        const account = await getStaffAccount(user.uid);
        if (account) {
          setAdminData(account.data);
        } else {
          console.error("Staff account document not found");
          setAdminData(null);
        }
      } catch (error) {
        console.error("Error fetching staff account data:", error);
        setAdminData(null);
      }
    };

    fetchAdminData();
  }, [authReady, user, reloadKey]);



  const menuItems = [
    { 
      to: "/admin-dashboard", 
      label: "Reports & Analytics", 
      key: "reports",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="3" x2="3" y2="20"></line>
          <line x1="3" y1="20" x2="21" y2="20"></line>
          <rect x="6" y="14" width="3" height="6"></rect>
          <rect x="11" y="10" width="3" height="10"></rect>
          <rect x="16" y="6" width="3" height="14"></rect>
        </svg>
      )
    },
    { 
      to: "/booking-management", 
      label: "Booking Management", 
      key: "booking",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 11 12 14 22 4"></polyline>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
        </svg>
      )
    },
    { 
      to: "/payment-management", 
      label: "Payment Management", 
      key: "payment",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
          <line x1="1" y1="10" x2="23" y2="10"></line>
          <circle cx="18" cy="15" r="1"></circle>
        </svg>
      )
    },
    { 
      to: "/schedule-management", 
      label: "Schedule Management", 
      key: "schedule",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
          <circle cx="9" cy="16" r="1"></circle>
          <circle cx="12" cy="16" r="1"></circle>
          <circle cx="15" cy="16" r="1"></circle>
        </svg>
      )
    },
    { 
      to: "/discount-management", 
      label: "Discount Management", 
      key: "discount",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
          <circle cx="8" cy="8" r="1.5"></circle>
        </svg>
      )
    },
    { 
      to: "/admin-notifications", 
      label: "Notifications", 
      key: "notifications",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
      )
    },
    {
      to: "/port-staff-management",
      label: "Port Staff",
      key: "port-staff",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M20 8v6"></path>
          <path d="M23 11h-6"></path>
        </svg>
      )
    },
    {
      to: "/qr-scanner",
      label: "Scan QR",
      key: "scan",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
          <path d="M14 14h3v3h-3zM20 14v2M14 20h2M20 19v2"></path>
        </svg>
      )
    }
  ];
  const visibleMenuItems = role === "portstaff"
    ? menuItems.filter((item) => ["reports", "booking", "payment", "schedule", "scan"].includes(item.key))
    : menuItems;

  return (
    <div style={{ display: "flex", height: "100vh", minHeight: 0, background: "#f5f9fc", overflow: "hidden" }}>
      {/* Mobile Sidebar Overlay */}
      {isMobile && sidebarOpen && (
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

      {/* Sidebar */}
      <div
        style={{
          width: isMobile && !sidebarOpen ? "0" : isMobile ? "280px" : "280px",
          background: "linear-gradient(135deg, #3b7ecc 0%, #4a8bd4 50%, #5a99db 100%)",
          color: "white",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "25px 20px",
          overflowY: "hidden",
          position: "fixed",
          height: "100vh",
          zIndex: 999,
          transition: "transform 0.3s ease",
          transform: isMobile && !sidebarOpen ? "translateX(-100%)" : "translateX(0)",
          boxShadow: "4px 0 15px rgba(59, 126, 204, 0.15)",
          left: 0,
          top: 0
        }}
      >
        {/* Branding Header */}
        <div>
          {/* Logo Section */}
          <div style={{
            paddingBottom: "12px",
            borderBottom: "1px solid rgba(255,255,255,0.2)",
            marginBottom: "12px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px"
          }}>
            <div style={{
              width: "100px",
              height: "70px",
              borderRadius: "100px 100px 0 0",
              backgroundColor: "rgba(255, 255, 255, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              boxShadow: "0 8px 16px rgba(0, 0, 0, 0.2)"
            }}>
              <img 
                src="/logoo.png" 
                alt="PMS Port Logo"
                style={{
                  width: "80px",
                  height: "50px",
                  objectFit: "contain"
                }}
              />
            </div>
            <div style={{
              textAlign: "center"
            }}>
              <h3 style={{
                fontWeight: "900",
                fontSize: "0.95rem",
                margin: "0",
                color: "white",
                letterSpacing: "-0.3px"
              }}>
                PMS Port
              </h3>
              <p style={{
                fontSize: "0.6rem",
                opacity: 0.85,
                margin: "2px 0 0 0",
                fontWeight: 700,
                letterSpacing: "0.4px",
                textTransform: "uppercase"
              }}>
                {role === "portstaff" ? "Port Staff Portal" : "Admin Portal"}
              </p>
            </div>
          </div>

          {adminData && (
            <div style={{
              background: "rgba(255, 255, 255, 0.15)",
              padding: "14px",
              borderRadius: "10px",
              border: "1px solid rgba(255, 255, 255, 0.25)",
              backdropFilter: "blur(10px)",
              marginBottom: "20px"
            }}>
              {/* Boat Info */}
              <div style={{ marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "rgba(255,255,255,0.85)", flexShrink: 0 }}>
                    <path d="M3 18h18"></path>
                    <path d="M5 5h14l2 13H3l2-13z"></path>
                  </svg>
                  <p style={{ fontSize: "0.6rem", opacity: 0.75, marginBottom: "0", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px", color: "rgba(255,255,255,0.85)" }}>
                    Boat
                  </p>
                </div>
                <p style={{ fontSize: "0.95rem", fontWeight: 900, marginBottom: "0", color: "#ffffff", letterSpacing: "-0.2px", marginTop: "4px" }}>
                  {adminData.assignedBoat || "Not Assigned"}
                </p>
              </div>

              {/* Route Info */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "rgba(255,255,255,0.85)", flexShrink: 0 }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  <p style={{ fontSize: "0.6rem", opacity: 0.75, marginBottom: "0", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px", color: "rgba(255,255,255,0.85)" }}>
                    Route
                  </p>
                </div>
                <p style={{ fontSize: "0.9rem", fontWeight: 900, marginBottom: "0", color: "#ffffff", letterSpacing: "-0.2px", lineHeight: "1.2", marginTop: "4px" }}>
                  {adminData.assignedRoute || "Not Assigned"}
                </p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ marginTop: "20px" }}>
            <p style={{ fontSize: "0.75rem", fontWeight: 800, color: "rgba(255,255,255,0.6)", marginBottom: "15px", textTransform: "uppercase", letterSpacing: "1px" }}>
              Navigation
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {visibleMenuItems.map((item) => (
                <Link
                  key={item.key}
                  to={item.to}
                  onClick={() => isMobile && setSidebarOpen(false)}
                  style={{
                    padding: "12px 15px",
                    borderRadius: "8px",
                    textDecoration: "none",
                    color: active === item.key ? "white" : "rgba(255,255,255,0.8)",
                    background: active === item.key ? "rgba(255,255,255,0.2)" : "transparent",
                    borderLeft: active === item.key ? "4px solid white" : "4px solid transparent",
                    fontWeight: active === item.key ? 700 : 500,
                    fontSize: "0.95rem",
                    transition: "all 0.3s ease",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    position: "relative"
                  }}
                  onMouseEnter={(e) => {
                    if (active !== item.key) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (active !== item.key) {
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", color: "currentColor", flexShrink: 0 }}>
                    {item.icon}
                  </span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.key === "notifications" && (
                    <NavNotificationBadge count={unreadNotificationCount} inline />
                  )}
                </Link>
              ))}
              {role === "portstaff" && (
                <button
                  type="button"
                  onClick={handlePortStaffSignOut}
                  style={{
                    marginTop: 8,
                    padding: "12px 15px",
                    border: "1px solid rgba(255,255,255,0.35)",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.12)",
                    color: "white",
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          minHeight: 0,
          marginLeft: isMobile ? "0" : "280px",
          width: isMobile ? "100%" : "calc(100% - 280px)"
        }}
      >
        {/* Top Bar */}
        <div
          style={{
            background: "white",
            padding: isMobile ? "12px 15px" : "15px 25px",
            borderBottom: "1px solid #d8e8f5",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            position: "relative",
            zIndex: 2,
            flexShrink: 0
          }}
        >
          {isMobile && <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                background: "none",
                border: "none",
                fontSize: "1.3rem",
                cursor: "pointer",
                color: "#3b7ecc",
                padding: "4px",
                borderRadius: "8px",
                transition: "all 0.3s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "36px",
                minHeight: "36px",
                position: "relative"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(59, 126, 204, 0.1)";
                e.currentTarget.style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
              <NavNotificationBadge count={unreadNotificationCount} />
            </button>}
          <h2 style={{ fontSize: isMobile ? "1.05rem" : "1.3rem", fontWeight: 800, color: "#2c5aa0", margin: 0, flex: 1 }}>
            {role === "portstaff" ? "Port Staff Portal" : "Admin Dashboard"}
          </h2>
          {role !== "portstaff" && <button
            onClick={() => navigate("/admin-profile")}
            title="Account"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              transition: "all 0.3s ease",
              position: "relative",
              width: isMobile ? "36px" : "40px",
              height: isMobile ? "36px" : "40px",
              borderRadius: "50%",
              overflow: "hidden"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            <img 
              src={adminData?.profilePicture || "/profile.png"} 
              alt="Profile"
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                objectFit: "cover"
              }}
            />
          </button>}
        </div>

        {/* Content Area */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            padding: isMobile ? "16px 12px" : "30px",
            overflowY: "auto",
            overscrollBehavior: "contain",
            background: "linear-gradient(135deg, rgba(15, 107, 127, 0.08) 0%, rgba(13, 79, 161, 0.08) 100%), url('/bg5.avif') center/cover fixed",
            position: "relative"
          }}
        >
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
            minHeight: "100%"
          }}>
            {children}
          </div>
        </div>
      </div>


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

export default AdminLayout;
