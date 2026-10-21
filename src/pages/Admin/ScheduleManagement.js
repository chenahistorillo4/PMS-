import { useEffect, useState } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, addDoc, onSnapshot, query, where, updateDoc, deleteDoc } from "firebase/firestore";
import AdminLayout from "./AdminLayout";
import { formatTime12Hour } from "../../utils/timeFormatter";
import { createTripNotifications } from "../../utils/notificationHelper";
import { getStaffAccount } from "../../utils/staffAccount";
import { useAuth } from "../../hooks/AuthContext";

function ScheduleManagement() {
  const { role } = useAuth();
  const isPortStaff = role === "portstaff";
  const [adminData, setAdminData] = useState(null);
  const [trips, setTrips] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [scheduleView, setScheduleView] = useState("upcoming"); // "upcoming" or "history"
  const [bookingCounts, setBookingCounts] = useState({}); // { scheduleId: count }
  const [currentPageUpcoming, setCurrentPageUpcoming] = useState(1);
  const [currentPageHistory, setCurrentPageHistory] = useState(1);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [imagePreview, setImagePreview] = useState(null);
  const [newTrip, setNewTrip] = useState({
    name: "",
    date: "",
    departure: "",
    arrival: "",
    capacity: 50,
    routeDirection: "",
    price: "",
    cargoPerKilo: "",
    allowPayLater: false,
    status: "Upcoming",
    boatImage: ""
  });

  // Fetch admin info (wait for auth to be ready)
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAdminData(null);
        return;
      }

      try {
        const account = await getStaffAccount(user.uid);
        if (account) {
          setAdminData(account.data);
        } else {
          setAdminData(null);
          console.error("Admin document not found for uid:", user.uid);
        }
      } catch (error) {
        console.error("Error fetching admin data:", error);
        setAdminData(null);
      }
    });

    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      unsubscribeAuth();
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Real-time listener for trips of this boat
  useEffect(() => {
    if (adminData?.assignedBoat) {
      const q = query(collection(db, "schedules"), where("boat", "==", adminData.assignedBoat));
      const unsubscribeTrips = onSnapshot(q, (snapshot) => {
        const tripList = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt ? data.createdAt.toDate() : null
          };
        });
        // Sort by date (descending)
        tripList.sort((a, b) => new Date(b.date) - new Date(a.date));
        setTrips(tripList);
      }, (error) => {
        console.error("Error listening to schedules:", error);
      });
      const bookingsQuery = query(
        collection(db, "bookings"),
        where("boat", "==", adminData.assignedBoat)
      );
      const unsubscribeBookings = onSnapshot(bookingsQuery, (snapshot) => {
        const counts = {};
        snapshot.docs.forEach((bookingDoc) => {
          const booking = bookingDoc.data();
          const bookingStatus = booking.status?.toLowerCase?.() || "";
          if (!booking.tripId || bookingStatus === "cancelled" || bookingStatus === "failed") return;
          counts[booking.tripId] = (counts[booking.tripId] || 0) + 1;
        });
        setBookingCounts(counts);
      }, (error) => {
        console.error("Error listening to bookings:", error);
      });

      return () => {
        unsubscribeTrips();
        unsubscribeBookings();
      };
    }
  }, [adminData]);

  const handleSaveTrip = async (e) => {
  e.preventDefault();
    if (!adminData || isPortStaff) return;

  try {
    // Use Base64 image preview if available, otherwise use existing image or empty string
    const boatImageToSave = imagePreview || newTrip.boatImage || "";

    if (editingId) {
      // Update existing trip
      const tripRef = doc(db, "schedules", editingId);
      const oldTrip = trips.find(t => t.id === editingId);
      
      await updateDoc(tripRef, {
        ...newTrip,
        boatImage: boatImageToSave,
        boat: adminData.assignedBoat,
        route: adminData.assignedRoute,
        routeDirection: newTrip.routeDirection,
        price: newTrip.price,
        cargoPerKilo: parseFloat(newTrip.cargoPerKilo) || 20
      });

      // Create notification if status changed to Cancelled
      if (oldTrip?.status !== "Cancelled" && newTrip.status === "Cancelled") {
        await createTripNotifications(
          adminData.assignedBoat,
          editingId,
          "trip_cancelled",
          "Trip Cancelled",
          `Trip "${newTrip.name}" has been cancelled.`,
          `Your trip "${newTrip.name}" on ${newTrip.date} has been cancelled. You will receive a refund.`,
          {
            name: newTrip.name,
            date: newTrip.date,
            departure: newTrip.departure,
            arrival: newTrip.arrival,
            boat: adminData.assignedBoat
          }
        );
      }
      // Create notification for other updates
      else if (oldTrip?.status !== newTrip.status || 
               oldTrip?.departure !== newTrip.departure || 
               oldTrip?.arrival !== newTrip.arrival) {
        await createTripNotifications(
          adminData.assignedBoat,
          editingId,
          "trip_updated",
          "Trip Updated",
          `Trip "${newTrip.name}" details have been updated.`,
          `Trip "${newTrip.name}" on ${newTrip.date} has been updated. Please check the new details.`,
          {
            name: newTrip.name,
            date: newTrip.date,
            departure: newTrip.departure,
            arrival: newTrip.arrival,
            boat: adminData.assignedBoat
          }
        );
      }

      alert("Trip updated successfully!");
      setEditingId(null);
    } else {
      // Add new trip
      await addDoc(collection(db, "schedules"), {
        ...newTrip,
        boatImage: boatImageToSave,
        boat: adminData.assignedBoat,
        route: adminData.assignedRoute,
        routeDirection: newTrip.routeDirection,
        price: newTrip.price,
        cargoPerKilo: parseFloat(newTrip.cargoPerKilo) || 20,
        date: newTrip.date,
        createdAt: new Date()
      });
      alert("New trip added successfully!");
    }

    setShowForm(false);
    setImagePreview(null);
    const input = document.getElementById("boatImageInput");
    if (input) input.value = "";
    setNewTrip({ name: "", date: "", departure: "", arrival: "", capacity: 50, status: "Upcoming", boatImage: "", cargoPerKilo: "", allowPayLater: false });
  } catch (error) {
    alert("Error saving trip: " + error.message);
  }
};

