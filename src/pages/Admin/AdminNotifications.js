import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../firebase";
import { doc, getDoc, collection, query, where, onSnapshot, updateDoc, addDoc, getDocs, deleteDoc } from "firebase/firestore";
import AdminLayout from "./AdminLayout";
import { formatTime12Hour } from "../../utils/timeFormatter";
import { isNotificationUnread } from "../../hooks/useUnreadNotificationCount";
import { getNotificationCardStyles, NotificationDot } from "../../components/NotificationBadge";

const ANNOUNCEMENT_TEMPLATES = [
  {
    id: "weather-advisory",
    title: "Weather Advisory",
    message:
      "Passengers are advised to monitor weather conditions and arrive early at the port. Please stay updated for further announcements regarding affected trips.",
  },
  {
    id: "schedule-adjustment",
    title: "Schedule Adjustment Notice",
    message:
      "Please be informed that selected trip schedules have been adjusted. Passengers are encouraged to review their booking details for updated departure times.",
  },
  {
    id: "port-arrival",
    title: "Port Arrival Reminder",
    message:
      "All passengers are advised to arrive at the port at least 30 minutes before departure to allow sufficient time for boarding and verification.",
  },
  {
    id: "system-maintenance",
    title: "Scheduled System Maintenance",
    message:
      "The PMS Port system will undergo maintenance on the scheduled date and time. Some services may be temporarily unavailable during this period.",
  },
  {
    id: "port-operations",
    title: "Port Operations Advisory",
    message:
      "Please review the latest travel requirements and port guidelines before your scheduled trip to avoid delays during boarding.",
  },
];

