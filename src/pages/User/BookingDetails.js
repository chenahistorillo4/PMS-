import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { db, auth } from "../../firebase";
import { collection, addDoc, query, where, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import { formatTime12Hour } from "../../utils/timeFormatter";
import {
  createQrPhCheckout,
  isPayMongoEnabled,
  isPayMongoGcash,
  checkPayMongoReady,
  isProductionDeployment,
} from "../../utils/paymongo";

// Generate a unique reference code
const generateReferenceCode = () => {
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${randomStr}${timestamp}`;
};

function BookingDetails(props) {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Support both route-based and modal-based usage
  const isModal = props?.isModal || false;
  const onCloseModal = props?.onClose;
  
  let { trip, userId, userType } = props?.trip 
    ? { trip: props.trip, userId: props.userId, userType: props.userType }
    : location.state || {};

  if (!userId && auth.currentUser) {
    userId = auth.currentUser.uid;
  }

  const [form, setForm] = useState({
    bookingType: "passenger_cargo", // "passenger_cargo" or "cargo_only"
    customerName: "",
    cargoType: "",
    cargoWeight: "",
    userType: userType || "regular",
    payment: "",
    idProof: null,
    idProofBase64: null,
    idPreview: null
  });
  const [loading, setLoading] = useState(false);
  const [bookingId, setBookingId] = useState(null);
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState([]);
  const [selectedPaymentAccount, setSelectedPaymentAccount] = useState(null);
  const [paymentProof, setPaymentProof] = useState(null);
  const [paymentProofBase64, setPaymentProofBase64] = useState(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState(null);
  const [boatDiscounts, setBoatDiscounts] = useState({});
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [payMongoReady, setPayMongoReady] = useState(false);
  const paymentAutoSelectedRef = useRef(false);
  const usesPayMongoGcash = isPayMongoGcash(form.payment);

  useEffect(() => {
    checkPayMongoReady().then(setPayMongoReady);
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const computeCargoPrice = (weight) => {
    const w = parseFloat(weight);
    const cargoRate = parseFloat(trip?.cargoPerKilo || 20);
    return isNaN(w) ? 0 : w * cargoRate;
  };
  const computeDiscountAmount = (basePrice, type) => {
    const rate = boatDiscounts[type] || 0;
    return basePrice * rate;
  };

  // Price calculations
  const cargoPrice = computeCargoPrice(form.cargoWeight);
  
  let basePrice, discountRate, discountAmount, finalPrice;
  
  if (form.bookingType === "cargo_only") {
    // Cargo-only: only charge cargo fee, no passenger base price
    basePrice = cargoPrice;
    discountRate = 0;
    discountAmount = 0;
    finalPrice = cargoPrice;
  } else {
    // Passenger + Cargo: charge base price + cargo price with discounts
    basePrice = parseFloat(trip?.price || 0) + cargoPrice;
    discountRate = boatDiscounts[form.userType] || 0;
    discountAmount = computeDiscountAmount(basePrice, form.userType);
    finalPrice = basePrice - discountAmount;
  }

  // Scroll to top on mount (only if not in modal)
  useEffect(() => {
    if (isModal) return; // Skip scroll when in modal
    
    const contentElement = document.getElementById('bookingdetails-page-content');
    if (contentElement) {
      contentElement.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, [isModal]);

  // Redirect after booking - REMOVED to wait for payment confirmation
  // Payment confirmation will come from admin via PaymentManagement

  // Fetch boat discounts from database
  useEffect(() => {
    const fetchBoatDiscounts = async () => {
      try {
        if (!trip?.boat) {
          console.log("No boat selected, skipping discount fetch");
          setBoatDiscounts({});
          return;
        }

        console.log("[INFO] Fetching discounts for boat:", trip.boat);
        
        // Query discounts collection filtered by boatName
        const discountQuery = query(
          collection(db, "discounts"),
          where("boatName", "==", trip.boat)
        );
        
        const discountSnap = await getDocs(discountQuery);
        
        if (discountSnap.empty) {
          console.log("[ERROR] No discounts found for boat:", trip.boat);
          setBoatDiscounts({});
          return;
        }
        
        const discountData = discountSnap.docs[0].data();
        console.log("[SUCCESS] Discounts found:", discountData);
        setBoatDiscounts(discountData.discounts || {});
      } catch (error) {
        console.error("Error fetching boat discounts:", error);
        setBoatDiscounts({});
      }
    };

    fetchBoatDiscounts();
  }, [trip?.boat]);

  // Fetch payment methods and validate user type for the selected boat
  useEffect(() => {
    const fetchPaymentMethods = async () => {
      try {
        if (!trip?.boat) return;

        // Find admin managing this boat
        const adminsQuery = query(
          collection(db, "admins"),
          where("assignedBoat", "==", trip.boat)
        );
        const adminsSnap = await getDocs(adminsQuery);

        if (adminsSnap.empty) {
          console.warn("No admin found for boat:", trip.boat);
          return;
        }

        const adminId = adminsSnap.docs[0].id;

        // Fetch active payment accounts for this admin
        const paymentQuery = query(
          collection(db, "paymentAccounts"),
          where("adminId", "==", adminId),
          where("isActive", "==", true)
        );
        const paymentSnap = await getDocs(paymentQuery);

        const methods = paymentSnap.docs.map(doc => ({
          id: doc.id,
          accountType: doc.data().accountType,
          accountName: doc.data().accountName,
          accountNumber: doc.data().accountNumber,
          accountHolder: doc.data().accountHolder
        }));

        setAvailablePaymentMethods(methods);
        
        // Auto-select first available payment method only once
        if (methods.length > 0 && !paymentAutoSelectedRef.current) {
          setForm(prev => ({ ...prev, payment: methods[0].accountType }));
          setSelectedPaymentAccount(methods[0]);
          paymentAutoSelectedRef.current = true;
        }
      } catch (error) {
        console.error("Error fetching payment methods:", error);
      }
    };

    fetchPaymentMethods();
  }, [trip?.boat]);

  // Validate user type when boat discounts change
  useEffect(() => {
    if (boatDiscounts && Object.keys(boatDiscounts).length > 0 && form.userType !== "regular") {
      if (!boatDiscounts[form.userType]) {
        console.log(`User type "${form.userType}" not available for boat "${trip.boat}". Resetting to "regular".`);
        setForm(prev => ({ ...prev, userType: "regular" }));
      }
    }
  }, [boatDiscounts, form.userType, trip?.boat]);

  const handleChange = (e) => {
    if (e.target.name === "idProof") {
      const file = e.target.files[0];
      if (file) {
        // Create preview
        const preview = URL.createObjectURL(file);
        
        // Convert to Base64
        const reader = new FileReader();
        reader.onloadend = () => {
          setForm({
            ...form,
            idProof: file,
            idProofBase64: reader.result, // Base64 string
            idPreview: preview
          });
        };
        reader.readAsDataURL(file);
      } else {
        setForm({
          ...form,
          idProof: null,
          idProofBase64: null,
          idPreview: null
        });
      }
    } else if (e.target.name === "paymentProof") {
      const file = e.target.files[0];
      if (file) {
        // Create preview
        const preview = URL.createObjectURL(file);
        
        // Convert to Base64
        const reader = new FileReader();
        reader.onloadend = () => {
          setPaymentProof(file);
          setPaymentProofBase64(reader.result);
          setPaymentProofPreview(preview);
        };
        reader.readAsDataURL(file);
      } else {
        setPaymentProof(null);
        setPaymentProofBase64(null);
        setPaymentProofPreview(null);
      }
    } else if (e.target.name === "payment") {
      const accountType = e.target.value;
      setForm({ ...form, payment: accountType });
      // Update selected account details
      const selected = availablePaymentMethods.find(m => m.accountType === accountType);
      setSelectedPaymentAccount(selected);
    } else {
      setForm({ ...form, [e.target.name]: e.target.value });
    }
  };

  const handleConfirmBooking = async () => {
    if (!form.customerName || !form.payment) {
      alert("Please complete all required fields.");
      return;
    }
    
    // Only validate passenger-specific fields if booking includes passenger
    if (form.bookingType === "passenger_cargo") {
      // Validate user type is available for this boat
      if (form.userType !== "regular" && !boatDiscounts[form.userType]) {
        alert(`The discount type "${form.userType}" is not available for ${trip.boat}. Please select a different user type or contact support.`);
        return;
      }
      
      if (form.userType !== "regular" && !form.idProof) {
        alert("Please upload your valid ID for verification.");
        return;
      }
    }

    // Manual proof is only required for non-PayMongo payments
    if (!usesPayMongoGcash && !paymentProofBase64) {
      alert("Please upload your proof of payment screenshot.");
      return;
    }

    if (!userId) {
      alert("User not found. Please log in again or reselect your trip.");
      navigate('/login');
      return;
    }
    if (!trip) {
      alert('Trip data is missing. Please select a trip again.');
      navigate('/booking');
      return;
    }

    try {
      setLoading(true);
      
      console.log('[INFO] Preparing booking data...');
      
      // Fetch user's name from Firestore users collection
      let bookedByName = auth.currentUser?.email || "Guest";
      try {
        const userDoc = await getDoc(doc(db, "users", userId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          // Try different field names for the user's name
          bookedByName = userData.name || userData.fullName || userData.displayName || auth.currentUser?.displayName || auth.currentUser?.email || "Guest";
        }
      } catch (error) {
        console.warn("Error fetching user name from database:", error);
        bookedByName = auth.currentUser?.displayName || auth.currentUser?.email || "Guest";
      }
      
      // Booking data with Base64 encoded image
      const referenceCode = generateReferenceCode();
      
      const bookingData = {
        tripId: trip.id,
        tripName: trip.name,
        boat: trip.boat,
        routeDirection: trip.routeDirection,
        date: trip.date,
        departure: trip.departure,
        arrival: trip.arrival,
        bookingType: form.bookingType,
        customerName: form.customerName,
        userType: form.bookingType === "cargo_only" ? null : form.userType,
        cargoType: form.cargoType,
        cargoWeight: form.cargoWeight,
        cargoPrice,
        basePrice: form.bookingType === "cargo_only" ? 0 : parseFloat(trip?.price || 0),
        passengerPrice: form.bookingType === "cargo_only" ? 0 : parseFloat(trip?.price || 0),
        discountRate,
        discountAmount,
        finalPrice,
        payment: form.payment,
        userId: userId || null,
        userEmail: auth.currentUser?.email || null,
        bookedByName: bookedByName,
        idProofBase64: form.bookingType === "cargo_only" ? null : (form.idProofBase64 || null),
        idProofFileName: form.bookingType === "cargo_only" ? null : (form.idProof?.name || null),
        status: "pending",
        referenceCode: referenceCode,
        qrCodeValue: referenceCode,
        createdAt: new Date()
      };
      
      console.log('Adding booking to Firestore...');
      const docRef = await addDoc(collection(db, "bookings"), bookingData);
      console.log('[SUCCESS] Booking successfully saved! ID:', docRef.id);
      
      // Create payment record with pending status
      console.log('[INFO] Creating payment record...');
      const paymentData = {
        bookingId: docRef.id,
        userId: userId || null,
        userEmail: auth.currentUser?.email || null,
        customerName: form.customerName,
        boat: trip.boat,
        trip: trip.name,
        amount: finalPrice,
        method: form.payment,
        paymentAccountId: selectedPaymentAccount?.id || null,
        paymentAccountNumber: selectedPaymentAccount?.accountNumber || null,
        status: "pending",
        paymentProvider: usesPayMongoGcash ? "paymongo" : "manual",
        proofOfPaymentBase64: usesPayMongoGcash ? null : paymentProofBase64,
        proofOfPaymentFileName: usesPayMongoGcash ? null : (paymentProof?.name || null),
        createdAt: new Date()
      };
      
      const paymentRef = await addDoc(collection(db, "payments"), paymentData);
      console.log('[SUCCESS] Payment record created! ID:', paymentRef.id);

      if (usesPayMongoGcash) {
        if (!payMongoReady) {
          alert(
            isProductionDeployment()
              ? "Online payment is not ready. Make sure PAYMONGO_SECRET_KEY is set in server/.env on the server, then redeploy."
              : "Online GCash payment is not ready yet. Start the payment server (npm run server) and add your PAYMONGO_SECRET_KEY in server/.env, then refresh this page."
          );
          setLoading(false);
          return;
        }

        if (finalPrice <= 0) {
          alert("Online payment requires a total amount greater than ₱0.00.");
          setLoading(false);
          return;
        }

        const checkout = await createQrPhCheckout({
          paymentId: paymentRef.id,
          amount: finalPrice,
          bookingId: docRef.id,
        });

        await updateDoc(doc(db, "payments", paymentRef.id), {
          paymongoPaymentIntentId: checkout.paymentIntentId || null,
          paymongoFlow: "qrph",
          paymongoStatus: checkout.status,
        });

        setBookingId(docRef.id);

        const paymentUrl = `/payment-qr?paymentId=${paymentRef.id}`;
        const navigationState = {
          paymentIntentId: checkout.paymentIntentId,
          qrImageUrl: checkout.qrImageUrl,
        };

        if (isModal) {
          window.location.assign(paymentUrl);
          return;
        }

        setLoading(false);
        navigate(paymentUrl, { state: navigationState });
        return;
      }
      
      console.log('[SUCCESS] Booking successful! Your proof of payment has been submitted.');
      setBookingId(docRef.id);
      alert("Booking successful! Your proof of payment has been submitted. The admin will review and confirm shortly.");
      
      // If in modal, close it; otherwise redirect
      if (isModal && onCloseModal) {
        setTimeout(() => {
          onCloseModal();
        }, 500);
      } else {
        // Redirect to ManageBooking
        navigate('/manage', { state: { userId, bookingId: docRef.id } });
      }
    } catch (error) {
      console.error('[ERROR] Booking error:', error);
      alert("Error booking trip: " + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="bookingdetails-page-content" style={{ 
      minHeight: isModal ? "auto" : "100vh", 
      background: isModal ? "transparent" : "linear-gradient(135deg, rgba(255, 255, 255, 0.45) 0%, rgba(240, 248, 255, 0.40) 100%), url('/bg5.avif') center/cover fixed", 
      paddingTop: isMobile && !isModal ? "70px" : "0", 
      padding: isModal ? "0" : "40px 20px"
    }}>
      <div style={{ maxWidth: isModal ? "100%" : "900px", margin: "0 auto", padding: isModal ? "0" : "0" }}>
        {/* Header */}
        <h1 style={{
          textAlign: "center",
          fontSize: isModal ? (isMobile ? "1.2rem" : "1.5rem") : (isMobile ? "1.3rem" : "2rem"),
          fontWeight: 700,
          marginBottom: isModal ? "20px" : "40px",
          color: "#1a1a1a",
          letterSpacing: "-0.5px"
        }}>
          Booking Details
        </h1>

        {/* Main Card */}
        <div style={{
          background: "white",
          borderRadius: "12px",
          padding: isModal ? "25px" : "35px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          border: "1px solid #f0f0f0"
        }}>
          {/* Trip Information Section */}
          <div style={{ marginBottom: "35px" }}>
            <h3 style={{
              fontSize: isMobile ? "0.95rem" : "1.1rem",
              fontWeight: 800,
              color: "#1a1a1a",
              marginBottom: "20px",
              paddingBottom: "12px",
              borderBottom: "2px solid #2196f3"
            }}>
              Trip Information
            </h3>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
              fontSize: isMobile ? "0.8rem" : "0.95rem"
            }}>
              <div>
                <label style={{ fontWeight: 600, color: "#999", fontSize: isMobile ? "0.65rem" : "0.85rem", marginBottom: "6px", display: "block", textTransform: "uppercase" }}>Boat</label>
                <div style={{ color: "#1a1a1a", fontSize: isMobile ? "0.8rem" : "1rem", fontWeight: 500 }}>{trip.boat}</div>
              </div>
              <div>
                <label style={{ fontWeight: 600, color: "#999", fontSize: isMobile ? "0.65rem" : "0.85rem", marginBottom: "6px", display: "block", textTransform: "uppercase" }}>Trip Name</label>
                <div style={{ color: "#1a1a1a", fontSize: isMobile ? "0.8rem" : "1rem", fontWeight: 500 }}>{trip.name}</div>
              </div>
              <div>
                <label style={{ fontWeight: 600, color: "#999", fontSize: isMobile ? "0.65rem" : "0.85rem", marginBottom: "6px", display: "block", textTransform: "uppercase" }}>Route</label>
                <div style={{ color: "#1a1a1a", fontSize: isMobile ? "0.8rem" : "1rem", fontWeight: 500 }}>{trip.routeDirection}</div>
              </div>
              <div>
                <label style={{ fontWeight: 600, color: "#999", fontSize: isMobile ? "0.65rem" : "0.85rem", marginBottom: "6px", display: "block", textTransform: "uppercase" }}>Date</label>
                <div style={{ color: "#1a1a1a", fontSize: isMobile ? "0.8rem" : "1rem", fontWeight: 500 }}>{trip.date}</div>
              </div>
              <div>
                <label style={{ fontWeight: 600, color: "#999", fontSize: isMobile ? "0.65rem" : "0.85rem", marginBottom: "6px", display: "block", textTransform: "uppercase" }}>Departure</label>
                <div style={{ color: "#1a1a1a", fontSize: isMobile ? "0.8rem" : "1rem", fontWeight: 500 }}>{formatTime12Hour(trip.departure)}</div>
              </div>
              <div>
                <label style={{ fontWeight: 600, color: "#999", fontSize: isMobile ? "0.65rem" : "0.85rem", marginBottom: "6px", display: "block", textTransform: "uppercase" }}>Arrival</label>
                <div style={{ color: "#1a1a1a", fontSize: isMobile ? "0.8rem" : "1rem", fontWeight: 500 }}>{formatTime12Hour(trip.arrival)}</div>
              </div>
            </div>
          </div>

          {/* Booking Type Selection Section */}
          <div style={{ marginBottom: "35px" }}>
            <h3 style={{
              fontSize: isMobile ? "0.95rem" : "1.1rem",
              fontWeight: 800,
              color: "#1a1a1a",
              marginBottom: "20px",
              paddingBottom: "12px",
              borderBottom: "2px solid #2196f3"
            }}>
              Booking Type
            </h3>
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
              <label style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                cursor: "pointer",
                fontSize: isMobile ? "0.78rem" : "0.95rem",
                fontWeight: 500,
                color: "#333",
                padding: "12px 15px",
                background: form.bookingType === "passenger_cargo" ? "#e3f2fd" : "#f5f5f5",
                borderRadius: "8px",
                border: form.bookingType === "passenger_cargo" ? "2px solid #2196f3" : "2px solid #ddd",
                transition: "all 0.2s ease"
              }}>
                <input
                  type="radio"
                  name="bookingType"
                  value="passenger_cargo"
                  onChange={handleChange}
                  checked={form.bookingType === "passenger_cargo"}
                  style={{ cursor: "pointer", width: "18px", height: "18px" }}
                />
                <span style={{ fontWeight: 600 }}>Passenger + Cargo</span>
              </label>
              <label style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                cursor: "pointer",
                fontSize: isMobile ? "0.78rem" : "0.95rem",
                fontWeight: 500,
                color: "#333",
                padding: "12px 15px",
                background: form.bookingType === "cargo_only" ? "#fff3e0" : "#f5f5f5",
                borderRadius: "8px",
                border: form.bookingType === "cargo_only" ? "2px solid #ff9800" : "2px solid #ddd",
                transition: "all 0.2s ease"
              }}>
                <input
                  type="radio"
                  name="bookingType"
                  value="cargo_only"
                  onChange={handleChange}
                  checked={form.bookingType === "cargo_only"}
                  style={{ cursor: "pointer", width: "18px", height: "18px" }}
                />
                <span style={{ fontWeight: 600 }}>Cargo Only</span>
              </label>
            </div>
          </div>

          {/* Customer Information Section */}
          <div style={{ marginBottom: "35px" }}>
            <h3 style={{
              fontSize: isMobile ? "0.95rem" : "1.1rem",
              fontWeight: 800,
              color: "#1a1a1a",
              marginBottom: "20px",
              paddingBottom: "12px",
              borderBottom: "2px solid #2196f3"
            }}>
              Customer Information
            </h3>
            <input
              type="text"
              name="customerName"
              placeholder="Enter your full name"
              value={form.customerName}
              onChange={handleChange}
              style={{
                width: "100%",
                padding: "12px 15px",
                border: "1px solid #ddd",
                borderRadius: "8px",
                fontSize: isMobile ? "0.8rem" : "0.95rem",
                fontFamily: "inherit",
                boxSizing: "border-box",
                marginBottom: "15px",
                transition: "border-color 0.2s ease"
              }}
              onFocus={(e) => e.target.style.borderColor = "#2196f3"}
              onBlur={(e) => e.target.style.borderColor = "#ddd"}
            />
          </div>

          {/* User Type Section - Only show for passenger bookings */}
          {form.bookingType === "passenger_cargo" && (
          <div style={{ marginBottom: "35px" }}>
            <h3 style={{
              fontSize: isMobile ? "0.95rem" : "1.1rem",
              fontWeight: 800,
              color: "#1a1a1a",
              marginBottom: "20px",
              paddingBottom: "12px",
              borderBottom: "2px solid #2196f3"
            }}>
              Passenger Type
            </h3>
            {Object.keys(boatDiscounts).length > 0 && (
              <p style={{
                fontSize: isMobile ? "0.72rem" : "0.85rem",
                color: "#666",
                marginBottom: "15px",
                padding: "10px 12px",
                background: "#f0f7ff",
                borderLeft: "4px solid #2196f3",
                borderRadius: "4px"
              }}>
                [INFO] Available discounts for <strong>{trip.boat}</strong>: {Object.keys(boatDiscounts).map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(", ")}
              </p>
            )}
            {Object.keys(boatDiscounts).length === 0 && (
              <p style={{
                fontSize: isMobile ? "0.72rem" : "0.85rem",
                color: "#ff6f00",
                marginBottom: "15px",
                padding: "10px 12px",
                background: "#fff3e0",
                borderLeft: "4px solid #ff9800",
                borderRadius: "4px"
              }}>
                [WARNING] No special discounts available for <strong>{trip.boat}</strong>. Only regular rates apply.
              </p>
            )}
            <select
              name="userType"
              value={form.userType}
              onChange={handleChange}
              style={{
                width: "100%",
                padding: "12px 15px",
                border: "1px solid #ddd",
                borderRadius: "8px",
                fontSize: isMobile ? "0.8rem" : "0.95rem",
                fontFamily: "inherit",
                boxSizing: "border-box",
                background: "white",
                cursor: "pointer",
                transition: "border-color 0.2s ease"
              }}
              onFocus={(e) => e.target.style.borderColor = "#2196f3"}
              onBlur={(e) => e.target.style.borderColor = "#ddd"}
            >
              <option value="regular">Regular</option>
              {Object.keys(boatDiscounts).map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)} ({(boatDiscounts[type] * 100).toFixed(0)}% discount)
                </option>
              ))}
            </select>
          </div>
          )}

          {/* ID Upload Section - Only show for passenger bookings with non-regular type */}
          {form.bookingType === "passenger_cargo" && form.userType !== "regular" && (
            <div style={{ marginBottom: "35px" }}>
              <h3 style={{
                fontSize: isMobile ? "0.95rem" : "1.1rem",
                fontWeight: 800,
                color: "#1a1a1a",
                marginBottom: "20px",
                paddingBottom: "12px",
                borderBottom: "2px solid #2196f3"
              }}>
                ID Verification
              </h3>
              <label style={{
                display: "block",
                fontWeight: 600,
                color: "#333",
                marginBottom: "12px",
                fontSize: isMobile ? "0.78rem" : "0.95rem"
              }}>
                Upload Your Valid ID / Photo
              </label>
              <input
                type="file"
                name="idProof"
                accept="image/*"
                onChange={handleChange}
                style={{
                  width: "100%",
                  padding: "12px 15px",
                  border: "2px dashed #2196f3",
                  borderRadius: "8px",
                  fontSize: isMobile ? "0.8rem" : "0.95rem",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  cursor: "pointer",
                  transition: "border-color 0.2s ease"
                }}
              />
              {form.idPreview && (
                <div style={{
                  marginTop: "20px",
                  textAlign: "center",
                  padding: "15px",
                  background: "#f9f9f9",
                  borderRadius: "8px",
                  border: "1px solid #e0e0e0"
                }}>
                  <p style={{ fontSize: isMobile ? "0.7rem" : "0.85rem", color: "#666", marginBottom: "12px", fontWeight: 600 }}>ID Preview</p>
                  <img src={form.idPreview} alt="ID Preview" style={{ maxWidth: '200px', maxHeight: '200px', borderRadius: "6px" }} />
                </div>
              )}
            </div>
          )}

          {/* Cargo Information Section */}
          <div style={{ marginBottom: "35px" }}>
            <h3 style={{
              fontSize: isMobile ? "0.95rem" : "1.1rem",
              fontWeight: 800,
              color: "#1a1a1a",
              marginBottom: "20px",
              paddingBottom: "12px",
              borderBottom: "2px solid #2196f3"
            }}>
              Cargo Information
            </h3>
            <div style={{ marginBottom: "15px" }}>
              <label style={{
                display: "block",
                fontWeight: 600,
                color: "#333",
                marginBottom: "8px",
                fontSize: isMobile ? "0.78rem" : "0.95rem"
              }}>
                Cargo Type
              </label>
              <input
                list="cargoOptions"
                name="cargoType"
                placeholder="Select or type cargo"
                value={form.cargoType}
                onChange={handleChange}
                style={{
                  width: "100%",
                  padding: "12px 15px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  fontSize: isMobile ? "0.8rem" : "0.95rem",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s ease"
                }}
                onFocus={(e) => e.target.style.borderColor = "#2196f3"}
                onBlur={(e) => e.target.style.borderColor = "#ddd"}
              />
              <datalist id="cargoOptions">
                <option value="None" />
                <option value="Rice sacks" />
                <option value="Furniture" />
                <option value="Vehicle" />
                <option value="Appliances" />
              </datalist>
            </div>
            <div>
              <label style={{
                display: "block",
                fontWeight: 600,
                color: "#333",
                marginBottom: "8px",
                fontSize: isMobile ? "0.78rem" : "0.95rem"
              }}>
                Cargo Weight (kg)
              </label>
              <input
                type="number"
                name="cargoWeight"
                placeholder="Cargo weight in kilograms"
                value={form.cargoWeight}
                onChange={handleChange}
                disabled={form.cargoType === "None"}
                style={{
                  width: "100%",
                  padding: "12px 15px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  fontSize: isMobile ? "0.8rem" : "0.95rem",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  background: form.cargoType === "None" ? "#f5f5f5" : "white",
                  cursor: form.cargoType === "None" ? "not-allowed" : "text",
                  transition: "border-color 0.2s ease",
                  color: form.cargoType === "None" ? "#999" : "#333"
                }}
                onFocus={(e) => e.target.style.borderColor = "#2196f3"}
                onBlur={(e) => e.target.style.borderColor = "#ddd"}
              />
            </div>
          </div>

          {/* Price Breakdown Section */}
          <div style={{ marginBottom: "35px" }}>
            <h3 style={{
              fontSize: isMobile ? "0.95rem" : "1.1rem",
              fontWeight: 800,
              color: "#1a1a1a",
              marginBottom: "20px",
              paddingBottom: "12px",
              borderBottom: "2px solid #2196f3"
            }}>
              Price Breakdown
            </h3>
            <div style={{
              background: "#f9f9f9",
              padding: "20px",
              borderRadius: "8px",
              border: "1px solid #e0e0e0"
            }}>
              {form.bookingType === "cargo_only" ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: isMobile ? "0.78rem" : "0.95rem" }}>
                    <span style={{ color: "#666", fontWeight: 500 }}>Cargo Price:</span>
                    <span style={{ fontWeight: 600, color: "#1a1a1a" }}>₱{Number(cargoPrice).toFixed(2)}</span>
                  </div>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    paddingTop: "12px",
                    borderTop: "2px solid #ddd",
                    fontSize: isMobile ? "0.9rem" : "1.1rem"
                  }}>
                    <span style={{ color: "#1a1a1a", fontWeight: 700 }}>Total Price:</span>
                    <span style={{ fontWeight: 800, color: "#ff9800", fontSize: isMobile ? "1rem" : "1.3rem" }}>₱{Number(finalPrice).toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: isMobile ? "0.78rem" : isMobile ? "0.78rem" : "0.95rem" }}>
                    <span style={{ color: "#666", fontWeight: 500 }}>Base Price:</span>
                    <span style={{ fontWeight: 600, color: "#1a1a1a" }}>₱{Number(trip.price).toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: isMobile ? "0.78rem" : "0.95rem" }}>
                    <span style={{ color: "#666", fontWeight: 500 }}>Cargo Price:</span>
                    <span style={{ fontWeight: 600, color: "#1a1a1a" }}>₱{Number(cargoPrice).toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: isMobile ? "0.78rem" : "0.95rem", color: "#f44336" }}>
                    <span style={{ fontWeight: 500 }}>Discount ({(discountRate * 100).toFixed(0)})%:</span>
                    <span style={{ fontWeight: 600 }}>-₱{Number(discountAmount).toFixed(2)}</span>
                  </div>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    paddingTop: "12px",
                    borderTop: "2px solid #ddd",
                    fontSize: isMobile ? "0.9rem" : "1.1rem"
                  }}>
                    <span style={{ color: "#1a1a1a", fontWeight: 700 }}>Total Price:</span>
                    <span style={{ fontWeight: 800, color: "#2196f3", fontSize: isMobile ? "1rem" : "1.3rem" }}>₱{Number(finalPrice).toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Payment Method Section */}
          <div style={{ marginBottom: "35px" }}>
            <h3 style={{
              fontSize: isMobile ? "0.95rem" : "1.1rem",
              fontWeight: 800,
              color: "#1a1a1a",
              marginBottom: "20px",
              paddingBottom: "12px",
              borderBottom: "2px solid #2196f3"
            }}>
              Payment Method
            </h3>
            {availablePaymentMethods.length === 0 ? (
              <div style={{
                padding: "15px",
                background: "#fff3cd",
                border: "1px solid #ffc107",
                borderRadius: "8px",
                color: "#856404",
                fontSize: isMobile ? "0.75rem" : "0.9rem",
                fontWeight: 500
              }}>
                No payment methods available for this boat.
              </div>
            ) : (
              <div style={{ display: "flex", gap: "25px", flexWrap: "wrap" }}>
                {availablePaymentMethods.map((method) => (
                  <label key={method.id} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    cursor: "pointer",
                    fontSize: isMobile ? "0.78rem" : "0.95rem",
                    fontWeight: 5,
                    color: "#333"
                  }}>
                    <input
                      type="radio"
                      name="payment"
                      value={method.accountType}
                      onChange={handleChange}
                      checked={form.payment === method.accountType}
                      style={{ cursor: "pointer", width: "18px", height: "18px" }}
                    />
                    {method.accountType === "gcash"
                      ? isPayMongoEnabled()
                        ? "GCash (QR Ph Scan)"
                        : "GCash"
                      : method.accountType === "paymaya"
                      ? "PayMaya"
                      : method.accountType.charAt(0).toUpperCase() + method.accountType.slice(1)}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Payment Instructions Section - Show when payment method selected BEFORE booking */}
          {form.payment && !bookingId && (
            <div style={{
              background: usesPayMongoGcash ? "#e8f5e9" : "#fff9e6",
              border: usesPayMongoGcash ? "2px solid #4caf50" : "2px solid #ffc107",
              borderRadius: "8px",
              padding: "clamp(20px, 5vw, 30px)",
              marginBottom: "30px",
              marginLeft: "15px",
              marginRight: "15px"
            }}>
                <h3 style={{
                  fontSize: isModal || isMobile ? "clamp(0.9rem, 1.1vw, 1rem)" : "clamp(1rem, 1.2vw, 1.1rem)",
                  fontWeight: 800,
                  color: "#1a1a1a",
                  marginBottom: "20px",
                  paddingBottom: "12px",
                  borderBottom: usesPayMongoGcash ? "2px solid #4caf50" : "2px solid #ffc107"
                }}>
                   {usesPayMongoGcash ? "Pay with QR Ph (GCash / Bank Apps)" : "Payment Instructions"}
                </h3>
                
                <div style={{
                  background: "white",
                  padding: isMobile ? "clamp(12px, 2vw, 15px)" : "clamp(15px, 3vw, 20px)",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  border: usesPayMongoGcash ? "1px solid #4caf50" : "1px solid #ffc107"
                }}>
                  {usesPayMongoGcash ? (
                    <>
                      <p style={{
                        fontSize: isMobile ? "clamp(0.7rem, 0.85vw, 0.78rem)" : "clamp(0.85rem, 1vw, 0.9rem)",
                        color: "#666",
                        marginBottom: "15px",
                        lineHeight: "1.6"
                      }}>
                        You will pay <strong>₱{Number(finalPrice).toFixed(2)}</strong> via <strong>QR Ph</strong>.
                        After confirming, a QR code will appear — scan it using the GCash app or any participating bank/e-wallet app.
                      </p>
                      {!payMongoReady && (
                        <p style={{
                          fontSize: isMobile ? "clamp(0.65rem, 0.8vw, 0.72rem)" : "clamp(0.75rem, 0.9vw, 0.85rem)",
                          color: "#c62828",
                          fontWeight: 600,
                          marginBottom: "10px",
                          lineHeight: "1.5"
                        }}>
                          {isProductionDeployment()
                            ? "Online payment is not ready. Add PAYMONGO_SECRET_KEY to server/.env and redeploy."
                            : "Payment server is not ready. Run `npm run server` and set PAYMONGO_SECRET_KEY in server/.env, then refresh."}
                        </p>
                      )}
                      <p style={{
                        fontSize: isMobile ? "clamp(0.65rem, 0.8vw, 0.72rem)" : "clamp(0.75rem, 0.9vw, 0.85rem)",
                        color: "#2e7d32",
                        fontWeight: 600,
                        marginBottom: "0",
                        lineHeight: "1.5"
                      }}>
                        No manual transfer or proof upload needed. QR code expires in 30 minutes.
                      </p>
                    </>
                  ) : (
                    <>
                  <p style={{
                    fontSize: isMobile ? "clamp(0.7rem, 0.85vw, 0.78rem)" : "clamp(0.85rem, 1vw, 0.9rem)",
                    color: "#666",
                    marginBottom: "15px",
                    lineHeight: "1.6"
                  }}>
                    Please send ₱<strong>{Number(finalPrice).toFixed(2)}</strong> to the following account:
                  </p>

                  {selectedPaymentAccount && (
                    <div style={{
                      background: "#f5f5f5",
                      padding: "clamp(12px, 2vw, 15px)",
                      borderRadius: "6px",
                      marginBottom: "15px",
                      border: "1px solid #ddd"
                    }}>
                      <p style={{ margin: "0 0 10px 0", fontSize: isMobile ? "clamp(0.68rem, 0.8vw, 0.75rem)" : "clamp(0.8rem, 0.95vw, 0.9rem)", color: "#333" }}>
                        <strong>Payment Method:</strong> {selectedPaymentAccount.accountType === "gcash" ? "GCash" : selectedPaymentAccount.accountType === "paymaya" ? "PayMaya" : selectedPaymentAccount.accountType}
                      </p>
                      <p style={{ margin: "0 0 10px 0", fontSize: isMobile ? "clamp(0.68rem, 0.8vw, 0.75rem)" : "clamp(0.8rem, 0.95vw, 0.9rem)", color: "#333" }}>
                        <strong>Account Number:</strong> {selectedPaymentAccount.accountNumber}
                      </p>
                      <p style={{ margin: "0 0 10px 0", fontSize: isMobile ? "clamp(0.68rem, 0.8vw, 0.75rem)" : "clamp(0.8rem, 0.95vw, 0.9rem)", color: "#333" }}>
                        <strong>Account Holder:</strong> {selectedPaymentAccount.accountHolder}
                      </p>
                      {bookingId && (
                        <p style={{ margin: "0", fontSize: isMobile ? "clamp(0.68rem, 0.8vw, 0.75rem)" : "clamp(0.8rem, 0.95vw, 0.9rem)", color: "#333" }}>
                          <strong>Reference/Booking ID:</strong> <span style={{ fontFamily: "monospace", fontWeight: 700, wordBreak: "break-word" }}>{bookingId}</span>
                        </p>
                      )}
                    </div>
                  )}

                  <p style={{
                    fontSize: isMobile ? "clamp(0.65rem, 0.8vw, 0.72rem)" : "clamp(0.75rem, 0.9vw, 0.85rem)",
                    color: "#ff6f00",
                    fontWeight: 600,
                    marginBottom: "0",
                    lineHeight: "1.5"
                  }}>
                    [NOTE] {bookingId ? `Please include your Booking ID ${bookingId} as reference so we can match your payment.` : "Your Booking ID will be generated after you confirm the booking. Please include it as reference when transferring."}
                  </p>
                    </>
                  )}
                </div>
              </div>
            )}

          {/* Proof of Payment Upload Section - manual payments only */}
          {form.payment && !bookingId && !usesPayMongoGcash && (
            <div style={{
              background: "white",
              border: "2px solid #4caf50",
              borderRadius: "8px",
              padding: "clamp(20px, 5vw, 30px)",
              marginBottom: "30px",
              marginLeft: "15px",
              marginRight: "15px"
            }}>
              <h3 style={{
                fontSize: isModal || isMobile ? "clamp(0.9rem, 1.1vw, 1rem)" : "clamp(1rem, 1.2vw, 1.1rem)",
                fontWeight: 800,
                color: "#1a1a1a",
                marginBottom: "20px",
                paddingBottom: "12px",
                borderBottom: "2px solid #4caf50"
              }}>
                ✓ Prepare Proof of Payment
              </h3>

              <p style={{
                fontSize: isMobile ? "clamp(0.75rem, 0.95vw, 0.85rem)" : "clamp(0.9rem, 1vw, 0.95rem)",
                color: "#555",
                marginBottom: "20px",
                lineHeight: "1.6"
              }}>
                After making the payment to the account above, you can upload a screenshot or receipt here. You'll need this proof to confirm your booking.
              </p>

              <div style={{
                marginBottom: "20px"
              }}>
                <label style={{
                  display: "block",
                  fontWeight: 600,
                  color: "#333",
                  marginBottom: "12px",
                  fontSize: isMobile ? "clamp(0.72rem, 0.88vw, 0.82rem)" : "clamp(0.85rem, 0.95vw, 0.95rem)"
                }}>
                  Payment Receipt/Screenshot
                </label>
                <input
                  type="file"
                  name="paymentProof"
                  accept="image/*"
                  onChange={handleChange}
                  style={{
                    width: "100%",
                    padding: "12px 15px",
                    border: "2px dashed #4caf50",
                    borderRadius: "8px",
                    fontSize: isMobile ? "0.8rem" : "0.95rem",
                    fontFamily: "inherit",
                    cursor: "pointer",
                    boxSizing: "border-box",
                    transition: "border-color 0.2s ease"
                  }}
                />
                <p style={{
                  fontSize: isMobile ? "clamp(0.65rem, 0.8vw, 0.72rem)" : "clamp(0.75rem, 0.85vw, 0.8rem)",
                  color: "#999",
                  marginTop: "8px",
                  marginBottom: "0"
                }}>
                  JPG, PNG accepted. Max size: 5MB
                </p>
              </div>

              {paymentProofPreview && (
                <div style={{
                  marginBottom: "20px",
                  textAlign: "center",
                  padding: "15px",
                  background: "#f9f9f9",
                  borderRadius: "8px",
                  border: "1px solid #e0e0e0"
                }}>
                  <p style={{ fontSize: isMobile ? "0.7rem" : "0.85rem", color: "#666", marginBottom: "12px", fontWeight: 600 }}>Receipt Preview</p>
                  <img src={paymentProofPreview} alt="Payment Proof" style={{ maxWidth: '100%', maxHeight: '250px', borderRadius: "6px" }} />
                </div>
              )}
            </div>
          )}

          {/* Confirm Booking Button - at dulo, after payment instructions */}
          {!bookingId && (
            <div style={{
              display: "flex",
              gap: "12px",
              justifyContent: "flex-end",
              marginBottom: "30px",
              padding: "0 15px",
              flexWrap: "wrap"
            }}>
              <button
                onClick={() => isModal ? onCloseModal() : navigate(-1)}
                style={{
                  padding: "clamp(10px, 2vw, 12px) clamp(16px, 3vw, 24px)",
                  background: "#f5f5f5",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  fontWeight: 700,
                  fontSize: "clamp(0.8rem, 0.95vw, 0.95rem)",
                  cursor: "pointer",
                  color: "#333",
                  transition: "all 0.3s ease",
                  letterSpacing: "0.3px",
                  flex: "1 1 auto",
                  minWidth: "80px"
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = "#e8e8e8";
                  e.target.style.borderColor = "#999";
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = "#f5f5f5";
                  e.target.style.borderColor = "#ddd";
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBooking}
                disabled={loading || !form.payment}
                style={{
                  padding: "clamp(10px, 2vw, 12px) clamp(16px, 3vw, 24px)",
                  background: loading || !form.payment ? "#ccc" : "#4caf50",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 700,
                  fontSize: "clamp(0.8rem, 0.95vw, 0.95rem)",
                  cursor: loading || !form.payment ? "not-allowed" : "pointer",
                  transition: "all 0.3s ease",
                  letterSpacing: "0.3px",
                  flex: "1 1 auto",
                  minWidth: "130px"
                }}
                onMouseEnter={(e) => {
                  if (!loading && form.payment) {
                    e.target.style.background = "#45a049";
                    e.target.style.boxShadow = "0 4px 12px rgba(76,175,80,0.3)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading && form.payment) {
                    e.target.style.background = "#4caf50";
                    e.target.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                  }
                }}
              >
                {loading
                  ? "Processing..."
                  : usesPayMongoGcash
                  ? "Confirm & Show QR Code"
                  : "Confirm Booking"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BookingDetails;
