import { useEffect, useState } from "react";
import { auth, db } from "../../firebase";
import { collection, query, where, onSnapshot, updateDoc, doc, addDoc } from "firebase/firestore";
import { formatTime12Hour } from "../../utils/timeFormatter";
import { useNavigate } from "react-router-dom";
import { notifyRefundRequest } from "../../utils/notificationHelper";
import { isNotificationUnread } from "../../hooks/useUnreadNotificationCount";
import { getNotificationCardStyles, NotificationDot } from "../../components/NotificationBadge";

function UserNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [processingAction, setProcessingAction] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Real-time listener for user notifications
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      navigate("/login");
      return;
    }

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      where("recipientType", "==", "user")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notificationList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date()
      }));
      // Sort by date descending (latest first)
      notificationList.sort((a, b) => b.createdAt - a.createdAt);
      setNotifications(notificationList);
    });

    return () => unsubscribe();
  }, [navigate]);

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

  const unreadCount = notifications.filter((notif) => isNotificationUnread(notif)).length;

  const handleRefundRequest = async (notif) => {
    try {
      setProcessingAction({ ...processingAction, [notif.id]: true });
      
      const user = auth.currentUser;
      if (!user) return;

      // Create refund request in Firestore
      const refundData = {
        userId: user.uid,
        bookingId: notif.bookingId,
        tripId: notif.tripId || notif.tripDetails?.id,
        tripName: notif.tripDetails?.name,
        boat: notif.tripDetails?.boat || null,
        amount: notif.bookingAmount || 0,
        reason: "Trip Cancelled",
        status: "pending",
        notificationId: notif.id,
        createdAt: new Date(),
        userEmail: user.email,
      };

      await addDoc(collection(db, "refund_requests"), refundData);

      notifyRefundRequest(refundData, refundData.boat).catch((error) =>
        console.warn("Refund admin notification failed:", error)
      );

      // Update notification to track the action
      await updateDoc(doc(db, "notifications", notif.id), {
        userAction: "refund_requested",
        actionTimestamp: new Date()
      });

      alert("Refund request submitted. We'll process it shortly!");
      setProcessingAction({ ...processingAction, [notif.id]: false });
    } catch (error) {
      console.error("Error submitting refund request:", error);
      alert("Error submitting refund request");
      setProcessingAction({ ...processingAction, [notif.id]: false });
    }
  };

  const handleBookAnother = async (notif) => {
    try {
      setProcessingAction({ ...processingAction, [notif.id]: true });
      
      // Update notification to track the action
      await updateDoc(doc(db, "notifications", notif.id), {
        userAction: "booking_another",
        actionTimestamp: new Date()
      });

      navigate("/schedule");
    } catch (error) {
      console.error("Error:", error);
      navigate("/schedule");
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
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, rgba(255, 255, 255, 0.45) 0%, rgba(240, 248, 255, 0.40) 100%), url('/bg5.avif') center/cover fixed",
      paddingTop: isMobile ? "72px" : "0",
      padding: isMobile ? "14px 10px" : "40px 20px"
    }}>
      <div style={{
        maxWidth: "900px",
        margin: "0 auto"
      }}>
        <h1 style={{
          textAlign: "center",
          fontSize: isMobile ? "1.2rem" : "2.2rem",
          fontWeight: 800,
          marginBottom: isMobile ? "6px" : "10px",
          color: "#1a1a1a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          flexWrap: "wrap",
        }}>
          Notifications
          {unreadCount > 0 && (
            <span style={{
              fontSize: isMobile ? "0.7rem" : "0.8rem",
              fontWeight: 700,
              color: "#f44336",
              background: "#ffebee",
              padding: "4px 10px",
              borderRadius: "999px",
            }}>
              {unreadCount} new
            </span>
          )}
        </h1>
        <p style={{
          textAlign: "center",
          fontSize: isMobile ? "0.76rem" : "0.98rem",
          color: "#666",
          marginBottom: isMobile ? "16px" : "32px",
          fontWeight: 500
        }}>
          Stay updated with trip changes and announcements
        </p>

        {/* Notifications List */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: isMobile ? "10px" : "15px"
        }}>
          {notifications.length === 0 ? (
            <div style={{
              background: "white",
              padding: isMobile ? "30px 15px" : "60px 30px",
              borderRadius: "12px",
              border: "1px solid #e0e0e0",
              textAlign: "center",
              color: "#999"
            }}>
              <div style={{ fontSize: "3rem", marginBottom: "15px" }}></div>
              <p style={{ fontSize: isMobile ? "0.85rem" : "1rem" }}>No notifications yet</p>
              <p style={{ fontSize: isMobile ? "0.75rem" : "0.9rem", marginTop: "8px" }}>
                You'll receive notifications when trip details change
              </p>
            </div>
          ) : (
            notifications.map((notif) => {
              const isUnread = isNotificationUnread(notif);
              const cardStyles = getNotificationCardStyles(!isUnread, isMobile);

              return (
              <div
                key={notif.id}
                style={cardStyles.card}
                onClick={() => handleNotificationClick(notif)}
                onMouseEnter={(e) => {
                  if (isUnread) {
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = isUnread ? "0 2px 8px rgba(0,0,0,0.06)" : "none";
                  e.currentTarget.style.transform = "translateY(0)";
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
                        {notif.tripDetails.boat && <div><strong>Boat:</strong> {notif.tripDetails.boat}</div>}
                      </div>
                    )}

                    <div style={{
                      ...cardStyles.timestamp,
                      marginBottom: notif.type === "trip_cancelled" ? "12px" : "0"
                    }}>
                      {new Date(notif.createdAt).toLocaleString()}
                      {!isUnread && (
                        <span style={{ marginLeft: "8px", fontStyle: "italic" }}>· Viewed</span>
                      )}
                    </div>

                    {notif.type === "trip_cancelled" && (
                      <div style={{
                        display: "flex",
                        gap: "8px",
                        marginTop: "12px",
                        flexWrap: "wrap"
                      }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRefundRequest(notif);
                          }}
                          disabled={processingAction[notif.id]}
                          style={{
                            flex: isMobile ? "1 1 calc(50% - 4px)" : "0 1 auto",
                            padding: "8px 14px",
                            background: processingAction[notif.id] ? "#ccc" : "#f44336",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            fontWeight: 600,
                            fontSize: isMobile ? "0.75rem" : "0.85rem",
                            cursor: processingAction[notif.id] ? "not-allowed" : "pointer",
                            transition: "background 0.3s"
                          }}
                          onMouseEnter={(e) => !processingAction[notif.id] && (e.target.style.background = "#d32f2f")}
                          onMouseLeave={(e) => !processingAction[notif.id] && (e.target.style.background = "#f44336")}
                        >
                          {processingAction[notif.id] ? "Processing..." : "Request Refund"}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBookAnother(notif);
                          }}
                          disabled={processingAction[notif.id]}
                          style={{
                            flex: isMobile ? "1 1 calc(50% - 4px)" : "0 1 auto",
                            padding: "8px 14px",
                            background: processingAction[notif.id] ? "#ccc" : "#4caf50",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            fontWeight: 600,
                            fontSize: isMobile ? "0.75rem" : "0.85rem",
                            cursor: processingAction[notif.id] ? "not-allowed" : "pointer",
                            transition: "background 0.3s"
                          }}
                          onMouseEnter={(e) => !processingAction[notif.id] && (e.target.style.background = "#45a049")}
                          onMouseLeave={(e) => !processingAction[notif.id] && (e.target.style.background = "#4caf50")}
                        >
                          {processingAction[notif.id] ? "Loading..." : "Book Another Trip"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default UserNotifications;