const handleEditTrip = (trip) => {
  if (isPortStaff) return;
  setNewTrip({
    name: trip.name,
    date: trip.date,
    departure: trip.departure,
    arrival: trip.arrival,
    capacity: trip.capacity,
    status: trip.status,
    routeDirection: trip.routeDirection,
    price: trip.price,
    cargoPerKilo: trip.cargoPerKilo || "",
    allowPayLater: trip.allowPayLater === true,
    boatImage: trip.boatImage || ""
  });
  setImagePreview(trip.boatImage || null);
  setEditingId(trip.id);
  setShowForm(true);
};

const handleDeleteTrip = async (id) => {
  if (isPortStaff) return;
  try {
    const tripToDelete = trips.find(t => t.id === id);
    if (!tripToDelete) return;

    // Create notifications before deleting
    await createTripNotifications(
      tripToDelete.boat,
      id,
      "trip_cancelled",
      "Trip Cancelled",
      `Trip "${tripToDelete.name}" has been deleted/cancelled.`,
      `Your trip "${tripToDelete.name}" on ${tripToDelete.date} has been cancelled. You will receive a refund.`,
      {
        name: tripToDelete.name,
        date: tripToDelete.date,
        departure: tripToDelete.departure,
        arrival: tripToDelete.arrival,
        boat: tripToDelete.boat
      }
    );

    await deleteDoc(doc(db, "schedules", id));
    alert("Trip deleted successfully and notifications sent!");
  } catch (error) {
    alert("Error deleting trip: " + error.message);
  }
};

const handleImageChange = (e) => {
  const file = e.target.files[0];
  if (file) {
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("File size must be less than 5MB");
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    // Convert to Base64 for preview and storage
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result); // Base64 data URL
    };
    reader.readAsDataURL(file);
  }
};

// Separate trips strictly by admin-managed status.
// A trip stays in upcoming until the admin explicitly changes it to Departed or Cancelled.
const upcomingTrips = trips.filter(
  (t) => t.status !== "Departed" && t.status !== "Cancelled"
);
const historyTripsRaw = trips.filter(
  (t) => t.status === "Departed" || t.status === "Cancelled"
);
// Sort history by date descending (latest dates first)
const historyTrips = [...historyTripsRaw].sort((a, b) => new Date(b.date) - new Date(a.date));

