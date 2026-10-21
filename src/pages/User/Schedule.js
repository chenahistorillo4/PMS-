import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, getDocs } from "firebase/firestore";
import { formatTime12Hour } from "../../utils/timeFormatter";

function getDateKey(value) {
  if (!value) return "";

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function Schedule() {
  const [selectedRoute, setSelectedRoute] = useState("All Routes");
  const [selectedDate, setSelectedDate] = useState("");
  const [trips, setTrips] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const contentElement = document.getElementById("schedule-page-content");
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
    const fetchTrips = async () => {
      const querySnapshot = await getDocs(collection(db, "schedules"));
      const tripsData = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setTrips(tripsData);

      const uniqueRoutes = [...new Set(tripsData.map((trip) => trip.routeDirection))];
      setRoutes(uniqueRoutes);
    };

    fetchTrips();
  }, []);

  const today = getDateKey(new Date());

  const filteredTrips = trips.filter((trip) => {
    const tripDate = getDateKey(trip.date);
    const isCurrentOrFutureTrip = tripDate && tripDate >= today;
    const routeMatch = selectedRoute === "All Routes" || trip.routeDirection === selectedRoute;
    const dateMatch = !selectedDate || tripDate === selectedDate;
    return isCurrentOrFutureTrip && routeMatch && dateMatch;
  });

  const handleReset = () => {
    setSelectedRoute("All Routes");
    setSelectedDate("");
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

  const cellPadding = isMobile ? "9px 8px" : "15px";
  const bodyFontSize = isMobile ? "0.72rem" : "0.95rem";
  const headFontSize = isMobile ? "0.64rem" : "0.85rem";

  return (
    <div
      id="schedule-page-content"
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, rgba(255, 255, 255, 0.45) 0%, rgba(240, 248, 255, 0.40) 100%), url('/bg5.avif') center/cover fixed",
        padding: isMobile ? "14px 8px" : "40px 20px",
        paddingTop: isMobile ? "72px" : "40px"
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto"
        }}
      >
        <h1
          style={{
            textAlign: "center",
            fontSize: isMobile ? "1.2rem" : "2.2rem",
            fontWeight: 800,
            marginBottom: isMobile ? "6px" : "10px",
            color: "#1a1a1a"
          }}
        >
          Ferry Schedule
        </h1>

        <p
          style={{
            textAlign: "center",
            fontSize: isMobile ? "0.76rem" : "0.98rem",
            color: "#666",
            marginBottom: isMobile ? "16px" : "32px",
            fontWeight: 500,
            maxWidth: "720px",
            marginLeft: "auto",
            marginRight: "auto",
            lineHeight: 1.5
          }}
        >
          Check ferry schedules and filter by route or date.
        </p>

        <div
          style={{
            background: "rgba(255, 255, 255, 0.95)",
            padding: isMobile ? "12px" : "30px",
            borderRadius: "12px",
            marginBottom: isMobile ? "16px" : "40px",
            display: isMobile ? "flex" : "grid",
            flexDirection: isMobile ? "column" : "row",
            gridTemplateColumns: isMobile ? undefined : "repeat(auto-fit, minmax(200px, 1fr))",
            gap: isMobile ? "10px" : "20px",
            alignItems: isMobile ? "stretch" : "end",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)"
          }}
        >
          <div>
            <label
              style={{
                fontWeight: 700,
                display: "block",
                marginBottom: "6px",
                color: "#1a1a1a",
                fontSize: isMobile ? "0.78rem" : "0.9rem"
              }}
            >
              Select Route
            </label>
            <select
              value={selectedRoute}
              onChange={(e) => setSelectedRoute(e.target.value)}
              style={{
                width: "100%",
                padding: isMobile ? "9px 10px" : "10px 15px",
                border: "2px solid #e0e0e0",
                borderRadius: "8px",
                fontSize: isMobile ? "0.78rem" : "0.95rem",
                backgroundColor: "white",
                color: "#333",
                cursor: "pointer",
                transition: "all 0.3s ease",
                fontWeight: 500
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#2196f3";
                e.target.style.boxShadow = "0 0 0 3px rgba(33,150,243,0.1)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#e0e0e0";
                e.target.style.boxShadow = "none";
              }}
            >
              <option value="All Routes">All Routes</option>
              {routes.map((route, idx) => (
                <option key={idx} value={route}>
                  {route}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              style={{
                fontWeight: 700,
                display: "block",
                marginBottom: "6px",
                color: "#1a1a1a",
                fontSize: isMobile ? "0.78rem" : "0.9rem"
              }}
            >
              Select Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                width: "100%",
                padding: isMobile ? "9px 10px" : "10px 15px",
                border: "2px solid #e0e0e0",
                borderRadius: "8px",
                fontSize: isMobile ? "0.78rem" : "0.95rem",
                backgroundColor: "white",
                color: "#333",
                cursor: "pointer",
                transition: "all 0.3s ease",
                fontWeight: 500
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#2196f3";
                e.target.style.boxShadow = "0 0 0 3px rgba(33,150,243,0.1)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#e0e0e0";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          <button
            onClick={handleReset}
            style={{
              padding: isMobile ? "8px 12px" : "10px 20px",
              background: "linear-gradient(135deg, #0d5f7a 0%, #1a7f99 100%)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: isMobile ? "0.74rem" : "0.95rem",
              transition: "all 0.3s ease",
              width: isMobile ? "100%" : "auto",
              boxShadow: "0 4px 8px rgba(13, 95, 122, 0.2)"
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = "translateY(-2px)";
              e.target.style.boxShadow = "0 6px 12px rgba(13, 95, 122, 0.3)";
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "0 4px 8px rgba(13, 95, 122, 0.2)";
            }}
          >
            Reset Filters
          </button>
        </div>

        {filteredTrips.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: isMobile ? "20px 12px" : "40px 20px",
              background: "rgba(255, 255, 255, 0.95)",
              borderRadius: "12px",
              color: "#666",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
              fontSize: isMobile ? "0.76rem" : "1rem"
            }}
          >
            No schedules available for the selected filters.
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              borderRadius: "12px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
              background: "rgba(255, 255, 255, 0.95)",
              WebkitOverflowScrolling: "touch"
            }}
          >
            <table
              style={{
                width: "100%",
                minWidth: isMobile ? "100%" : "100%",
                borderCollapse: "collapse",
                backgroundColor: "white"
              }}
            >
              <thead>
                <tr style={{ background: "linear-gradient(135deg, #2196f3 0%, #1976d2 100%)" }}>
                  <th
                    style={{
                      padding: cellPadding,
                      textAlign: "left",
                      fontWeight: 700,
                      color: "white",
                      fontSize: headFontSize,
                      letterSpacing: "0.5px",
                      textTransform: "uppercase"
                    }}
                  >
                    Route
                  </th>
                  <th
                    style={{
                      padding: cellPadding,
                      textAlign: "left",
                      fontWeight: 700,
                      color: "white",
                      fontSize: headFontSize,
                      letterSpacing: "0.5px",
                      textTransform: "uppercase"
                    }}
                  >
                    Boat
                  </th>
                  <th
                    style={{
                      padding: cellPadding,
                      textAlign: "left",
                      fontWeight: 700,
                      color: "white",
                      fontSize: headFontSize,
                      letterSpacing: "0.5px",
                      textTransform: "uppercase"
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      padding: cellPadding,
                      textAlign: "left",
                      fontWeight: 700,
                      color: "white",
                      fontSize: headFontSize,
                      letterSpacing: "0.5px",
                      textTransform: "uppercase"
                    }}
                  >
                    Date
                  </th>
                  <th
                    style={{
                      padding: cellPadding,
                      textAlign: "left",
                      fontWeight: 700,
                      color: "white",
                      fontSize: headFontSize,
                      letterSpacing: "0.5px",
                      textTransform: "uppercase"
                    }}
                  >
                    Departure
                  </th>
                  <th
                    style={{
                      padding: cellPadding,
                      textAlign: "left",
                      fontWeight: 700,
                      color: "white",
                      fontSize: headFontSize,
                      letterSpacing: "0.5px",
                      textTransform: "uppercase"
                    }}
                  >
                    Arrival
                  </th>
                  <th
                    style={{
                      padding: cellPadding,
                      textAlign: "left",
                      fontWeight: 700,
                      color: "white",
                      fontSize: headFontSize,
                      letterSpacing: "0.5px",
                      textTransform: "uppercase"
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTrips.map((trip) => (
                  <tr
                    key={trip.id}
                    style={{
                      borderBottom: "1px solid #eee",
                      transition: "background 0.2s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#f9f9f9";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "white";
                    }}
                  >
                    <td style={{ padding: cellPadding, color: "#333", fontSize: bodyFontSize, fontWeight: 500 }}>
                      {trip.routeDirection}
                    </td>
                    <td style={{ padding: cellPadding, color: "#333", fontSize: bodyFontSize }}>
                      {trip.boat}
                    </td>
                    <td style={{ padding: cellPadding, color: "#333", fontSize: bodyFontSize }}>
                      {trip.name}
                    </td>
                    <td style={{ padding: cellPadding, color: "#333", fontSize: bodyFontSize }}>
                      {new Date(trip.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      })}
                    </td>
                    <td style={{ padding: cellPadding, color: "#333", fontSize: bodyFontSize }}>
                      {formatTime12Hour(trip.departure)}
                    </td>
                    <td style={{ padding: cellPadding, color: "#333", fontSize: bodyFontSize }}>
                      {formatTime12Hour(trip.arrival)}
                    </td>
                    <td style={{ padding: cellPadding }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: isMobile ? "4px 8px" : "6px 12px",
                          borderRadius: "20px",
                          fontSize: isMobile ? "0.64rem" : "0.85rem",
                          fontWeight: 600,
                          backgroundColor: getStatusBadgeColor(trip.status),
                          color: "white",
                          textTransform: "capitalize",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {trip.status || "Unknown"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Schedule;
