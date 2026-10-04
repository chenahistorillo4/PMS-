import { useEffect, useState } from "react";
import { db } from "../../firebase";
import { doc, getDoc, collection, getDocs, query, where, updateDoc } from "firebase/firestore";
import AdminLayout from "./AdminLayout";
import { useAuthReloadKey, useAuthUser } from "../../hooks/useAuthUser";
import { getStaffAccount } from "../../utils/staffAccount";

const normalizeRoute = (route) =>
  String(route || "").toLowerCase().replace(/[^a-z0-9]/g, "");

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
            const bookingRoutes = bookingsList
              .map((booking) => booking.routeDirection || booking.route)
              .filter(Boolean);
            const boatSnapshot = await getDocs(
              query(collection(db, "boats"), where("name", "==", admin.assignedBoat))
            );
            const assignedBoat = boatSnapshot.docs[0]?.data();
            const boatRoutes = Array.isArray(assignedBoat?.availableRoutes)
              ? assignedBoat.availableRoutes
              : assignedBoat?.route
                ? [assignedBoat.route]
                : [];
            const routeOptions = [...new Set(
              [
                ...boatRoutes,
                ...(Array.isArray(admin.availableRoutes) ? admin.availableRoutes : []),
                admin.assignedRoute,
                ...bookingRoutes
              ].filter(Boolean)
            )].sort();
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
                  method: payment.method || payment.accountType || "Unknown",
                  accountNumber: payment.accountNumber || payment.paymentAccountNumber || "N/A",
                  accountHolder: payment.accountHolder || "N/A",
                  status: payment.status || "pending"
                };
              }
            });

            // Merge payment info into bookings
            bookingsList = bookingsList.map(booking => ({
              ...booking,
              paymentInfo: paymentMap[booking.id] || {
                method: "Unknown",
                accountNumber: "N/A",
                accountHolder: "N/A",
                status: "unknown"
              }
            }));

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

            // Keep pending reservations visible; cancelled bookings are excluded from active records.
            bookingsList = bookingsList.filter((booking) => {
              const status = String(booking.status || "").toLowerCase();
              return status === "pending" || status === "confirmed" || status === "departed";
            });

            // Sort by date descending (most recent first)
            bookingsList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setBookings(bookingsList);

            // Check and update departed bookings
            updateDepartedBookings(bookingsList);
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

  // Get bookings for selected date and schedule
  const getSelectedDateBookings = () => {
    let filtered = bookings.filter(
      (b) =>
        (!selectedDate || b.date === selectedDate) &&
        ["pending", "confirmed", "departed"].includes(String(b.status || "").toLowerCase()) &&
        (selectedRoute === "all" ||
          !selectedRoute ||
          normalizeRoute(b.routeDirection || b.route) === normalizeRoute(selectedRoute))
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

    if (["cancelled", "departed", "scanned"].includes(bookingStatus)) return bookingStatus;
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
    return "#999";
  };

  return (
    <AdminLayout active="booking">
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
        View pending reservations and confirmed bookings for your assigned ferry boat. Pending payments can be confirmed or cancelled in Payment Management.
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
            <div style={{ marginTop: "5px", color: "#777", fontSize: isMobile ? "0.65rem" : "0.75rem" }}>
              Leave blank to show bookings for all dates.
            </div>
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
          <button
            onClick={() => {
              setHasSearched(true);
              // Scroll to selected date bookings
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
              alignSelf: "flex-start",
              marginTop: isMobile ? "18px" : "25px",
              flex: "0 0 auto",
              minWidth: isMobile ? "80px" : "auto",
              marginLeft: isMobile ? "auto" : "0",
              boxSizing: "border-box"
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "#1976d2";
              e.target.style.transform = "translateY(-2px)";
              e.target.style.boxShadow = "0 4px 12px rgba(33, 150, 243, 0.3)";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "#2196f3";
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "none";
            }}
          >
            Search
          </button>
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
          <h2 style={{ fontSize: isMobile ? "0.9rem" : "1.25rem", fontWeight: 800, color: "#1e3a5f", marginBottom: isMobile ? "12px" : "20px" }}>
            Bookings for {selectedDate ? formatDate(selectedDate) : "All Dates"} · {selectedRoute === "all" ? "All Routes" : selectedRoute || "All Routes"}
          </h2>

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
            <div style={{ width: "100%", overflowX: "auto", overflowY: "visible" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "100%" }}>
                {/* Mobile Header Row */}
                <div style={{ display: "flex", gap: "6px", background: "#f5f5f5", padding: "10px 12px", borderRadius: "8px", marginBottom: "4px", fontSize: "0.65rem", fontWeight: 700, color: "#1e3a5f", textTransform: "uppercase" }}>
                  <div style={{ flex: "0 0 20%", minWidth: "60px" }}>User Account</div>
                  <div style={{ flex: "0 0 20%", minWidth: "60px" }}>Passenger</div>
                  <div style={{ flex: "0 0 18%", minWidth: "50px" }}>Route</div>
                  <div style={{ flex: "0 0 15%", minWidth: "55px" }}>Date</div>
                  <div style={{ flex: "0 0 15%", minWidth: "45px" }}>Time</div>
                  <div style={{ flex: "0 0 13%", minWidth: "40px" }}>Payment</div>
                  <div style={{ flex: "0 0 14%", minWidth: "45px" }}>Amount</div>
                </div>

                {paginatedBookings.map((booking) => (
                  (() => {
                    const displayStatus = getDisplayBookingStatus(booking);
                    return (
                  <div key={booking.id} style={{
                    display: "flex",
                    gap: "6px",
                    alignItems: "center",
                    padding: "10px 12px",
                    background: "#ffffff",
                    border: "1px solid #e0e8f0",
                    borderRadius: "8px",
                    transition: "all 0.3s ease",
                    fontSize: "0.7rem"
                  }}>
                    <div style={{ flex: "0 0 20%", minWidth: "60px", fontWeight: 600, color: "#1976d2", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.65rem" }}>
                      {booking.bookedByName || booking.userEmail || "Unknown"}
                    </div>
                    <div style={{ flex: "0 0 20%", minWidth: "60px", fontWeight: 600, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {booking.customerName}
                    </div>
                    <div style={{ flex: "0 0 18%", minWidth: "50px", color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.65rem" }}>
                      {booking.routeDirection}
                    </div>
                    <div style={{ flex: "0 0 15%", minWidth: "55px", color: "#666", fontSize: "0.6rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {formatBookingDate(booking.date || booking.bookingDate)}
                    </div>
                    <div style={{ flex: "0 0 15%", minWidth: "45px", color: "#666", fontSize: "0.6rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {booking.departure} → {booking.arrival}
                    </div>
                    <div style={{ flex: "0 0 13%", minWidth: "40px", color: "#ff9800", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.6rem" }}>
                      <div>
                        {booking.paymentInfo?.method === "gcash" ? "GCash" : booking.paymentInfo?.method === "paymaya" ? "PayMaya" : booking.paymentInfo?.method?.charAt(0).toUpperCase() + booking.paymentInfo?.method?.slice(1)}
                      </div>
                      <div style={{
                        color: booking.paymentInfo?.status === "completed"
                          ? "#4caf50"
                          : booking.paymentInfo?.status === "pending"
                            ? "#ff9800"
                            : "#999"
                      }}>
                        {booking.paymentInfo?.status === "completed"
                          ? "Paid"
                          : booking.paymentInfo?.status === "pending"
                            ? "Payment Pending"
                            : booking.status === "pending"
                              ? "Pending"
                              : "Unknown"}
                      </div>
                    </div>
                    <div style={{ flex: "0 0 14%", minWidth: "45px", display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ color: "#2196f3", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        ₱{Number(booking.finalPrice).toFixed(2)}
                      </div>
                      <span style={{
                        display: "inline-block",
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "4px",
                        border: `1px solid ${getStatusColor(displayStatus)}`,
                        borderRadius: "4px",
                        color: getStatusColor(displayStatus),
                        fontWeight: 700,
                        fontSize: "0.55rem",
                        textAlign: "center",
                        textTransform: "capitalize"
                      }}>
                        {displayStatus}
                      </span>
                    </div>
                  </div>
                    );
                  })()
                ))}
              </div>
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
                          {booking.paymentInfo?.method === "gcash" ? "GCash" : booking.paymentInfo?.method === "paymaya" ? "PayMaya" : booking.paymentInfo?.method?.charAt(0).toUpperCase() + booking.paymentInfo?.method?.slice(1)}
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