// Pagination logic
const ITEMS_PER_PAGE = 10;
const currentPage = scheduleView === "upcoming" ? currentPageUpcoming : currentPageHistory;
const tripList = scheduleView === "upcoming" ? upcomingTrips : historyTrips;
const totalPages = Math.ceil(tripList.length / ITEMS_PER_PAGE);
const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
const endIndex = startIndex + ITEMS_PER_PAGE;
const displayedTrips = tripList.slice(startIndex, endIndex);

  return (
    <AdminLayout active="schedule">
      <h2 style={{
        fontWeight: "800",
        fontSize: isMobile ? "1.1rem" : "1.3rem",
        color: "#1a1a1a",
        marginBottom: isMobile ? "12px" : "20px",
        marginTop: "0",
        letterSpacing: "0.3px"
      }}>Schedule Management</h2>

      {adminData && (
        <p style={{
          fontSize: isMobile ? "0.8rem" : "0.95rem",
          color: "#666",
          marginBottom: isMobile ? "16px" : "20px",
          fontWeight: "500"
        }}>
          View and manage ferry trip schedules for <strong>{adminData.assignedBoat}</strong>
        </p>
      )}

      {/* Add/Edit Trip Form Modal */}
      {showForm && adminData && (
        <div style={{
          position: "fixed",
          top: "0",
          left: "0",
          right: "0",
          bottom: "0",
          background: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: isMobile ? "8px" : "20px"
        }}>
          <div style={{
            background: "white",
            borderRadius: "12px",
            padding: isMobile ? "10px 8px" : "24px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            maxWidth: "600px",
            width: "100%",
            maxHeight: "90vh",
            overflowY: "auto"
          }}>
            <h3 style={{
              fontSize: isMobile ? "0.75rem" : "1.2rem",
              fontWeight: 800,
              color: "#1a1a1a",
              marginBottom: isMobile ? "8px" : "20px",
              marginTop: "0"
            }}>
              {editingId ? "Edit Trip" : "Add New Trip"}
            </h3>
            <form onSubmit={handleSaveTrip}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: isMobile ? "8px" : "15px",
                marginBottom: isMobile ? "10px" : "20px"
              }}>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: isMobile ? "0.6rem" : "0.85rem",
                    fontWeight: 700,
                    color: "#333",
                    marginBottom: isMobile ? "3px" : "8px"
                  }}>Trip Name *</label>
                  <input 
                    type="text" 
                    placeholder="e.g., Morning Express"
                    value={newTrip.name} 
                    onChange={(e)=>setNewTrip({...newTrip,name:e.target.value})} 
                    required
                    style={{
                      width: "100%",
                      padding: isMobile ? "4px 6px" : "10px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      fontSize: isMobile ? "11px" : "0.9rem",
                      fontFamily: "inherit",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: isMobile ? "0.6rem" : "0.85rem",
                    fontWeight: 700,
                    color: "#333",
                    marginBottom: isMobile ? "3px" : "8px"
                  }}>Date *</label>
                  <input 
                    type="date" 
                    value={newTrip.date} 
                    onChange={(e)=>setNewTrip({...newTrip,date:e.target.value})} 
                    required
                    style={{
                      width: "100%",
                      padding: isMobile ? "4px 6px" : "10px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      fontSize: isMobile ? "11px" : "0.9rem",
                      fontFamily: "inherit",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: isMobile ? "0.6rem" : "0.85rem",
                    fontWeight: 700,
                    color: "#333",
                    marginBottom: isMobile ? "3px" : "8px"
                  }}>Departure Time *</label>
                  <input 
                    type="time" 
                    value={newTrip.departure} 
                    onChange={(e)=>setNewTrip({...newTrip,departure:e.target.value})} 
                    required
                    style={{
                      width: "100%",
                      padding: isMobile ? "4px 6px" : "10px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      fontSize: isMobile ? "11px" : "0.9rem",
                      fontFamily: "inherit",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: isMobile ? "0.6rem" : "0.85rem",
                    fontWeight: 700,
                    color: "#333",
                    marginBottom: isMobile ? "3px" : "8px"
                  }}>Estimated Arrival (ETA) *</label>
                  <input 
                    type="time" 
                    value={newTrip.arrival} 
                    onChange={(e)=>setNewTrip({...newTrip,arrival:e.target.value})} 
                    required
                    style={{
                      width: "100%",
                      padding: isMobile ? "4px 6px" : "10px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      fontSize: isMobile ? "11px" : "0.9rem",
                      fontFamily: "inherit",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: isMobile ? "0.6rem" : "0.85rem",
                    fontWeight: 700,
                    color: "#333",
                    marginBottom: isMobile ? "3px" : "8px"
                  }}>Capacity *</label>
                  <input 
                    type="number" 
                    placeholder="50"
                    value={newTrip.capacity} 
                    onChange={(e)=>setNewTrip({...newTrip,capacity:e.target.value})}
                    style={{
                      width: "100%",
                      padding: isMobile ? "4px 6px" : "10px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      fontSize: isMobile ? "11px" : "0.9rem",
                      fontFamily: "inherit",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: isMobile ? "0.6rem" : "0.85rem",
                    fontWeight: 700,
                    color: "#333",
                    marginBottom: isMobile ? "3px" : "8px"
                  }}>Route Direction *</label>
                  <select
                    value={newTrip.routeDirection}
                    onChange={(e)=>setNewTrip({...newTrip, routeDirection:e.target.value})}
                    required
                    style={{
                      width: "100%",
                      padding: isMobile ? "4px 6px" : "10px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      fontSize: isMobile ? "11px" : "0.9rem",
                      fontFamily: "inherit",
                      boxSizing: "border-box"
                    }}
                  >
                    <option value="">Select Route</option>
                    {adminData?.availableRoutes?.map((route) => (
                      <option key={route} value={route}>{route}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: isMobile ? "0.6rem" : "0.85rem",
                    fontWeight: 700,
                    color: "#333",
                    marginBottom: isMobile ? "3px" : "8px"
                  }}>Price (₱) *</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={newTrip.price}
                    onChange={(e)=>setNewTrip({...newTrip, price:e.target.value})}
                    required
                    style={{
                      width: "100%",
                      padding: isMobile ? "4px 6px" : "10px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      fontSize: isMobile ? "11px" : "0.9rem",
                      fontFamily: "inherit",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
                <label style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  color: "#333",
                  fontSize: isMobile ? "0.7rem" : "0.85rem",
                  lineHeight: 1.4
                }}>
                  <input
                    type="checkbox"
                    checked={newTrip.allowPayLater}
                    onChange={(e) => setNewTrip({ ...newTrip, allowPayLater: e.target.checked })}
                    style={{ marginTop: "2px" }}
                  />
                  Booking only; passengers can reserve now and pay manually later.
                </label>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: isMobile ? "0.6rem" : "0.85rem",
                    fontWeight: 700,
                    color: "#333",
                    marginBottom: isMobile ? "3px" : "8px"
                  }}>Cargo Price Per Kilo (₱) *</label>
                  <input
                    type="number"
                    placeholder="20"
                    value={newTrip.cargoPerKilo}
                    onChange={(e)=>setNewTrip({...newTrip, cargoPerKilo:e.target.value})}
                    required
                    style={{
                      width: "100%",
                      padding: isMobile ? "4px 6px" : "10px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      fontSize: isMobile ? "11px" : "0.9rem",
                      fontFamily: "inherit",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: isMobile ? "0.6rem" : "0.85rem",
                    fontWeight: 700,
                    color: "#333",
                    marginBottom: isMobile ? "3px" : "8px"
                  }}>Status *</label>
                  <select 
                    value={newTrip.status} 
                    onChange={(e)=>setNewTrip({...newTrip,status:e.target.value})}
                    style={{
                      width: "100%",
                      padding: isMobile ? "4px 6px" : "10px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      fontSize: isMobile ? "11px" : "0.9rem",
                      fontFamily: "inherit",
                      boxSizing: "border-box"
                    }}
                  >
                    <option>Upcoming</option>
                    <option>Boarding</option>
                    <option>Departed</option>
                    <option>Cancelled</option>
                  </select>
                </div>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: isMobile ? "0.6rem" : "0.85rem",
                    fontWeight: 700,
                    color: "#333",
                    marginBottom: isMobile ? "3px" : "8px"
                  }}>Boat Picture</label>
                  <input 
                    id="boatImageInput"
                    type="file" 
                    accept="image/*"
                    onChange={handleImageChange}
                    style={{
                      width: "100%",
                      padding: isMobile ? "4px 6px" : "10px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                      fontSize: isMobile ? "11px" : "0.9rem",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                      cursor: "pointer"
                    }}
                  />
                </div>
                {imagePreview && (
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    marginTop: "10px",
                    gap: "10px"
                  }}>
                    <img 
                      src={imagePreview} 
                      alt="Boat Preview" 
                      style={{
                        maxWidth: "200px",
                        maxHeight: "200px",
                        borderRadius: "8px",
                        border: "2px solid #2196f3",
                        objectFit: "cover"
                      }}
                    />
                <button
                  type="button"
                  onClick={() => {
                    setImagePreview(null);
                    const input = document.getElementById("boatImageInput");
                    if (input) input.value = "";
                  }}
                  style={{
                    background: "#f44336",
                    color: "white",
                    border: "none",
                    padding: isMobile ? "5px 8px" : "6px 12px",
                    borderRadius: "6px",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: isMobile ? "0.7rem" : "0.85rem",
                    transition: "all 0.3s ease"
                  }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#d32f2f";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#f44336";
                      }}
                    >
                      Remove Image
                    </button>
                  </div>
                )}
              </div>

              <div style={{ 
                display: "flex", 
                gap: isMobile ? "8px" : "12px",
                justifyContent: "flex-end",
                flexWrap: "wrap"
              }}>
                <button 
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setImagePreview(null);
                    const input = document.getElementById("boatImageInput");
                    if (input) input.value = "";
                    setNewTrip({ name: "", date: "", departure: "", arrival: "", capacity: 50, status: "Upcoming", boatImage: "", cargoPerKilo: "", allowPayLater: false });
                  }}
                  style={{
                    background: "#f5f5f5",
                    color: "#333",
                    border: "1px solid #ddd",
                    padding: isMobile ? "4px 8px" : "10px 18px",
                    borderRadius: "8px",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: isMobile ? "0.7rem" : "0.85rem",
                    transition: "all 0.3s ease",
                    flex: 1,
                    minWidth: isMobile ? "50px" : "100px"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#e0e0e0";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#f5f5f5";
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  style={{
                    background: "#4caf50",
                    color: "white",
                    border: "none",
                    padding: isMobile ? "4px 8px" : "10px 18px",
                    borderRadius: "8px",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: isMobile ? "0.7rem" : "0.85rem",
                    transition: "all 0.3s ease",
                    flex: 1,
                    minWidth: isMobile ? "50px" : "100px"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#45a049";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(76,175,80,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#4caf50";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                  }}
                >
                  {editingId ? "Update Trip" : "Save Trip"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Button Section */}
      <div style={{
        display: "flex",
        gap: isMobile ? "6px" : "8px",
        marginBottom: isMobile ? "16px" : "20px",
        flexWrap: "wrap"
      }}>
        <button
          onClick={() => setScheduleView("upcoming")}
          style={{
            padding: isMobile ? "6px 10px" : "8px 16px",
            border: "none",
            borderRadius: "6px",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: isMobile ? "0.7rem" : "0.85rem",
            background: scheduleView === "upcoming" ? "#2196f3" : "#e0e0e0",
            color: scheduleView === "upcoming" ? "white" : "#333",
            transition: "all 0.3s ease",
            display: "flex",
            alignItems: "center",
            gap: isMobile ? "4px" : "6px"
          }}
          onMouseEnter={(e) => {
            if (scheduleView !== "upcoming") {
              e.currentTarget.style.background = "#d0d0d0";
            }
          }}
          onMouseLeave={(e) => {
            if (scheduleView !== "upcoming") {
              e.currentTarget.style.background = "#e0e0e0";
            }
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          Upcoming ({upcomingTrips.length})
        </button>
        <button
          onClick={() => setScheduleView("history")}
          style={{
            padding: isMobile ? "6px 10px" : "8px 16px",
            border: "none",
            borderRadius: "6px",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: isMobile ? "0.7rem" : "0.85rem",
            background: scheduleView === "history" ? "#2196f3" : "#e0e0e0",
            color: scheduleView === "history" ? "white" : "#333",
            transition: "all 0.3s ease",
            display: "flex",
            alignItems: "center",
            gap: isMobile ? "4px" : "6px"
          }}
          onMouseEnter={(e) => {
            if (scheduleView !== "history") {
              e.currentTarget.style.background = "#d0d0d0";
            }
          }}
          onMouseLeave={(e) => {
            if (scheduleView !== "history") {
              e.currentTarget.style.background = "#e0e0e0";
            }
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
            <polyline points="13 2 13 9 20 9"></polyline>
            <line x1="9" y1="13" x2="15" y2="13"></line>
            <line x1="9" y1="17" x2="15" y2="17"></line>
          </svg>
          History
        </button>
      </div>

      {/* Detailed Schedule Table */}
      <div style={{
        background: "white",
        borderRadius: "12px",
        padding: isMobile ? "12px" : "20px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        border: "1px solid #e0e8f0",
        borderTop: "4px solid #2196f3",
        transition: "all 0.3s ease"
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: isMobile ? "flex-start" : "center",
          marginBottom: isMobile ? "12px" : "20px",
          flexWrap: "wrap",
          gap: isMobile ? "8px" : "15px"
        }}>
          <h2 style={{
            fontSize: isMobile ? "0.95rem" : "1.1rem",
            fontWeight: 800,
            color: "#1a1a1a",
            margin: "0"
          }}>Trip Schedule</h2>
          {!isPortStaff && !showForm && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button 
              onClick={() => setShowForm(true)}
              style={{
                background: "#2196f3",
                color: "white",
                border: "none",
                padding: isMobile ? "6px 12px" : "10px 20px",
                borderRadius: "8px",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: isMobile ? "0.75rem" : "0.85rem",
                transition: "all 0.3s ease",
                whiteSpace: "nowrap"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#1976d2";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(33,150,243,0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#2196f3";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
              }}
            >
              + Add Trip
            </button>
            </div>
          )}
        </div>
        <div style={{
          overflowX: "auto",
          WebkitOverflowScrolling: "touch"
        }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse"
          }}>
            <thead>
              <tr style={{
                background: "linear-gradient(135deg, #2196f3 0%, #1976d2 100%)",
                color: "white"
              }}>
                <th style={{
                  padding: isMobile ? "8px 6px" : "14px 12px",
                  textAlign: "left",
                  fontWeight: 700,
                  fontSize: isMobile ? "0.7rem" : "0.9rem"
                }}>Trip Name</th>
                <th style={{
                  padding: isMobile ? "8px 6px" : "14px 12px",
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: isMobile ? "0.65rem" : "0.9rem"
                }}>Boat</th>
                <th style={{
                  padding: isMobile ? "8px 6px" : "14px 12px",
                  textAlign: "left",
                  fontWeight: 700,
                  fontSize: isMobile ? "0.7rem" : "0.9rem"
                }}>Date</th>
                <th style={{
                  padding: isMobile ? "8px 6px" : "14px 12px",
                  textAlign: "left",
                  fontWeight: 700,
                  fontSize: isMobile ? "0.7rem" : "0.9rem"
                }}>Departure</th>
                <th style={{
                  padding: isMobile ? "8px 6px" : "14px 12px",
                  textAlign: "left",
                  fontWeight: 700,
                  fontSize: isMobile ? "0.65rem" : "0.9rem",
                  whiteSpace: "nowrap"
                }}>ETA</th>
                <th style={{
                  padding: isMobile ? "8px 6px" : "14px 12px",
                  textAlign: "left",
                  fontWeight: 700,
                  fontSize: isMobile ? "0.7rem" : "0.9rem"
                }}>Cap</th>
                <th style={{
                  padding: isMobile ? "8px 6px" : "14px 12px",
                  textAlign: "left",
                  fontWeight: 700,
                  fontSize: isMobile ? "0.65rem" : "0.9rem"
                }}>Route</th>
                <th style={{
                  padding: isMobile ? "8px 6px" : "14px 12px",
                  textAlign: "right",
                  fontWeight: 700,
                  fontSize: isMobile ? "0.7rem" : "0.9rem"
                }}>Price</th>
                <th style={{
                  padding: isMobile ? "8px 6px" : "14px 12px",
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: isMobile ? "0.65rem" : "0.9rem",
                  whiteSpace: "nowrap"
                }}>Available</th>
                <th style={{
                  padding: isMobile ? "8px 6px" : "14px 12px",
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: isMobile ? "0.7rem" : "0.9rem"
                }}>Status</th>
                <th style={{
                  padding: isMobile ? "8px 6px" : "14px 12px",
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: isMobile ? "0.7rem" : "0.9rem"
                }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedTrips.length === 0 ? (
                <tr>
                  <td colSpan="11" style={{
                    padding: isMobile ? "24px 12px" : "40px 20px",
                    textAlign: "center",
                    color: "#999",
                    fontSize: isMobile ? "0.85rem" : "0.95rem"
                  }}>
                    No {scheduleView === "upcoming" ? "upcoming" : "history"} trips yet.
                  </td>
                </tr>
              ) : (
                displayedTrips.map((trip, index) => (
                  <tr key={trip.id} style={{
                    borderBottom: "1px solid #e0e0e0",
                    background: index % 2 === 0 ? "white" : "#f9f9f9",
                    transition: "all 0.3s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f0f7fb";
                    e.currentTarget.style.boxShadow = "inset 0 0 6px rgba(33,150,243,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = index % 2 === 0 ? "white" : "#f9f9f9";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  >
                    <td style={{
                      padding: isMobile ? "8px 4px" : "12px",
                      fontWeight: 700,
                      color: "#333",
                      fontSize: isMobile ? "0.75rem" : "0.9rem"
                    }}>{trip.name}</td>
                    <td style={{
                      padding: isMobile ? "8px 4px" : "12px",
                      textAlign: "center"
                    }}>
                      {trip.boatImage ? (
                        <img 
                          src={trip.boatImage} 
                          alt={trip.name}
                          style={{
                            width: isMobile ? "40px" : "60px",
                            height: isMobile ? "40px" : "60px",
                            borderRadius: "6px",
                            objectFit: "cover",
                            border: "1px solid #ddd"
                          }}
                        />
                      ) : (
                        <div style={{
                          width: isMobile ? "40px" : "60px",
                          height: isMobile ? "40px" : "60px",
                          background: "#f0f0f0",
                          borderRadius: "6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#999",
                          fontSize: isMobile ? "0.7rem" : "0.85rem"
                        }}>
                          No Image
                        </div>
                      )}
                    </td>
                    <td style={{
                      padding: isMobile ? "8px 4px" : "12px",
                      color: "#666",
                      fontSize: isMobile ? "0.75rem" : "0.9rem"
                    }}>{trip.date}</td>
                    <td style={{
                      padding: isMobile ? "8px 4px" : "12px",
                      color: "#666",
                      fontSize: isMobile ? "0.75rem" : "0.9rem"
                    }}>{formatTime12Hour(trip.departure)}</td>
                    <td style={{
                      padding: isMobile ? "8px 4px" : "12px",
                      color: "#666",
                      fontSize: isMobile ? "0.75rem" : "0.9rem"
                    }}>{formatTime12Hour(trip.arrival)}</td>
                    <td style={{
                      padding: isMobile ? "8px 4px" : "12px",
                      color: "#666",
                      fontSize: isMobile ? "0.75rem" : "0.9rem"
                    }}>{trip.capacity}</td>
                    <td style={{
                      padding: isMobile ? "8px 4px" : "12px",
                      color: "#666",
                      fontSize: isMobile ? "0.7rem" : "0.9rem",
                      maxWidth: isMobile ? "60px" : "auto",
                      overflow: isMobile ? "hidden" : "visible",
                      textOverflow: isMobile ? "ellipsis" : "clip"
                    }}>{trip.routeDirection}</td>
                    <td style={{
                      padding: isMobile ? "8px 4px" : "12px",
                      color: "#2196f3",
                      fontWeight: 700,
                      fontSize: isMobile ? "0.75rem" : "0.9rem",
                      textAlign: "right"
                    }}>₱{trip.price}</td>
                    <td style={{
                      padding: isMobile ? "8px 4px" : "12px",
                      textAlign: "center"
                    }}>
                      <span style={{
                        display: "inline-block",
                        background: "#2196f3",
                        color: "white",
                        padding: isMobile ? "4px 6px" : "6px 12px",
                        borderRadius: "20px",
                        fontSize: isMobile ? "0.65rem" : "0.8rem",
                        fontWeight: 700,
                        whiteSpace: "nowrap"
                      }}>
                        {bookingCounts[trip.id] !== undefined ? bookingCounts[trip.id] : trip.capacity} / {trip.capacity}
                      </span>
                    </td>
                    <td style={{
                      padding: isMobile ? "8px 4px" : "12px",
                      textAlign: "center"
                    }}>
                      <span style={{
                        display: "inline-block",
                        background: trip.status === "Departed" ? "#4caf50" : trip.status === "Boarding" ? "#ff9800" : trip.status === "Cancelled" ? "#f44336" : "#2196f3",
                        color: "white",
                        padding: isMobile ? "3px 6px" : "4px 12px",
                        borderRadius: "20px",
                        fontSize: isMobile ? "0.65rem" : "0.8rem",
                        fontWeight: 700,
                        whiteSpace: "nowrap"
                      }}>
                        {trip.status}
                      </span>
                    </td>
                    <td style={{
                      padding: isMobile ? "4px 2px" : "16px",
                      textAlign: "center",
                      fontSize: isMobile ? "0.65rem" : "0.9rem",
                      display: "flex",
                      gap: isMobile ? "3px" : "12px",
                      justifyContent: "center",
                      flexWrap: "wrap",
                      minHeight: isMobile ? "32px" : "40px",
                      alignItems: "center",
                      width: "100%"
                    }}>
                      {!isPortStaff && scheduleView === "upcoming" && (
                        <>
                          <button 
                            onClick={() => handleEditTrip(trip)}
                            style={{
                              background: "#ffc107",
                              color: "white",
                              border: "none",
                              padding: isMobile ? "4px 6px" : "6px 12px",
                              borderRadius: "6px",
                              fontWeight: 700,
                              cursor: "pointer",
                              fontSize: isMobile ? "0.65rem" : "0.8rem",
                              transition: "all 0.3s ease",
                              whiteSpace: "nowrap"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#ffa000";
                              e.currentTarget.style.boxShadow = "0 4px 12px rgba(255,160,0,0.3)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "#ffc107";
                              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                            }}
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => handleDeleteTrip(trip.id)}
                            style={{
                              background: "#f44336",
                              color: "white",
                              border: "none",
                              padding: isMobile ? "4px 6px" : "6px 12px",
                              borderRadius: "6px",
                              fontWeight: 700,
                              cursor: "pointer",
                              fontSize: isMobile ? "0.65rem" : "0.8rem",
                              transition: "all 0.3s ease",
                              whiteSpace: "nowrap"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#d32f2f";
                              e.currentTarget.style.boxShadow = "0 4px 12px rgba(244,67,54,0.3)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "#f44336";
                              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                      {!isPortStaff && scheduleView === "history" && (
                        <button 
                          onClick={() => handleDeleteTrip(trip.id)}
                          style={{
                            background: "#f44336",
                            color: "white",
                            border: "none",
                            padding: isMobile ? "4px 6px" : "6px 12px",
                            borderRadius: "6px",
                            fontWeight: 700,
                            cursor: "pointer",
                            fontSize: isMobile ? "0.65rem" : "0.8rem",
                            transition: "all 0.3s ease",
                            whiteSpace: "nowrap"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#d32f2f";
                            e.currentTarget.style.boxShadow = "0 4px 12px rgba(244,67,54,0.3)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#f44336";
                            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {tripList.length > ITEMS_PER_PAGE && (
          <div style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: isMobile ? "8px" : "12px",
            marginTop: isMobile ? "12px" : "20px",
            paddingTop: isMobile ? "12px" : "20px",
            borderTop: "1px solid #e0e0e0",
            flexWrap: "wrap"
          }}>
            <button
              onClick={() => {
                if (scheduleView === "upcoming") {
                  setCurrentPageUpcoming(prev => Math.max(prev - 1, 1));
                } else {
                  setCurrentPageHistory(prev => Math.max(prev - 1, 1));
                }
              }}
              disabled={currentPage === 1}
              style={{
                background: currentPage === 1 ? "#e0e0e0" : "#2196f3",
                color: currentPage === 1 ? "#999" : "white",
                border: "none",
                padding: isMobile ? "6px 12px" : "10px 18px",
                borderRadius: "6px",
                fontWeight: 700,
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                fontSize: isMobile ? "0.75rem" : "0.85rem",
                transition: "all 0.3s ease"
              }}
              onMouseEnter={(e) => {
                if (currentPage !== 1) {
                  e.currentTarget.style.background = "#1976d2";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(33,150,243,0.3)";
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage !== 1) {
                  e.currentTarget.style.background = "#2196f3";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                }
              }}
            >
              ← Previous
            </button>

            <span style={{
              fontSize: isMobile ? "0.75rem" : "0.9rem",
              fontWeight: 700,
              color: "#666",
              minWidth: isMobile ? "70px" : "100px",
              textAlign: "center"
            }}>
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => {
                if (scheduleView === "upcoming") {
                  setCurrentPageUpcoming(prev => Math.min(prev + 1, totalPages));
                } else {
                  setCurrentPageHistory(prev => Math.min(prev + 1, totalPages));
                }
              }}
              disabled={currentPage === totalPages}
              style={{
                background: currentPage === totalPages ? "#e0e0e0" : "#2196f3",
                color: currentPage === totalPages ? "#999" : "white",
                border: "none",
                padding: isMobile ? "6px 12px" : "10px 18px",
                borderRadius: "6px",
                fontWeight: 700,
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                fontSize: isMobile ? "0.75rem" : "0.85rem",
                transition: "all 0.3s ease"
              }}
              onMouseEnter={(e) => {
                if (currentPage !== totalPages) {
                  e.currentTarget.style.background = "#1976d2";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(33,150,243,0.3)";
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage !== totalPages) {
                  e.currentTarget.style.background = "#2196f3";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                }
              }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default ScheduleManagement;
