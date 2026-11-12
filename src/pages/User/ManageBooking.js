import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { auth, db } from "../../firebase";
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { formatTime12Hour } from "../../utils/timeFormatter";
import { useAuthReloadKey } from "../../hooks/useAuthUser";
import { checkPaymentExpiry } from "../../utils/paymentExpiryCheck";
import { getQrPhImageUrl } from "../../utils/paymongo";

function ManageBooking() {
  const navigate = useNavigate();
  const reloadKey = useAuthReloadKey();
  const [bookings, setBookings] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [paymentStatuses, setPaymentStatuses] = useState({});
  const [refundRequestsByBooking, setRefundRequestsByBooking] = useState({});
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [proofModal, setProofModal] = useState({ isOpen: false, bookingId: null, proofImage: null });
  const [qrModal, setQrModal] = useState({ isOpen: false, bookingId: null, referenceCode: null });
  const [qrCountdownNow, setQrCountdownNow] = useState(Date.now());
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [expandedDetails, setExpandedDetails] = useState({});
  const bookingsPerPage = 5;
  const totalPages = Math.ceil(bookings.length / bookingsPerPage);
  const pageStartIndex = (currentPage - 1) * bookingsPerPage;
  const visibleBookings = bookings.slice(pageStartIndex, pageStartIndex + bookingsPerPage);
  const qrBooking = bookings.find((booking) => booking.id === qrModal.bookingId);
  const qrPaymentInfo = paymentStatuses[qrModal.bookingId] || {};
  const isPayMongoGcashPayment =
    qrPaymentInfo.paymentProvider === "paymongo" &&
    qrPaymentInfo.paymongoFlow === "qrph" &&
    String(qrPaymentInfo.method || qrBooking?.payment || "").toLowerCase() === "gcash" &&
    Boolean(qrPaymentInfo.paymongoPaymentIntentId);
  const isPendingPayMongoGcashQr =
    isPayMongoGcashPayment &&
    qrPaymentInfo.status === "pending" &&
    qrPaymentInfo.paymongoStatus !== "paid";
  const qrExpiryValue = qrPaymentInfo.paymentExpiresAt || qrBooking?.paymentExpiresAt;
  const qrExpiryDate = qrExpiryValue?.toDate?.() || (qrExpiryValue ? new Date(qrExpiryValue) : null);
  const qrExpiryTime = qrExpiryDate && !Number.isNaN(qrExpiryDate.getTime())
    ? qrExpiryDate.getTime()
    : null;
  const qrSecondsRemaining = qrExpiryTime === null
    ? null
    : Math.max(0, Math.ceil((qrExpiryTime - qrCountdownNow) / 1000));
  const qrCountdownLabel = qrSecondsRemaining === null
    ? "Countdown unavailable"
    : `${Math.floor(qrSecondsRemaining / 60)}m ${String(qrSecondsRemaining % 60).padStart(2, "0")}s`;
  const showPayMongoPaymentQr = isPendingPayMongoGcashQr && qrSecondsRemaining !== 0;
  const showBookingQr = !isPayMongoGcashPayment ||
    (qrPaymentInfo.status === "completed" && qrBooking?.status === "confirmed");

  useEffect(() => {
    if (!qrModal.isOpen || !isPendingPayMongoGcashQr || qrExpiryTime === null) return undefined;

    setQrCountdownNow(Date.now());
    const intervalId = setInterval(() => setQrCountdownNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [qrModal.isOpen, isPendingPayMongoGcashQr, qrExpiryTime]);

  useEffect(() => {
    const lastPage = Math.max(1, totalPages);
    if (currentPage > lastPage) {
      setCurrentPage(lastPage);
    }
  }, [currentPage, totalPages]);

  // Scroll to top on mount
  useEffect(() => {
    const contentElement = document.getElementById('managebooking-page-content');
    if (contentElement) {
      contentElement.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const normalizeValue = (value) => (typeof value === "string" ? value.trim() : "");

    const buildIdentifierVariants = (value, { allowLowercase = false } = {}) => {
      const normalized = normalizeValue(value);
      if (!normalized) return [];

      const variants = new Set([normalized]);
      if (allowLowercase) {
        variants.add(normalized.toLowerCase());
      }

      return Array.from(variants);
    };

    const formatBooking = (doc) => {
      const booking = { id: doc.id, ...doc.data() };

      if (booking.date && booking.date.toDate) {
        booking.date = booking.date.toDate().toLocaleDateString("en-PH", {
          year: "numeric",
          month: "long",
          day: "numeric"
        });
      }

      return booking;
    };

    const fetchBookings = async (user) => {
      try {
        if (!user) {
          setBookings([]);
          setPaymentStatuses({});
          setIsLoadingBookings(false);
          return;
        }

        const bookingMap = new Map();
        const bookingsRef = collection(db, "bookings");
        const paymentsRef = collection(db, "payments");
        const uidValues = buildIdentifierVariants(user.uid);
        const emailValues = buildIdentifierVariants(user.email, { allowLowercase: true });
        const makeQueries = (collectionRef, field, values) =>
          values.map((value) => getDocs(query(collectionRef, where(field, "==", value))));
        const bookingQueries = [
          ...makeQueries(bookingsRef, "userId", uidValues),
          ...makeQueries(bookingsRef, "userEmail", emailValues),
        ];
        const paymentQueries = [
          ...makeQueries(paymentsRef, "userId", uidValues),
          ...makeQueries(paymentsRef, "userEmail", emailValues),
        ];

        const [userProfileSnap, bookingSnapshots, paymentSnapshots] = await Promise.all([
          getDoc(doc(db, "users", user.uid)),
          Promise.all(bookingQueries),
          Promise.all(paymentQueries),
        ]);
        const userProfile = userProfileSnap.exists() ? userProfileSnap.data() : {};

        const mergeBookingSnapshots = (snapshots) => {
          snapshots.forEach((snapshot) => {
            snapshot.docs.forEach((bookingDoc) => {
              bookingMap.set(bookingDoc.id, formatBooking(bookingDoc));
            });
          });
        };
        mergeBookingSnapshots(bookingSnapshots);

        const additionalEmails = buildIdentifierVariants(userProfile?.email, { allowLowercase: true })
          .filter((email) => !emailValues.includes(email));
        if (additionalEmails.length > 0) {
          const [additionalBookings, additionalPayments] = await Promise.all([
            Promise.all(makeQueries(bookingsRef, "userEmail", additionalEmails)),
            Promise.all(makeQueries(paymentsRef, "userEmail", additionalEmails)),
          ]);
          mergeBookingSnapshots(additionalBookings);
          paymentSnapshots.push(...additionalPayments);
        }

        if (bookingMap.size === 0) {
          const fallbackNames = new Set([
            ...buildIdentifierVariants(user.displayName),
            ...buildIdentifierVariants(userProfile?.name),
          ]);
          if (fallbackNames.size > 0) {
            const fallbackSnapshots = await Promise.all(
              makeQueries(bookingsRef, "customerName", Array.from(fallbackNames))
            );
            mergeBookingSnapshots(fallbackSnapshots);
          }
        }

        const sortBookings = (bookingValues) =>
          Array.from(bookingValues).sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return bTime - aTime;
          });

        setBookings(sortBookings(bookingMap.values()));

        const paymentMap = {};
        paymentSnapshots.forEach((snapshot) => {
          snapshot.docs.forEach((doc) => {
            const payment = doc.data();
            if (payment.bookingId) {
              paymentMap[payment.bookingId] = {
                paymentId: doc.id,
                status: payment.status?.toLowerCase?.() || "",
                paymentMode: payment.paymentMode || "",
                method: payment.method || "",
                paymentProvider: payment.paymentProvider || "",
                paymongoFlow: payment.paymongoFlow || "",
                paymongoPaymentIntentId: payment.paymongoPaymentIntentId || "",
                paymentExpiresAt: payment.paymentExpiresAt || null,
                paymongoStatus: payment.paymongoStatus?.toLowerCase?.() || "",
                proofOfPaymentBase64: payment.proofOfPaymentBase64 || null
              };
            }
          });
        });

        setPaymentStatuses(paymentMap);
        setIsLoadingBookings(false);

        const expiringPaymentEntries = Object.entries(paymentMap).filter(
          ([, payment]) => payment.status === "pending" && payment.paymentMode !== "pay_later"
        );
        const expiryResults = await Promise.all(
          expiringPaymentEntries.map(([, payment]) => checkPaymentExpiry(payment.paymentId))
        );
        const cancelledPayments = expiryResults.flatMap((result) => result?.cancelled || []);
        if (cancelledPayments.length > 0) {
          const cancelledPaymentIds = new Set(cancelledPayments.map((item) => item.paymentId));
          const cancelledBookingIds = new Set(cancelledPayments.map((item) => item.bookingId));
          setPaymentStatuses((previous) => {
            const updated = { ...previous };
            cancelledBookingIds.forEach((bookingId) => {
              if (updated[bookingId]) updated[bookingId] = { ...updated[bookingId], status: "cancelled" };
            });
            return updated;
          });
          setBookings((previous) =>
            previous.map((booking) =>
              cancelledBookingIds.has(booking.id) ? { ...booking, status: "cancelled" } : booking
            )
          );
          console.info(
            `Marked ${cancelledBookingIds.size} expired booking(s) and ${cancelledPaymentIds.size} payment(s) as cancelled.`
          );
        }
      } catch (error) {
        console.error("Error fetching bookings:", error);
      } finally {
        setIsLoadingBookings(false);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsLoadingBookings(true);
      fetchBookings(user);
    });

    return () => unsubscribe();
  }, [reloadKey]);

  useEffect(() => {
    let unsubscribeRefundRequests = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeRefundRequests();

      if (!user) {
        setRefundRequestsByBooking({});
        return;
      }

      const refundRequestsQuery = query(
        collection(db, "refund_requests"),
        where("userId", "==", user.uid)
      );
      unsubscribeRefundRequests = onSnapshot(
        refundRequestsQuery,
        (snapshot) => {
          const requestsByBooking = {};
          snapshot.docs.forEach((refundDoc) => {
            const refund = refundDoc.data();
            if (!refund.bookingId) return;

            const createdAt = refund.createdAt?.toDate?.() || new Date(refund.createdAt || 0);
            const previousRequest = requestsByBooking[refund.bookingId];
            const previousCreatedAt = previousRequest?.createdAt || new Date(0);

            if (createdAt >= previousCreatedAt) {
              requestsByBooking[refund.bookingId] = {
                status: refund.status || "pending",
                createdAt,
              };
            }
          });
          setRefundRequestsByBooking(requestsByBooking);
        },
        (error) => console.error("Error watching refund requests:", error)
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeRefundRequests();
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!qrModal.isOpen || !qrModal.bookingId) return undefined;

    const bookingRef = doc(db, "bookings", qrModal.bookingId);
    const unsubscribeBooking = onSnapshot(
      bookingRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        const booking = { id: snapshot.id, ...snapshot.data() };
        if (booking.date?.toDate) {
          booking.date = booking.date.toDate().toLocaleDateString("en-PH", {
            year: "numeric",
            month: "long",
            day: "numeric"
          });
        }
        setBookings((previous) =>
          previous.map((item) => (item.id === booking.id ? { ...item, ...booking } : item))
        );
      },
      (error) => console.error("Error watching booking status:", error)
    );
    const paymentQuery = query(
      collection(db, "payments"),
      where("bookingId", "==", qrModal.bookingId)
    );
    const unsubscribePayment = onSnapshot(
      paymentQuery,
      (snapshot) => {
        const paymentDoc = snapshot.docs[0];
        if (!paymentDoc) return;
        const payment = paymentDoc.data();
        setPaymentStatuses((previous) => ({
          ...previous,
          [qrModal.bookingId]: {
            paymentId: paymentDoc.id,
            status: payment.status?.toLowerCase?.() || "",
            paymentMode: payment.paymentMode || "",
            method: payment.method || "",
            paymentProvider: payment.paymentProvider || "",
            paymongoFlow: payment.paymongoFlow || "",
            paymongoPaymentIntentId: payment.paymongoPaymentIntentId || "",
            paymentExpiresAt: payment.paymentExpiresAt || null,
            paymongoStatus: payment.paymongoStatus?.toLowerCase?.() || "",
            proofOfPaymentBase64: payment.proofOfPaymentBase64 || null
          }
        }));
      },
      (error) => console.error("Error watching payment status:", error)
    );

    return () => {
      unsubscribeBooking();
      unsubscribePayment();
    };
  }, [qrModal.isOpen, qrModal.bookingId]);

  const getBookingDisplayState = (booking, paymentInfo = {}) => {
    const bookingStatus = booking.status?.toLowerCase?.() || "";
    const paymentStatus = paymentInfo.status?.toLowerCase?.() || "";

    if (bookingStatus === "cancelled") {
      return {
        label: "Cancelled",
        color: "#f44336",
        paymentLabel: "Not Paid",
        paymentColor: "#f44336",
        canShowQr: false,
        actionLabel: "Cancelled",
        actionDisabled: true,
      };
    }

    if (["scanned", "boarded"].includes(bookingStatus)) {
      return {
        label: "Boarded",
        color: "#4caf50",
        paymentLabel: paymentStatus === "completed" ? "Paid" : "Pending",
        paymentColor: paymentStatus === "completed" ? "#4caf50" : "#ff9800",
        canShowQr: false,
        actionLabel: "Already Boarded",
        actionDisabled: true,
      };
    }

    if (paymentStatus === "pending" && paymentInfo.paymongoStatus === "paid") {
      return {
        label: "Awaiting Confirmation",
        color: "#ff9800",
        paymentLabel: "Paid - Awaiting Confirmation",
        paymentColor: "#ff9800",
        canShowQr: false,
        actionLabel: "Awaiting Port Confirmation",
        actionDisabled: true,
      };
    }

    if (
      paymentStatus === "completed" ||
      paymentStatus === "confirmed"
    ) {
      return {
        label: bookingStatus === "departed" ? "Departed" : "Confirmed",
        color: bookingStatus === "departed" ? "#9c27b0" : "#4caf50",
        paymentLabel: "Paid",
        paymentColor: "#4caf50",
        canShowQr: bookingStatus === "confirmed",
        actionLabel: "View QR Code",
        actionDisabled: false,
      };
    }

    if (["failed", "cancelled"].includes(paymentStatus)) {
      return {
        label: "Cancelled",
        color: "#f44336",
        paymentLabel: "Payment Failed",
        paymentColor: "#f44336",
        canShowQr: false,
        actionLabel: "Payment Failed",
        actionDisabled: true,
      };
    }

    if (paymentStatus === "pending" || paymentInfo.paymentId) {
      return {
        label: "Pending",
        color: "#ff9800",
        paymentLabel: paymentInfo.proofOfPaymentBase64 ? "Pending Approval" : "Pending",
        paymentColor: "#ff9800",
        canShowQr: Boolean(paymentInfo.paymentId),
        actionLabel: "View QR (Pending)",
        actionDisabled: !paymentInfo.paymentId,
      };
    }

    return {
      label: "Not Paid",
      color: "#f44336",
      paymentLabel: "Not Paid",
      paymentColor: "#f44336",
      canShowQr: false,
      actionLabel: paymentInfo.paymentId ? "Complete Payment" : "Not Paid",
      actionDisabled: !paymentInfo.paymentId,
    };
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied to clipboard!");
    } catch (error) {
      console.error("Failed to copy:", error);
      alert("Failed to copy to clipboard");
    }
  };

  const downloadQRCode = () => {
    const qrContainer = document.querySelector("#manage-booking-qr");
    const image = qrContainer?.querySelector("img");
    const canvas = qrContainer?.querySelector("canvas");
    const qrSource = showPayMongoPaymentQr ? image?.src : canvas?.toDataURL("image/png");
    if (!qrSource) return;

    const link = document.createElement("a");
    link.href = qrSource;
    link.download = showPayMongoPaymentQr
      ? `paymongo-gcash-${qrModal.bookingId}.png`
      : `booking-qr-${qrModal.referenceCode || qrModal.bookingId}.png`;
    link.click();
  };

  return (
    <div id="managebooking-page-content" style={{ minHeight: "100vh", background: "linear-gradient(135deg, rgba(255, 255, 255, 0.45) 0%, rgba(240, 248, 255, 0.40) 100%), url('/bg5.avif') center/cover fixed", paddingTop: isMobile ? "70px" : "0" }}>
      <div style={{ padding: isMobile ? "10px 10px 16px" : "110px 40px 48px", maxWidth: "1440px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: isMobile ? "16px" : "32px", textAlign: "center" }}>
        <h1
          style={{
            textAlign: "center",
            fontSize: isMobile ? "1.2rem" : "3rem",
            fontWeight: 800,
            marginBottom: isMobile ? "6px" : "14px",
            color: "#062b70",
            fontFamily: "inherit"
          }}
        >
          Manage Booking
        </h1>
        <p
          style={{
            textAlign: "center",
            fontSize: isMobile ? "0.76rem" : "0.98rem",
            color: "#1d416f",
            fontFamily: "inherit",
            marginBottom: 0,
            fontWeight: 500,
            maxWidth: "720px",
            marginLeft: "auto",
            marginRight: "auto",
            lineHeight: 1.5
          }}
        >
          View and manage your ferry reservations.
        </p>
      </div>

      {isLoadingBookings ? (
        <div style={{
          textAlign: "center",
          padding: isMobile ? "30px 15px" : "80px 30px",
          background: "white",
          borderRadius: "12px",
          border: "1px solid #d8e8f5",
          color: "#666",
          fontSize: isMobile ? "0.9rem" : "1rem",
          fontWeight: 600
        }}>
          Loading your bookings...
        </div>
      ) : bookings.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: isMobile ? "30px 15px" : "80px 30px",
          background: "white",
          borderRadius: "12px",
          border: "2px dashed #cce0f0",
          color: "#666"
        }}>
          <div style={{ fontSize: isMobile ? "1.4rem" : "2rem", marginBottom: isMobile ? "8px" : "15px", fontWeight: 800, color: "#2196f3" }}>Bookings</div>
          <p style={{ fontSize: isMobile ? "0.95rem" : "1.3rem", fontWeight: 600, marginBottom: "4px" }}>No Bookings Yet</p>
          <p style={{ fontSize: isMobile ? "0.8rem" : "1rem", color: "#999" }}>Start booking today!</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? "10px" : "24px" }}>
          {visibleBookings.map((booking) => (
            <div key={booking.id} style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              {(() => {
                const paymentInfo = paymentStatuses[booking.id] || {};
                const refundRequest = refundRequestsByBooking[booking.id];
                const displayState = getBookingDisplayState(booking, paymentInfo);
                const passengerText = booking.customerName || booking.name || "Guest";
                const routeText = booking.routeDirection || booking.tripName || "Ferry Route";
                const isDetailsExpanded = expandedDetails[booking.id];
                const proofImage = paymentInfo.proofOfPaymentBase64;

                return (
                  <>
              {/* Main Booking Card */}
              <div
                style={{
                  background: displayState.label === "Not Paid"
                    ? "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,248,248,0.98) 100%)"
                    : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,251,255,0.98) 100%)",
                  borderRadius: "18px",
                  border: displayState.label === "Not Paid" ? "1px solid #ffcdd2" : "1px solid #dbe7f2",
                  padding: isMobile ? "10px" : "16px",
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 220px",
                  gap: isMobile ? "10px" : "14px",
                  alignItems: isMobile ? "stretch" : "center",
                  transition: "all 0.3s ease",
                  boxShadow: "0 10px 28px rgba(30,58,95,0.08)",
                  position: "relative",
                  overflow: "hidden"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "0 16px 34px rgba(30,58,95,0.13)";
                  e.currentTarget.style.borderColor = "#c7dbed";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "0 10px 28px rgba(30,58,95,0.08)";
                  e.currentTarget.style.borderColor = "#dbe7f2";
                }}
              >
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: `linear-gradient(90deg, ${displayState.color} 0%, #64b5f6 100%)` }} />
                {/* Left Content */}
                <div style={{ flex: 1 }}>
                  {/* Status Badge */}
                  <div style={{ marginBottom: isMobile ? "8px" : "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{
                      display: "inline-block",
                      padding: isMobile ? "4px 9px" : "7px 12px",
                      borderRadius: "999px",
                      fontSize: isMobile ? "0.58rem" : "0.74rem",
                      fontWeight: 700,
                      backgroundColor: displayState.color,
                      color: "white",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px"
                    }}>
                      {displayState.label}
                    </span>
                    <span style={{ fontSize: isMobile ? "0.64rem" : "0.76rem", color: "#7b8da1", fontWeight: 700 }}>
                      {booking.date}
                    </span>
                  </div>

                  {/* Boat Name - Main Title */}
                  <div style={{ fontSize: isMobile ? "0.96rem" : "1.22rem", fontWeight: 800, color: "#1e3a5f", marginBottom: isMobile ? "4px" : "6px", letterSpacing: "-0.3px" }}>
                    {booking.boat || "Ferry Vessel"}
                  </div>

                  {/* Passenger Name */}
                  <div style={{ fontSize: isMobile ? "0.72rem" : "0.88rem", color: "#667085", marginBottom: isMobile ? "6px" : "8px", fontWeight: 500 }}>
                    Passenger:{" "}
                    <span
                      style={{
                        fontWeight: 700,
                        color: "#2196f3",
                        wordBreak: "break-word"
                      }}
                    >
                      {passengerText}
                    </span>
                  </div>

                  {/* Route - Prominent */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: isMobile ? "8px" : "12px" }}>
                    <div style={{ fontSize: isMobile ? "0.76rem" : "0.96rem", color: "#667085", fontWeight: 500, lineHeight: 1.3, flex: 1, minWidth: 0 }}>
                      Route:{" "}
                      <span
                        style={{
                          fontWeight: 700,
                          color: "#2196f3",
                          wordBreak: "break-word"
                        }}
                      >
                        {routeText}
                      </span>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <button
                        onClick={() =>
                          setExpandedDetails((prev) => ({
                            ...prev,
                            [booking.id]: !prev[booking.id]
                          }))
                        }
                        style={{
                          background: "none",
                          border: "none",
                          color: "#1976d2",
                          fontSize: isMobile ? "0.68rem" : "0.82rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          padding: 0
                        }}
                      >
                        {isDetailsExpanded ? "See less" : "See more"}
                      </button>
                    </div>
                  </div>

                  {/* Details Grid */}
                  {isDetailsExpanded && (
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: isMobile ? "6px" : "12px"
                    }}>
                      {booking.departure && (
                        <div style={{ background: "#f8fbfe", padding: isMobile ? "6px 7px" : "9px 10px", borderRadius: "10px", border: "1px solid #e5edf5" }}>
                          <div style={{ fontSize: isMobile ? "0.56rem" : "0.65rem", fontWeight: 800, color: "#999", marginBottom: "2px", textTransform: "uppercase" }}>Departure</div>
                          <div style={{ fontSize: isMobile ? "0.72rem" : "0.92rem", color: "#1e3a5f", fontWeight: 600, lineHeight: 1.2 }}>{formatTime12Hour(booking.departure)}</div>
                        </div>
                      )}
                      {booking.arrival && (
                        <div style={{ background: "#f8fbfe", padding: isMobile ? "6px 7px" : "9px 10px", borderRadius: "10px", border: "1px solid #e5edf5" }}>
                          <div style={{ fontSize: isMobile ? "0.56rem" : "0.65rem", fontWeight: 800, color: "#999", marginBottom: "2px", textTransform: "uppercase" }}>ETA</div>
                          <div style={{ fontSize: isMobile ? "0.72rem" : "0.92rem", color: "#1e3a5f", fontWeight: 600, lineHeight: 1.2 }}>{formatTime12Hour(booking.arrival)}</div>
                        </div>
                      )}
                      <div style={{ background: "#f8fbfe", padding: isMobile ? "6px 7px" : "9px 10px", borderRadius: "10px", border: "1px solid #e5edf5" }}>
                        <div style={{ fontSize: isMobile ? "0.56rem" : "0.65rem", fontWeight: 800, color: "#999", marginBottom: "2px", textTransform: "uppercase" }}>Type</div>
                        <div style={{ fontSize: isMobile ? "0.72rem" : "0.92rem", color: "#1e3a5f", fontWeight: 600, lineHeight: 1.2 }}>{booking.userType || "Regular"}</div>
                      </div>
                      <div style={{ background: "#f8fbfe", padding: isMobile ? "6px 7px" : "9px 10px", borderRadius: "10px", border: "1px solid #e5edf5" }}>
                        <div style={{ fontSize: isMobile ? "0.56rem" : "0.65rem", fontWeight: 800, color: "#999", marginBottom: "2px", textTransform: "uppercase" }}>Cargo</div>
                        <div style={{ fontSize: isMobile ? "0.72rem" : "0.92rem", color: "#1e3a5f", fontWeight: 600, lineHeight: 1.2 }}>
                          {booking.cargoType || "None"}
                        </div>
                      </div>
                      <div style={{ background: "#f8fbfe", padding: isMobile ? "6px 7px" : "9px 10px", borderRadius: "10px", border: "1px solid #e5edf5" }}>
                        <div style={{ fontSize: isMobile ? "0.56rem" : "0.65rem", fontWeight: 800, color: "#999", marginBottom: "2px", textTransform: "uppercase" }}>Weight</div>
                        <div style={{ fontSize: isMobile ? "0.72rem" : "0.92rem", color: "#1e3a5f", fontWeight: 600, lineHeight: 1.2 }}>
                          {booking.cargoWeight ? `${booking.cargoWeight} kg` : "N/A"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Content - Price & Button */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: isMobile ? "8px" : "10px", minWidth: isMobile ? "auto" : "210px", width: "100%", background: "linear-gradient(180deg, #f8fbfe 0%, #eef6ff 100%)", border: "1px solid #dbe7f2", borderRadius: "14px", padding: isMobile ? "9px" : "12px" }}>
                  {/* Price */}
                  <div style={{ textAlign: "left", display: "block", paddingBottom: "8px", borderBottom: "1px solid #dbe7f2" }}>
                    <div style={{ fontSize: isMobile ? "0.56rem" : "0.66rem", fontWeight: 800, color: "#7b8da1", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px", display: "block" }}>Total Fare</div>
                    <div style={{ fontSize: isMobile ? "1rem" : "1.45rem", fontWeight: 800, color: "#1976d2", lineHeight: 1.1 }}>
                      {`PHP ${booking.finalPrice || booking.fare || 0}`}
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: "6px" }}>
                    <div style={{ fontSize: isMobile ? "0.68rem" : "0.82rem", color: "#5f7287", fontWeight: 600 }}>
                      Payment: {booking.payment || "N/A"}
                    </div>
                    <div style={{ fontSize: isMobile ? "0.68rem" : "0.82rem", color: "#5f7287", fontWeight: 600 }}>
                      Payment Status: <span style={{ color: displayState.paymentColor, fontWeight: 700 }}>{displayState.paymentLabel}</span>
                    </div>
                    {refundRequest && (
                      <div
                        role="status"
                        style={{
                          color: ["approved", "refunded"].includes(refundRequest.status)
                            ? "#2e7d32"
                            : refundRequest.status === "rejected"
                              ? "#c62828"
                              : "#9a6700",
                          fontSize: isMobile ? "0.68rem" : "0.82rem",
                          fontWeight: 700,
                        }}
                      >
                        {refundRequest.status === "refunded"
                          ? "Refunded"
                          : refundRequest.status === "approved"
                          ? "Refund Approved"
                          : refundRequest.status === "rejected"
                            ? "Refund Declined"
                            : "Refund Already Requested"}
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (displayState.canShowQr) {
                        setQrModal({ 
                          isOpen: true, 
                          bookingId: booking.id,
                          referenceCode: booking.referenceCode || booking.id
                        });
                        return;
                      }
                      if (paymentInfo.paymentId && displayState.actionLabel === "Complete Payment") {
                        navigate(`/payment-qr?paymentId=${paymentInfo.paymentId}`);
                      }
                    }}
                    style={{
                      padding: isMobile ? "9px 12px" : "10px 14px",
                      background: displayState.canShowQr
                        ? "#2196f3"
                        : displayState.actionLabel === "Complete Payment"
                          ? "#f44336"
                          : "#cbd5e1",
                      color: "white",
                      border: "none",
                      borderRadius: "10px",
                      fontWeight: 700,
                      fontSize: isMobile ? "0.72rem" : "0.85rem",
                      cursor: displayState.actionDisabled ? "default" : "pointer",
                      transition: "all 0.3s ease",
                      letterSpacing: "0.2px",
                      width: "100%"
                    }}
                    onMouseEnter={(e) => {
                      if (!displayState.actionDisabled && displayState.canShowQr) {
                        e.target.style.background = "#1976d2";
                      }
                      if (!displayState.actionDisabled && displayState.actionLabel === "Complete Payment") {
                        e.target.style.background = "#d32f2f";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!displayState.actionDisabled && displayState.canShowQr) {
                        e.target.style.background = "#2196f3";
                      }
                      if (!displayState.actionDisabled && displayState.actionLabel === "Complete Payment") {
                        e.target.style.background = "#f44336";
                      }
                    }}
                  >
                    {displayState.actionLabel}
                  </button>

                  {displayState.paymentLabel === "Pending Approval" && proofImage && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setProofModal({ isOpen: true, bookingId: booking.id, proofImage: proofImage });
                      }}
                      style={{
                        padding: isMobile ? "8px 12px" : "10px 14px",
                        background: "#eef6ff",
                        color: "#1976d2",
                        border: "1px solid #bfdbfe",
                        borderRadius: "10px",
                        fontWeight: 700,
                        fontSize: isMobile ? "0.72rem" : "0.82rem",
                        cursor: "pointer",
                        width: "100%"
                      }}
                    >
                      View Proof of Payment
                    </button>
                  )}
                </div>
              </div>

                  </>
                );
              })()}
            </div>
          ))}
          {totalPages > 1 && (
            <nav
              aria-label="Booking pages"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: isMobile ? "8px" : "16px",
                flexWrap: "wrap",
                marginTop: "6px",
                padding: "13px",
                border: "1px solid #e0e8f0",
                borderRadius: "11px",
                background: "rgba(255, 255, 255, 0.94)"
              }}
            >
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                style={paginationButtonStyle(currentPage === 1)}
              >
                Previous
              </button>
              <span aria-live="polite" style={{ color: "#52677d", fontSize: "0.88rem", fontWeight: 600, textAlign: "center" }}>
                {pageStartIndex + 1}–{Math.min(pageStartIndex + bookingsPerPage, bookings.length)}
                {" of "}
                {bookings.length} · Page {currentPage} of {totalPages}
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
      )}

      {/* Proof of Payment Modal */}
      {proofModal.isOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "white",
            borderRadius: "12px",
            padding: isMobile ? "15px" : "30px",
            maxWidth: isMobile ? "90vw" : "500px",
            width: "100%",
            boxShadow: "0 10px 40px rgba(0, 0, 0, 0.3)",
            maxHeight: "90vh",
            overflowY: "auto"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
              paddingBottom: "15px",
              borderBottom: "2px solid #e0e8f0"
            }}>
              <h3 style={{
                fontSize: isMobile ? "1rem" : "1.3rem",
                fontWeight: 800,
                color: "#1e3a5f",
                margin: 0
              }}>
                Proof of Payment
              </h3>
              <button
                onClick={() => setProofModal({ isOpen: false, bookingId: null, proofImage: null })}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  color: "#999",
                  padding: "0",
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "color 0.2s ease"
                }}
                onMouseEnter={(e) => e.target.style.color = "#333"}
                onMouseLeave={(e) => e.target.style.color = "#999"}
              >
                x
              </button>
            </div>

            <div style={{
              textAlign: "center",
              background: "#f5f9fc",
              padding: "15px",
              borderRadius: "8px",
              border: "1px solid #d8e8f5"
            }}>
              {proofModal.proofImage ? (
                <img
                  src={proofModal.proofImage}
                  alt="Proof of Payment"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "500px",
                    borderRadius: "8px",
                    border: "1px solid #d8e8f5"
                  }}
                />
              ) : (
                <p style={{ color: "#999", margin: 0 }}>No proof image available</p>
              )}
            </div>

            <button
              onClick={() => setProofModal({ isOpen: false, bookingId: null, proofImage: null })}
              style={{
                width: "100%",
                marginTop: "20px",
                padding: "12px",
                background: "#4caf50",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontWeight: 700,
                fontSize: "0.95rem",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "#45a049";
                e.target.style.boxShadow = "0 4px 12px rgba(76,175,80,0.3)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "#4caf50";
                e.target.style.boxShadow = "none";
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
      {qrModal.isOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: isMobile ? "12px" : "20px",
          overflowY: "auto"
        }}>
          <div style={{
            background: "white",
            borderRadius: "16px",
            padding: isMobile ? "12px" : "28px",
            maxWidth: isMobile ? "340px" : "420px",
            width: "100%",
            maxHeight: isMobile ? "calc(100dvh - 24px)" : undefined,
            overflowY: isMobile ? "auto" : undefined,
            boxSizing: "border-box",
            boxShadow: "0 10px 40px rgba(0, 0, 0, 0.3)",
            textAlign: "center"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: isMobile ? "10px" : "18px"
            }}>
              <h3 style={{
                fontSize: isMobile ? "1rem" : "1.2rem",
                fontWeight: 800,
                color: "#1e3a5f",
                margin: 0
              }}>
                {showPayMongoPaymentQr ? "GCash Payment QR" : "Booking QR Code"}
              </h3>
              <button
                onClick={() => setQrModal({ isOpen: false, bookingId: null, referenceCode: null })}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.3rem",
                  cursor: "pointer",
                  color: "#999",
                  padding: 0,
                  width: "28px",
                  height: "28px"
                }}
              >
                x
              </button>
            </div>

            <div style={{
              background: "#f8fbfe",
              border: "1px solid #e5edf5",
              borderRadius: "14px",
              padding: isMobile ? "14px" : "18px"
            }}>
              {(showPayMongoPaymentQr || showBookingQr) && (
                <div id="manage-booking-qr" style={{ background: "white", padding: isMobile ? "8px" : "12px", borderRadius: "12px", border: "1px solid #e0e8f0", display: "inline-block", marginBottom: isMobile ? "10px" : "14px" }}>
                  {showPayMongoPaymentQr ? (
                    <img
                      id="manage-booking-paymongo-qr"
                      src={getQrPhImageUrl(qrPaymentInfo.paymongoPaymentIntentId)}
                      alt="PayMongo GCash payment QR code"
                      style={{
                        display: "block",
                        width: isMobile ? "min(220px, 65vw)" : "220px",
                        height: "auto",
                      }}
                    />
                  ) : (
                    <QRCodeCanvas
                      value={qrModal.referenceCode || qrModal.bookingId || ""}
                      size={isMobile ? 150 : 220}
                    />
                  )}
                </div>
              )}
              {isPendingPayMongoGcashQr && qrSecondsRemaining > 0 && (
                <p style={{ margin: "0 0 12px", color: "#e65100", fontSize: "0.85rem", fontWeight: 700 }}>
                  Pay within {qrCountdownLabel}.
                </p>
              )}
              {(() => {
                const booking = bookings.find((item) => item.id === qrModal.bookingId);
                const paymentInfo = paymentStatuses[qrModal.bookingId] || {};
                const displayState = booking
                  ? getBookingDisplayState(booking, paymentInfo)
                  : null;
                const isPaidAndValid =
                  displayState?.paymentLabel === "Paid" && booking?.status === "confirmed";
                const qrStatusLabel = ["scanned", "boarded"].includes(booking?.status?.toLowerCase?.())
                  ? "Already boarded"
                  : booking?.status === "cancelled"
                    ? "Booking cancelled."
                    : isPaidAndValid
                      ? "Paid / Valid for boarding"
                      : paymentInfo.paymongoStatus === "paid"
                        ? "Payment received / Awaiting confirmation"
                        : isPendingPayMongoGcashQr && qrSecondsRemaining === 0
                          ? "QR expired. Booking cancellation is being processed."
                      : "Pending payment / Not valid for boarding";
                const qrStatusIsInvalid =
                  ["scanned", "boarded"].includes(booking?.status?.toLowerCase?.()) ||
                  booking?.status === "cancelled";

                return (
                  <div
                    role="status"
                    style={{
                      marginBottom: "14px",
                      padding: "10px",
                      borderRadius: "8px",
                      background: isPaidAndValid
                        ? "#e8f5e9"
                        : qrStatusIsInvalid
                          ? "#ffebee"
                          : "#fff3e0",
                      color: isPaidAndValid
                        ? "#2e7d32"
                        : qrStatusIsInvalid
                          ? "#c62828"
                          : "#e65100",
                      fontWeight: 800,
                      fontSize: isMobile ? "0.78rem" : "0.9rem"
                    }}
                  >
                    {qrStatusLabel}
                  </div>
                );
              })()}
              {showBookingQr && (
                <>
                  <div style={{ fontSize: isMobile ? "0.62rem" : "0.7rem", fontWeight: 800, color: "#7b8da1", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Reference Code
                  </div>
                  <div style={{
                    fontSize: isMobile ? "0.78rem" : "0.9rem",
                    fontFamily: "monospace",
                    color: "#1e3a5f",
                    fontWeight: 800,
                    background: "white",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1px solid #e0e8f0",
                    letterSpacing: "0.4px",
                    wordBreak: "break-all",
                    marginBottom: "12px"
                  }}>
                    {(qrModal.referenceCode || qrModal.bookingId || "").toUpperCase()}
                  </div>
                </>
              )}

              {/* Copy and Download Buttons */}
              <div style={{
                display: "flex",
                gap: "8px",
                marginBottom: "4px"
              }}>
                {showBookingQr && <button
                  onClick={() => copyToClipboard((qrModal.referenceCode || qrModal.bookingId || "").toUpperCase())}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background: "#2196f3",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 600,
                    fontSize: isMobile ? "0.8rem" : "0.9rem",
                    cursor: "pointer",
                    transition: "background 0.3s"
                  }}
                  onMouseEnter={(e) => e.target.style.background = "#1976d2"}
                  onMouseLeave={(e) => e.target.style.background = "#2196f3"}
                >
                  Copy Code
                </button>}
                {(showPayMongoPaymentQr || showBookingQr) && <button
                  onClick={downloadQRCode}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background: "#4caf50",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 600,
                    fontSize: isMobile ? "0.8rem" : "0.9rem",
                    cursor: "pointer",
                    transition: "background 0.3s"
                  }}
                  onMouseEnter={(e) => e.target.style.background = "#45a049"}
                  onMouseLeave={(e) => e.target.style.background = "#4caf50"}
                >
                  {showPayMongoPaymentQr ? "Download PayMongo QR" : "Download Booking QR"}
                </button>}
              </div>
            </div>

            <button
              onClick={() => setQrModal({ isOpen: false, bookingId: null, referenceCode: null })}
              style={{
                width: "100%",
                marginTop: isMobile ? "10px" : "16px",
                padding: isMobile ? "9px" : "11px",
                background: "#2196f3",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontWeight: 700,
                fontSize: isMobile ? "0.85rem" : "0.95rem",
                cursor: "pointer"
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
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

export default ManageBooking;
