import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { auth, db } from "../../firebase";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { formatTime12Hour } from "../../utils/timeFormatter";

function ManageBooking() {
  const [bookings, setBookings] = useState([]);
  const [paymentStatuses, setPaymentStatuses] = useState({});
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [proofModal, setProofModal] = useState({ isOpen: false, bookingId: null, proofImage: null });
  const [qrModal, setQrModal] = useState({ isOpen: false, bookingId: null, referenceCode: null });
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [expandedDetails, setExpandedDetails] = useState({});

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
        const userProfileSnap = await getDoc(doc(db, "users", user.uid));
        const userProfile = userProfileSnap.exists() ? userProfileSnap.data() : {};

        const bookingQueries = [];
        const paymentQueries = [];

        buildIdentifierVariants(user.uid).forEach((uidValue) => {
          bookingQueries.push(getDocs(query(bookingsRef, where("userId", "==", uidValue))));
          paymentQueries.push(getDocs(query(paymentsRef, where("userId", "==", uidValue))));
        });

        buildIdentifierVariants(user.email, { allowLowercase: true }).forEach((emailValue) => {
          bookingQueries.push(getDocs(query(bookingsRef, where("userEmail", "==", emailValue))));
          paymentQueries.push(getDocs(query(paymentsRef, where("userEmail", "==", emailValue))));
        });

        buildIdentifierVariants(userProfile?.email, { allowLowercase: true }).forEach((emailValue) => {
          bookingQueries.push(getDocs(query(bookingsRef, where("userEmail", "==", emailValue))));
          paymentQueries.push(getDocs(query(paymentsRef, where("userEmail", "==", emailValue))));
        });

        const bookingSnapshots = await Promise.all(bookingQueries);
        bookingSnapshots.forEach((snapshot) => {
          snapshot.docs.forEach((doc) => {
            bookingMap.set(doc.id, formatBooking(doc));
          });
        });

        if (bookingMap.size === 0) {
          const fallbackNameQueries = [];

          buildIdentifierVariants(user.displayName).forEach((nameValue) => {
            fallbackNameQueries.push(getDocs(query(bookingsRef, where("customerName", "==", nameValue))));
          });

          buildIdentifierVariants(userProfile?.name).forEach((nameValue) => {
            fallbackNameQueries.push(getDocs(query(bookingsRef, where("customerName", "==", nameValue))));
          });

          const fallbackSnapshots = await Promise.all(fallbackNameQueries);
          fallbackSnapshots.forEach((snapshot) => {
            snapshot.docs.forEach((doc) => {
              bookingMap.set(doc.id, formatBooking(doc));
            });
          });
        }

        const data = Array.from(bookingMap.values()).sort((a, b) => {
          const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return bTime - aTime;
        });

        setBookings(data);

        const paymentMap = {};
        const paymentSnapshots = await Promise.all(paymentQueries);
        paymentSnapshots.forEach((snapshot) => {
          snapshot.docs.forEach((doc) => {
            const payment = doc.data();
            if (payment.bookingId) {
              paymentMap[payment.bookingId] = {
                status: payment.status?.toLowerCase?.() || "",
                proofOfPaymentBase64: payment.proofOfPaymentBase64 || null
              };
            }
          });
        });

        setPaymentStatuses(paymentMap);
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
  }, []);

  const getStatusColor = (status) => {
    const statusLower = status?.toLowerCase() || "";
    if (statusLower === "confirmed") return "#4caf50";
    if (statusLower === "pending") return "#ff9800";
    if (statusLower === "cancelled") return "#f44336";
    return "#999";
  };

  const getPaymentDisplayStatus = (status) => {
    const statusLower = status?.toLowerCase?.() || "";
    if (statusLower === "completed" || statusLower === "confirmed") return "confirmed";
    return "pending";
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
    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `booking-qr-${qrModal.referenceCode || qrModal.bookingId}.png`;
    link.click();
  };

  return (
    <div id="managebooking-page-content" style={{ minHeight: "100vh", background: "linear-gradient(135deg, rgba(255, 255, 255, 0.45) 0%, rgba(240, 248, 255, 0.40) 100%), url('/bg5.avif') center/cover fixed", paddingTop: isMobile ? "70px" : "0" }}>
      <div style={{ padding: isMobile ? "10px 10px 16px" : "22px 18px 28px", maxWidth: "1060px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: isMobile ? "16px" : "32px", textAlign: "center" }}>
        <h1
          style={{
            textAlign: "center",
            fontSize: isMobile ? "1.2rem" : "2.2rem",
            fontWeight: 800,
            marginBottom: isMobile ? "6px" : "10px",
            color: "#1a1a1a"
          }}
        >
          Manage Booking
        </h1>
        <p
          style={{
            textAlign: "center",
            fontSize: isMobile ? "0.76rem" : "0.98rem",
            color: "#666",
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
        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? "10px" : "16px" }}>
          {bookings.map((booking) => (
            <div key={booking.id} style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              {(() => {
                const paymentDisplayStatus = getPaymentDisplayStatus(paymentStatuses[booking.id]?.status);
                const canShowQr = paymentDisplayStatus === "confirmed";
                const passengerText = booking.customerName || booking.name || "Guest";
                const routeText = booking.routeDirection || booking.tripName || "Ferry Route";
                const isDetailsExpanded = expandedDetails[booking.id];
                const proofImage = paymentStatuses[booking.id]?.proofOfPaymentBase64;

                return (
                  <>
              {/* Main Booking Card */}
              <div
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,251,255,0.98) 100%)",
                  borderRadius: "18px",
                  border: "1px solid #dbe7f2",
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
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: `linear-gradient(90deg, ${getStatusColor(booking.status)} 0%, #64b5f6 100%)` }} />
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
                      backgroundColor: getStatusColor(booking.status),
                      color: "white",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px"
                    }}>
                      {booking.status || "Confirmed"}
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
                      Payment Status: <span style={{ color: getStatusColor(paymentDisplayStatus), fontWeight: 700, textTransform: "capitalize" }}>{paymentDisplayStatus}</span>
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (canShowQr) {
                        setQrModal({ 
                          isOpen: true, 
                          bookingId: booking.id,
                          referenceCode: booking.referenceCode || booking.id
                        });
                      }
                    }}
                    style={{
                      padding: isMobile ? "9px 12px" : "10px 14px",
                      background: canShowQr ? "#2196f3" : "#cbd5e1",
                      color: "white",
                      border: "none",
                      borderRadius: "10px",
                      fontWeight: 700,
                      fontSize: isMobile ? "0.72rem" : "0.85rem",
                      cursor: canShowQr ? "pointer" : "default",
                      transition: "all 0.3s ease",
                      letterSpacing: "0.2px",
                      width: "100%"
                    }}
                    onMouseEnter={(e) => {
                      if (canShowQr) {
                        e.target.style.background = "#1976d2";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (canShowQr) {
                        e.target.style.background = "#2196f3";
                      }
                    }}
                  >
                    {canShowQr ? "View QR Code" : "Waiting for Approval"}
                  </button>

                  {booking.status?.toLowerCase() === "pending" && proofImage && (
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
          padding: isMobile ? "14px" : "20px"
        }}>
          <div style={{
            background: "white",
            borderRadius: "16px",
            padding: isMobile ? "16px" : "28px",
            maxWidth: isMobile ? "92vw" : "420px",
            width: "100%",
            boxShadow: "0 10px 40px rgba(0, 0, 0, 0.3)",
            textAlign: "center"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "18px"
            }}>
              <h3 style={{
                fontSize: isMobile ? "1rem" : "1.2rem",
                fontWeight: 800,
                color: "#1e3a5f",
                margin: 0
              }}>
                Booking QR Code
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
              <div style={{ background: "white", padding: isMobile ? "10px" : "12px", borderRadius: "12px", border: "1px solid #e0e8f0", display: "inline-block", marginBottom: "14px" }}>
                <QRCodeCanvas value={qrModal.referenceCode || qrModal.bookingId || ""} size={isMobile ? 180 : 220} />
              </div>
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

              {/* Copy and Download Buttons */}
              <div style={{
                display: "flex",
                gap: "8px",
                marginBottom: "4px"
              }}>
                <button
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
                </button>
                <button
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
                  Download QR
                </button>
              </div>
            </div>

            <button
              onClick={() => setQrModal({ isOpen: false, bookingId: null, referenceCode: null })}
              style={{
                width: "100%",
                marginTop: "16px",
                padding: "11px",
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

export default ManageBooking;
