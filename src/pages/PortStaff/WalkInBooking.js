import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { db, auth } from "../../firebase";
import AdminLayout from "../Admin/AdminLayout";
import { getStaffAccount } from "../../utils/staffAccount";
import { useAuthUser } from "../../hooks/useAuthUser";

const generateReferenceCode = () => {
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `WI${random}${timestamp}`;
};

const getTripDate = (date) => {
  const parsedDate = date?.toDate?.() || date;
  return parsedDate ? new Date(parsedDate) : null;
};

const formatDateValue = (date) => {
  const parsedDate = getTripDate(date);
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) return "";
  return [
    parsedDate.getFullYear(),
    String(parsedDate.getMonth() + 1).padStart(2, "0"),
    String(parsedDate.getDate()).padStart(2, "0")
  ].join("-");
};

function WalkInBookingPage() {
  const { user, authReady } = useAuthUser();
  const [profile, setProfile] = useState(null);
  const [trips, setTrips] = useState([]);
  const [bookingCounts, setBookingCounts] = useState({});
  const [discounts, setDiscounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [form, setForm] = useState({
    tripId: "",
    bookingType: "passenger_cargo",
    customerName: "",
    userType: "regular",
    cargoType: "",
    cargoWeight: "",
    payment: "Cash"
  });

  useEffect(() => {
    if (!authReady || !user) return undefined;

    let active = true;
    const loadData = async () => {
      try {
        const account = await getStaffAccount(user.uid);
        if (!account?.data?.assignedBoat) {
          throw new Error("This Port Staff account does not have an assigned boat.");
        }

        const assignedBoat = account.data.assignedBoat;
        const [schedulesSnapshot, discountsSnapshot, bookingsSnapshot] = await Promise.all([
          getDocs(query(collection(db, "schedules"), where("boat", "==", assignedBoat))),
          getDocs(query(collection(db, "discounts"), where("boatName", "==", assignedBoat))),
          getDocs(query(collection(db, "bookings"), where("boat", "==", assignedBoat)))
        ]);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const availableTrips = schedulesSnapshot.docs
          .map((tripDoc) => ({ id: tripDoc.id, ...tripDoc.data() }))
          .filter((trip) => {
            const tripDate = getTripDate(trip.date);
            const status = String(trip.status || "").toLowerCase();
            return tripDate &&
              !Number.isNaN(tripDate.getTime()) &&
              tripDate >= today &&
              !["cancelled", "departed", "boarding", "full"].includes(status);
          })
          .sort((a, b) => getTripDate(a.date) - getTripDate(b.date));
        const discountData = discountsSnapshot.docs[0]?.data()?.discounts || {};
        const counts = {};
        bookingsSnapshot.docs.forEach((bookingDoc) => {
          const booking = bookingDoc.data();
          const status = String(booking.status || "").toLowerCase();
          if (!["cancelled", "failed"].includes(status)) {
            counts[booking.tripId] = (counts[booking.tripId] || 0) + 1;
          }
        });

        if (!active) return;
        setProfile(account.data);
        setTrips(availableTrips);
        setDiscounts(discountData);
        setBookingCounts(counts);
        if (availableTrips.length > 0) {
          setForm((previous) => ({ ...previous, tripId: availableTrips[0].id }));
        }
      } catch (error) {
        console.error("Error loading walk-in booking data:", error);
        if (active) setMessage({ type: "error", text: error.message || "Unable to load walk-in booking data." });
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();
    return () => {
      active = false;
    };
  }, [authReady, user]);

  const selectedTrip = trips.find((trip) => trip.id === form.tripId);
  const isCargoOnly = form.bookingType === "cargo_only";
  const cargoPrice = useMemo(() => {
    const weight = Number(form.cargoWeight);
    const rate = Number(selectedTrip?.cargoPerKilo || 20);
    return Number.isFinite(weight) && weight > 0 ? weight * rate : 0;
  }, [form.cargoWeight, selectedTrip]);
  const basePrice = isCargoOnly ? cargoPrice : Number(selectedTrip?.price || 0) + cargoPrice;
  const discountRate = isCargoOnly ? 0 : Number(discounts[form.userType] || 0);
  const discountAmount = basePrice * discountRate;
  const finalPrice = Math.max(0, basePrice - discountAmount);
  const availableSeats = selectedTrip
    ? Math.max(0, Number(selectedTrip.capacity || 0) - (bookingCounts[selectedTrip.id] || 0))
    : 0;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
    setMessage({ type: "", text: "" });
  };

  const resetForm = () => {
    setForm({
      tripId: trips[0]?.id || "",
      bookingType: "passenger_cargo",
      customerName: "",
      userType: "regular",
      cargoType: "",
      cargoWeight: "",
      payment: "Cash"
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedTrip || !form.customerName.trim()) {
      setMessage({ type: "error", text: "Please select a trip and enter the passenger name." });
      return;
    }
    if (!isCargoOnly && form.userType !== "regular" && !discounts[form.userType]) {
      setMessage({ type: "error", text: "The selected passenger type is not available for this boat." });
      return;
    }
    if (form.cargoWeight && (!Number.isFinite(Number(form.cargoWeight)) || Number(form.cargoWeight) < 0)) {
      setMessage({ type: "error", text: "Cargo weight must be a valid non-negative number." });
      return;
    }

    setSaving(true);
    setMessage({ type: "", text: "" });
    try {
      const latestBookingsSnapshot = await getDocs(
        query(collection(db, "bookings"), where("tripId", "==", selectedTrip.id))
      );
      const occupiedSeats = latestBookingsSnapshot.docs.filter((bookingDoc) => {
        const status = String(bookingDoc.data().status || "").toLowerCase();
        return !["cancelled", "failed"].includes(status);
      }).length;
      if (occupiedSeats >= Number(selectedTrip.capacity || 0)) {
        setBookingCounts((previous) => ({ ...previous, [selectedTrip.id]: occupiedSeats }));
        throw new Error("This trip is already full. Please select another schedule.");
      }

      const referenceCode = generateReferenceCode();
      const staffName = profile?.name || auth.currentUser?.email || "Port Staff";
      const bookingData = {
        tripId: selectedTrip.id,
        tripName: selectedTrip.name || "",
        boat: selectedTrip.boat,
        routeDirection: selectedTrip.routeDirection || selectedTrip.route || "",
        route: selectedTrip.routeDirection || selectedTrip.route || "",
        date: selectedTrip.date,
        departure: selectedTrip.departure || "",
        arrival: selectedTrip.arrival || "",
        bookingType: form.bookingType,
        customerName: form.customerName.trim(),
        userType: isCargoOnly ? null : form.userType,
        cargoType: form.cargoType.trim(),
        cargoWeight: form.cargoWeight,
        cargoPrice,
        basePrice: isCargoOnly ? 0 : Number(selectedTrip.price || 0),
        passengerPrice: isCargoOnly ? 0 : Number(selectedTrip.price || 0),
        discountRate,
        discountAmount,
        finalPrice,
        payment: form.payment,
        paymentMode: "pay_now",
        paymentStatus: "completed",
        userId: null,
        userEmail: null,
        userPhone: null,
        bookedByName: staffName,
        bookingSource: "walk_in",
        createdBy: user.uid,
        status: "confirmed",
        referenceCode,
        qrCodeValue: referenceCode,
        createdAt: serverTimestamp()
      };
      const bookingReference = doc(collection(db, "bookings"));
      const paymentReference = doc(collection(db, "payments"));
      const batch = writeBatch(db);
      batch.set(bookingReference, bookingData);
      batch.set(paymentReference, {
        bookingId: bookingReference.id,
        customerName: bookingData.customerName,
        boat: bookingData.boat,
        trip: bookingData.tripName,
        routeDirection: bookingData.routeDirection,
        amount: finalPrice,
        method: form.payment,
        paymentMode: "pay_now",
        status: "completed",
        paymentProvider: "manual",
        userId: null,
        userEmail: null,
        createdAt: serverTimestamp()
      });
      await batch.commit();
      setBookingCounts((previous) => ({
        ...previous,
        [selectedTrip.id]: (previous[selectedTrip.id] || 0) + 1
      }));

      setMessage({
        type: "success",
        text: `Walk-in booking saved. Reference: ${referenceCode}`
      });
      resetForm();
    } catch (error) {
      console.error("Error saving walk-in booking:", error);
      setMessage({ type: "error", text: error.message || "Unable to save walk-in booking." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout active="walk-in">
      <main style={{ width: "100%", fontSize: "0.95rem" }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: "24px", boxShadow: "0 2px 10px rgba(0,0,0,.08)" }}>
          <h1 style={{ margin: 0, color: "#244f86", fontSize: "1.3rem", fontWeight: 800 }}>Walk-in Booking</h1>
          <p style={{ color: "#666", margin: "8px 0 24px", fontSize: "0.95rem", fontWeight: 500, lineHeight: 1.5 }}>
            Create a booking for passengers who did not book online.
          </p>

          {message.text && (
            <div role="alert" style={{
              marginBottom: 18,
              padding: "12px 14px",
              borderRadius: 8,
              background: message.type === "success" ? "#e8f7ee" : "#fdecec",
              color: message.type === "success" ? "#23743c" : "#a12626"
            }}>
              {message.text}
            </div>
          )}

          {loading ? (
            <p>Loading available trips...</p>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                <label style={labelStyle}>
                  Trip / Schedule
                  <select name="tripId" value={form.tripId} onChange={handleChange} required style={inputStyle}>
                    <option value="">Select a trip</option>
                    {trips.map((trip) => (
                      <option key={trip.id} value={trip.id}>
                        {[trip.name, trip.routeDirection, formatDateValue(trip.date), trip.departure].filter(Boolean).join(" - ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  Booking Type
                  <select name="bookingType" value={form.bookingType} onChange={handleChange} style={inputStyle}>
                    <option value="passenger_cargo">Passenger + Cargo</option>
                    <option value="cargo_only">Cargo Only</option>
                  </select>
                </label>
                <label style={labelStyle}>
                  Passenger Name
                  <input name="customerName" value={form.customerName} onChange={handleChange} required style={inputStyle} />
                </label>
                {!isCargoOnly && (
                  <label style={labelStyle}>
                    Passenger Type
                    <select name="userType" value={form.userType} onChange={handleChange} style={inputStyle}>
                      <option value="regular">Regular</option>
                      {Object.keys(discounts).filter((type) => type !== "regular").map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label style={labelStyle}>
                  Cargo Type
                  <input name="cargoType" value={form.cargoType} onChange={handleChange} placeholder="Optional" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Cargo Weight (kg)
                  <input name="cargoWeight" type="number" min="0" step="0.01" value={form.cargoWeight} onChange={handleChange} placeholder="Optional" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Payment Method
                  <input value="Cash" readOnly style={{ ...inputStyle, background: "#f4f6f8", fontWeight: 700 }} />
                </label>
              </div>

              <div style={{ marginTop: 22, padding: 16, borderRadius: 10, background: "#f4f8fc", color: "#334b63" }}>
                <strong>Amount to collect: ₱{finalPrice.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                <div style={{ marginTop: 6, fontSize: "0.85rem" }}>
                  Route: {selectedTrip?.routeDirection || "N/A"} | Date: {formatDateValue(selectedTrip?.date) || "N/A"} | Time: {selectedTrip?.departure || "N/A"}
                </div>
                <div style={{ marginTop: 6, fontSize: "0.85rem", fontWeight: 700 }}>
                  Available seats: {availableSeats} of {selectedTrip?.capacity || 0}
                </div>
              </div>

              <button type="submit" disabled={saving || !trips.length || !availableSeats} style={buttonStyle}>
                {saving ? "Saving..." : "Save Walk-in Booking"}
              </button>
            </form>
          )}
        </div>
      </main>
    </AdminLayout>
  );
}

const inputStyle = {
  display: "block",
  width: "100%",
  marginTop: 7,
  padding: "11px 12px",
  border: "1px solid #d5e0eb",
  borderRadius: 8,
  background: "#fff",
  font: "inherit",
  fontSize: "0.95rem",
  color: "#263c52"
};

const labelStyle = {
  display: "block",
  color: "#666",
  fontSize: "0.85rem",
  fontWeight: 600,
  lineHeight: 1.25
};

const buttonStyle = {
  marginTop: 22,
  padding: "12px 18px",
  border: 0,
  borderRadius: 8,
  background: "#2876d2",
  color: "#fff",
  fontWeight: 700,
  fontSize: "0.95rem",
  cursor: "pointer"
};

export default WalkInBookingPage;
