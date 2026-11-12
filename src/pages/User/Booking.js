import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { FiAnchor, FiCalendar, FiClock, FiMapPin, FiTag, FiUser } from "react-icons/fi";
import { formatTime12Hour } from "../../utils/timeFormatter";
import BookingDetails from "./BookingDetails";

function Booking({ userId, userType }) {
  const [trips, setTrips] = useState([]);
  const [discounts, setDiscounts] = useState({});
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [bookingCounts, setBookingCounts] = useState({});
  const [bookingCountsLoaded, setBookingCountsLoaded] = useState(false);
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
  const tripsPerPage = 6;
  const totalPages = Math.ceil(filteredTrips.length / tripsPerPage);
  const pageStartIndex = (currentPage - 1) * tripsPerPage;
  const visibleTrips = filteredTrips.slice(pageStartIndex, pageStartIndex + tripsPerPage);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, Math.max(1, totalPages)));
  }, [totalPages]);

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
            padding: isMobile ? "14px 10px" : "110px 40px 64px",
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
            color: "#062b70",
            fontFamily: "inherit"
          }}
        >
          Ferry Booking
        </h1>
        <p
          style={{
            textAlign: "center",
            fontSize: isMobile ? "0.76rem" : "0.98rem",
            color: "#1d416f",
            fontFamily: "inherit",
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
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
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
              gridTemplateColumns: isMobile
                ? "repeat(auto-fit, minmax(min(100%, 165px), 1fr))"
                : "repeat(auto-fit, minmax(min(100%, 520px), 1fr))",
              gap: isMobile ? "12px" : "20px",
              paddingBottom: isMobile ? "8px" : "0"
            }}
          >
            {visibleTrips.map((trip) => (
              <div
                key={trip.id}
                style={{
                  background: "#ffffff",
                  display: "flex",
                  flexDirection: isMobile ? "column" : "row",
                  alignItems: isMobile ? "stretch" : "stretch",
                  gap: isMobile ? "7px" : "14px",
                  padding: isMobile ? "7px" : "10px",
                  height: isMobile ? "auto" : "184px",
                  minHeight: isMobile ? "278px" : undefined,
                  boxSizing: "border-box",
                  borderRadius: "14px",
                  border: "1px solid #d5e5f4",
                  overflow: "hidden",
                  transition: "all 0.3s ease",
                  boxShadow: "0 3px 12px rgba(24, 73, 125, 0.1)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#8abce9";
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 8px 18px rgba(24, 73, 125, 0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#d5e5f4";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 3px 12px rgba(24, 73, 125, 0.1)";
                }}
              >
                {(() => {
                  const availableSpots = getAvailableSpots(trip);
                  const isUnavailable =
                    !bookingCountsLoaded ||
                    availableSpots <= 0 ||
                    ["departed", "cancelled", "boarding"].includes(trip.status?.toLowerCase());
                  const dateValue = trip.date?.toDate ? trip.date.toDate() : new Date(`${trip.date}T12:00:00`);
                  const formattedDate = trip.date && !Number.isNaN(dateValue.getTime())
                    ? dateValue.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
                    : trip.date || "Date TBA";
                  const paymentMethod = trip.paymentMethod || (trip.allowPayLater ? "pay_later" : "gcash");
                  const paymentLabel = paymentMethod === "pay_later" ? "Pay Later" : "GCash";
                  const routeParts = String(trip.routeDirection || "").split(/\s*[-–→]\s*/);
                  const infoStyle = { color: "#25476d", fontSize: isMobile ? "0.66rem" : "0.78rem", fontWeight: 600, lineHeight: 1.3, minWidth: 0 };
                  const iconStyle = { flex: "0 0 auto", width: isMobile ? 13 : 14, height: isMobile ? 13 : 14, color: "#0756ad", strokeWidth: 2.5 };

                  return (
                    <>
                      <div style={{
                        position: "relative",
                        flex: isMobile ? "0 0 94px" : "0 0 38%",
                        width: isMobile ? "100%" : undefined,
                        minWidth: isMobile ? 0 : "145px",
                        maxWidth: isMobile ? "none" : "220px",
                        height: isMobile ? "94px" : "100%",
                        overflow: "hidden",
                        borderRadius: isMobile ? "9px" : "9px",
                        background: "#e8f1f8",
                      }}>
                        {trip.boatImage ? (
                          <img src={trip.boatImage} alt={trip.name} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ display: "grid", placeItems: "center", height: "100%", padding: 8, color: "#718096", fontSize: isMobile ? "0.65rem" : "0.8rem", textAlign: "center" }}>
                            No boat image available
                          </div>
                        )}
                        {isMobile && (
                          <span style={{
                            position: "absolute",
                            top: 6,
                            right: 6,
                            padding: "3px 7px",
                            borderRadius: 12,
                            background: paymentMethod === "pay_later" ? "#fff0c2" : "#d9f2e3",
                            color: paymentMethod === "pay_later" ? "#805b00" : "#176b3a",
                            fontSize: "0.62rem",
                            fontWeight: 800,
                            lineHeight: 1.2,
                            whiteSpace: "nowrap",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
                          }}>{paymentLabel}</span>
                        )}
                      </div>
                      <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "column", justifyContent: "flex-start", minWidth: 0, gap: isMobile ? 5 : 6, padding: isMobile ? "0 1px 1px" : "1px 2px 1px 0" }}>
                        <div style={{ minWidth: 0, padding: isMobile ? "5px 6px" : "7px 9px", borderRadius: 8, background: "#edf5fc" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 5 }}>
                            <div style={{ color: "#0756ad", fontSize: isMobile ? "0.76rem" : "0.88rem", fontWeight: 800, lineHeight: 1.2, overflowWrap: "anywhere", minWidth: 0 }}>{trip.name}</div>
                            {!isMobile && <span style={{
                              flexShrink: 0,
                              padding: "3px 6px",
                              borderRadius: 5,
                              background: paymentMethod === "pay_later" ? "#fff0c2" : "#d9f2e3",
                              color: paymentMethod === "pay_later" ? "#805b00" : "#176b3a",
                              fontSize: "0.64rem",
                              fontWeight: 700,
                              lineHeight: 1.2,
                              whiteSpace: "nowrap",
                            }}>{paymentLabel}</span>}
                          </div>
                          {isMobile ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, color: "#1d5fa7", fontSize: "0.65rem", fontWeight: 700, lineHeight: 1.2, minWidth: 0 }}>
                              <FiMapPin style={iconStyle} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {routeParts.length > 1 ? <>{routeParts[0]} <span style={{ padding: "0 3px" }}>→</span> {routeParts.slice(1).join(" - ")}</> : trip.routeDirection || "Route TBA"}
                              </span>
                            </div>
                          ) : (
                            <div style={{ marginTop: 4, color: "#1d5fa7", fontSize: "0.72rem", fontWeight: 600, lineHeight: 1.25, overflowWrap: "anywhere" }}>{trip.routeDirection || "Route TBA"}</div>
                          )}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: isMobile ? 3 : 4, padding: isMobile ? "0 4px" : "0 8px" }}>
                          <div style={{ ...infoStyle, display: "flex", alignItems: "center", gap: 5 }}><FiCalendar style={iconStyle} />{formattedDate}</div>
                          <div style={{ ...infoStyle, display: "flex", alignItems: "center", gap: 5 }}><FiClock style={iconStyle} />{formatTime12Hour(trip.departure)}{trip.arrival ? ` – ${formatTime12Hour(trip.arrival)}` : ""}</div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) auto auto", alignItems: "center", gap: isMobile ? 4 : 8, padding: isMobile ? "0 4px" : "0 8px" }}>
                          <span style={{ ...infoStyle, display: "flex", alignItems: "center", gap: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><FiAnchor style={iconStyle} />{trip.boat || "Boat TBA"}</span>
                          {isMobile ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                              <span style={{ ...infoStyle, display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}><FiUser style={iconStyle} />{availableSpots} seats</span>
                              <strong style={{ display: "flex", alignItems: "center", gap: 4, color: "#0756ad", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                                <span style={{ height: 15, borderLeft: "1px solid #d5e0eb", marginRight: 4 }} />
                                ₱{Number(trip.price || 0).toFixed(2)}
                              </strong>
                            </div>
                          ) : (
                            <>
                              <span style={{ ...infoStyle, whiteSpace: "nowrap" }}>♙ &nbsp;{availableSpots}</span>
                              <strong style={{ color: "#0756ad", fontSize: "0.95rem", whiteSpace: "nowrap" }}>
                                ₱{Number(trip.price || 0).toFixed(2)}
                              </strong>
                            </>
                          )}
                        </div>

                        <button
                          onClick={() => handleBookClick(trip)}
                          disabled={isUnavailable}
                          style={{
                            width: "100%",
                            minHeight: isMobile ? 32 : 32,
                            flexShrink: 0,
                            marginTop: "auto",
                            padding: isMobile ? "6px 8px" : "6px 10px",
                            background: isUnavailable ? "#aab7c4" : "#0756ad",
                            color: "#fff",
                            border: "none",
                            borderRadius: isMobile ? "9px" : "7px",
                            fontWeight: 700,
                            fontSize: isMobile ? "0.72rem" : "0.76rem",
                            cursor: isUnavailable ? "not-allowed" : "pointer",
                            transition: "all 0.2s ease",
                            letterSpacing: "0.2px",
                          }}
                          onMouseEnter={(e) => {
                            if (!isUnavailable) e.currentTarget.style.background = "#064894";
                          }}
                          onMouseLeave={(e) => {
                            if (!isUnavailable) e.currentTarget.style.background = "#0756ad";
                          }}
                        >
                          {isMobile && <FiTag style={{ width: 15, height: 15, marginRight: 6, verticalAlign: "middle" }} />}
                          {!bookingCountsLoaded
                            ? "Loading Availability..."
                            : availableSpots <= 0
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
        {totalPages > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: isMobile ? "10px" : "16px",
              marginTop: isMobile ? "14px" : "22px",
              paddingBottom: isMobile ? "8px" : "0",
            }}
          >
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              style={bookingPaginationButtonStyle(currentPage === 1, isMobile)}
            >
              Previous
            </button>
            <span style={{
              color: "#25476d",
              fontSize: isMobile ? "0.72rem" : "0.85rem",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}>
              {pageStartIndex + 1}–{Math.min(pageStartIndex + tripsPerPage, filteredTrips.length)} of {filteredTrips.length}
              {" · "}Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
              style={bookingPaginationButtonStyle(currentPage === totalPages, isMobile)}
            >
              Next
            </button>
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
            zIndex: 1200,
            padding: isMobile ? "10px" : "20px",
            overflowY: "auto"
          }}
        >
          {/* Modal Container */}
          <div
            style={{
              background: "white",
              borderRadius: isMobile ? "14px" : "12px",
              maxWidth: isMobile ? "min(94vw, 460px)" : "560px",
              width: "100%",
              maxHeight: isMobile ? "82dvh" : "82vh",
              overflowY: "auto",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
              position: "relative",
              boxSizing: "border-box"
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
                margin: isMobile ? "8px 8px 0 0" : "12px 12px 0 0",
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
            
            <div style={{ clear: "both", padding: isMobile ? "10px" : "16px" }}>
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

function bookingPaginationButtonStyle(disabled, isMobile) {
  return {
    padding: isMobile ? "7px 10px" : "8px 14px",
    border: "1px solid #cbd8e6",
    borderRadius: "7px",
    background: disabled ? "#f3f6f9" : "#ffffff",
    color: disabled ? "#9aa8b6" : "#0756ad",
    fontWeight: 700,
    fontSize: isMobile ? "0.7rem" : "0.82rem",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

export default Booking;
