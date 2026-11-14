import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { db, auth } from "../../firebase";
import AdminLayout from "../Admin/AdminLayout";
import { getStaffAccount } from "../../utils/staffAccount";
import { useAuthUser } from "../../hooks/useAuthUser";
import {
  calculatePromoDiscount,
  getActivePromo,
  getPromoReservationCounts,
} from "../../utils/promotionHelpers";
import { notifyNewBookingReceived } from "../../utils/notificationHelper";
import {
  calculateCargoTotal,
  createCargoBookingSnapshot,
  isValidCargoQuantity,
} from "../../utils/cargoPricing";
import "./WalkInBooking.css";

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
  const [cargoTypes, setCargoTypes] = useState([]);
  const [promos, setPromos] = useState([]);
  const [promoReservationCounts, setPromoReservationCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [form, setForm] = useState({
    tripId: "",
    bookingType: "passenger_cargo",
    customerName: "",
    userType: "regular",
    cargoId: "",
    cargoQuantity: "",
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
        const [schedulesSnapshot, discountsSnapshot, bookingsSnapshot, cargoSnapshot] = await Promise.all([
          getDocs(query(collection(db, "schedules"), where("boat", "==", assignedBoat))),
          getDocs(query(collection(db, "discounts"), where("boatName", "==", assignedBoat))),
          getDocs(query(collection(db, "bookings"), where("boat", "==", assignedBoat))),
          getDocs(query(
            collection(db, "cargoTypes"),
            where("boat", "==", assignedBoat)
          ))
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
        const boatPromos = discountsSnapshot.docs[0]?.data()?.promos || [];
        const promoCounts = getPromoReservationCounts(
          bookingsSnapshot.docs.map((bookingDoc) => bookingDoc.data())
        );
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
        setCargoTypes(cargoSnapshot.docs
          .map((cargoDoc) => ({ id: cargoDoc.id, ...cargoDoc.data() }))
          .filter((cargo) => cargo.status === "active")
          .filter((cargo) => Number.isFinite(Number(cargo.price)) && Number(cargo.price) > 0)
          .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))));
        setPromos(Array.isArray(boatPromos) ? boatPromos : []);
        setPromoReservationCounts(promoCounts);
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
  const selectedCargo = cargoTypes.find((cargo) => cargo.id === form.cargoId) || null;
  const isCargoOnly = form.bookingType === "cargo_only";
  const isPassengerOnly = form.bookingType === "passenger_only";
  const includesCargo = !isPassengerOnly;
  const cargoPrice = useMemo(() => {
    if (!includesCargo || !selectedCargo) return 0;
    return calculateCargoTotal(selectedCargo.price, Number(form.cargoQuantity) || 0, selectedCargo.pricingBasis);
  }, [form.cargoQuantity, includesCargo, selectedCargo]);
  const basePrice = isCargoOnly ? cargoPrice : Number(selectedTrip?.price || 0) + cargoPrice;
  const discountRate = isCargoOnly ? 0 : Number(discounts[form.userType] || 0);
  const activePromo = isCargoOnly ? null : getActivePromo(promos, promoReservationCounts);
  const passengerDiscountAmount = basePrice * discountRate;
  const promoDiscountAmount = calculatePromoDiscount(basePrice - passengerDiscountAmount, activePromo);
  const discountAmount = passengerDiscountAmount + promoDiscountAmount;
  const finalPrice = Math.max(0, basePrice - discountAmount);
  const availableSeats = selectedTrip
    ? Math.max(0, Number(selectedTrip.capacity || 0) - (bookingCounts[selectedTrip.id] || 0))
    : 0;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({
      ...previous,
      [name]: value,
      ...(name === "bookingType" && value === "passenger_only"
        ? { cargoId: "", cargoQuantity: "" }
        : {})
    }));
    setMessage({ type: "", text: "" });
  };

  const resetForm = () => {
    setForm({
      tripId: trips[0]?.id || "",
      bookingType: "passenger_cargo",
      customerName: "",
      userType: "regular",
      cargoId: "",
      cargoQuantity: "",
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
    if (includesCargo && isCargoOnly && !selectedCargo) {
      setMessage({ type: "error", text: "Please select an available cargo type." });
      return;
    }
    if (includesCargo && form.cargoId && !selectedCargo) {
      setMessage({ type: "error", text: "The selected cargo type is no longer available. Please choose another type or remove it." });
      return;
    }
    if (includesCargo && form.cargoId && !isValidCargoQuantity(form.cargoQuantity, selectedCargo?.pricingBasis)) {
      setMessage({
        type: "error",
        text: selectedCargo?.pricingBasis === "Per Kilo"
          ? "Cargo weight must be greater than zero and use up to two decimal places."
          : "Cargo quantity must be a whole number greater than zero."
      });
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

      const latestBoatBookings = await getDocs(
        query(collection(db, "bookings"), where("boat", "==", selectedTrip.boat))
      );
      const latestPromo = isCargoOnly
        ? null
        : getActivePromo(
          promos,
          getPromoReservationCounts(latestBoatBookings.docs.map((bookingDoc) => bookingDoc.data()))
        );
      if ((latestPromo?.id || null) !== (activePromo?.id || null)) {
        throw new Error("Promo availability has changed. Please review the updated price before booking.");
      }

      let cargoSnapshot = null;
      if (includesCargo && selectedCargo) {
        const latestCargoDoc = await getDoc(doc(db, "cargoTypes", selectedCargo.id));
        if (!latestCargoDoc.exists() || latestCargoDoc.data().status !== "active") {
          throw new Error("This cargo type is no longer available. Please choose another cargo type.");
        }
        const latestCargo = { id: latestCargoDoc.id, ...latestCargoDoc.data() };
        if (
          latestCargo.boat !== selectedTrip.boat ||
          latestCargo.name !== selectedCargo.name ||
          latestCargo.pricingBasis !== selectedCargo.pricingBasis ||
          Number(latestCargo.price) !== Number(selectedCargo.price)
        ) {
          throw new Error("Cargo pricing has changed. Please review the updated cargo price before booking.");
        }
        cargoSnapshot = createCargoBookingSnapshot(latestCargo, form.cargoQuantity);
        if (!cargoSnapshot) throw new Error("Please enter a valid cargo quantity.");
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
        cargoType: cargoSnapshot?.name || "",
        cargoQuantity: cargoSnapshot?.quantity || 0,
        cargoPricingBasis: cargoSnapshot?.pricingBasis || "",
        cargoSnapshot,
        cargoPrice,
        basePrice: isCargoOnly ? 0 : Number(selectedTrip.price || 0),
        passengerPrice: isCargoOnly ? 0 : Number(selectedTrip.price || 0),
        discountRate,
        discountAmount,
        passengerDiscountAmount,
        promoName: promoDiscountAmount > 0 ? activePromo?.name || null : null,
        promoId: promoDiscountAmount > 0 ? activePromo?.id || null : null,
        promoPercentage: promoDiscountAmount > 0 ? Number(activePromo?.percentage) : 0,
        promoDiscountAmount,
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
      await notifyNewBookingReceived(bookingData, bookingReference.id, selectedTrip.capacity).catch((error) =>
        console.warn("Walk-in booking in-app notification failed:", error)
      );
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
      <main className="walk-in-page">
        <section className="walk-in-card">
          <header className="walk-in-header">
            <div>
              <h1>Walk-in Booking</h1>
              <p>
                Create a booking for passengers who did not book online.
              </p>
            </div>
            {profile?.assignedBoat && (
              <div className="walk-in-boat-badge">
                <span>Assigned boat</span>
                <strong>{profile.assignedBoat}</strong>
              </div>
            )}
          </header>

          {message.text && (
            <div className={`walk-in-message ${message.type}`} role="alert">
              {message.text}
            </div>
          )}

          {loading ? (
            <p className="walk-in-state">Loading available trips...</p>
          ) : trips.length === 0 ? (
            <div className="walk-in-state walk-in-empty">
              <strong>No available trips</strong>
              <span>There are no upcoming schedules available for your assigned boat.</span>
            </div>
          ) : (
            <form className="walk-in-form" onSubmit={handleSubmit}>
              <div className="walk-in-fields">
                <label className="walk-in-field">
                  Trip / Schedule
                  <select name="tripId" value={form.tripId} onChange={handleChange} required>
                    <option value="">Select a trip</option>
                    {trips.map((trip) => (
                      <option key={trip.id} value={trip.id}>
                        {[trip.name, trip.routeDirection, formatDateValue(trip.date), trip.departure].filter(Boolean).join(" - ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="walk-in-field">
                  Booking Type
                  <select name="bookingType" value={form.bookingType} onChange={handleChange}>
                    <option value="passenger_only">Passenger Only</option>
                    <option value="passenger_cargo">Passenger + Cargo</option>
                    <option value="cargo_only">Cargo Only</option>
                  </select>
                </label>
                <label className="walk-in-field">
                  Passenger Name
                  <input name="customerName" value={form.customerName} onChange={handleChange} required />
                </label>
                {!isCargoOnly && (
                  <label className="walk-in-field">
                    Passenger Type
                    <select name="userType" value={form.userType} onChange={handleChange}>
                      <option value="regular">Regular</option>
                      {Object.keys(discounts).filter((type) => type !== "regular").map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                )}
                {includesCargo && (
                  <>
                    <label className="walk-in-field">
                      Cargo Type and Price
                      <select name="cargoId" value={form.cargoId} onChange={handleChange} required={isCargoOnly}>
                        <option value="">{isCargoOnly ? "Select cargo type" : "No cargo"}</option>
                        {cargoTypes.map((cargo) => (
                          <option key={cargo.id} value={cargo.id}>
                            {cargo.name} — ₱{Number(cargo.price).toFixed(2)} {cargo.pricingBasis}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="walk-in-field">
                      Quantity {selectedCargo ? `(${selectedCargo.pricingBasis.replace("Per ", "")})` : ""}
                      <input
                        name="cargoQuantity"
                        type="number"
                        min={selectedCargo?.pricingBasis === "Per Kilo" ? "0.01" : "1"}
                        step={selectedCargo?.pricingBasis === "Per Kilo" ? "0.01" : "1"}
                        value={form.cargoQuantity}
                        onChange={handleChange}
                        disabled={!selectedCargo}
                        required={Boolean(selectedCargo)}
                      />
                    </label>
                    {selectedCargo && (
                      <p className="walk-in-cargo-price">
                        ₱{Number(selectedCargo.price).toFixed(2)} {selectedCargo.pricingBasis}
                        {" · Cargo total: "}₱{cargoPrice.toFixed(2)}
                      </p>
                    )}
                  </>
                )}
                <label className="walk-in-field">
                  Payment Method
                  <input value="Cash" readOnly />
                </label>
              </div>

              <section className="walk-in-summary" aria-label="Booking summary">
                <div className="walk-in-total">
                  <span>Amount to collect</span>
                  <strong>₱{finalPrice.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
                <div className="walk-in-breakdown">
                  {cargoPrice > 0 && <span>Cargo: ₱{cargoPrice.toFixed(2)}</span>}
                  {passengerDiscountAmount > 0 && (
                    <span>{form.userType} discount ({(discountRate * 100).toFixed(0)}%): -₱{passengerDiscountAmount.toFixed(2)}</span>
                  )}
                  {promoDiscountAmount > 0 && (
                    <span>Promo {activePromo.name} ({Number(activePromo.percentage)}%): -₱{promoDiscountAmount.toFixed(2)}</span>
                  )}
                  <span>{selectedTrip?.routeDirection || "Route N/A"} · {formatDateValue(selectedTrip?.date) || "Date N/A"} · {selectedTrip?.departure || "Time N/A"}</span>
                  <strong>Available seats: {availableSeats} of {selectedTrip?.capacity || 0}</strong>
                </div>
              </section>

              <button className="walk-in-submit" type="submit" disabled={saving || !trips.length || !availableSeats}>
                {saving ? "Saving..." : "Save Walk-in Booking"}
              </button>
            </form>
          )}
        </section>
      </main>
    </AdminLayout>
  );
}

export default WalkInBookingPage;
