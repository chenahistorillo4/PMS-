import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import jsQR from "jsqr";
import { auth, db } from "../../firebase";
import { doc, updateDoc, serverTimestamp, getDoc, collection, query, where, getDocs, addDoc, onSnapshot } from "firebase/firestore";
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import "./QRScanner.css";

async function getBookingPaymentStatus(bookingId, bookingData) {
  const paymentsSnapshot = await getDocs(
    query(collection(db, "payments"), where("bookingId", "==", bookingId))
  );
  const paymentStatus = paymentsSnapshot.docs[0]?.data().status?.toLowerCase?.();
  return paymentStatus || bookingData.paymentStatus?.toLowerCase?.() || "pending";
}

function QRScanner({ user }) {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const streamRef = useRef(null);
  const detailsSectionRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [bookingDetails, setBookingDetails] = useState(null);
  const [isPendingAcceptance, setIsPendingAcceptance] = useState(false);
  const [currentBookingDocId, setCurrentBookingDocId] = useState(null);
  const [scanMessage, setScanMessage] = useState("Scan a QR code to view booking details");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationType, setNotificationType] = useState(""); // "success" or "error"
  const [recentScans, setRecentScans] = useState([]);
  const [manualBookingId, setManualBookingId] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [, setSuccessfulScan] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    role: "",
    status: "",
    createdAt: null,
    lastLogin: null,
    photoURL: ""
  });
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [previewImage, setPreviewImage] = useState(null);
  const fileInputRef = useRef(null);

  const createScanRecord = (details, action, bookingDocId) => {
    const now = new Date();

    return {
      bookingDocId: bookingDocId || "",
      bookingId: details?.booking_id || "N/A",
      passengerName: details?.passengerName || "N/A",
      departure: details?.departure || "N/A",
      destination: details?.destination || "N/A",
      vessel: details?.vessel || "N/A",
      travelDate: details?.date || "N/A",
      referenceCode: details?.referenceCode || details?.reference_number || "N/A",
      actionStatus: action,
      bookingStatus: details?.status || "Pending",
      timestamp: now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      }),
      date: now.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      }),
      createdAt: serverTimestamp()
    };
  };

  const saveScanHistory = async (details, action, bookingDocId) => {
    const currentUser = auth.currentUser;
    if (!currentUser || !details) return null;

    return addDoc(collection(db, "scanner_history"), {
      scannerId: currentUser.uid,
      scannerName: profile.name || currentUser.email || "QR Scanner",
      scannerEmail: profile.email || currentUser.email || "",
      ...createScanRecord(details, action, bookingDocId)
    });
  };

  // Effect to handle camera stream when cameraActive changes
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      console.log("useEffect: Assigning stream to video element");
      videoRef.current.srcObject = streamRef.current;
      
      // Ensure video starts playing
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.play().catch(err => console.error("Play error:", err));
        }
      }, 100);
      
      // Start QR scanning
      setTimeout(() => {
        console.log("useEffect: Starting QR scan");
        scanQRCode();
      }, 500);
    }
  }, [cameraActive]);

  // Initialize profile and subscribe to scanner-specific history
  useEffect(() => {
    let unsubscribeHistory = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setRecentScans([]);
        return;
      }

      try {
        const userDocRef = doc(db, "qr_scanners", currentUser.uid);

        await updateDoc(userDocRef, {
          lastLogin: serverTimestamp()
        });

        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data());
        }

        const historyQuery = query(
          collection(db, "scanner_history"),
          where("scannerId", "==", currentUser.uid)
        );

        unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
          const historyList = snapshot.docs
            .map((scanDoc) => ({
              id: scanDoc.id,
              ...scanDoc.data()
            }))
            .sort((a, b) => {
              const aTime = a.createdAt?.toDate?.()?.getTime?.() || 0;
              const bTime = b.createdAt?.toDate?.()?.getTime?.() || 0;
              return bTime - aTime;
            });

          setRecentScans(historyList);
        });
      } catch (error) {
        console.error("Error initializing profile/history:", error);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeHistory) {
        unsubscribeHistory();
      }
    };
  }, []);

  // Auto-scroll to booking details on mobile when booking is detected
  useEffect(() => {
    if (bookingDetails && window.innerWidth <= 768) {
      setTimeout(() => {
        if (detailsSectionRef.current) {
          detailsSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 300);
    }
  }, [bookingDetails]);

  const handleAcceptScan = async () => {
    if (bookingDetails && currentBookingDocId) {
      try {
        const bookingRef = doc(db, "bookings", currentBookingDocId);
        const bookingSnapshot = await getDoc(bookingRef);
        if (!bookingSnapshot.exists()) {
          setNotificationMessage("✗ Booking could not be found. Please scan again.");
          setNotificationType("error");
          return;
        }
        const latestBooking = bookingSnapshot.data();
        const paymentStatus = await getBookingPaymentStatus(currentBookingDocId, latestBooking);
        if (
          latestBooking.status !== "confirmed" ||
          !["completed", "confirmed"].includes(paymentStatus)
        ) {
          setBookingDetails((previous) => ({
            ...previous,
            status: latestBooking.status || "Pending",
            paymentStatus,
            isPaidAndConfirmed: false
          }));
          setNotificationMessage("✗ Payment is still pending. Confirm payment before boarding.");
          setNotificationType("error");
          return;
        }

        const acceptedRecord = createScanRecord(bookingDetails, "accepted", currentBookingDocId);
        // Mark booking as scanned/used in Firebase
        await updateDoc(bookingRef, {
          status: "scanned",
          scannedAt: serverTimestamp(),
          scannedBy: profile.name || auth.currentUser?.email || "QR Scanner"
        });

        await saveScanHistory(bookingDetails, "accepted", currentBookingDocId);
        setRecentScans(prev => [{ ...acceptedRecord, id: `${currentBookingDocId}-accepted-${Date.now()}` }, ...prev]);
        setNotificationMessage("✓ Booking accepted and added to history!");
        setNotificationType("success");
        
        // Clear the booking details after acceptance
        setTimeout(() => {
          setBookingDetails(null);
          setIsPendingAcceptance(false);
          setCurrentBookingDocId(null);
          setScanMessage("Scan a QR code to view booking details");
          setNotificationMessage("");
          setNotificationType("");
        }, 1500);
      } catch (error) {
        console.error("Error accepting scan:", error);
        setNotificationMessage("✗ Error accepting booking. Please try again.");
        setNotificationType("error");
      }
    }
  };

  const handleRejectScan = async () => {
    if (bookingDetails) {
      try {
        const rejectedRecord = createScanRecord(bookingDetails, "rejected", currentBookingDocId);
        await saveScanHistory(bookingDetails, "rejected", currentBookingDocId);
        setRecentScans(prev => [{ ...rejectedRecord, id: `${currentBookingDocId || rejectedRecord.bookingId}-rejected-${Date.now()}` }, ...prev]);
      } catch (error) {
        console.error("Error saving rejected scan history:", error);
      }
    }

    setBookingDetails(null);
    setIsPendingAcceptance(false);
    setCurrentBookingDocId(null);
    setScanMessage("Scan rejected. Scan a new QR code to view booking details");
    setNotificationMessage("✗ Booking rejected");
    setNotificationType("error");
    
    setTimeout(() => {
      setScanMessage("Scan a QR code to view booking details");
      setNotificationMessage("");
      setNotificationType("");
    }, 2000);
  };

  const handleLogout = () => {
    setShowDrawer(false);
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    stopCamera();
    
    // Clear all storage
    localStorage.removeItem("user");
    localStorage.removeItem("userRole");
    localStorage.removeItem("authToken");
    sessionStorage.clear();
    
    // Sign out from Firebase
    try {
      await auth.signOut();
    } catch (err) {
      console.error("Logout error:", err);
    }
    
    // Navigate to login page (shows public navbar)
    navigate("/login");
  };

  const cancelLogout = () => {
    setShowLogoutConfirm(false);
  };

  const handleEditProfile = () => {
    setIsEditingProfile(true);
  };

  const handleCancelEdit = async () => {
    setIsEditingProfile(false);
    setPreviewImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    // Refetch profile data
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const userDocRef = doc(db, "qr_scanners", currentUser.uid);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data());
        }
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const handleProfileUpdate = async () => {
    setIsSaving(true);
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const userDocRef = doc(db, "qr_scanners", currentUser.uid);
        await updateDoc(userDocRef, {
          name: profile.name,
          email: profile.email
        });
        alert("Profile updated successfully!");
        setIsEditingProfile(false);
      }
    } catch (error) {
      alert("Error updating profile: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleProfilePictureSelect = (e) => {
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
        setPreviewImage(reader.result); // Base64 data URL
        setProfile(prev => ({ ...prev, photoURL: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfilePicture = async () => {
    if (!previewImage) {
      alert("Please select an image first");
      return;
    }

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        alert("User not authenticated");
        return;
      }

      const userDocRef = doc(db, "qr_scanners", currentUser.uid);
      await updateDoc(userDocRef, { photoURL: previewImage });
      setProfile((prev) => ({ ...prev, photoURL: previewImage }));
      setPreviewImage(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      alert("Profile picture saved successfully!");
    } catch (error) {
      alert("Error saving profile picture: " + error.message);
    }
  };

  const handleCancelPicture = () => {
    setPreviewImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveProfilePicture = async () => {
    if (!profile.photoURL) {
      alert("No profile picture to remove");
      return;
    }

    if (!window.confirm("Are you sure you want to remove your profile picture?")) {
      return;
    }

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const userDocRef = doc(db, "qr_scanners", currentUser.uid);
      await updateDoc(userDocRef, { photoURL: "" });
      setProfile((prev) => ({ ...prev, photoURL: "" }));
      alert("Profile picture removed!");
    } catch (error) {
      alert("Error removing profile picture: " + error.message);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordError("");

    if (!passwordForm.currentPassword) {
      setPasswordError("Please enter your current password");
      return;
    }
    if (!passwordForm.newPassword) {
      setPasswordError("Please enter a new password");
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }
    if (passwordForm.currentPassword === passwordForm.newPassword) {
      setPasswordError("New password must be different from current password");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) {
        throw new Error("User not authenticated");
      }

      const credential = EmailAuthProvider.credential(
        user.email,
        passwordForm.currentPassword
      );
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, passwordForm.newPassword);

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      });
      setIsChangingPassword(false);
      alert("Password changed successfully!");
    } catch (error) {
      if (error.code === "auth/wrong-password") {
        setPasswordError("Current password is incorrect");
      } else if (error.code === "auth/weak-password") {
        setPasswordError(
          "New password is too weak. Please use a stronger password"
        );
      } else {
        setPasswordError("Error changing password: " + error.message);
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleCancelPasswordChange = () => {
    setIsChangingPassword(false);
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: ""
    });
    setPasswordError("");
  };

  const handleValidateBooking = async () => {
    if (!manualBookingId.trim()) {
      setNotificationMessage("✗ Please enter a booking ID");
      setNotificationType("error");
      setTimeout(() => {
        setNotificationMessage("");
        setNotificationType("");
      }, 2000);
      return;
    }

    try {
      const scannedCode = manualBookingId.trim();
      const bookingsRef = collection(db, "bookings");
      let bookingDoc = null;

      // Try searching by various fields
      const fieldsToSearch = [
        "booking_id",
        "reference_number",
        "tripId",
        "referenceCode"
      ];

      for (const field of fieldsToSearch) {
        const q = query(bookingsRef, where(field, "==", scannedCode));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          bookingDoc = querySnapshot.docs[0];
          console.log(`Found booking by ${field}`);
          break;
        }
      }

      // If still not found, search all documents for field matches or document ID match
      if (!bookingDoc) {
        const allBookings = await getDocs(bookingsRef);
        bookingDoc = allBookings.docs.find(doc => {
          const data = doc.data();
          const docId = doc.id;
          
          // Check if document ID matches
          if (docId === scannedCode || docId.toUpperCase() === scannedCode.toUpperCase()) {
            return true;
          }

          // Check various fields (case-insensitive)
          return (
            (data.booking_id && data.booking_id.toUpperCase() === scannedCode.toUpperCase()) ||
            (data.reference_number && data.reference_number.toUpperCase() === scannedCode.toUpperCase()) ||
            (data.tripId && data.tripId.toUpperCase() === scannedCode.toUpperCase()) ||
            (data.referenceCode && data.referenceCode.toUpperCase() === scannedCode.toUpperCase())
          );
        });
      }

      if (bookingDoc) {
        const bookingData = bookingDoc.data();

        // Check if ticket is already scanned/used
        if (bookingData.status === "scanned" || bookingData.scannedAt) {
          setBookingDetails(null);
          setNotificationMessage(`✗ This ticket has already been used on ${bookingData.scannedAt?.toDate?.()?.toLocaleString() || "a previous date"}`);
          setNotificationType("error");
          setIsPendingAcceptance(false);
          setCurrentBookingDocId(null);
          setSuccessfulScan(null);
          return;
        }

        const paymentStatus = await getBookingPaymentStatus(bookingDoc.id, bookingData);
        const isPaidAndConfirmed =
          bookingData.status === "confirmed" &&
          ["completed", "confirmed"].includes(paymentStatus);

        // Extract relevant booking information
        const details = {
          passengerName: bookingData.customerName || bookingData.passenger_name || bookingData.name || "N/A",
          booking_id: bookingData.booking_id || scannedCode,
          referenceCode: bookingData.referenceCode || bookingData.reference_number || "N/A",
          departure: bookingData.departure_port || bookingData.departure || bookingData.routeDirection?.split(" to ")[0] || "N/A",
          destination: bookingData.destination_port || bookingData.destination || bookingData.routeDirection?.split(" to ")[1] || "N/A",
          date: bookingData.departure_date || bookingData.departureDate || bookingData.date || "N/A",
          time: bookingData.departure_time || bookingData.departureTime || bookingData.arrival || "N/A",
          vessel: bookingData.vessel_name || bookingData.vessel || bookingData.boat || bookingData.tripName || "N/A",
          status: bookingData.status || "Pending",
          userType: bookingData.userType || "Regular",
          cargoType: bookingData.cargoType || "N/A",
          cargoWeight: bookingData.cargoWeight || "N/A",
          cargoPrice: bookingData.cargoPrice || 0,
          basePrice: bookingData.basePrice || bookingData.price || 0,
          discountRate: bookingData.discountRate || 0,
          discountAmount: bookingData.discountAmount || 0,
          finalPrice: bookingData.finalPrice || bookingData.total_amount || "0",
          ticketCount: bookingData.ticket_count || bookingData.passengers?.length || 1,
          totalAmount: bookingData.total_amount || bookingData.finalPrice || "0",
          reference_number: bookingData.reference_number || bookingData.referenceCode || "N/A",
          tripId: bookingData.tripId || "N/A",
          email: bookingData.userEmail || "N/A",
          bookedBy: bookingData.bookedByName || "N/A",
          paymentMethod: bookingData.payment || "N/A",
          paymentStatus,
          isPaidAndConfirmed
        };

        setBookingDetails(details);
        setCurrentBookingDocId(bookingDoc.id);
        setScanMessage(`Booking found`);
        setNotificationMessage(
          isPaidAndConfirmed
            ? "✓ Payment confirmed. Booking is valid for boarding."
            : "Payment is pending. Confirm payment before boarding."
        );
        setNotificationType(isPaidAndConfirmed ? "success" : "error");
        setIsPendingAcceptance(true);
        setSuccessfulScan(details);
      } else {
        setBookingDetails(null);
        setNotificationMessage("✗ No booking found for this ID");
        setNotificationType("error");
        setSuccessfulScan(null);
      }
    } catch (error) {
      console.error("Error fetching booking:", error);
      setBookingDetails(null);
      setNotificationMessage("✗ Error: " + error.message);
      setNotificationType("error");
      setSuccessfulScan(null);
    }

    setManualBookingId("");
    setTimeout(() => {
      setNotificationMessage("");
      setNotificationType("");
    }, 3000);
  };

  const startCamera = async () => {
    try {
      console.log("startCamera: Starting camera...");
      
      // Get camera permission and stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      
      console.log("startCamera: Camera permission granted, stream obtained");
      
      // Store stream in ref for use after re-render
      streamRef.current = stream;
      
      // Set state to active - this triggers the useEffect
      setCameraActive(true);
    } catch (err) {
      console.error("startCamera: Camera error:", err);
      alert("Camera Error: " + err.message);
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    console.log("Stopping camera...");
    
    // Clear the scanning interval
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    // Stop all video tracks from stream
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => {
        console.log("Stopping track:", track.kind);
        track.stop();
      });
      streamRef.current = null;
    }

    // Clear video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    console.log("Camera stopped");
    setCameraActive(false);
    setBookingDetails(null);
    setIsPendingAcceptance(false);
    setScanMessage("Scan a QR code to view booking details");
    setNotificationMessage("");
    setNotificationType("");
  };

  const scanQRCode = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    const context = canvas.getContext("2d");
    scanIntervalRef.current = setInterval(async () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
          // Parse QR code data - expecting booking ID or reference number
          console.log("QR Code detected:", code.data);
          const scannedCode = code.data.trim();

          // Fetch booking details from Firebase
          try {
            const bookingsRef = collection(db, "bookings");
            let querySnapshot = null;
            let bookingDoc = null;

            // Try searching by various fields
            const fieldsToSearch = [
              "booking_id",
              "reference_number",
              "tripId",
              "referenceCode"
            ];

            for (const field of fieldsToSearch) {
              const q = query(bookingsRef, where(field, "==", scannedCode));
              querySnapshot = await getDocs(q);
              if (!querySnapshot.empty) {
                bookingDoc = querySnapshot.docs[0];
                console.log(`Found booking by ${field}`);
                break;
              }
            }

            // If still not found, search all documents for field matches or document ID match
            if (!bookingDoc) {
              const allBookings = await getDocs(bookingsRef);
              bookingDoc = allBookings.docs.find(doc => {
                const data = doc.data();
                const docId = doc.id;
                
                // Check if document ID matches
                if (docId === scannedCode || docId.toUpperCase() === scannedCode.toUpperCase()) {
                  return true;
                }

                // Check various fields (case-insensitive)
                return (
                  (data.booking_id && data.booking_id.toUpperCase() === scannedCode.toUpperCase()) ||
                  (data.reference_number && data.reference_number.toUpperCase() === scannedCode.toUpperCase()) ||
                  (data.tripId && data.tripId.toUpperCase() === scannedCode.toUpperCase()) ||
                  (data.referenceCode && data.referenceCode.toUpperCase() === scannedCode.toUpperCase())
                );
              });
            }

            if (bookingDoc) {
              const bookingData = bookingDoc.data();
              console.log("Booking found:", bookingData);
              const paymentStatus = await getBookingPaymentStatus(bookingDoc.id, bookingData);
              const isPaidAndConfirmed =
                bookingData.status === "confirmed" &&
                ["completed", "confirmed"].includes(paymentStatus);

              // Check if ticket is already scanned/used
              if (bookingData.status === "scanned" || bookingData.scannedAt) {
                setBookingDetails(null);
                setNotificationMessage(`✗ This ticket has already been used on ${bookingData.scannedAt?.toDate?.()?.toLocaleString() || "a previous date"}`);
                setNotificationType("error");
                setIsPendingAcceptance(false);
                setCurrentBookingDocId(null);
                setSuccessfulScan(null);
                return;
              }

              // Extract relevant booking information
              const details = {
                passengerName: bookingData.customerName || bookingData.passenger_name || bookingData.name || "N/A",
                booking_id: bookingData.booking_id || scannedCode,
                referenceCode: bookingData.referenceCode || bookingData.reference_number || "N/A",
                departure: bookingData.departure_port || bookingData.departure || bookingData.routeDirection?.split(" to ")[0] || "N/A",
                destination: bookingData.destination_port || bookingData.destination || bookingData.routeDirection?.split(" to ")[1] || "N/A",
                date: bookingData.departure_date || bookingData.departureDate || bookingData.date || "N/A",
                time: bookingData.departure_time || bookingData.departureTime || bookingData.arrival || "N/A",
                vessel: bookingData.vessel_name || bookingData.vessel || bookingData.boat || bookingData.tripName || "N/A",
                status: bookingData.status || "Pending",
                userType: bookingData.userType || "Regular",
                cargoType: bookingData.cargoType || "N/A",
                cargoWeight: bookingData.cargoWeight || "N/A",
                cargoPrice: bookingData.cargoPrice || 0,
                basePrice: bookingData.basePrice || bookingData.price || 0,
                discountRate: bookingData.discountRate || 0,
                discountAmount: bookingData.discountAmount || 0,
                finalPrice: bookingData.finalPrice || bookingData.total_amount || "0",
                ticketCount: bookingData.ticket_count || bookingData.passengers?.length || 1,
                totalAmount: bookingData.total_amount || bookingData.finalPrice || "0",
                reference_number: bookingData.reference_number || bookingData.referenceCode || "N/A",
                tripId: bookingData.tripId || "N/A",
                email: bookingData.userEmail || "N/A",
                bookedBy: bookingData.bookedByName || "N/A",
                paymentMethod: bookingData.payment || "N/A",
                paymentStatus,
                isPaidAndConfirmed
              };

              setBookingDetails(details);
              setCurrentBookingDocId(bookingDoc.id);
              setScanMessage(`Booking found`);
              setNotificationMessage(
                isPaidAndConfirmed
                  ? "✓ Payment confirmed. Booking is valid for boarding."
                  : "Payment is pending. Confirm payment before boarding."
              );
              setNotificationType(isPaidAndConfirmed ? "success" : "error");
              setIsPendingAcceptance(true);
              setSuccessfulScan(details);
            } else {
              // Booking not found
              console.log("No booking found for code:", scannedCode);
              setBookingDetails(null);
              setScanMessage("Walang booking na nahanap");
              setNotificationMessage("✗ No booking found for this QR code");
              setNotificationType("error");
              setSuccessfulScan(null);
            }
          } catch (error) {
            console.error("Error fetching booking:", error);
            setBookingDetails(null);
            setScanMessage("Error fetching booking details");
            setNotificationMessage("✗ Error: " + error.message);
            setNotificationType("error");
            setSuccessfulScan(null);
          }

          // Clear notification after 3 seconds
          setTimeout(() => {
            setNotificationMessage("");
            setNotificationType("");
          }, 3000);

          // Clear interval after detecting a QR code
          if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
          }
        }
      }
    }, 100);
  };

  return (
    <div className="qr-scanner-container">
      {/* Drawer Overlay */}
      {showDrawer && (
        <div
          className="drawer-overlay"
          onClick={() => setShowDrawer(false)}
        />
      )}

      {/* Left-side Drawer */}
      <div className={`scanner-drawer ${showDrawer ? "open" : ""}`}>
        <nav className="drawer-nav">
          <button
            className={`drawer-nav-item ${!showHistory && !showProfile ? "active" : ""}`}
            onClick={() => {
              setShowHistory(false);
              setShowProfile(false);
              setShowDrawer(false);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            Home
          </button>

          <button
            className={`drawer-nav-item ${showHistory ? "active" : ""}`}
            onClick={() => {
              setShowHistory(true);
              setShowProfile(false);
              setShowDrawer(false);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            </svg>
            History
          </button>

          <button
            className={`drawer-nav-item ${showProfile ? "active" : ""}`}
            onClick={() => {
              setShowHistory(false);
              setShowProfile(true);
              setShowDrawer(false);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Profile
          </button>
        </nav>
      </div>

      {/* Header */}
      <header className="scanner-header">
        <div className="scanner-header-content">
          <button
            className="hamburger-btn"
            onClick={() => setShowDrawer(!showDrawer)}
            title="Menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          <div className="scanner-logo-section">
            <div className="scanner-logo-arch">
              <img 
                src="/logoo.png" 
                alt="PMS Port Logo"
                className="scanner-logo"
              />
            </div>
            <div className="scanner-branding">
              <h1 className="scanner-title">QR Boarding Scanner</h1>
              <p className="scanner-subtitle">Staff Control System</p>
            </div>
          </div>
          <div className="header-buttons">
            <button 
              className={`btn-nav ${!showHistory && !showProfile ? "active" : ""}`}
              onClick={() => {
                setShowHistory(false);
                setShowProfile(false);
              }}
            >
              Home
            </button>
            <button 
              className={`btn-nav ${showHistory ? "active" : ""}`}
              onClick={() => {
                setShowHistory(true);
                setShowProfile(false);
              }}
            >
              History
            </button>
            <button 
              className={`btn-nav ${showProfile ? "active" : ""}`}
              onClick={() => {
                setShowProfile(true);
                setShowHistory(false);
              }}
            >
              Profile
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="scanner-content">
        {/* Notification */}
        {notificationMessage && (
          <div className={`notification-banner notification-${notificationType}`}>
            {notificationMessage}
          </div>
        )}

        {!showHistory && !showProfile && (
          <>
            {/* QR Scanner Section */}
        <div className="scanner-section">
          <div className="scanner-header-section">
            <h2>QR Scanner</h2>
            <p>Point camera at boarding pass</p>
            <div className="camera-toggle">
              <span className="camera-label">CAMERA</span>
              <span className={`toggle-switch ${cameraActive ? "on" : "off"}`}>
                {cameraActive ? "ON" : "OFF"}
              </span>
            </div>
          </div>

          {/* Video/Camera Preview */}
          <div className="camera-preview">
            {cameraActive ? (
              <>
                <video
                  key={cameraActive ? "on" : "off"}
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  defaultValue="auto"
                  style={{ 
                    width: "100%", 
                    height: "100%", 
                    objectFit: "cover",
                    display: "block",
                    backgroundColor: "#000"
                  }}
                />
                <canvas ref={canvasRef} style={{ display: "none" }} />
                
                {/* Scanning Overlay */}
                <div className="scanning-overlay">
                  <div className="scanning-frame">
                    <div className="corner corner-top-left"></div>
                    <div className="corner corner-top-right"></div>
                    <div className="corner corner-bottom-left"></div>
                    <div className="corner corner-bottom-right"></div>
                  </div>
                  <p className="scanning-text">Position QR code here</p>
                </div>
                
              </>
            ) : (
              <div className="camera-inactive">
                <p>Camera Not Active</p>
                <p className="camera-hint">Click "Start Camera Scanner" to begin scanning</p>
              </div>
            )}
          </div>

          {/* Start/Stop Camera Button */}
          {!cameraActive ? (
            <button className="btn-start-camera" onClick={startCamera}>
              Start Camera Scanner
            </button>
          ) : (
            <button className="btn-stop-camera" onClick={stopCamera}>
              Stop Camera Scanner
            </button>
          )}

          {/* Scanning Tips Section */}
          <div className="scanning-tips-section">
            <h3>SCANNING TIPS</h3>
            <ul className="tips-list">
              <li>Hold QR code steady in front of camera</li>
              <li>Ensure good lighting conditions</li>
              <li>Keep QR code centered in frame</li>
              <li>Distance: 15-30cm from camera</li>
            </ul>
          </div>
        </div>

        {/* Booking Details Section */}
        <div className="details-section" ref={detailsSectionRef}>
          <div className="details-header">
            <h2>Booking Details</h2>
            <p>Passenger and trip information</p>
          </div>

          <div className="details-content">
            {bookingDetails ? (
              <div className="booking-card">
                <div className="detail-item">
                  <span className="detail-label">Passenger Name:</span>
                  <span className="detail-value">{bookingDetails.passengerName}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Reference Code:</span>
                  <span className="detail-value" style={{fontFamily: "monospace", fontWeight: "bold"}}>{bookingDetails.referenceCode}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Route:</span>
                  <span className="detail-value">{bookingDetails.departure} → {bookingDetails.destination}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Boat/Vessel:</span>
                  <span className="detail-value">{bookingDetails.vessel}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Departure Date:</span>
                  <span className="detail-value">{bookingDetails.date}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Time:</span>
                  <span className="detail-value">{bookingDetails.time}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Passenger Type:</span>
                  <span className="detail-value">{bookingDetails.userType}</span>
                </div>
                {bookingDetails.cargoType && bookingDetails.cargoType !== "N/A" && (
                  <>
                    <div className="detail-item">
                      <span className="detail-label">Cargo Type:</span>
                      <span className="detail-value">{bookingDetails.cargoType}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Cargo Weight:</span>
                      <span className="detail-value">{bookingDetails.cargoWeight} kg</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Cargo Price:</span>
                      <span className="detail-value">₱{parseFloat(bookingDetails.cargoPrice).toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div className="detail-item">
                  <span className="detail-label">Base Price:</span>
                  <span className="detail-value">₱{parseFloat(bookingDetails.basePrice).toFixed(2)}</span>
                </div>
                {bookingDetails.discountRate > 0 && (
                  <>
                    <div className="detail-item">
                      <span className="detail-label">Discount Rate:</span>
                      <span className="detail-value">{(bookingDetails.discountRate * 100).toFixed(0)}%</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Discount Amount:</span>
                      <span className="detail-value">₱{parseFloat(bookingDetails.discountAmount).toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div className="detail-item" style={{backgroundColor: "#f0f8ff", padding: "10px", borderRadius: "8px", fontWeight: "bold"}}>
                  <span className="detail-label">Final Price:</span>
                  <span className="detail-value" style={{color: "#1e7e34", fontSize: "1.1em"}}>₱{parseFloat(bookingDetails.finalPrice).toFixed(2)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Payment Method:</span>
                  <span className="detail-value">{bookingDetails.paymentMethod}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Payment Status:</span>
                  <span
                    className={`detail-value ${
                      bookingDetails.isPaidAndConfirmed ? "status-confirmed" : "status-pending"
                    }`}
                  >
                    {bookingDetails.isPaidAndConfirmed ? "Paid / Valid" : "Pending / Not Valid"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Status:</span>
                  <span className={`detail-value status-${bookingDetails.status.toLowerCase()}`}>
                    {bookingDetails.status}
                  </span>
                </div>
                {bookingDetails.email && bookingDetails.email !== "N/A" && (
                  <div className="detail-item">
                    <span className="detail-label">Email:</span>
                    <span className="detail-value">{bookingDetails.email}</span>
                  </div>
                )}
                {bookingDetails.bookedBy && bookingDetails.bookedBy !== "N/A" && (
                  <div className="detail-item">
                    <span className="detail-label">Booked By:</span>
                    <span className="detail-value">{bookingDetails.bookedBy}</span>
                  </div>
                )}

                {isPendingAcceptance && (
                  <div style={{
                    display: "flex",
                    gap: "12px",
                    marginTop: "16px",
                    borderTop: "1px solid #e0e8f0",
                    paddingTop: "16px"
                  }}>
                    {bookingDetails.isPaidAndConfirmed ? (
                      <button
                        onClick={handleAcceptScan}
                        style={{
                          flex: 1,
                          padding: "12px",
                          background: "#1e7e34",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          fontWeight: "bold",
                          cursor: "pointer",
                          fontSize: "0.95rem",
                          transition: "background 0.2s"
                        }}
                        onMouseOver={(e) => e.target.style.background = "#155a2a"}
                        onMouseOut={(e) => e.target.style.background = "#1e7e34"}
                      >
                        Accept for Boarding
                      </button>
                    ) : (
                      <div
                        role="status"
                        style={{
                          flex: 1,
                          padding: "12px",
                          background: "#fff3e0",
                          color: "#e65100",
                          borderRadius: "8px",
                          fontWeight: "bold",
                          textAlign: "center"
                        }}
                      >
                        Waiting for payment confirmation
                      </div>
                    )}
                    <button
                      onClick={handleRejectScan}
                      style={{
                        flex: 1,
                        padding: "12px",
                        background: "#d32f2f",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        fontWeight: "bold",
                        cursor: "pointer",
                        fontSize: "0.95rem",
                        transition: "background 0.2s"
                      }}
                      onMouseOver={(e) => e.target.style.background = "#b71c1c"}
                      onMouseOut={(e) => e.target.style.background = "#d32f2f"}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="no-booking-message">
                <p>{scanMessage}</p>
                <p className="scan-hint">Point the camera at the passenger's boarding pass</p>
              </div>
            )}
          </div>
        </div>

        {/* Manual Booking ID Entry Section */}
        <div className="manual-entry-section">
          <h3>MANUAL BOOKING ID ENTRY</h3>
          <div className="booking-input-group">
            <input
              type="text"
              placeholder="Enter booking ID (e.g., MW5001)"
              value={manualBookingId}
              onChange={(e) => setManualBookingId(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleValidateBooking()}
              className="booking-id-input"
            />
            <button className="btn-validate" onClick={handleValidateBooking}>
              Validate
            </button>
          </div>
        </div>
          </>
        )}

        {showHistory && (
          // History View
          <div className="history-view">
            <div className="history-header">
              <h2>Boarding Records</h2>
              <p>Your account's scan history organized by vessel</p>
            </div>

            {recentScans.length > 0 ? (
              <div className="vessels-container">
                {Object.entries(
                  recentScans.reduce((acc, scan) => {
                    if (!acc[scan.vessel]) {
                      acc[scan.vessel] = {};
                    }
                    if (!acc[scan.vessel][scan.date]) {
                      acc[scan.vessel][scan.date] = [];
                    }
                    acc[scan.vessel][scan.date].push(scan);
                    return acc;
                  }, {})
                ).map(([vessel, dateGroups]) => (
                  <div key={vessel} className="vessel-section">
                    <div className="vessel-header">
                      <h3>{vessel}</h3>
                      <span className="passenger-count">
                        {Object.values(dateGroups).reduce((sum, arr) => sum + arr.length, 0)} passenger(s)
                      </span>
                    </div>
                    
                    <div className="vessel-bookings">
                      {Object.entries(dateGroups).map(([date, scans]) => (
                        <div key={date} className="date-group">
                          <div className="date-header">
                            <span className="date-label">{date}</span>
                            <span className="date-count">{scans.length}</span>
                          </div>
                          
                          <div className="bookings-by-date">
                            {scans.map((scan, index) => (
                              <div key={index} className="booking-record">
                                <div className="record-number">{index + 1}</div>
                                <div className="record-content">
                                  <h4>{scan.passengerName}</h4>
                                  <div className="record-meta">
                                    <span className="meta-badge">{scan.bookingId}</span>
                                    <span className="meta-badge">{scan.departure} → {scan.destination}</span>
                                    <span className={`status-badge status-${(scan.actionStatus || scan.status || "pending").toLowerCase()}`}>
                                      {scan.actionStatus || scan.status}
                                    </span>
                                  </div>
                                  <p className="record-time">{scan.timestamp}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="history-empty">
                <p>No boarding scans yet</p>
                <p className="empty-hint">Scans will appear here organized by vessel and date</p>
              </div>
            )}
          </div>
        )}

        {showProfile && (
          // Profile View
          <div className="profile-view">
            {!isEditingProfile && !isChangingPassword ? (
              // View Mode
              <div className="profile-card">
                {/* Profile Picture Section */}
                <div className="profile-picture-section">
                  {profile?.photoURL ? (
                    <img 
                      src={profile.photoURL} 
                      alt="Profile" 
                      className="profile-picture"
                    />
                  ) : (
                    <div className="profile-picture-placeholder">
                      <span>No Photo</span>
                    </div>
                  )}
                </div>

                {/* Info Header with Edit Button */}
                <div className="profile-info-header">
                  <h2>Personal Information</h2>
                  <button 
                    className="profile-edit-btn"
                    onClick={handleEditProfile}
                  >
                    Edit Profile
                  </button>
                </div>

                <div className="profile-content">
                  <div className="profile-fields">
                    <div className="profile-item">
                      <label>Full Name</label>
                      <p>{profile?.name || "Not set"}</p>
                    </div>
                    <div className="profile-item">
                      <label>Email</label>
                      <p>{profile?.email || "Not set"}</p>
                    </div>
                    <div className="profile-item">
                      <label>Role</label>
                      <p>{profile?.role || "Not set"}</p>
                    </div>
                  </div>

                  <div className="profile-section">
                    <h3>Account Status</h3>
                    <div className="profile-item">
                      <label>Status</label>
                      <p className={`status-badge ${profile?.status === "active" ? "active" : "inactive"}`}>
                        {profile?.status === "active" ? "✓ Active" : "✗ Inactive"}
                      </p>
                    </div>
                  </div>

                  <div className="profile-section">
                    <h3>Activity Log</h3>
                    <div className="profile-item">
                      <label>Created Date</label>
                      <p>{profile?.createdAt ? new Date(profile.createdAt.seconds * 1000).toLocaleDateString() : "Not available"}</p>
                    </div>
                    <div className="profile-item">
                      <label>Last Login</label>
                      <p>{profile?.lastLogin ? new Date(profile.lastLogin.seconds * 1000).toLocaleString() : "Not yet"}</p>
                    </div>
                  </div>

                  <div className="profile-action-buttons">
                    <button 
                      className="profile-password-btn"
                      onClick={() => setIsChangingPassword(true)}
                    >
                      Change Password
                    </button>
                    <button 
                      className="profile-logout-btn" 
                      onClick={handleLogout}
                    >
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            ) : isEditingProfile ? (
              // Edit Mode
              <div className="profile-card edit-mode">
                <div className="profile-header">
                  <h2>Edit Profile</h2>
                </div>

                {/* Profile Picture Upload */}
                <div className="profile-picture-upload">
                  <div className="picture-preview">
                    {previewImage ? (
                      <img src={previewImage} alt="Preview" className="profile-picture" />
                    ) : profile?.photoURL ? (
                      <img src={profile.photoURL} alt="Profile" className="profile-picture" />
                    ) : (
                      <div className="profile-picture-placeholder">
                        <span>No Photo</span>
                      </div>
                    )}
                  </div>
                  <div className="picture-actions">
                    {!previewImage ? (
                      <>
                        <input 
                          ref={fileInputRef}
                          type="file" 
                          accept="image/*" 
                          onChange={handleProfilePictureSelect}
                          style={{ display: "none" }}
                          id="profilePictureInput"
                        />
                        <button 
                          className="picture-upload-btn"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Select Photo
                        </button>
                        {profile?.photoURL && (
                          <button 
                            className="picture-remove-btn"
                            onClick={handleRemoveProfilePicture}
                          >
                            Remove Photo
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button 
                          className="picture-save-btn"
                          onClick={handleSaveProfilePicture}
                        >
                          Save Photo
                        </button>
                        <button 
                          className="picture-cancel-btn"
                          onClick={handleCancelPicture}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Edit Fields */}
                <div className="profile-edit-fields">
                  <div className="profile-field">
                    <label>Full Name</label>
                    <input 
                      type="text"
                      value={profile.name}
                      onChange={(e) => setProfile({...profile, name: e.target.value})}
                      placeholder="Enter your full name"
                    />
                  </div>

                  <div className="profile-field">
                    <label>Email</label>
                    <input 
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile({...profile, email: e.target.value})}
                      placeholder="Enter your email"
                    />
                  </div>

                  <div className="profile-field">
                    <label>Role</label>
                    <input 
                      type="text"
                      value={profile.role}
                      disabled
                      placeholder="Role"
                    />
                  </div>
                </div>

                <div className="profile-edit-buttons">
                  <button 
                    className="btn-save"
                    onClick={handleProfileUpdate}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
                  </button>
                  <button 
                    className="btn-cancel"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // Change Password Mode
              <div className="profile-card password-mode">
                <div className="password-header">
                  <h2>Change Password</h2>
                </div>

                {passwordError && (
                  <div className="password-error">
                    {passwordError}
                  </div>
                )}

                <div className="password-form">
                  <div className="password-field">
                    <label>Current Password</label>
                    <input 
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                      placeholder="Enter your current password"
                    />
                  </div>

                  <div className="password-field">
                    <label>New Password</label>
                    <input 
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                      placeholder="Enter your new password"
                    />
                  </div>

                  <div className="password-field">
                    <label>Confirm New Password</label>
                    <input 
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                      placeholder="Confirm your new password"
                    />
                  </div>
                </div>

                <div className="password-actions">
                  <button 
                    className="btn-cancel"
                    onClick={handleCancelPasswordChange}
                    disabled={isUpdatingPassword}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn-update-password"
                    onClick={handlePasswordChange}
                    disabled={isUpdatingPassword}
                  >
                    {isUpdatingPassword ? "Updating..." : "Update Password"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="logout-modal-overlay">
          <div className="logout-modal">
            <h2>Confirm Logout</h2>
            <p>Are you sure you want to log out?</p>
            <div className="modal-buttons">
              <button className="btn-cancel" onClick={cancelLogout}>
                Cancel
              </button>
              <button className="btn-confirm-logout" onClick={confirmLogout}>
                Yes, Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QRScanner;
