import { useEffect, useRef, useState } from "react";
import { auth, db } from "../../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
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
  const [refundForm, setRefundForm] = useState(null);
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
    if (
      event.target instanceof Element
      && event.target.closest("button, a, input, select, textarea, [role='button']")
    ) {
      gesture.current = null;
      return;
    }

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

  const openRefundForm = async (notif) => {
    if (!notif.bookingId) {
      alert("This notification is not linked to an existing booking.");
      return;
    }

    setProcessingAction((current) => ({ ...current, [notif.id]: true }));
    setRefundForm({
      notification: notif,
      loading: true,
      submitting: false,
      error: "",
      passengerName: "",
      bookingId: notif.bookingId,
      amount: 0,
      userPhone: "",
      gcashAccountName: "",
      gcashNumber: "",
      reason: "Trip cancelled",
    });

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Please sign in again to request a refund.");

      const [bookingSnapshot, userSnapshot, previousRequests] = await Promise.all([
        getDoc(doc(db, "bookings", notif.bookingId)),
        getDoc(doc(db, "users", currentUser.uid)),
        getDocs(query(collection(db, "refund_requests"), where("userId", "==", currentUser.uid))),
      ]);
      if (!bookingSnapshot.exists()) throw new Error("The booking could not be found.");

      const booking = bookingSnapshot.data();
      if (booking.userId !== currentUser.uid) {
        throw new Error("You can only request a refund for your own booking.");
      }

      const existingRequest = previousRequests.docs
        .map((requestDoc) => requestDoc.data())
        .find(
          (request) =>
            request.bookingId === notif.bookingId &&
            ["pending", "approved", "refunded"].includes(request.status)
        );
      if (existingRequest) {
        throw new Error("A refund request already exists for this booking.");
      }

      const profile = userSnapshot.exists() ? userSnapshot.data() : {};
      const amount = Number(booking.finalPrice ?? booking.fare ?? notif.bookingAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("The refund amount could not be determined from the booking.");
      }

      setRefundForm((current) =>
        current
          ? {
              ...current,
              loading: false,
              passengerName:
                booking.customerName ||
                profile.name ||
                profile.fullName ||
                booking.bookedByName ||
                currentUser.displayName ||
                "",
              amount,
              userPhone: booking.userPhone || profile.phone || "",
              booking,
            }
          : current
      );
    } catch (error) {
      console.error("Error preparing refund request:", error);
      setRefundForm((current) =>
        current ? { ...current, loading: false, error: error.message } : current
      );
    } finally {
      setProcessingAction((current) => ({ ...current, [notif.id]: false }));
    }
  };

  const handleRefundRequestSubmit = async (event) => {
    event.preventDefault();
    if (!refundForm || refundForm.loading || refundForm.submitting) return;

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setRefundForm((current) => ({ ...current, error: "Please sign in again to submit." }));
      return;
    }

    const gcashAccountName = refundForm.gcashAccountName.trim();
    const gcashNumber = refundForm.gcashNumber.trim();
    const normalizedGcashNumber = gcashNumber.replace(/[\s-]/g, "");
    if (!gcashAccountName || !/^09\d{9}$|^\+639\d{9}$/.test(normalizedGcashNumber)) {
      setRefundForm((current) => ({
        ...current,
        error: "Enter the GCash account name and a valid Philippine GCash number.",
      }));
      return;
    }
    if (!refundForm.reason.trim()) {
      setRefundForm((current) => ({ ...current, error: "Please provide a reason." }));
      return;
    }

    setRefundForm((current) => ({ ...current, submitting: true, error: "" }));
    try {
      const booking = refundForm.booking;
      const refundData = {
        userId: currentUser.uid,
        userEmail: currentUser.email || null,
        userPhone: refundForm.userPhone || null,
        passengerName: refundForm.passengerName,
        gcashAccountName,
        gcashNumber: normalizedGcashNumber,
        bookingId: refundForm.bookingId,
        tripId: booking.tripId || refundForm.notification.tripId || null,
        tripName: booking.tripName || refundForm.notification.tripDetails?.name || "",
        boat: booking.boat || refundForm.notification.tripDetails?.boat || null,
        amount: refundForm.amount,
        reason: refundForm.reason.trim(),
        status: "pending",
        notificationId: refundForm.notification.id,
        createdAt: new Date(),
      };

      const requestRef = doc(collection(db, "refund_requests"));
      const batch = writeBatch(db);
      batch.set(requestRef, refundData);
      batch.update(doc(db, "notifications", refundForm.notification.id), {
        userAction: "refund_requested",
        actionTimestamp: new Date(),
      });
      await batch.commit();

      notifyRefundRequest({ ...refundData, id: requestRef.id }, refundData.boat).catch((error) =>
        console.warn("Refund admin notification failed:", error)
      );
      setRefundForm(null);
      alert("Refund request submitted. We'll process it shortly!");
    } catch (error) {
      console.error("Error submitting refund request:", error);
      setRefundForm((current) =>
        current ? { ...current, submitting: false, error: error.message } : current
      );
    }
  };

  const handleBookAnother = async (notif) => {
    if (!notif.bookingId) {
      alert("This notification is not linked to an existing booking.");
      return;
    }

    navigate("/booking", {
      state: {
        rescheduleBookingId: notif.bookingId,
        rescheduleNotificationId: notif.id,
      },
    });
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
      case "booking_cancelled":
      case "payment_expired":
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
                              openRefundForm(notif);
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
        {refundForm && (
          <div
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget && !refundForm.submitting) {
                setRefundForm(null);
              }
            }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
              background: "rgba(12, 31, 48, 0.62)",
            }}
          >
            <form
              onSubmit={handleRefundRequestSubmit}
              onClick={(event) => event.stopPropagation()}
              style={{
                width: "min(100%, 520px)",
                maxHeight: "90vh",
                overflowY: "auto",
                padding: isMobile ? "20px" : "26px",
                borderRadius: "14px",
                background: "#fff",
                boxShadow: "0 18px 50px rgba(0,0,0,.24)",
              }}
            >
              <h2 style={{ margin: "0 0 6px", color: "#18324b", fontSize: "1.25rem" }}>
                Refund Request
              </h2>
              <p style={{ margin: "0 0 18px", color: "#66798b", fontSize: "0.9rem" }}>
                Confirm your booking details and provide the GCash account for the refund.
              </p>
              {refundForm.loading ? (
                <p role="status">Loading booking details…</p>
              ) : refundForm.error && !refundForm.booking ? (
                <>
                  <p role="alert" style={{ color: "#b42318", fontSize: "0.88rem" }}>
                    {refundForm.error}
                  </p>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "18px" }}>
                    <button
                      type="button"
                      onClick={() => setRefundForm(null)}
                      style={refundSecondaryButtonStyle}
                    >
                      Close
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {[
                    ["Passenger Name", "passengerName", refundForm.passengerName],
                    ["Booking ID", "bookingId", refundForm.bookingId],
                    ["Refund Amount", "amount", `₱${Number(refundForm.amount).toFixed(2)}`],
                  ].map(([label, key, value]) => (
                    <label key={key} style={refundFieldStyle}>
                      <span style={refundLabelStyle}>{label}</span>
                      <input
                        type="text"
                        value={value}
                        readOnly
                        style={refundInputStyle}
                      />
                    </label>
                  ))}
                  <label style={refundFieldStyle}>
                    <span style={refundLabelStyle}>GCash Account Name</span>
                    <input
                      type="text"
                      autoComplete="name"
                      required
                      value={refundForm.gcashAccountName}
                      onChange={(event) =>
                        setRefundForm((current) => ({ ...current, gcashAccountName: event.target.value }))
                      }
                      style={refundInputStyle}
                    />
                  </label>
                  <label style={refundFieldStyle}>
                    <span style={refundLabelStyle}>GCash Number</span>
                    <input
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      required
                      placeholder="09XXXXXXXXX"
                      value={refundForm.gcashNumber}
                      onChange={(event) =>
                        setRefundForm((current) => ({ ...current, gcashNumber: event.target.value }))
                      }
                      style={refundInputStyle}
                    />
                  </label>
                  <label style={refundFieldStyle}>
                    <span style={refundLabelStyle}>Reason</span>
                    <textarea
                      required
                      rows={3}
                      value={refundForm.reason}
                      onChange={(event) =>
                        setRefundForm((current) => ({ ...current, reason: event.target.value }))
                      }
                      style={{ ...refundInputStyle, resize: "vertical" }}
                    />
                  </label>
                  {refundForm.error && (
                    <p role="alert" style={{ color: "#b42318", fontSize: "0.88rem" }}>
                      {refundForm.error}
                    </p>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "9px", marginTop: "18px" }}>
                    <button
                      type="button"
                      disabled={refundForm.submitting}
                      onClick={() => setRefundForm(null)}
                      style={refundSecondaryButtonStyle}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={refundForm.submitting}
                      style={refundSubmitButtonStyle(refundForm.submitting)}
                    >
                      {refundForm.submitting ? "Submitting…" : "Submit Request"}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        )}
      </div>
    </main>
  );
}

const refundFieldStyle = {
  display: "grid",
  gap: "6px",
  marginBottom: "12px",
};

const refundLabelStyle = {
  color: "#34495e",
  fontSize: "0.86rem",
  fontWeight: 700,
};

const refundInputStyle = {
  boxSizing: "border-box",
  width: "100%",
  minHeight: "40px",
  padding: "9px 11px",
  border: "1px solid #cbd8e6",
  borderRadius: "7px",
  color: "#24384b",
  font: "inherit",
};

const refundSecondaryButtonStyle = {
  border: "1px solid #cbd8e6",
  borderRadius: "7px",
  padding: "9px 14px",
  background: "#fff",
  color: "#34495e",
  fontWeight: 700,
  cursor: "pointer",
};

const refundSubmitButtonStyle = (submitting) => ({
  border: "none",
  borderRadius: "7px",
  padding: "9px 14px",
  background: submitting ? "#9aa8b6" : "#218838",
  color: "#fff",
  fontWeight: 700,
  cursor: submitting ? "wait" : "pointer",
});

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
