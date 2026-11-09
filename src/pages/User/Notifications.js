import { useEffect, useRef, useState } from "react";
import { auth, db } from "../../firebase";
import { collection, query, where, onSnapshot, updateDoc, doc, addDoc, deleteDoc } from "firebase/firestore";
import { formatTime12Hour } from "../../utils/timeFormatter";
import { useNavigate } from "react-router-dom";
import { notifyRefundRequest } from "../../utils/notificationHelper";
import { isNotificationUnread } from "../../hooks/useUnreadNotificationCount";
import { getNotificationCardStyles, NotificationDot } from "../../components/NotificationBadge";
import { useAuthReloadKey, useAuthUser } from "../../hooks/useAuthUser";
import "./Notifications.css";

function UserNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [notificationLoadError, setNotificationLoadError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [processingAction, setProcessingAction] = useState({});
  const [deleteActions, setDeleteActions] = useState({});
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  const navigate = useNavigate();
  const { user, authReady } = useAuthUser();
  const reloadKey = useAuthReloadKey();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Real-time listener for user notifications
  useEffect(() => {
    if (!authReady) return;

    if (!user) {
      navigate("/login");
      return undefined;
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
      notificationList.sort((a, b) => b.createdAt - a.createdAt);
      setNotificationLoadError("");
      setNotifications(notificationList);
    }, (error) => {
      console.error("Error loading user notifications:", error);
      setNotificationLoadError(error.message || "Unable to load notifications.");
    });

    return () => unsubscribe();
  }, [authReady, user, reloadKey, navigate]);

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
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (isNotificationUnread(notif)) {
      markAsRead(notif.id);
    }
  };

  const showDeleteAction = (notificationId) => {
    setDeleteActions((current) => ({ ...current, [notificationId]: true }));
  };

  const hideDeleteAction = (notificationId) => {
    setDeleteActions((current) => {
      const next = { ...current };
      delete next[notificationId];
      return next;
    });
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
      console.error("Error deleting notification:", error);
      alert("Unable to delete this notification. Please try again.");
    }
  };

  const handlePointerDown = (event, notificationId) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = {
      id: notificationId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      wasRevealed: Boolean(deleteActions[notificationId])
    };
  };

  const handlePointerMove = (event) => {
    if (!gesture.current) return;

    const deltaX = event.clientX - gesture.current.x;
    const deltaY = event.clientY - gesture.current.y;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      gesture.current.moved = true;
      if (deltaX < -40) {
        showDeleteAction(gesture.current.id);
      } else if (gesture.current.wasRevealed && deltaX > 25) {
        hideDeleteAction(gesture.current.id);
      }
      event.preventDefault();
    }
  };

  const handlePointerUp = () => {
    if (gesture.current?.moved) {
      suppressClick.current = true;
    }
    gesture.current = null;
  };

  const notificationsPerPage = 10;
  const totalPages = Math.ceil(notifications.length / notificationsPerPage);
  const pageStartIndex = (currentPage - 1) * notificationsPerPage;
  const visibleNotifications = notifications.slice(
    pageStartIndex,
    pageStartIndex + notificationsPerPage
  );

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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

      const refundRequestRef = await addDoc(collection(db, "refund_requests"), refundData);

      notifyRefundRequest({ ...refundData, id: refundRequestRef.id }, refundData.boat).catch((error) =>
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

      navigate("/booking");
    } catch (error) {
      console.error("Error:", error);
      navigate("/booking");
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
      case "trip_departed":
      case "trip_completed":
        return (
          <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" color="#2e7d32">
            <circle cx="12" cy="12" r="10"/>
            <path d="m8 12 2.5 2.5L16 9"/>
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
    <main
      className={`user-notifications-page${isMobile ? " mobile" : ""}`}
      style={{
        background:
          "linear-gradient(135deg, rgba(255, 255, 255, 0.45) 0%, rgba(240, 248, 255, 0.40) 100%), url('/bg5.avif') center/cover fixed"
      }}
    >
      <div className="user-notifications-shell">

        {/* Notifications List */}
        <div className="notifications-list">
          {notificationLoadError ? (
            <div className="notifications-empty" role="alert">
              <h2>Unable to load notifications</h2>
              <p>{notificationLoadError}</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="notifications-empty">
              <span className="notifications-empty-icon" aria-hidden="true">✉</span>
              <h2>No notifications yet</h2>
              <p>
                You'll receive notifications when trip details change
              </p>
            </div>
          ) : (
            visibleNotifications.map((notif) => {
              const isUnread = isNotificationUnread(notif);
              const refundAlreadyRequested = notif.userAction === "refund_requested";
              const cardStyles = getNotificationCardStyles(!isUnread, isMobile);

              return (
              <div className="notification-swipe-wrapper" key={notif.id}>
                <button
                  type="button"
                  className="notification-restore-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDeleteActions((current) => {
                      const next = { ...current };
                      delete next[notif.id];
                      return next;
                    });
                  }}
                  aria-label={`Keep notification: ${notif.title}`}
                >
                  Undo
                </button>
                <button
                  type="button"
                  className="notification-delete-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDeleteNotification(notif);
                  }}
                  aria-label={`Delete notification: ${notif.title}`}
                >
                  Delete
                </button>
                <div
                  className={`notification-card${isUnread ? " unread" : ""}${deleteActions[notif.id] ? " delete-revealed" : ""}`}
                  style={cardStyles.card}
                  onClick={() => handleNotificationClick(notif)}
                  onDoubleClick={() => showDeleteAction(notif.id)}
                  onPointerDown={(event) => handlePointerDown(event, notif.id)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                onMouseEnter={(e) => {
                  if (isUnread) {
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
                  }
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
                
                <div className="notification-card-body" style={{ opacity: isUnread ? 1 : 0.88 }}>
                  <div className="notification-icon" style={{
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
                  
                  <div className="notification-card-content">
                    <h4 style={cardStyles.title}>
                      {notif.title}
                    </h4>
                    
                    <p style={cardStyles.message}>
                      {notif.message}
                    </p>

                    {notif.tripDetails && (
                      <div className="notification-trip-details" style={{
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

                    <div className="notification-timestamp" style={{
                      ...cardStyles.timestamp,
                      marginBottom: notif.type === "trip_cancelled" ? "12px" : "0"
                    }}>
                      {new Date(notif.createdAt).toLocaleString()}
                      {!isUnread && (
                        <span style={{ marginLeft: "8px", fontStyle: "italic" }}>· Viewed</span>
                      )}
                    </div>

                    {notif.type === "trip_cancelled" && (
                      <div className="notification-actions" style={{
                        display: "flex",
                        gap: "8px",
                        marginTop: "12px",
                        flexWrap: "wrap"
                      }}>
                        <button
                          className="notification-action-button refund"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!refundAlreadyRequested) {
                              handleRefundRequest(notif);
                            }
                          }}
                          disabled={processingAction[notif.id] || refundAlreadyRequested}
                          style={{
                            flex: isMobile ? "1 1 calc(50% - 4px)" : "0 1 auto",
                            padding: "8px 14px",
                            background: processingAction[notif.id] || refundAlreadyRequested ? "#9e9e9e" : "#f44336",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            fontWeight: 600,
                            fontSize: isMobile ? "0.75rem" : "0.85rem",
                            cursor: processingAction[notif.id] || refundAlreadyRequested ? "not-allowed" : "pointer",
                            transition: "background 0.3s"
                          }}
                          onMouseEnter={(e) => !processingAction[notif.id] && !refundAlreadyRequested && (e.target.style.background = "#d32f2f")}
                          onMouseLeave={(e) => !processingAction[notif.id] && !refundAlreadyRequested && (e.target.style.background = "#f44336")}
                        >
                          {processingAction[notif.id]
                            ? "Processing..."
                            : refundAlreadyRequested
                              ? "Refund Requested"
                              : "Request Refund"}
                        </button>
                        <button
                          className="notification-action-button book-again"
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
              </div>
            );
            })
          )}
        </div>

        {totalPages > 1 && (
          <nav className="notifications-pagination" aria-label="Notification pages">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              style={paginationButtonStyle(currentPage === 1)}
            >
              Previous
            </button>
            <span aria-live="polite">
              {pageStartIndex + 1}–{Math.min(pageStartIndex + notificationsPerPage, notifications.length)}
              {" of "}
              {notifications.length} · Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
              style={paginationButtonStyle(currentPage === totalPages)}
            >
              Next
            </button>
          </nav>
        )}
      </div>
    </main>
  );
}

function paginationButtonStyle(disabled) {
  return {
    padding: "6px 10px",
    border: "1px solid #cbd8e6",
    borderRadius: "7px",
    background: disabled ? "#f3f6f9" : "#fff",
    color: disabled ? "#9aa8b6" : "#2c5f9c",
    fontWeight: 700,
    fontSize: "0.78rem",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

export default UserNotifications;
