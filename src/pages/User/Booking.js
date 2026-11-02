import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { formatTime12Hour } from "../../utils/timeFormatter";
import BookingDetails from "./BookingDetails";

function Booking({ userId, userType }) {
  const [trips, setTrips] = useState([]);
  const [discounts, setDiscounts] = useState({});
  const [search, setSearch] = useState("");
  const [bookingCounts, setBookingCounts] = useState({});
  const [bookingCountsLoaded, setBookingCountsLoaded] = useState(false);
  const [expandedTrips, setExpandedTrips] = useState({});
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [showModal, setShowModal] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState(null);

  useEffect(() => {
    const contentElement = document.getElementById("booking-page-content");
    if (contentElement) {
      contentElement.scrollIntoView({ behavior: "auto", block: "start" });
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
    const unsubscribeTrips = onSnapshot(
      collection(db, "schedules"),
      (snapshot) => {
        setTrips(snapshot.docs.map((tripDoc) => ({ id: tripDoc.id, ...tripDoc.data() })));
      },
      (error) => console.error("Error listening to trips:", error)
    );

    getDocs(collection(db, "discounts"))
      .then((discountSnap) => {
        const discountData = {};
        discountSnap.docs.forEach((discountDoc) => {
          discountData[discountDoc.id] = discountDoc.data();
        });
        setDiscounts(discountData);
      })
      .catch((error) => console.error("Error fetching discounts:", error));

    return () => {
      unsubscribeTrips();
    };
  }, []);

  useEffect(() => {
    if (trips.length === 0) {
      setBookingCounts({});
      setBookingCountsLoaded(true);
      return undefined;
    }

    let isActive = true;
    const pendingInitialSnapshots = new Set(trips.map((trip) => trip.id));
    setBookingCountsLoaded(false);

    const unsubscribers = trips.map((trip) => {
      const bookingsQuery = query(
        collection(db, "bookings"),
        where("tripId", "==", trip.id)
      );
      return onSnapshot(
        bookingsQuery,
        (snapshot) => {
          if (!isActive) return;
          const activeBookingCount = snapshot.docs.filter((bookingDoc) => {
            const status = bookingDoc.data().status?.toLowerCase?.() || "";
            return status !== "cancelled" && status !== "failed";
          }).length;
          setBookingCounts((previous) => ({ ...previous, [trip.id]: activeBookingCount }));
          pendingInitialSnapshots.delete(trip.id);
          if (pendingInitialSnapshots.size === 0) setBookingCountsLoaded(true);
        },
        (error) => {
          console.error(`Error listening to bookings for trip ${trip.id}:`, error);
          pendingInitialSnapshots.delete(trip.id);
          if (pendingInitialSnapshots.size === 0) setBookingCountsLoaded(true);
        }
      );
    });

    return () => {
      isActive = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [trips]);

  const isTripDateInPast = (tripDate) => {
    if (!tripDate) return false;

    const parsedDate = tripDate?.toDate ? tripDate.toDate() : new Date(String(tripDate));
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tripDay = new Date(parsedDate);
    tripDay.setHours(0, 0, 0, 0);

    return tripDay < today;
  };

  const filteredTrips = trips.filter((trip) => {
    const matchesSearch =
      trip.name?.toLowerCase().includes(search.toLowerCase()) ||
      trip.boat?.toLowerCase().includes(search.toLowerCase()) ||
      trip.routeDirection?.toLowerCase().includes(search.toLowerCase());

    const isBookable =
      trip.status?.toLowerCase() !== "departed" &&
      trip.status?.toLowerCase() !== "cancelled" &&
      trip.status?.toLowerCase() !== "boarding";

    return matchesSearch && isBookable && !isTripDateInPast(trip.date);
  });

  const handleBookClick = (trip) => {
    if (isTripDateInPast(trip?.date)) {
      alert("This trip date has already passed. Please select an available schedule.");
      return;
    }

    setSelectedTrip(trip);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedTrip(null);
  };

  const handleToggleInfo = (tripId) => {
    setExpandedTrips((prev) => ({
      ...prev,
      [tripId]: !prev[tripId]
    }));
  };

  const getStatusBadgeColor = (status) => {
    if (!status) return "#999";
    const statusLower = status.toLowerCase();
    if (statusLower === "upcoming") return "#2196f3";
    if (statusLower === "boarding") return "#4caf50";
    if (statusLower === "depart") return "#ff7043";
    if (statusLower === "available") return "#26c6da";
    if (statusLower === "limited") return "#ffc107";
    if (statusLower === "full" || statusLower === "cancelled") return "#f44336";
    return "#999";
  };

  const getAvailableSpots = (trip) => {
    const capacity = trip.capacity || 0;
    const booked = bookingCounts[trip.id] || 0;
    return Math.max(0, capacity - booked);
  };

  return (
    <div
      id="booking-page-content"
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, rgba(255, 255, 255, 0.45) 0%, rgba(240, 248, 255, 0.40) 100%), url('/bg5.avif') center/cover fixed",
        paddingTop: isMobile ? "72px" : "0"
      }}
    >
        <div
          style={{
            padding: isMobile ? "14px 10px" : "64px 40px",
            maxWidth: isMobile ? "100%" : "1440px",
            margin: "0 auto"
          }}
        >
        <h1
          style={{
            textAlign: "center",
            fontSize: isMobile ? "1.2rem" : "3rem",
            fontWeight: 800,
            marginBottom: isMobile ? "6px" : "14px",
            color: "#1a1a1a"
          }}
        >
          Ferry Booking
        </h1>
        <p
          style={{
            textAlign: "center",
            fontSize: isMobile ? "0.76rem" : "0.98rem",
            color: "#666",
            marginBottom: isMobile ? "16px" : "42px",
            fontWeight: 500,
            maxWidth: "720px",
            marginLeft: "auto",
            marginRight: "auto",
            lineHeight: 1.5
          }}
        >
          Check available ferry trips and book your ticket.
        </p>

        <div
          style={{
            background: "rgba(255, 255, 255, 0.97)",
            padding: isMobile ? "14px 12px" : "36px 40px",
            borderRadius: "12px",
            marginBottom: isMobile ? "18px" : "48px",
            border: "1px solid #dcdcdc",
            boxShadow: "0 3px 10px rgba(0, 0, 0, 0.07)"
          }}
        >
          <label
            style={{
              fontWeight: 600,
              display: "block",
              marginBottom: isMobile ? "8px" : "14px",
              color: "#222",
              fontSize: isMobile ? "0.8rem" : "0.95rem"
            }}
          >
            Search Trip
          </label>
          <input
            type="text"
            placeholder="Search by trip name, boat, or route..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: isMobile ? "9px 10px" : "13px 16px",
              border: "1.5px solid #ddd",
              borderRadius: "8px",
              fontSize: isMobile ? "0.78rem" : "0.95rem",
              boxSizing: "border-box",
              transition: "all 0.2s ease",
              background: "white",
              fontFamily: "inherit",
              color: "#333"
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#2196f3";
              e.target.style.boxShadow = "0 0 0 3px rgba(33, 150, 243, 0.1)";
              e.target.style.outline = "none";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#ddd";
              e.target.style.boxShadow = "none";
            }}
          />
        </div>

        {filteredTrips.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: isMobile ? "24px 12px" : "60px 20px",
              color: "#999",
              fontSize: isMobile ? "0.78rem" : "1.05rem"
            }}
          >
            No trips found. Try adjusting your search criteria.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fill, minmax(360px, 1fr))",
              gap: isMobile ? "12px" : "28px",
              paddingBottom: isMobile ? "8px" : "0"
            }}
          >
            {filteredTrips.map((trip) => (
              <div
                key={trip.id}
                style={{
                  background: "#ffffff",
                  borderRadius: "12px",
                  border: "1px solid #e0e0e0",
                  overflow: "hidden",
                  transition: "all 0.3s ease",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#2196f3";
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 12px 24px rgba(0, 0, 0, 0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#e0e0e0";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.06)";
                }}
              >
                {(() => {
                  const isExpanded = !!expandedTrips[trip.id];
                  const isUnavailable =
                    !bookingCountsLoaded ||
                    getAvailableSpots(trip) <= 0 ||
                    trip.status?.toLowerCase() === "departed" ||
                    trip.status?.toLowerCase() === "cancelled" ||
                    trip.status?.toLowerCase() === "boarding";

                  return (
                    <>
                <div
                  style={{
                    background: "linear-gradient(135deg, #1e88e5 0%, #1565c0 100%)",
                    color: "white",
                    padding: isMobile ? "10px 10px" : "15px 17px"
                  }}
                >
                  <div
                    style={{
                      fontSize: isMobile ? "0.78rem" : "1rem",
                      fontWeight: 700,
                      marginBottom: "3px",
                      color: "white",
                      letterSpacing: "0.2px"
                    }}
                  >
                    {trip.name}
                  </div>
                  <div
                    style={{
                      fontSize: isMobile ? "0.62rem" : "0.75rem",
                      color: "rgba(255,255,255,0.95)",
                      fontWeight: 500
                    }}
                  >
                    {trip.routeDirection}
                  </div>
                </div>

                <div
                  style={{
                    width: "100%",
                    height: isMobile ? "112px" : "180px",
                    background: "#f0f0f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden"
                  }}
                >
                  {trip.boatImage ? (
                    <img
                      src={trip.boatImage}
                      alt={trip.name}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        objectPosition: "center"
                      }}
                    />
                  ) : (
                    <div style={{ textAlign: "center", color: "#999", fontSize: isMobile ? "0.62rem" : "0.9rem", padding: isMobile ? "0 8px" : "0" }}>
                      <div style={{ marginBottom: "8px", fontSize: isMobile ? "1.15rem" : "2rem" }}></div>
                      <div>No boat image available</div>
                    </div>
                  )}
                </div>

                <div style={{ padding: isMobile ? "10px" : "15px 17px" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: isMobile ? "8px" : "11px",
                      fontSize: isMobile ? "0.64rem" : "0.82rem",
                      marginBottom: "10px"
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: "#1e88e5", marginBottom: "2px", fontSize: isMobile ? "0.5rem" : "0.65rem", textTransform: "uppercase", letterSpacing: "0.4px" }}>Boat</div>
                        <div style={{ color: "#222", fontSize: isMobile ? "0.68rem" : "0.93rem", fontWeight: 600 }}>{trip.boat}</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#1e88e5", marginBottom: "2px", fontSize: isMobile ? "0.5rem" : "0.65rem", textTransform: "uppercase", letterSpacing: "0.4px" }}>Date</div>
                      <div style={{ color: "#222", fontSize: isMobile ? "0.68rem" : "0.93rem", fontWeight: 600 }}>{trip.date}</div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      alignItems: "center",
                      marginBottom: isExpanded ? (isMobile ? "10px" : "12px") : "10px"
                    }}
                  >
                    <button
                      onClick={() => handleToggleInfo(trip.id)}
                      style={{
                        padding: 0,
                        background: "transparent",
                        border: "none",
                        color: "#1565c0",
                        fontWeight: 700,
                        fontSize: isMobile ? "0.64rem" : "0.82rem",
                        cursor: "pointer",
                        textDecoration: "underline",
                        textUnderlineOffset: "2px",
                        whiteSpace: "nowrap",
                        flexShrink: 0
                      }}
                    >
                      {isExpanded ? "See less" : "See more"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div style={{ marginBottom: isMobile ? "10px" : "15px" }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: isMobile ? "8px" : "11px",
                          fontSize: isMobile ? "0.64rem" : "0.82rem"
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, color: "#1e88e5", marginBottom: "2px", fontSize: isMobile ? "0.5rem" : "0.65rem", textTransform: "uppercase", letterSpacing: "0.4px" }}>Depart</div>
                          <div style={{ color: "#222", fontSize: isMobile ? "0.68rem" : "0.93rem", fontWeight: 600 }}>{formatTime12Hour(trip.departure)}</div>
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: "#1e88e5", marginBottom: "2px", fontSize: isMobile ? "0.5rem" : "0.65rem", textTransform: "uppercase", letterSpacing: "0.4px" }}>Arrive</div>
                          <div style={{ color: "#222", fontSize: isMobile ? "0.68rem" : "0.93rem", fontWeight: 600 }}>{formatTime12Hour(trip.arrival)}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {isExpanded && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          trip.price === 0 || trip.price
                            ? "1fr 1fr 1fr"
                            : "1fr 1fr",
                        gap: isMobile ? "8px" : "11px",
                        paddingTop: isMobile ? "8px" : "11px",
                        borderTop: "1px solid #e8e8e8",
                        marginBottom: isMobile ? "10px" : "15px"
                      }}
                    >
                      {(trip.price === 0 || trip.price) && (
                        <div>
                          <div style={{ fontWeight: 700, color: "#1e88e5", fontSize: isMobile ? "0.5rem" : "0.65rem", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.4px" }}>Price</div>
                          <div style={{ color: "#1e88e5", fontSize: isMobile ? "0.82rem" : "1.15rem", fontWeight: 800 }}>₱{Number(trip.price).toFixed(2)}</div>
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 700, color: "#1e88e5", fontSize: isMobile ? "0.5rem" : "0.65rem", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.4px" }}>Available</div>
                        <div style={{ color: "#222", fontSize: isMobile ? "0.7rem" : "1rem", fontWeight: 700 }}>{getAvailableSpots(trip)} seats</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: "#1e88e5", fontSize: isMobile ? "0.5rem" : "0.65rem", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.4px" }}>Status</div>
                        <span
                          style={{
                            display: "inline-block",
                            padding: isMobile ? "3px 6px" : "4px 9px",
                            borderRadius: "4px",
                            fontSize: isMobile ? "0.56rem" : "0.7rem",
                            fontWeight: 700,
                            backgroundColor: getStatusBadgeColor(trip.status),
                            color: "white"
                          }}
                        >
                          {trip.status}
                        </span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => handleBookClick(trip)}
                    disabled={isUnavailable}
                    style={{
                      width: "100%",
                      padding: isMobile ? "8px 10px" : "10px 15px",
                      background: isUnavailable ? "#ddd" : "#1e88e5",
                      color: isUnavailable ? "#888" : "white",
                      border: "none",
                      borderRadius: "6px",
                      fontWeight: 700,
                      fontSize: isMobile ? "0.66rem" : "0.85rem",
                      cursor: isUnavailable ? "not-allowed" : "pointer",
                      transition: "all 0.3s ease",
                      letterSpacing: "0.3px"
                    }}
                    onMouseEnter={(e) => {
                      if (!isUnavailable) {
                        e.target.style.background = "#1565c0";
                        e.target.style.boxShadow = "0 4px 12px rgba(30, 136, 229, 0.35)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isUnavailable) {
                        e.target.style.background = "#1e88e5";
                        e.target.style.boxShadow = "none";
                      }
                    }}
                  >
                    {!bookingCountsLoaded
                      ? "Loading Availability..."
                      : getAvailableSpots(trip) <= 0
                        ? "Fully Booked"
                        : isUnavailable
                          ? "Not Available"
                          : "Book Now"}
                  </button>

                </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Overlay */}
      {showModal && (
        <div
          style={{
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
            overflow: "auto"
          }}
          onClick={handleCloseModal}
        >
          {/* Modal Container */}
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              maxWidth: isMobile ? "100%" : "600px",
              width: "100%",
              maxHeight: isMobile ? "90vh" : "85vh",
              overflow: "auto",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
              position: "relative"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleCloseModal}
              style={{
                position: "sticky",
                top: 0,
                right: 0,
                background: "#f5f5f5",
                border: "none",
                borderRadius: "50%",
                width: "36px",
                height: "36px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                color: "#666",
                zIndex: 1001,
                float: "right",
                margin: "12px 12px 0 0",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "#e0e0e0";
                e.target.style.color = "#333";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "#f5f5f5";
                e.target.style.color = "#666";
              }}
              title="Close"
            >
              ×
            </button>
            
            <div style={{ clear: "both", padding: "20px" }}>
              <BookingDetails
                trip={selectedTrip}
                userId={userId}
                userType={userType}
                discounts={discounts}
                isModal={true}
                onClose={handleCloseModal}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Booking;
