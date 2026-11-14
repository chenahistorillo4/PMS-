import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { canRescheduleAtSameFare } from "../../utils/rescheduleBooking";

function formatTripDate(value) {
  const date = value?.toDate?.() || new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value || "Date unavailable")
    : date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}

function RescheduleBookingConfirmation({
  trip,
  bookingId,
  notificationId,
  userId,
  onCancel,
  isMobile,
}) {
  const navigate = useNavigate();
  const currentUserId = userId || auth.currentUser?.uid;
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getDoc(doc(db, "bookings", bookingId))
      .then((snapshot) => {
        if (!snapshot.exists()) throw new Error("The existing booking could not be found.");
        const data = snapshot.data();
        const ownsBooking =
          data.userId === currentUserId ||
          (auth.currentUser?.email && data.userEmail === auth.currentUser.email);
        if (!ownsBooking) throw new Error("You can only reschedule your own booking.");
        if (!active) return;
        setBooking({ id: snapshot.id, ...data });
      })
      .catch((loadError) => {
        console.error("Unable to load booking for rescheduling:", loadError);
        if (active) setError(loadError.message || "Unable to load the existing booking.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [bookingId, currentUserId]);

  const fareMatches = canRescheduleAtSameFare(booking, trip);
  const displayFare = booking?.bookingType === "cargo_only"
    ? Number(booking.finalPrice || 0)
    : Number(trip?.price || 0);

  const confirmReschedule = async () => {
    if (!booking || !fareMatches || saving) return;
    setSaving(true);
    setError("");

    try {
      const bookingRef = doc(db, "bookings", bookingId);
      const [latestBookingSnapshot, latestTripSnapshot] = await Promise.all([
        getDoc(bookingRef),
        getDoc(doc(db, "schedules", trip.id)),
      ]);
      if (!latestBookingSnapshot.exists()) {
        throw new Error("The existing booking could not be found.");
      }
      if (!latestTripSnapshot.exists()) {
        throw new Error("This schedule is no longer available. Please select another trip.");
      }

      const latestBooking = latestBookingSnapshot.data();
      const latestTrip = { id: latestTripSnapshot.id, ...latestTripSnapshot.data() };
      const ownsBooking =
        latestBooking.userId === currentUserId ||
        (auth.currentUser?.email && latestBooking.userEmail === auth.currentUser.email);
      if (!ownsBooking) throw new Error("You can only reschedule your own booking.");
      if (!canRescheduleAtSameFare(latestBooking, latestTrip)) {
        throw new Error("This booking can no longer be rescheduled at the same fare. No changes were made.");
      }
      if (["cancelled", "departed", "boarding", "completed", "full"].includes(
        String(latestTrip.status || "").toLowerCase()
      )) {
        throw new Error("This schedule is no longer available. Please select another trip.");
      }
      if (
        latestBooking.cargoSnapshot &&
        latestBooking.boat !== latestTrip.boat
      ) {
        throw new Error("Cargo bookings can only be moved to another schedule for the same boat.");
      }

      await updateDoc(bookingRef, {
        tripId: latestTrip.id,
        tripName: latestTrip.name || "",
        boat: latestTrip.boat || "",
        route: latestTrip.routeDirection || latestTrip.route || "",
        routeDirection: latestTrip.routeDirection || latestTrip.route || "",
        date: latestTrip.date,
        departure: latestTrip.departure || "",
        arrival: latestTrip.arrival || "",
        scheduleRescheduledAt: serverTimestamp(),
      });

      if (notificationId) {
        try {
          await updateDoc(doc(db, "notifications", notificationId), {
            userAction: "booking_another",
            actionTimestamp: serverTimestamp(),
            isRead: true,
          });
        } catch (notificationError) {
          console.error("Reschedule succeeded, but notification tracking failed:", notificationError);
        }
      }

      window.alert("Your booking has been rescheduled. Your Booking ID and payment record are unchanged.");
      navigate("/manage", {
        replace: true,
        state: {
          bookingRefreshKey: Date.now(),
          rescheduledBookingId: bookingId,
        },
      });
    } catch (rescheduleError) {
      console.error("Unable to reschedule booking:", rescheduleError);
      setError(rescheduleError.message || "Unable to reschedule this booking.");
    } finally {
      setSaving(false);
    }
  };

  const cardStyle = {
    margin: "0 auto",
    maxWidth: "720px",
    padding: isMobile ? "18px" : "28px",
    borderRadius: "14px",
    background: "#fff",
    boxShadow: "0 8px 28px rgba(20, 53, 89, 0.14)",
    color: "#243746",
  };
  const detailsStyle = {
    marginTop: "18px",
    padding: "16px",
    borderRadius: "10px",
    background: "#f5f9fc",
    lineHeight: 1.8,
  };

  if (loading) {
    return <section style={cardStyle} aria-live="polite">Loading your existing booking...</section>;
  }

  return (
    <section style={cardStyle} aria-labelledby="reschedule-confirmation-title">
      <h2 id="reschedule-confirmation-title" style={{ margin: 0, color: "#173b63" }}>
        Confirm New Schedule
      </h2>
      <p style={{ margin: "8px 0 0", color: "#657587" }}>
        Review the new trip before confirming. Your existing booking and payment record will be kept.
      </p>

      {booking && (
        <div style={detailsStyle}>
          <div><strong>Booking ID:</strong> {booking.id}</div>
          <div><strong>New route:</strong> {trip.routeDirection || trip.route || "Route unavailable"}</div>
          <div><strong>Boat:</strong> {trip.boat || "Boat unavailable"}</div>
          <div><strong>Date:</strong> {formatTripDate(trip.date)}</div>
          <div><strong>Time:</strong> {trip.departure || "TBA"} - {trip.arrival || "TBA"}</div>
          <div><strong>New passenger fare:</strong> ₱{displayFare.toFixed(2)}</div>
          <div><strong>Current booking total:</strong> ₱{Number(booking.finalPrice || 0).toFixed(2)}</div>
          <div style={{ marginTop: "8px", color: "#176b38", fontWeight: 700 }}>
            No new payment is required. Existing payment details will not be changed.
          </div>
        </div>
      )}

      {!fareMatches && booking && (
        <p role="alert" style={{ margin: "14px 0 0", color: "#a7271e" }}>
          This schedule has a different passenger fare. Rescheduling is only available when the fare matches the original booking.
        </p>
      )}
      {error && (
        <p role="alert" style={{ margin: "14px 0 0", color: "#a7271e" }}>{error}</p>
      )}

      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "22px", flexWrap: "wrap" }}>
        <button type="button" onClick={onCancel} disabled={saving} style={buttonStyle("#edf2f7", "#284b69")}>
          Back to schedules
        </button>
        <button
          type="button"
          onClick={confirmReschedule}
          disabled={!booking || !fareMatches || saving}
          style={buttonStyle(fareMatches && booking ? "#278143" : "#aab7c4", "#fff")}
        >
          {saving ? "Rescheduling..." : "Confirm Reschedule"}
        </button>
      </div>
    </section>
  );
}

function buttonStyle(background, color) {
  return {
    border: 0,
    borderRadius: "8px",
    padding: "11px 16px",
    background,
    color,
    fontWeight: 700,
    cursor: background === "#aab7c4" ? "not-allowed" : "pointer",
  };
}

export default RescheduleBookingConfirmation;