function AdminNotifications() {
  const NOTIFICATIONS_PER_PAGE = 10;
  const normalizeBoatName = (boatName) => (boatName || "").trim().toLowerCase();
  const [adminData, setAdminData] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationPage, setNotificationPage] = useState(1);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [showAnnounceForm, setShowAnnounceForm] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [announcement, setAnnouncement] = useState({
    title: "",
    message: ""
  });
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [deleteActions, setDeleteActions] = useState({});
  const gesture = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch admin info
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthReady(true);

      if (!user) {
        setAdminData(null);
        setNotifications([]);
        return;
      }

      try {
        if (user) {
          const docRef = doc(db, "admins", user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setAdminData(docSnap.data());
          } else {
            setAdminData(null);
          }
        }
      } catch (error) {
        console.error("Error fetching admin data:", error);
        setAdminData(null);
      }

    });

    return () => unsubscribe();
  }, []);

  // Real-time listener for notifications
  useEffect(() => {
    if (adminData?.assignedBoat) {
      const q = query(
        collection(db, "notifications"),
        where("recipientType", "==", "admin")
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const assignedBoat = normalizeBoatName(adminData.assignedBoat);
        const currentUserId = auth.currentUser?.uid;

        const notificationList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || new Date()
        })).filter((notif) => {
          const notificationBoat = normalizeBoatName(notif.boat);

          if (notificationBoat) {
            return notificationBoat === assignedBoat;
          }

          if (notif.adminId && currentUserId) {
            return notif.adminId === currentUserId;
          }

          // Support legacy admin notifications that were saved without boat/adminId.
          return true;
        });

        // Sort by date descending (latest first)
        notificationList.sort((a, b) => b.createdAt - a.createdAt);
        setNotifications(notificationList);
      });

      return () => unsubscribe();
    }
  }, [adminData?.assignedBoat]);

  const unreadCount = notifications.filter((notif) => isNotificationUnread(notif)).length;
  const totalNotificationPages = Math.max(1, Math.ceil(notifications.length / NOTIFICATIONS_PER_PAGE));
  const paginatedNotifications = notifications.slice(
    (notificationPage - 1) * NOTIFICATIONS_PER_PAGE,
    notificationPage * NOTIFICATIONS_PER_PAGE
  );

  useEffect(() => {
    setNotificationPage((currentPage) => Math.min(currentPage, totalNotificationPages));
  }, [totalNotificationPages]);

  const markAsRead = async (notificationId) => {
    try {
      await updateDoc(doc(db, "notifications", notificationId), {
        isRead: true
      });
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const handleNotificationClick = (notif) => {
    if (isNotificationUnread(notif)) {
      markAsRead(notif.id);
    }
  };

  const handleDeleteNotification = async (notif) => {
    if (!window.confirm("Delete this notification?")) return;

    try {
      await deleteDoc(doc(db, "notifications", notif.id));
      setDeleteActions((current) => {
        const next = { ...current };
        delete next[notif.id];
        return next;
      });
    } catch (error) {
      console.error("Error deleting admin notification:", error);
      alert("Unable to delete this notification. Please try again.");
    }
  };

  const revealDeleteActions = (notificationId) => {
    setDeleteActions((current) => ({ ...current, [notificationId]: true }));
  };

  const restoreNotification = (notificationId) => {
    setDeleteActions((current) => {
      const next = { ...current };
      delete next[notificationId];
      return next;
    });
  };

  const handlePointerDown = (event, notificationId) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = {
      id: notificationId,
      x: event.clientX,
      y: event.clientY,
      wasRevealed: Boolean(deleteActions[notificationId]),
      moved: false
    };
  };

  const handlePointerMove = (event) => {
    if (!gesture.current) return;
    const distanceX = event.clientX - gesture.current.x;
    const distanceY = event.clientY - gesture.current.y;

    if (Math.abs(distanceX) > Math.abs(distanceY) && Math.abs(distanceX) > 10) {
      gesture.current.moved = true;
      if (distanceX < -40) {
        revealDeleteActions(gesture.current.id);
      } else if (gesture.current.wasRevealed && distanceX > 25) {
        restoreNotification(gesture.current.id);
      }
      event.preventDefault();
    }
  };

  const handlePointerUp = () => {
    gesture.current = null;
  };

  const handleSendAnnouncement = async (e) => {
    e.preventDefault();
    const trimmedTitle = announcement.title.trim();
    const trimmedMessage = announcement.message.trim();

    if (!trimmedTitle || !trimmedMessage) {
      alert("Please fill in the title and message.");
      return;
    }

    if (!adminData?.assignedBoat) {
      alert("Admin profile is missing an assigned boat. Please check the admin account setup.");
      return;
    }

    setIsLoading(true);
    try {
      const adminAnnouncementPromise = addDoc(collection(db, "notifications"), {
        adminId: auth.currentUser?.uid || "",
        type: "announcement",
        title: trimmedTitle,
        message: trimmedMessage,
        recipientType: "admin",
        boat: adminData.assignedBoat,
        isRead: false,
        createdAt: new Date(),
        audienceCount: 0
      });

      // Get all trips for this boat
      const tripsQuery = query(
        collection(db, "schedules"),
        where("boat", "==", adminData.assignedBoat)
      );
      const tripsSnap = await getDocs(tripsQuery);
      const tripIds = tripsSnap.docs.map(doc => doc.id);

      // Get all unique users with bookings for these trips
      const userIds = new Set();
      for (const tripId of tripIds) {
        const bookingsQuery = query(
          collection(db, "bookings"),
          where("tripId", "==", tripId)
        );
        const bookingsSnap = await getDocs(bookingsQuery);
        bookingsSnap.docs.forEach(doc => {
          if (doc.data().userId) {
            userIds.add(doc.data().userId);
          }
        });
      }

      // Create notifications for all users
      const notificationPromises = Array.from(userIds).map(userId =>
        addDoc(collection(db, "notifications"), {
          userId,
          type: "announcement",
          title: trimmedTitle,
          message: trimmedMessage,
          recipientType: "user",
          boat: adminData.assignedBoat,
          isRead: false,
          createdAt: new Date()
        })
      );

      const adminAnnouncementRef = await adminAnnouncementPromise;

      await updateDoc(doc(db, "notifications", adminAnnouncementRef.id), {
        audienceCount: userIds.size
      });

      await Promise.all(notificationPromises);

      if (userIds.size === 0) {
        alert("Notification saved for admin. No users with bookings were found for this boat yet.");
      } else {
        alert(`Announcement sent to ${userIds.size} users and displayed in admin notifications.`);
      }

      setAnnouncement({ title: "", message: "" });
      setSelectedTemplate("");
      setShowAnnounceForm(false);
    } catch (error) {
      console.error("Error sending announcement:", error);
      alert("Error sending announcement: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getNotificationIcon = (type) => {
    const iconStyle = {
      width: "24px",
      height: "24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    };

    switch(type) {
      case "trip_cancelled":
        return (
          <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" color="#f44336">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        );
      case "trip_updated":
        return (
          <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" color="#2196f3">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        );
      case "announcement":
        return (
          <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" color="#4caf50">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            <circle cx="9" cy="10" r="1"/>
            <circle cx="12" cy="10" r="1"/>
            <circle cx="15" cy="10" r="1"/>
          </svg>
        );
      default:
        return (
          <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" color="#999">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        );
    }
  };

  return (
    <AdminLayout active="notifications">
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: isMobile ? "16px" : "24px",
        gap: "12px",
        flexWrap: "wrap"
      }}>
        <h2 style={{
          fontWeight: "800",
          fontSize: isMobile ? "1.1rem" : "1.3rem",
          color: "#1a1a1a",
          marginTop: "0",
          marginBottom: "0",
          letterSpacing: "0.3px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap"
        }}>
          Notifications
          {unreadCount > 0 && (
            <span style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#f44336",
              background: "#ffebee",
              padding: "4px 10px",
              borderRadius: "999px",
            }}>
              {unreadCount} new
            </span>
          )}
        </h2>
        <button
          onClick={() => setShowAnnounceForm(!showAnnounceForm)}
          style={{
            padding: "8px 16px",
            background: "#2196f3",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: isMobile ? "0.85rem" : "0.95rem",
            fontWeight: 600,
            whiteSpace: "nowrap"
          }}
        >
          {showAnnounceForm ? "Cancel" : "New Announcement"}
        </button>
      </div>

      {adminData && (
        <p style={{
          fontSize: isMobile ? "0.8rem" : "0.95rem",
          color: "#666",
          marginBottom: isMobile ? "16px" : "20px",
          fontWeight: "500"
        }}>
          Updates and notifications for <strong>{adminData.assignedBoat}</strong>
        </p>
      )}

      {authReady && !adminData?.assignedBoat && (
        <p style={{
          fontSize: isMobile ? "0.8rem" : "0.92rem",
          color: "#d32f2f",
          marginBottom: isMobile ? "16px" : "20px",
          fontWeight: "600",
          background: "#fff5f5",
          border: "1px solid #ffcdd2",
          borderRadius: "8px",
          padding: "10px 12px"
        }}>
          No assigned boat was found for this admin account. Announcements cannot be sent until the admin profile is complete.
        </p>
      )}

      {/* Announcement Form */}
      {showAnnounceForm && (
        <div style={{
          background: "#f5f5f5",
          padding: isMobile ? "16px 15px" : "24px 20px",
          borderRadius: "10px",
          marginBottom: "24px",
          border: "2px solid #2196f3",
          boxShadow: "0 2px 8px rgba(33, 150, 243, 0.1)"
        }}>
          <h3 style={{
            marginTop: "0",
            marginBottom: "16px",
            fontSize: isMobile ? "1rem" : "1.1rem",
            color: "#1a1a1a"
          }}>
            Send Announcement to Users
          </h3>
          <form onSubmit={handleSendAnnouncement}>
            <div style={{ marginBottom: "16px" }}>
              <label style={{
                display: "block",
                marginBottom: "6px",
                fontWeight: 600,
                fontSize: isMobile ? "0.9rem" : "0.95rem",
                color: "#333"
              }}>
                Choose a Built-in Notification
              </label>
              <select
                value={selectedTemplate}
                onChange={(e) => {
                  const template = ANNOUNCEMENT_TEMPLATES.find((item) => item.id === e.target.value);
                  setSelectedTemplate(e.target.value);
                  if (template) {
                    setAnnouncement({ title: template.title, message: template.message });
                  }
                }}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  fontSize: "0.95rem",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  background: "#fff"
                }}
              >
                <option value="">Select a notification template</option>
                {ANNOUNCEMENT_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>{template.title}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{
                display: "block",
                marginBottom: "6px",
                fontWeight: 600,
                fontSize: isMobile ? "0.9rem" : "0.95rem",
                color: "#333"
              }}>
                Title
              </label>
              <input
                type="text"
                placeholder="Announcement title (e.g., 'Schedule Update')"
                value={announcement.title}
                onChange={(e) => setAnnouncement({ ...announcement, title: e.target.value })}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  fontSize: "0.95rem",
                  boxSizing: "border-box",
                  fontFamily: "inherit"
                }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{
                display: "block",
                marginBottom: "6px",
                fontWeight: 600,
                fontSize: isMobile ? "0.9rem" : "0.95rem",
                color: "#333"
              }}>
                Message
              </label>
              <textarea
                placeholder="Write your announcement here..."
                value={announcement.message}
                onChange={(e) => setAnnouncement({ ...announcement, message: e.target.value })}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  fontSize: "0.95rem",
                  minHeight: isMobile ? "100px" : "120px",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  resize: "vertical"
                }}
              />
            </div>

            <p style={{
              fontSize: "0.85rem",
              color: "#666",
              margin: "8px 0 16px 0",
              background: "white",
              padding: "10px 12px",
              borderRadius: "6px",
              borderLeft: "3px solid #2196f3"
            }}>
              This will be sent only to users who have bookings on <strong>{adminData?.assignedBoat || "your assigned boat"}</strong>'s trips.
            </p>

            <button
              type="submit"
              disabled={isLoading || !announcement.title.trim() || !announcement.message.trim() || !adminData?.assignedBoat}
              style={{
                padding: "12px 24px",
                background: isLoading || !announcement.title.trim() || !announcement.message.trim() || !adminData?.assignedBoat ? "#ccc" : "#4caf50",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: isLoading || !announcement.title.trim() || !announcement.message.trim() || !adminData?.assignedBoat ? "not-allowed" : "pointer",
                fontSize: "0.95rem",
                fontWeight: 600,
                transition: "background 0.3s"
              }}
            >
              {isLoading ? "Sending..." : "Send Announcement"}
            </button>
          </form>
        </div>
      )}

      {/* Notifications List */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: isMobile ? "10px" : "15px"
      }}>
        {notifications.length === 0 ? (
          <div style={{
            background: "white",
            padding: isMobile ? "20px 15px" : "40px 30px",
            borderRadius: "12px",
            border: "1px solid #e0e0e0",
            textAlign: "center",
            color: "#999"
          }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "10px" }}></div>
            <p style={{ fontSize: isMobile ? "0.85rem" : "1rem" }}>No notifications yet</p>
          </div>
        ) : (
          paginatedNotifications.map((notif) => {
            const isUnread = isNotificationUnread(notif);
            const cardStyles = getNotificationCardStyles(!isUnread, isMobile);
            const isDeleteRevealed = deleteActions[notif.id];
            const actionWidth = isMobile ? 76 : 88;

            return (
            <div key={notif.id} style={{ position: "relative", overflow: "hidden", borderRadius: "12px", touchAction: "pan-y" }}>
              <div style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                width: `${actionWidth}px`,
                display: "flex",
                flexDirection: "column",
                zIndex: 0
              }}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    restoreNotification(notif.id);
                  }}
                  style={{
                    flex: 1,
                    border: 0,
                    borderRadius: "0 12px 0 0",
                    background: "#607d8b",
                    color: "white",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDeleteNotification(notif);
                  }}
                  style={{
                    flex: 1,
                    border: 0,
                    borderRadius: "0 0 12px 0",
                    background: "#f44336",
                    color: "white",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  Delete
                </button>
              </div>
              <div
                style={{
                  ...cardStyles.card,
                  position: "relative",
                  zIndex: 1,
                  transform: isDeleteRevealed ? `translateX(-${actionWidth}px)` : "translateX(0)",
                  transition: gesture.current ? "none" : "transform 0.2s ease"
                }}
                onClick={() => handleNotificationClick(notif)}
                onDoubleClick={() => revealDeleteActions(notif.id)}
                onPointerDown={(event) => handlePointerDown(event, notif.id)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onMouseEnter={(e) => {
                  if (isUnread) e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = isUnread ? "0 2px 8px rgba(0,0,0,0.06)" : "none";
                }}
              >
              {isUnread && (
                <NotificationDot
                  size={10}
                  style={{
                    position: "absolute",
                    top: "12px",
                    right: "12px",
                    boxShadow: "0 0 0 2px #ffffff",
                  }}
                />
              )}
              
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", opacity: isUnread ? 1 : 0.88 }}>
                <div style={{
                  fontSize: "1.5rem",
                  minWidth: "30px",
                  textAlign: "center",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  filter: isUnread ? "none" : "grayscale(1)",
                  opacity: isUnread ? 1 : 0.65,
                }}>
                  {getNotificationIcon(notif.type)}
                </div>
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={cardStyles.title}>
                    {notif.title}
                  </h4>
                  
                  <p style={cardStyles.message}>
                    {notif.message}
                  </p>

                  {notif.tripDetails && (
                    <div style={{
                      background: isUnread ? "rgba(0,0,0,0.03)" : "rgba(0,0,0,0.02)",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      fontSize: isMobile ? "0.7rem" : "0.85rem",
                      color: isUnread ? "#666" : "#9e9e9e",
                      marginBottom: "8px",
                      border: "1px solid rgba(0,0,0,0.05)"
                    }}>
                      <div><strong>Trip:</strong> {notif.tripDetails.name}</div>
                      <div><strong>Date:</strong> {notif.tripDetails.date}</div>
                      <div><strong>Time:</strong> {formatTime12Hour(notif.tripDetails.departure)} - {formatTime12Hour(notif.tripDetails.arrival)}</div>
                    </div>
                  )}

                  {notif.type === "announcement" && typeof notif.audienceCount === "number" && (
                    <div style={{
                      fontSize: isMobile ? "0.72rem" : "0.84rem",
                      color: isUnread ? "#2e7d32" : "#9e9e9e",
                      fontWeight: 600,
                      marginBottom: "8px"
                    }}>
                      Sent to {notif.audienceCount} user{notif.audienceCount === 1 ? "" : "s"}
                    </div>
                  )}

                  <div style={cardStyles.timestamp}>
                    {new Date(notif.createdAt).toLocaleString()}
                    {!isUnread && (
                      <span style={{ marginLeft: "8px", fontStyle: "italic" }}>· Viewed</span>
                    )}
                  </div>
                </div>
              </div>
              </div>
            </div>
          );
          })
        )}
      </div>

      {notifications.length > NOTIFICATIONS_PER_PAGE && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: isMobile ? "10px" : "16px",
          marginTop: isMobile ? "18px" : "24px",
          flexWrap: "wrap"
        }}>
          <button
            type="button"
            onClick={() => setNotificationPage((page) => Math.max(1, page - 1))}
            disabled={notificationPage === 1}
            style={{
              padding: isMobile ? "8px 12px" : "9px 16px",
              border: "1px solid #2196f3",
              borderRadius: "6px",
              background: notificationPage === 1 ? "#e0e0e0" : "#2196f3",
              color: notificationPage === 1 ? "#888" : "white",
              cursor: notificationPage === 1 ? "not-allowed" : "pointer",
              fontWeight: 700
            }}
          >
            Previous
          </button>
          <span style={{
            color: "#666",
            fontSize: isMobile ? "0.8rem" : "0.9rem",
            fontWeight: 600
          }}>
            Page {notificationPage} of {totalNotificationPages}
          </span>
          <button
            type="button"
            onClick={() => setNotificationPage((page) => Math.min(totalNotificationPages, page + 1))}
            disabled={notificationPage === totalNotificationPages}
            style={{
              padding: isMobile ? "8px 12px" : "9px 16px",
              border: "1px solid #2196f3",
              borderRadius: "6px",
              background: notificationPage === totalNotificationPages ? "#e0e0e0" : "#2196f3",
              color: notificationPage === totalNotificationPages ? "#888" : "white",
              cursor: notificationPage === totalNotificationPages ? "not-allowed" : "pointer",
              fontWeight: 700
            }}
          >
            Next
          </button>
        </div>
      )}
    </AdminLayout>
  );
}

export default AdminNotifications;
