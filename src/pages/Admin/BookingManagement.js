import { useEffect, useState } from "react";
import { db } from "../../firebase";
import { doc, getDoc, collection, getDocs, query, where, updateDoc, onSnapshot } from "firebase/firestore";
import AdminLayout from "./AdminLayout";
import { useAuthReloadKey, useAuthUser } from "../../hooks/useAuthUser";
import { getStaffAccount } from "../../utils/staffAccount";

const normalizeRoute = (route) =>
  String(route || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const getBookingRoute = (booking) => booking.routeDirection || booking.route || "";

const getPaymentMethodLabel = (method) => {
  const normalizedMethod = String(method || "").trim().toLowerCase().replace(/[\s_-]/g, "");
  if (normalizedMethod === "cash" || normalizedMethod.includes("gcash")) return "GCash";
  if (normalizedMethod === "paylater") return "Pay Later";
  if (normalizedMethod === "paymaya") return "PayMaya";
  return method
    ? String(method).charAt(0).toUpperCase() + String(method).slice(1)
    : "Unknown";
};

function BookingManagement() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSchedule, setSelectedSchedule] = useState("all");
  const [availableRoutes, setAvailableRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState("all");
  const [hasSearched, setHasSearched] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [showDownloadPreview, setShowDownloadPreview] = useState(false);
  const { user, authReady } = useAuthUser();
  const reloadKey = useAuthReloadKey();

  // Pagination logic
  const itemsPerPage = 10;

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!authReady) return;

    let active = true;
    let unsubscribeBookings;

    const fetchData = async () => {
      if (!user) {
        setBookings([]);
        setAvailableRoutes([]);
        setSelectedRoute("");
        setFetchError("");
        setLoading(false);
        return;
      }

      setLoading(true);
      setFetchError("");
      try {
          // Fetch the assigned boat for either an admin or Port Staff account.
          const adminAccount = await getStaffAccount(user.uid);
          if (!active) return;
          
          if (adminAccount) {
            const admin = adminAccount.data;

            if (!admin.assignedBoat) {
              setBookings([]);
              setAvailableRoutes([]);
              setSelectedRoute("");
              setFetchError("This admin account does not have an assigned boat.");
              setLoading(false);
              return;
            }

            const schedulesRef = collection(db, "schedules");
            const bookingsRef = collection(db, "bookings");
            const [bookingsSnap, schedulesSnap] = await Promise.all([
              getDocs(query(bookingsRef, where("boat", "==", admin.assignedBoat))),
              getDocs(query(schedulesRef, where("boat", "==", admin.assignedBoat)))
            ]);

            const bookingDocsById = new Map(
              bookingsSnap.docs.map((bookingDoc) => [bookingDoc.id, bookingDoc])
            );
            const scheduleIds = schedulesSnap.docs.map((scheduleDoc) => scheduleDoc.id);
            const tripIdChunks = [];
            for (let index = 0; index < scheduleIds.length; index += 30) {
              tripIdChunks.push(scheduleIds.slice(index, index + 30));
            }
            let tripLookupFailed = false;
            const bookingsByTrip = await Promise.all(
              tripIdChunks.map((tripIds) =>
                getDocs(query(bookingsRef, where("tripId", "in", tripIds))).catch((error) => {
                  tripLookupFailed = true;
                  console.error("Error looking up bookings by assigned trip:", error);
                  return null;
                })
              )
            );
            bookingsByTrip.forEach((snapshot) => {
              if (!snapshot) return;
              snapshot.docs.forEach((bookingDoc) => {
                const bookingBoat = bookingDoc.data().boat;
                if (bookingBoat && bookingBoat !== admin.assignedBoat) return;
                bookingDocsById.set(bookingDoc.id, bookingDoc);
              });
            });

            let bookingsList = Array.from(bookingDocsById.values()).map((bookingDoc) => ({
              id: bookingDoc.id,
              ...bookingDoc.data()
            }));
            if (bookingsList.length === 0 && tripLookupFailed) {
              setFetchError("Could not check bookings linked to this boat's trips. Check Firestore access and try again.");
            }
            bookingsList = bookingsList.map((booking) => {
              const date = booking.date?.toDate?.() || booking.date;
              if (!(date instanceof Date)) return booking;
              const localDate = [
                date.getFullYear(),
                String(date.getMonth() + 1).padStart(2, "0"),
                String(date.getDate()).padStart(2, "0")
              ].join("-");
              return { ...booking, date: localDate };
            });
            const bookingRoutes = bookingsList.map(getBookingRoute).filter(Boolean);
            const boatSnapshot = await getDocs(
              query(collection(db, "boats"), where("name", "==", admin.assignedBoat))
            );
            const assignedBoat = boatSnapshot.docs[0]?.data();
            const boatRoutes = Array.isArray(assignedBoat?.availableRoutes)
              ? assignedBoat.availableRoutes
              : assignedBoat?.route
                ? [assignedBoat.route]
                : [];
            const routeOptionsByDirection = new Map();
            [
              ...boatRoutes,
              ...(Array.isArray(admin.availableRoutes) ? admin.availableRoutes : []),
              admin.assignedRoute,
              ...bookingRoutes
            ].filter(Boolean).forEach((route) => {
              const routeLabel = String(route).trim();
              const routeKey = normalizeRoute(routeLabel);
              if (routeKey && !routeOptionsByDirection.has(routeKey)) {
                routeOptionsByDirection.set(routeKey, routeLabel);
              }
            });
            const routeOptions = [...routeOptionsByDirection.values()].sort();
            setAvailableRoutes(routeOptions);
            setSelectedRoute((currentRoute) => {
              if (currentRoute === "all") return "all";
              if (routeOptions.includes(currentRoute)) return currentRoute;
              return "all";
            });

            // Fetch payment information for each booking
            const paymentsQuery = query(collection(db, "payments"));
            const paymentsSnap = await getDocs(paymentsQuery);
            const paymentMap = {};
            paymentsSnap.docs.forEach(doc => {
              const payment = doc.data();
              if (payment.bookingId) {
                paymentMap[payment.bookingId] = {
                  method: payment.method || payment.accountType || (payment.paymentMode === "pay_later" ? "Pay Later" : ""),
                  accountNumber: payment.accountNumber || payment.paymentAccountNumber || "N/A",
                  accountHolder: payment.accountHolder || "N/A",
                  status: payment.status || "pending"
                };
              }
            });

            // Merge payment info into bookings
            bookingsList = bookingsList.map(booking => {
              const paymentInfo = paymentMap[booking.id] || {
                method: "",
                accountNumber: "N/A",
                accountHolder: "N/A",
                status: "unknown"
              };
              return {
                ...booking,
                paymentInfo: {
                  ...paymentInfo,
                  method: getPaymentMethodLabel(
                    booking.payment || booking.paymentMethod || paymentInfo.method ||
                    (booking.paymentMode === "pay_later" ? "Pay Later" : "")
                  ),
                },
              };
            });

            // Fetch user names for bookings that don't have bookedByName
            const userMap = {};
            for (const booking of bookingsList) {
              if (!booking.bookedByName && booking.userId) {
                if (!userMap[booking.userId]) {
                  try {
                    const userDoc = await getDoc(doc(db, "users", booking.userId));
                    if (userDoc.exists()) {
                      const userData = userDoc.data();
                      userMap[booking.userId] = userData.name || userData.fullName || userData.displayName || booking.userEmail || booking.userId;
                    } else {
                      userMap[booking.userId] = booking.userEmail || booking.userId;
                    }
                  } catch (error) {
                    console.warn("Error fetching user:", booking.userId, error);
                    userMap[booking.userId] = booking.userEmail || booking.userId;
                  }
                }
              }
            }

            // Add fetched user names to bookings that need them
            bookingsList = bookingsList.map(booking => ({
              ...booking,
              bookedByName: booking.bookedByName || userMap[booking.userId] || booking.userEmail || "Unknown"
            }));

            // Keep cancelled bookings visible so payment-expiry cancellations can be reviewed.
            bookingsList = bookingsList.filter((booking) => {
              const status = String(booking.status || "").toLowerCase();
              return ["pending", "confirmed", "cancelled", "departed", "boarded", "scanned"].includes(status);
            });

            // Sort by date descending (most recent first)
            bookingsList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setBookings(bookingsList);

            // Check and update departed bookings
            updateDepartedBookings(bookingsList);

            unsubscribeBookings = onSnapshot(
              query(bookingsRef, where("boat", "==", admin.assignedBoat)),
              (snapshot) => {
                if (!active) return;

                setBookings((currentBookings) => {
                  const bookingsById = new Map(
                    currentBookings
                      .filter((booking) => booking.boat !== admin.assignedBoat)
                      .map((booking) => [booking.id, booking])
                  );

                  snapshot.docs.forEach((bookingDoc) => {
                    const data = bookingDoc.data();
                    const previousBooking = currentBookings.find(
                      (booking) => booking.id === bookingDoc.id
                    );
                    const dateValue = data.date?.toDate?.() || data.date;
                    let date = dateValue;
                    if (dateValue instanceof Date) {
                      date = [
                        dateValue.getFullYear(),
                        String(dateValue.getMonth() + 1).padStart(2, "0"),
                        String(dateValue.getDate()).padStart(2, "0")
                      ].join("-");
                    }

                    bookingsById.set(bookingDoc.id, {
                      ...previousBooking,
                      ...data,
                      id: bookingDoc.id,
                      date,
                      paymentInfo: previousBooking?.paymentInfo || {
                        method: getPaymentMethodLabel(
                          data.payment ||
                          data.paymentMethod ||
                          (data.paymentMode === "pay_later" ? "Pay Later" : "")
                        ),
                        accountNumber: "N/A",
                        accountHolder: "N/A",
                        status: data.paymentStatus || "unknown"
                      },
                      bookedByName:
                        data.bookedByName ||
                        previousBooking?.bookedByName ||
                        data.userEmail ||
                        "Unknown"
                    });
                  });

                  const liveBookings = Array.from(bookingsById.values()).filter((booking) =>
                    ["pending", "confirmed", "cancelled", "departed", "boarded", "scanned"].includes(
                      String(booking.status || "").toLowerCase()
                    )
                  );
                  liveBookings.sort(
                    (a, b) => new Date(b.createdAt?.toDate?.() || b.createdAt || 0) -
                      new Date(a.createdAt?.toDate?.() || a.createdAt || 0)
                  );
                  return liveBookings;
                });
              },
              (error) => {
                console.error("Error listening for booking updates:", error);
                setFetchError("Unable to receive live booking updates. Please refresh the page.");
              }
            );
          } else {
            setBookings([]);
            setAvailableRoutes([]);
            setSelectedRoute("");
            setFetchError("Admin profile was not found. Please contact the system administrator.");
          }
      } catch (error) {
        console.error("Error fetching data:", error);
        setFetchError("Unable to load bookings. Please refresh the page or contact support if this continues.");
        setBookings([]);
      }
      setLoading(false);
    };
    fetchData();

    return () => {
      active = false;
      unsubscribeBookings?.();
    };
  }, [authReady, user, reloadKey]);

  // Auto-update bookings to "departed" if departure time has passed
  const updateDepartedBookings = async (bookingsList) => {
    const now = new Date();
    
    for (const booking of bookingsList) {
      if (booking.status === "confirmed" && booking.date && booking.departure) {
        const [departureHour, departureMin] = booking.departure.split(':').map(Number);
        const departureDateTime = new Date(booking.date);
        departureDateTime.setHours(departureHour, departureMin, 0);
        
        // If departure time has passed, update status to departed
        if (now > departureDateTime) {
          try {
            const bookingRef = doc(db, "bookings", booking.id);
            await updateDoc(bookingRef, { status: "departed" });
            // Update local state
            setBookings(prevBookings => 
              prevBookings.map(b => b.id === booking.id ? { ...b, status: "departed" } : b)
            );
          } catch (error) {
            console.error("Error updating departed status:", error);
          }
        }
      }
    }
  };

  // Helper function to format date
  const formatDate = (dateString) => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };

  const formatBookingDate = (dateValue) => {
    if (!dateValue) return "N/A";
    const dateString = typeof dateValue === "string" ? dateValue : "";
    const dateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = dateMatch
      ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]))
      : dateValue?.toDate?.() || new Date(dateValue);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString();
  };

  const downloadBookings = () => {
    const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csvContent = `\uFEFF${getBookingExportRows().map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const file = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const downloadUrl = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = getBookingExportFileName();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  };

  // Get bookings for selected date and schedule
  const getSelectedDateBookings = () => {
    let filtered = bookings.filter(
      (b) =>
        (!selectedDate || b.date === selectedDate) &&
        ["pending", "confirmed", "departed", "boarded", "scanned"].includes(String(b.status || "").toLowerCase()) &&
        (selectedRoute === "all" ||
          !selectedRoute ||
          normalizeRoute(getBookingRoute(b)) === normalizeRoute(selectedRoute))
    );
    
    // Filter by schedule if not "all"
    if (selectedSchedule !== "all") {
      filtered = filtered.filter(b => {
        const departureHour = parseInt(b.departure?.split(':')[0]);
        if (selectedSchedule === "morningExpress") {
          return departureHour >= 5 && departureHour < 12;
        } else if (selectedSchedule === "afternoonExpress") {
          return departureHour >= 12 && departureHour < 18;
        }
        return true;
      });
    }
    
    return filtered;
  };

  const selectedDateBookings = getSelectedDateBookings();
  const totalPages = Math.ceil(selectedDateBookings.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedBookings = selectedDateBookings.slice(startIndex, endIndex);

  const getDisplayBookingStatus = (booking) => {
    const bookingStatus = String(booking.status || "pending").toLowerCase();
    const paymentStatus = String(booking.paymentInfo?.status || "").toLowerCase();

    if (["cancelled", "departed", "boarded", "scanned"].includes(bookingStatus)) return bookingStatus;
    if (["cancelled", "failed"].includes(paymentStatus)) return "cancelled";
    if (bookingStatus === "confirmed" || ["completed", "confirmed"].includes(paymentStatus)) {
      return "confirmed";
    }
    return "pending";
  };

  const getStatusColor = (status) => {
    if (status === "confirmed") return "#4caf50";
    if (status === "pending") return "#ff9800";
    if (status === "cancelled") return "#f44336";
    if (status === "departed") return "#9c27b0";
    if (status === "boarded" || status === "scanned") return "#16845b";
    return "#999";
  };

  const getBookingExportRows = () => [
    ["User Account", "Passenger", "Route", "Date", "Departure", "Arrival", "Payment Method", "Payment Status", "Amount", "Booking Status"],
    ...selectedDateBookings.map((booking) => [
      booking.bookedByName || booking.userEmail || "Unknown",
      booking.customerName || "N/A",
      getBookingRoute(booking) || "N/A",
      formatBookingDate(booking.date || booking.bookingDate),
      booking.departure || "N/A",
      booking.arrival || "N/A",
      booking.paymentInfo?.method || "Unknown",
      booking.paymentInfo?.status || "Unknown",
      Number(booking.finalPrice || 0).toFixed(2),
      getDisplayBookingStatus(booking)
    ])
  ];

  const getBookingExportFileName = () => {
    const routePart = selectedRoute && selectedRoute !== "all"
      ? normalizeRoute(selectedRoute)
      : "all-routes";
    return `bookings-${selectedDate || "all-dates"}-${routePart}.csv`;
  };

  return (
    <AdminLayout active="booking">
      {showDownloadPreview && (
        <div
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowDownloadPreview(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: isMobile ? 12 : 24,
            background: "rgba(0,0,0,0.5)",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-download-preview-title"
            style={{
              width: "100%",
              maxWidth: 1100,
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              background: "#fff",
              borderRadius: 12,
              padding: isMobile ? 14 : 24,
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 16,
            }}>
              <div>
                <h2 id="booking-download-preview-title" style={{
                  margin: 0,
                  color: "#1e3a5f",
                  fontSize: isMobile ? "1rem" : "1.2rem",
                  fontWeight: 800,
                }}>CSV Download Preview</h2>
                <p style={{ margin: "6px 0 0", color: "#666", fontSize: isMobile ? "0.78rem" : "0.9rem" }}>
                  {getBookingExportFileName()} · {selectedDateBookings.length} booking{selectedDateBookings.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close preview"
                onClick={() => setShowDownloadPreview(false)}
                style={{
                  border: "1px solid #d0d0d0",
                  borderRadius: 6,
                  background: "#fff",
                  color: "#444",
                  padding: "6px 10px",
                  fontSize: "1.1rem",
                  cursor: "pointer",
                }}
              >×</button>
            </div>
            <div style={{ overflow: "auto", border: "1px solid #cbd2d9", borderRadius: 4, background: "#fff" }}>
              <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse", fontSize: "0.82rem", color: "#222" }}>
                <tbody>
                  {getBookingExportRows().map((row, rowIndex) => (
                    <tr key={`export-row-${rowIndex}`} style={{ background: rowIndex === 0 ? "#eef2f5" : "#fff" }}>
                      <th scope="row" style={{
                        position: "sticky",
                        left: 0,
                        width: 42,
                        padding: "8px",
                        border: "1px solid #cbd2d9",
                        background: rowIndex === 0 ? "#e1e7ec" : "#f7f9fa",
                        color: "#66717b",
                        textAlign: "right",
                        fontWeight: 500,
                      }}>{rowIndex + 1}</th>
                      {row.map((cell, cellIndex) => {
                        const Cell = rowIndex === 0 ? "th" : "td";
                        return (
                          <Cell key={`export-cell-${rowIndex}-${cellIndex}`} style={{
                            padding: "8px 10px",
                            border: "1px solid #cbd2d9",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                            fontWeight: rowIndex === 0 ? 700 : 400,
                          }}>{cell}</Cell>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 16,
            }}>
              <button
                type="button"
                onClick={() => setShowDownloadPreview(false)}
                style={{
                  padding: "9px 16px",
                  border: "1px solid #d0d0d0",
                  borderRadius: 6,
                  background: "#fff",
                  color: "#444",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >Cancel</button>
              <button
                type="button"
                onClick={() => {
                  downloadBookings();
                  setShowDownloadPreview(false);
                }}
                style={{
                  padding: "9px 16px",
                  border: "none",
                  borderRadius: 6,
                  background: "#2196f3",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >Confirm Download</button>
            </div>
          </section>
        </div>
      )}
      <h2 style={{
        fontWeight: "800",
        fontSize: isMobile ? "1.1rem" : "1.3rem",
        color: "#1a1a1a",
        marginBottom: isMobile ? "12px" : "25px",
        marginTop: "0",
        letterSpacing: "0.3px"
      }}>Booking Management</h2>

      {/* Bookings Overview */}
      <p style={{
        fontSize: isMobile ? "0.8rem" : "0.95rem",
        color: "#666",
        marginBottom: isMobile ? "18px" : "30px",
        fontWeight: "500",
        lineHeight: isMobile ? "1.4" : "1.5"
      }}>
        View pending reservations and confirmed bookings for your assigned ferry boat.
      </p>



      <div style={{
        background: "white",
        borderRadius: "12px",
        padding: isMobile ? "15px" : "25px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        border: "1px solid #e0e8f0",
        marginBottom: isMobile ? "15px" : "30px"
      }}>
        <h3 style={{ fontSize: isMobile ? "0.85rem" : "1.05rem", fontWeight: 800, color: "#1e3a5f", marginBottom: isMobile ? "10px" : "15px" }}>
          Search Bookings by Date & Schedule
        </h3>
        <div style={{ display: "flex", gap: isMobile ? "8px" : "15px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: isMobile ? "120px" : "200px" }}>
            <label style={{ display: "block", minHeight: isMobile ? "14px" : "17px", lineHeight: isMobile ? "14px" : "17px", fontSize: isMobile ? "0.7rem" : "0.85rem", fontWeight: 600, color: "#666", marginBottom: isMobile ? "4px" : "8px", textTransform: "uppercase" }}>
              Select Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: "100%",
                padding: isMobile ? "6px 8px" : "10px 12px",
                border: "1px solid #d0d0d0",
                borderRadius: "6px",
                fontSize: isMobile ? "0.8rem" : "1rem",
                height: isMobile ? "32px" : "42px",
                boxSizing: "border-box",
                cursor: "pointer"
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: isMobile ? "100%" : "200px" }}>
            <label style={{ display: "block", minHeight: isMobile ? "14px" : "17px", lineHeight: isMobile ? "14px" : "17px", fontSize: isMobile ? "0.7rem" : "0.85rem", fontWeight: 600, color: "#666", marginBottom: isMobile ? "4px" : "8px", textTransform: "uppercase" }}>
              Select Route
            </label>
            <select
              value={selectedRoute}
              onChange={(e) => {
                setSelectedRoute(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: "100%",
                padding: isMobile ? "6px 8px" : "10px 12px",
                border: "1px solid #d0d0d0",
                borderRadius: "6px",
                fontSize: isMobile ? "0.8rem" : "1rem",
                height: isMobile ? "32px" : "42px",
                boxSizing: "border-box",
                cursor: "pointer",
                background: "white"
              }}
            >
              <option value="all">All Routes</option>
              {availableRoutes.map((route) => (
                <option key={route} value={route}>{route}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: isMobile ? "120px" : "200px" }}>
            <label style={{ display: "block", minHeight: isMobile ? "14px" : "17px", lineHeight: isMobile ? "14px" : "17px", fontSize: isMobile ? "0.7rem" : "0.85rem", fontWeight: 600, color: "#666", marginBottom: isMobile ? "4px" : "8px", textTransform: "uppercase" }}>
              Trip Schedule
            </label>
            <select
              value={selectedSchedule}
              onChange={(e) => {
                setSelectedSchedule(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: "100%",
                padding: isMobile ? "6px 8px" : "10px 12px",
                border: "1px solid #d0d0d0",
                borderRadius: "6px",
                fontSize: isMobile ? "0.8rem" : "1rem",
                height: isMobile ? "32px" : "42px",
                boxSizing: "border-box",
                cursor: "pointer",
                background: "white"
              }}
            >
              <option value="all">All</option>
              <option value="morningExpress">Morning Express</option>
              <option value="afternoonExpress">Afternoon Express</option>
            </select>
          </div>
          <div style={{
            display: "flex",
            gap: "8px",
            alignSelf: "flex-start",
            marginTop: isMobile ? "18px" : "25px",
            marginLeft: isMobile ? "auto" : "0",
          }}>
            <button
              onClick={() => {
                setHasSearched(true);
                setTimeout(() => {
                  const element = document.getElementById("search-results");
                  if (element) {
                    element.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }, 100);
              }}
              style={{
                padding: isMobile ? "6px 10px" : "10px 24px",
                height: isMobile ? "32px" : "42px",
                background: "#2196f3",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: isMobile ? "0.7rem" : "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.3s ease",
                whiteSpace: "nowrap",
                flex: "0 0 auto",
                minWidth: isMobile ? "80px" : "auto",
                boxSizing: "border-box"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#1976d2";
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(33, 150, 243, 0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#2196f3";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedDate("");
                setSelectedRoute("all");
                setSelectedSchedule("all");
                setCurrentPage(1);
                setHasSearched(true);
              }}
              style={{
                padding: isMobile ? "6px 10px" : "10px 20px",
                height: isMobile ? "32px" : "42px",
                background: "#fff",
                color: "#1e3a5f",
                border: "1px solid #d0d0d0",
                borderRadius: "6px",
                fontSize: isMobile ? "0.7rem" : "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                minWidth: isMobile ? "70px" : "auto",
                boxSizing: "border-box"
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Selected Date Bookings */}
      {hasSearched && (
        <div id="search-results" style={{
          background: "white",
          borderRadius: isMobile ? "8px" : "12px",
          padding: isMobile ? "12px" : "25px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          border: "1px solid #e0e8f0",
          marginBottom: isMobile ? "15px" : "30px"
        }}>
          <div style={{
            display: "flex",
            alignItems: isMobile ? "flex-start" : "center",
            justifyContent: "space-between",
            gap: "12px",
            flexDirection: "row",
            marginBottom: isMobile ? "12px" : "20px"
          }}>
            <h2 style={{
              fontSize: isMobile ? "0.9rem" : "1.25rem",
              fontWeight: 800,
              color: "#1e3a5f",
              margin: 0,
              minWidth: 0,
              flex: "1 1 auto",
              overflowWrap: "anywhere",
            }}>
              Bookings for {selectedDate ? formatDate(selectedDate) : "All Dates"} · {selectedRoute === "all" ? "All Routes" : selectedRoute || "All Routes"}
            </h2>
            <button
              type="button"
              onClick={() => setShowDownloadPreview(true)}
              disabled={loading || Boolean(fetchError) || selectedDateBookings.length === 0}
              style={{
                padding: isMobile ? "8px 12px" : "10px 16px",
                border: "none",
                borderRadius: "6px",
                background: loading || fetchError || selectedDateBookings.length === 0 ? "#aab7c4" : "#16845b",
                color: "#fff",
                fontSize: isMobile ? "0.75rem" : "0.85rem",
                fontWeight: 700,
                cursor: loading || fetchError || selectedDateBookings.length === 0 ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                flex: "0 0 auto",
                alignSelf: "flex-start",
              }}
            >
              {isMobile ? "Download" : "Download Bookings"}
            </button>
          </div>

          {loading ? (
            <p style={{ textAlign: "center", color: "#666", padding: "40px 20px", fontSize: "0.95rem" }}>
              Loading bookings...
            </p>
          ) : fetchError ? (
            <p role="alert" style={{ textAlign: "center", color: "#b00020", padding: "40px 20px", fontSize: "0.95rem" }}>
              {fetchError}
            </p>
          ) : selectedDateBookings.length === 0 ? (
            <p style={{ textAlign: "center", color: "#666", padding: "40px 20px", fontSize: "0.95rem" }}>
              No bookings found for this date and schedule
            </p>
          ) : isMobile ? (
            <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", minWidth: "700px", borderCollapse: "separate", borderSpacing: "0 6px", fontSize: "0.72rem" }}>
                <thead>
                  <tr style={{ background: "#f5f7fa" }}>
                    {["Passenger", "Route", "Date", "Time", "Payment", "Amount", "Status"].map((heading) => (
                      <th key={heading} style={{
                        padding: "10px 8px",
                        color: "#1e3a5f",
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        textAlign: "left",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedBookings.map((booking) => {
                    const displayStatus = getDisplayBookingStatus(booking);
                    const paymentStatus = booking.paymentInfo?.status === "completed"
                      ? "Paid"
                      : booking.paymentInfo?.status === "pending"
                        ? "Payment Pending"
                        : booking.status === "pending"
                          ? "Pending"
                          : "Unknown";
                    return (
                      <tr key={booking.id} style={{ background: "#fff" }}>
                        <td style={{ maxWidth: "125px", padding: "11px 8px", borderTop: "1px solid #dce5ef", borderBottom: "1px solid #dce5ef", borderLeft: "1px solid #dce5ef", color: "#263b55", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {booking.customerName || "N/A"}
                        </td>
                        <td style={{ maxWidth: "140px", padding: "11px 8px", borderTop: "1px solid #dce5ef", borderBottom: "1px solid #dce5ef", color: "#596579", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {booking.routeDirection || "N/A"}
                        </td>
                        <td style={{ padding: "11px 8px", borderTop: "1px solid #dce5ef", borderBottom: "1px solid #dce5ef", color: "#596579", whiteSpace: "nowrap" }}>
                          {formatBookingDate(booking.date || booking.bookingDate)}
                        </td>
                        <td style={{ padding: "11px 8px", borderTop: "1px solid #dce5ef", borderBottom: "1px solid #dce5ef", color: "#596579", whiteSpace: "nowrap" }}>
                          {booking.departure || "N/A"}{booking.arrival ? ` → ${booking.arrival}` : ""}
                        </td>
                        <td style={{ padding: "11px 8px", borderTop: "1px solid #dce5ef", borderBottom: "1px solid #dce5ef", whiteSpace: "nowrap" }}>
                          <div style={{ color: "#d88700", fontWeight: 600 }}>{booking.paymentInfo?.method || "Unknown"}</div>
                          <div style={{ color: booking.paymentInfo?.status === "completed" ? "#258443" : "#d88700" }}>{paymentStatus}</div>
                        </td>
                        <td style={{ padding: "11px 8px", borderTop: "1px solid #dce5ef", borderBottom: "1px solid #dce5ef", color: "#1687d9", fontWeight: 700, whiteSpace: "nowrap" }}>
                          ₱{Number(booking.finalPrice || 0).toFixed(2)}
                        </td>
                        <td style={{ padding: "11px 8px", borderTop: "1px solid #dce5ef", borderBottom: "1px solid #dce5ef", borderRight: "1px solid #dce5ef", whiteSpace: "nowrap" }}>
                          <span style={{ padding: "4px 6px", border: `1px solid ${getStatusColor(displayStatus)}`, borderRadius: "5px", color: getStatusColor(displayStatus), fontSize: "0.62rem", fontWeight: 700, textTransform: "capitalize" }}>
                            {displayStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.9rem",
                marginBottom: "0"
              }}>
                <thead>
                  <tr style={{ background: "#f5f5f5", borderBottom: "2px solid #e0e8f0" }}>
                    <th style={{ padding: "12px", textAlign: "left", fontWeight: 700, color: "#1e3a5f", fontSize: "0.85rem", textTransform: "uppercase" }}>
                      User Account
                    </th>
                    <th style={{ padding: "12px", textAlign: "left", fontWeight: 700, color: "#1e3a5f", fontSize: "0.85rem", textTransform: "uppercase" }}>
                      Passenger
                    </th>
                    <th style={{ padding: "12px", textAlign: "left", fontWeight: 700, color: "#1e3a5f", fontSize: "0.85rem", textTransform: "uppercase" }}>
                      Route
                    </th>
                    <th style={{ padding: "12px", textAlign: "left", fontWeight: 700, color: "#1e3a5f", fontSize: "0.85rem", textTransform: "uppercase" }}>
                      Date
                    </th>
                    <th style={{ padding: "12px", textAlign: "left", fontWeight: 700, color: "#1e3a5f", fontSize: "0.85rem", textTransform: "uppercase" }}>
                      Time
                    </th>
                    <th style={{ padding: "12px", textAlign: "left", fontWeight: 700, color: "#1e3a5f", fontSize: "0.85rem", textTransform: "uppercase" }}>
                      Payment
                    </th>
                    <th style={{ padding: "12px", textAlign: "left", fontWeight: 700, color: "#1e3a5f", fontSize: "0.85rem", textTransform: "uppercase" }}>
                      Amount
                    </th>
                    <th style={{ padding: "12px", textAlign: "left", fontWeight: 700, color: "#1e3a5f", fontSize: "0.85rem", textTransform: "uppercase" }}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedBookings.map((booking) => (
                    (() => {
                      const displayStatus = getDisplayBookingStatus(booking);
                      return (
                    <tr key={booking.id} style={{ borderBottom: "1px solid #e0e8f0", transition: "all 0.3s ease" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#f9fbfd"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "white"}
                    >
                      <td style={{ padding: "12px", color: "#1976d2", fontWeight: 600, fontSize: "0.9rem" }}>
                        {booking.bookedByName || booking.userEmail || "Unknown"}
                      </td>
                      <td style={{ padding: "12px", color: "#333", fontWeight: 600 }}>
                        {booking.customerName}
                      </td>
                      <td style={{ padding: "12px", color: "#666" }}>
                        {booking.routeDirection}
                      </td>
                      <td style={{ padding: "12px", color: "#666", whiteSpace: "nowrap" }}>
                        {formatBookingDate(booking.date || booking.bookingDate)}
                      </td>
                      <td style={{ padding: "12px", color: "#666", fontSize: "0.85rem" }}>
                        {booking.departure} → {booking.arrival}
                      </td>
                      <td style={{ padding: "12px", color: "#ff9800", fontWeight: 600, fontSize: "0.9rem" }}>
                        <div style={{ marginBottom: "4px" }}>
                          {booking.paymentInfo?.method || "Unknown"}
                        </div>
                        <div style={{
                          fontSize: "0.75rem",
                          color: booking.paymentInfo?.status === "completed"
                            ? "#4caf50"
                            : booking.paymentInfo?.status === "pending"
                              ? "#ff9800"
                              : "#999",
                          fontWeight: 700,
                          marginTop: "3px"
                        }}>
                          {booking.paymentInfo?.status === "completed"
                            ? "Paid"
                            : booking.paymentInfo?.status === "pending"
                              ? "Pending"
                              : booking.status === "pending"
                                ? "Pending"
                                : "Unknown"}
                        </div>
                      </td>
                      <td style={{ padding: "12px", color: "#2196f3", fontWeight: 700 }}>
                        ₱{Number(booking.finalPrice).toFixed(2)}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <span style={{
                          display: "inline-block",
                          minWidth: "90px",
                          padding: "6px 10px",
                          border: `1px solid ${getStatusColor(displayStatus)}`,
                          borderRadius: "6px",
                          color: getStatusColor(displayStatus),
                          fontWeight: 700,
                          fontSize: "0.85rem",
                          textAlign: "center",
                          textTransform: "capitalize"
                        }}>
                          {displayStatus}
                        </span>
                      </td>
                    </tr>
                      );
                    })()
                  ))}
                </tbody>
              </table>
            </div>
          )}

        {/* Pagination Controls */}
        {selectedDateBookings.length > itemsPerPage && (
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: isMobile ? "16px" : "20px",
            paddingTop: isMobile ? "16px" : "20px",
            borderTop: "1px solid #e0e0e0",
            flexWrap: isMobile ? "wrap" : "nowrap",
            gap: isMobile ? "8px" : "15px"
          }}>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              style={{
                background: currentPage === 1 ? "#ccc" : "#2196f3",
                color: "white",
                border: "none",
                padding: isMobile ? "8px 12px" : "10px 20px",
                borderRadius: "6px",
                fontWeight: 700,
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                fontSize: isMobile ? "0.8rem" : "0.9rem",
                transition: "all 0.3s ease",
                opacity: currentPage === 1 ? 0.5 : 1,
                flex: isMobile ? "0 1 auto" : "0 1 auto",
                minWidth: isMobile ? "auto" : "100px",
                minHeight: isMobile ? "36px" : "auto"
              }}
              onMouseEnter={(e) => {
                if (currentPage !== 1) {
                  e.currentTarget.style.background = "#1976d2";
                  e.currentTarget.style.boxShadow = "0 4px 8px rgba(33,150,243,0.3)";
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage !== 1) {
                  e.currentTarget.style.background = "#2196f3";
                  e.currentTarget.style.boxShadow = "none";
                }
              }}
            >
              ← Previous
            </button>

            <span style={{
              fontSize: isMobile ? "0.85rem" : "0.95rem",
              fontWeight: 600,
              color: "#666",
              whiteSpace: "nowrap",
              order: isMobile ? 3 : 0,
              width: isMobile ? "100%" : "auto",
              textAlign: "center"
            }}>
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              style={{
                background: currentPage === totalPages ? "#ccc" : "#2196f3",
                color: "white",
                border: "none",
                padding: isMobile ? "8px 12px" : "10px 20px",
                borderRadius: "6px",
                fontWeight: 700,
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                fontSize: isMobile ? "0.8rem" : "0.9rem",
                transition: "all 0.3s ease",
                opacity: currentPage === totalPages ? 0.5 : 1,
                flex: isMobile ? "0 1 auto" : "0 1 auto",
                minWidth: isMobile ? "auto" : "100px",
                minHeight: isMobile ? "36px" : "auto"
              }}
              onMouseEnter={(e) => {
                if (currentPage !== totalPages) {
                  e.currentTarget.style.background = "#1976d2";
                  e.currentTarget.style.boxShadow = "0 4px 8px rgba(33,150,243,0.3)";
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage !== totalPages) {
                  e.currentTarget.style.background = "#2196f3";
                  e.currentTarget.style.boxShadow = "none";
                }
              }}
            >
              Next →
            </button>
          </div>
        )}
        </div>
      )}
    </AdminLayout>
  );
}

export default BookingManagement;
