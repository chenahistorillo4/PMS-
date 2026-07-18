import { useEffect, useState } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc, collection, getDocs, query, where, updateDoc } from "firebase/firestore";
import AdminLayout from "./AdminLayout";

function BookingManagement() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedSchedule, setSelectedSchedule] = useState("all");
  const [hasSearched, setHasSearched] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Pagination logic
  const itemsPerPage = 10;

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const user = auth.currentUser;
      if (user) {
        setLoading(true);
        try {
          // Fetch admin data
          const adminDocRef = doc(db, "admins", user.uid);
          const adminDocSnap = await getDoc(adminDocRef);
          
          if (adminDocSnap.exists()) {
            const admin = adminDocSnap.data();

            // Fetch bookings for this boat
            const bookingsQuery = query(
              collection(db, "bookings"),
              where("boat", "==", admin.assignedBoat)
            );
            const bookingsSnap = await getDocs(bookingsQuery);
            let bookingsList = bookingsSnap.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));

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
                  accountHolder: payment.accountHolder || "N/A"
                };
              }
            });

            // Merge payment info into bookings
            bookingsList = bookingsList.map(booking => ({
              ...booking,
              paymentInfo: paymentMap[booking.id] || { method: "Unknown", accountNumber: "N/A", accountHolder: "N/A" }
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

            // Only paid/confirmed bookings belong in admin records.
            bookingsList = bookingsList.filter((booking) => {
              const status = String(booking.status || "").toLowerCase();
              return status === "confirmed" || status === "departed";
            });

            // Sort by date descending (most recent first)
            bookingsList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setBookings(bookingsList);

            // Check and update departed bookings
            updateDepartedBookings(bookingsList);
          }
        } catch (error) {
          console.error("Error fetching data:", error);
        }
        setLoading(false);
      }
    };
    fetchData();
  }, []);

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

  // Get bookings for selected date and schedule
  const getSelectedDateBookings = () => {
    let filtered = bookings.filter(
      (b) =>
        b.date === selectedDate &&
        (b.status === "confirmed" || b.status === "departed")
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

  const handleStatusChange = async (bookingId, newStatus) => {
    try {
      setLoading(true);
      const bookingRef = doc(db, "bookings", bookingId);
      await updateDoc(bookingRef, { status: newStatus });
      setBookings(bookings.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
      setLoading(false);
    } catch (error) {
      console.error("Error updating status: " + error.message);
      setLoading(false);
    }
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
        Booking transactions overview for your assigned ferry boat. Only paid and confirmed bookings appear here. Unpaid bookings stay in Payment Management until payment is completed.
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
        <div style={{ display: "flex", gap: isMobile ? "8px" : "15px", alignItems: "flex-end", flexWrap: isMobile ? "wrap" : "wrap" }}>
          <div style={{ flex: 1, minWidth: isMobile ? "120px" : "200px" }}>
            <label style={{ display: "block", fontSize: isMobile ? "0.7rem" : "0.85rem", fontWeight: 600, color: "#666", marginBottom: isMobile ? "4px" : "8px", textTransform: "uppercase" }}>
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
                boxSizing: "border-box",
                cursor: "pointer"
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: isMobile ? "120px" : "200px" }}>
            <label style={{ display: "block", fontSize: isMobile ? "0.7rem" : "0.85rem", fontWeight: 600, color: "#666", marginBottom: isMobile ? "4px" : "8px", textTransform: "uppercase" }}>
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
              background: "#2196f3",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: isMobile ? "0.7rem" : "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.3s ease",
              whiteSpace: "nowrap",
              flex: isMobile ? "0 0 auto" : "0 0 auto",
              minWidth: isMobile ? "80px" : "auto",
              marginLeft: isMobile ? "auto" : "0"
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
            Bookings for {formatDate(selectedDate)}
          </h2>

          {selectedDateBookings.length === 0 ? (
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
                  <div style={{ flex: "0 0 15%", minWidth: "45px" }}>Time</div>
                  <div style={{ flex: "0 0 13%", minWidth: "40px" }}>Payment</div>
                  <div style={{ flex: "0 0 14%", minWidth: "45px" }}>Amount</div>
                </div>

                {paginatedBookings.map((booking) => (
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
                    <div style={{ flex: "0 0 15%", minWidth: "45px", color: "#666", fontSize: "0.6rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {booking.departure} → {booking.arrival}
                    </div>
                    <div style={{ flex: "0 0 13%", minWidth: "40px", color: "#ff9800", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.6rem" }}>
                      {booking.paymentInfo?.method === "gcash" ? "GCash" : booking.paymentInfo?.method === "paymaya" ? "PayMaya" : booking.paymentInfo?.method?.charAt(0).toUpperCase() + booking.paymentInfo?.method?.slice(1)}
                    </div>
                    <div style={{ flex: "0 0 14%", minWidth: "45px", display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ color: "#2196f3", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        ₱{Number(booking.finalPrice).toFixed(2)}
                      </div>
                      <select
                        value={booking.status || "pending"}
                        onChange={e => handleStatusChange(booking.id, e.target.value)}
                        disabled={loading || booking.status === "departed"}
                        style={{
                          width: "100%",
                          padding: "3px 4px",
                          border: `2px solid ${getStatusColor(booking.status)}`,
                          borderRadius: "4px",
                          background: booking.status === "departed" ? "#f5f5f5" : "white",
                          color: booking.status === "departed" ? "#999" : "#333",
                          fontWeight: 600,
                          cursor: booking.status === "departed" ? "not-allowed" : "pointer",
                          fontSize: "0.55rem",
                          opacity: booking.status === "departed" ? 0.6 : 1
                        }}
                      >
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="departed">Departed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>
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
                      Time
                    </th>
                    <th style={{ padding: "12px", textAlign: "left", fontWeight: 700, color: "#1e3a5f", fontSize: "0.85rem", textTransform: "uppercase" }}>
                      Payment Account
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
                      <td style={{ padding: "12px", color: "#666", fontSize: "0.85rem" }}>
                        {booking.departure} → {booking.arrival}
                      </td>
                      <td style={{ padding: "12px", color: "#ff9800", fontWeight: 600, fontSize: "0.9rem" }}>
                        <div style={{ marginBottom: "4px" }}>
                          {booking.paymentInfo?.method === "gcash" ? "GCash" : booking.paymentInfo?.method === "paymaya" ? "PayMaya" : booking.paymentInfo?.method?.charAt(0).toUpperCase() + booking.paymentInfo?.method?.slice(1)}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "#666", fontWeight: 500 }}>
                          {booking.paymentInfo?.accountNumber || "N/A"}
                        </div>
                      </td>
                      <td style={{ padding: "12px", color: "#2196f3", fontWeight: 700 }}>
                        ₱{Number(booking.finalPrice).toFixed(2)}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <select
                          value={booking.status || "pending"}
                          onChange={e => handleStatusChange(booking.id, e.target.value)}
                          disabled={loading || booking.status === "departed"}
                          style={{
                            padding: "6px 10px",
                            border: `2px solid ${getStatusColor(booking.status)}`,
                            borderRadius: "6px",
                            background: booking.status === "departed" ? "#f5f5f5" : "white",
                            color: booking.status === "departed" ? "#999" : "#333",
                            fontWeight: 600,
                            cursor: booking.status === "departed" ? "not-allowed" : "pointer",
                            fontSize: "0.85rem",
                            opacity: booking.status === "departed" ? 0.6 : 1
                          }}
                        >
                          <option value="pending">Pending</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="departed">Departed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                    </tr>
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
