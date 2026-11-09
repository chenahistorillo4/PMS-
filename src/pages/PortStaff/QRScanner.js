import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import jsQR from "jsqr";
import jsPDF from "jspdf";
import {
  FiCalendar,
  FiChevronRight,
  FiCreditCard,
  FiEdit2,
  FiKey,
  FiLock,
  FiLogOut,
  FiMail,
  FiShield,
  FiUser,
} from "react-icons/fi";
import { auth, db } from "../../firebase";
import { doc, updateDoc, setDoc, serverTimestamp, getDoc, collection, query, where, getDocs, addDoc, onSnapshot, runTransaction } from "firebase/firestore";
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import "./QRScanner.css";
import { getStaffAccount } from "../../utils/staffAccount";

async function createProfilePhotoDataUrl(file) {
  const imageBitmap = await createImageBitmap(file);
  const maxDimension = 1200;
  let scale = Math.min(1, maxDimension / Math.max(imageBitmap.width, imageBitmap.height));
  const maxDataUrlBytes = 700 * 1024;

  while (scale >= 0.25) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(imageBitmap.width * scale));
    canvas.height = Math.max(1, Math.round(imageBitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      imageBitmap.close();
      throw new Error("Unable to process this image in your browser.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

    for (let quality = 0.85; quality >= 0.5; quality -= 0.1) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= maxDataUrlBytes) {
        imageBitmap.close();
        return dataUrl;
      }
    }

    scale *= 0.8;
  }

  imageBitmap.close();
  throw new Error("This image could not be compressed enough to save. Please choose a smaller image.");
}

async function getBookingPaymentStatus(bookingId, bookingData) {
  const paymentsSnapshot = await getDocs(
    query(collection(db, "payments"), where("bookingId", "==", bookingId))
  );
  const paymentRecords = paymentsSnapshot.docs.map((paymentDoc) => paymentDoc.data());
  return getPaymentStatusFromRecords(paymentRecords, bookingData);
}

function getPaymentStatusFromRecords(paymentRecords, bookingData = {}) {
  const paymentStatus = (
    paymentRecords.find((payment) => isPaymentPaid(payment.status)) ||
    paymentRecords[0]
  )?.status?.toLowerCase?.();
  return paymentStatus || bookingData.paymentStatus?.toLowerCase?.() || "pending";
}

function isPaymentPaid(paymentStatus) {
  return ["paid", "completed", "confirmed"].includes(
    String(paymentStatus || "").toLowerCase()
  );
}

async function findBookingForBoat(scannedCode, assignedBoat) {
  if (!assignedBoat) {
    throw new Error("This Port Staff account does not have an assigned boat.");
  }

  const [schedulesSnapshot, boatBookingsSnapshot] = await Promise.all([
    getDocs(query(collection(db, "schedules"), where("boat", "==", assignedBoat))),
    getDocs(query(collection(db, "bookings"), where("boat", "==", assignedBoat)))
  ]);
  const bookingById = new Map(
    boatBookingsSnapshot.docs.map((bookingDoc) => [bookingDoc.id, bookingDoc])
  );
  const tripIds = schedulesSnapshot.docs.map((scheduleDoc) => scheduleDoc.id);
  for (let index = 0; index < tripIds.length; index += 30) {
    const tripIdChunk = tripIds.slice(index, index + 30);
    const bookingsByTrip = await getDocs(
      query(collection(db, "bookings"), where("tripId", "in", tripIdChunk))
    );
    bookingsByTrip.docs.forEach((bookingDoc) => {
      const bookingData = bookingDoc.data();
      if (!bookingData.boat || bookingData.boat === assignedBoat) {
        bookingById.set(bookingDoc.id, bookingDoc);
      }
    });
  }

  const normalizedCode = scannedCode.toUpperCase();
  return [...bookingById.values()].find((bookingDoc) => {
    const bookingData = bookingDoc.data();
    return bookingDoc.id.toUpperCase() === normalizedCode ||
      ["booking_id", "reference_number", "tripId", "referenceCode"].some(
        (field) => String(bookingData[field] || "").toUpperCase() === normalizedCode
      );
  }) || null;
}

function getScanDateKey(scan) {
  const createdAt = scan.createdAt?.toDate?.() || scan.createdAt;
  const date = createdAt ? new Date(createdAt) : new Date(scan.date);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function getTripDateKey(scan) {
  const travelDate = scan.travelDate?.toDate?.() || scan.travelDate;
  if (!travelDate || travelDate === "N/A") return "";
  if (typeof travelDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(travelDate)) {
    return travelDate;
  }
  const date = new Date(travelDate);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function getScanRoute(scan) {
  const route = scan.routeDirection || scan.route;
  if (route && !/→\s*N\/A$/i.test(route)) return route;

  const departure = scan.departurePort || scan.departure_port || scan.departure;
  const destination = scan.destinationPort || scan.destination_port || scan.destination;
  if (!departure || !destination || destination === "N/A" || /^\d{1,2}:\d{2}/.test(departure)) {
    return "N/A";
  }
  return `${departure} → ${destination}`;
}

function getBookingRouteDetails(bookingData) {
  const route = String(bookingData.routeDirection || bookingData.route || "").trim();
  const routeParts = route.split(/\s*(?:→|->|[-–—]|\bto\b)\s*/i);
  const hasRouteParts = routeParts.length > 1;
  const departure = bookingData.departure_port || bookingData.departurePort ||
    (hasRouteParts ? routeParts[0] : "N/A");
  const destination = bookingData.destination_port || bookingData.destinationPort ||
    (hasRouteParts ? routeParts.slice(1).join(" - ") : "N/A");

  return {
    route: route || (departure !== "N/A" && destination !== "N/A" ? `${departure} → ${destination}` : ""),
    departure,
    destination
  };
}

function getBookingScheduleTime(bookingData) {
  const departure = bookingData.departure_time || bookingData.departureTime || bookingData.departure;
  const arrival = bookingData.arrival_time || bookingData.arrivalTime || bookingData.arrival;
  if (departure && arrival) return `${departure} → ${arrival}`;
  return departure || arrival || "N/A";
}

function getScanDisplayStatus(scan) {
  const status = String(scan.actionStatus || scan.status || "pending").toLowerCase();
  if (["accepted", "scanned", "boarded"].includes(status)) return "Boarded";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getScanPaymentStatus(scan) {
  const status = String(scan.paymentStatus || "").toLowerCase();
  return ["paid", "completed", "confirmed"].includes(status) ? "Paid" : "Pending";
}

function getScanPaymentAmount(scan) {
  const amount = Number(scan.paymentAmount || scan.totalAmount || 0);
  return Number.isFinite(amount) && amount > 0
    ? `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "N/A";
}

function QRScanner({ user, embedded = false, profileOnly = false }) {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const scanProcessingRef = useRef(false);
  const lastScannedCodeRef = useRef("");
  const noQrFramesRef = useRef(0);
  const streamRef = useRef(null);
  const detailsSectionRef = useRef(null);
  const scanQRCodeRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [bookingDetails, setBookingDetails] = useState(null);
  const [isPendingAcceptance, setIsPendingAcceptance] = useState(false);
  const [currentBookingDocId, setCurrentBookingDocId] = useState(null);
  const [scanMessage, setScanMessage] = useState("Scan a QR code to view booking details");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationType, setNotificationType] = useState(""); // "success" or "error"
  const [recentScans, setRecentScans] = useState([]);
  const [availableBoatRoutes, setAvailableBoatRoutes] = useState([]);
  const [manualBookingId, setManualBookingId] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showHistoryDownloadPreview, setShowHistoryDownloadPreview] = useState(false);
  const [historyDownloadError, setHistoryDownloadError] = useState("");
  const [historyDate, setHistoryDate] = useState("");
  const [historyRoute, setHistoryRoute] = useState("");
  const [appliedHistoryDate, setAppliedHistoryDate] = useState("");
  const [appliedHistoryRoute, setAppliedHistoryRoute] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const showProfile = profileOnly;
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
  const [profilePictureFile, setProfilePictureFile] = useState(null);
  const fileInputRef = useRef(null);

  const createScanRecord = (details, action, bookingDocId) => {
    const now = new Date();

    return {
      bookingDocId: bookingDocId || "",
      bookingId: details?.booking_id || "N/A",
      userAccount: details?.bookedBy && details.bookedBy !== "N/A"
        ? details.bookedBy
        : details?.email || "N/A",
      passengerName: details?.passengerName || "N/A",
      departure: details?.departure || "N/A",
      destination: details?.destination || "N/A",
      route: details?.route || `${details?.departure || "N/A"} → ${details?.destination || "N/A"}`,
      vessel: details?.vessel || "N/A",
      travelDate: details?.date || "N/A",
      tripTime: details?.time || "N/A",
      tripId: details?.tripId || "",
      referenceCode: details?.referenceCode || details?.reference_number || "N/A",
      paymentMethod: details?.paymentMethod || "N/A",
      paymentStatus: details?.paymentStatus || "pending",
      paymentAmount: details?.totalAmount || details?.finalPrice || 0,
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
      scannerName: profile.name || currentUser.email || "Port Staff",
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
        scanQRCodeRef.current?.();
      }, 500);
    }
  }, [cameraActive]);

  // Initialize Port Staff profile and subscribe to scan history
  useEffect(() => {
    let unsubscribeHistory = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setRecentScans([]);
        return;
      }

      try {
        const account = await getStaffAccount(currentUser.uid);
        if (!account || account.collectionName !== "port_staff") {
          throw new Error("Port Staff profile could not be found.");
        }
        await updateDoc(doc(db, "port_staff", currentUser.uid), {
          lastLogin: serverTimestamp()
        });
        setProfile(account.data);

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

          const unresolvedBookingIds = [...new Set(
            historyList
              .filter((scan) => getScanRoute(scan) === "N/A" && scan.bookingDocId)
              .map((scan) => scan.bookingDocId)
          )];
          if (!unresolvedBookingIds.length) return;

          Promise.all(unresolvedBookingIds.map(async (bookingId) => {
            const bookingSnapshot = await getDoc(doc(db, "bookings", bookingId));
            return [
              bookingId,
              bookingSnapshot.exists() ? getBookingRouteDetails(bookingSnapshot.data()) : null
            ];
          }))
            .then((resolvedRoutes) => {
              const routeByBookingId = new Map(resolvedRoutes);
              setRecentScans((currentScans) => currentScans.map((scan) => {
                const routeDetails = routeByBookingId.get(scan.bookingDocId);
                return routeDetails?.route ? { ...scan, ...routeDetails } : scan;
              }));
            })
            .catch((error) => {
              console.error("Error resolving routes for recent scans:", error);
            });
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

  useEffect(() => {
    if (!profile.assignedBoat) {
      setAvailableBoatRoutes([]);
      return undefined;
    }

    const schedulesQuery = query(
      collection(db, "schedules"),
      where("boat", "==", profile.assignedBoat)
    );
    return onSnapshot(
      schedulesQuery,
      (snapshot) => {
        const routes = snapshot.docs
          .map((scheduleDoc) => getBookingRouteDetails(scheduleDoc.data()).route)
          .filter((route) => route && route !== "N/A" && !route.includes("→ N/A"));
        setAvailableBoatRoutes([...new Set(routes)].sort((a, b) => a.localeCompare(b)));
      },
      (error) => {
        console.error("Error loading routes for assigned boat:", error);
      }
    );
  }, [profile.assignedBoat]);

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

  useEffect(() => {
    if (!currentBookingDocId || !isPendingAcceptance) {
      return undefined;
    }

    const bookingRef = doc(db, "bookings", currentBookingDocId);
    const paymentsQuery = query(
      collection(db, "payments"),
      where("bookingId", "==", currentBookingDocId)
    );

    const updatePaymentState = (paymentRecords, bookingData = {}) => {
      const paymentStatus = getPaymentStatusFromRecords(paymentRecords, bookingData);
      const isPaid = isPaymentPaid(paymentStatus);

      setBookingDetails((previous) => {
        if (!previous) return previous;

        const bookingStatus = String(previous.status || "").toLowerCase();
        const canAccept = isPaid &&
          !["cancelled", "departed", "scanned", "boarded"].includes(bookingStatus);

        return {
          ...previous,
          paymentStatus,
          isPaid,
          canAccept
        };
      });

      setNotificationMessage(
        isPaid
          ? "✓ Payment confirmed. Booking can be accepted for boarding."
          : "Payment is pending. Confirm payment before boarding."
      );
      setNotificationType(isPaid ? "success" : "error");
    };

    const unsubscribeBooking = onSnapshot(
      bookingRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        const bookingData = snapshot.data();
        setBookingDetails((previous) => {
          if (!previous) return previous;
          const bookingStatus = String(bookingData.status || "pending").toLowerCase();
          const isPaid = previous.isPaid;
          return {
            ...previous,
            status: bookingData.status || "Pending",
            canAccept: Boolean(isPaid) &&
              !["cancelled", "departed", "scanned", "boarded"].includes(bookingStatus)
          };
        });
      },
      (error) => console.error("Error watching scanned booking:", error)
    );

    const unsubscribePayment = onSnapshot(
      paymentsQuery,
      (snapshot) => {
        updatePaymentState(
          snapshot.docs.map((paymentDoc) => paymentDoc.data())
        );
      },
      (error) => console.error("Error watching scanned payment:", error)
    );

    return () => {
      unsubscribeBooking();
      unsubscribePayment();
    };
  }, [currentBookingDocId, isPendingAcceptance]);

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
        if (!isPaymentPaid(paymentStatus)) {
          setBookingDetails((previous) => ({
            ...previous,
            status: "Pending",
            paymentStatus,
            isPaid: false,
            canAccept: false
          }));
          setNotificationMessage("✗ Payment is still pending. Confirm payment before boarding.");
          setNotificationType("error");
          return;
        }
        if (["cancelled", "departed", "scanned", "boarded"].includes(
          String(latestBooking.status || "").toLowerCase()
        ) || latestBooking.scannedAt) {
          throw new Error("This booking can no longer be accepted. This QR code cannot be reused.");
        }
        let belongsToAssignedBoat = latestBooking.boat === profile.assignedBoat;
        if (!latestBooking.boat && latestBooking.tripId) {
          const assignedTrip = await getDoc(doc(db, "schedules", latestBooking.tripId));
          belongsToAssignedBoat = assignedTrip.exists() &&
            assignedTrip.data().boat === profile.assignedBoat;
        }
        if (!belongsToAssignedBoat) {
          setNotificationMessage("✗ This booking is not assigned to your boat.");
          setNotificationType("error");
          return;
        }

        await runTransaction(db, async (transaction) => {
          const latestSnapshot = await transaction.get(bookingRef);
          if (!latestSnapshot.exists()) {
            throw new Error("Booking could not be found.");
          }
          const transactionBooking = latestSnapshot.data();
          if (transactionBooking.boat !== profile.assignedBoat) {
            if (transactionBooking.boat || !transactionBooking.tripId) {
              throw new Error("This booking is not assigned to your boat.");
            }
            const assignedTrip = await transaction.get(
              doc(db, "schedules", transactionBooking.tripId)
            );
            if (!assignedTrip.exists() || assignedTrip.data().boat !== profile.assignedBoat) {
              throw new Error("This booking is not assigned to your boat.");
            }
          }
          if (
            ["scanned", "boarded"].includes(String(transactionBooking.status || "").toLowerCase()) ||
            transactionBooking.scannedAt
          ) {
            throw new Error("This QR code was already accepted and cannot be reused.");
          }
          if (["cancelled", "departed"].includes(
            String(transactionBooking.status || "").toLowerCase()
          )) {
            throw new Error("This booking can no longer be accepted for boarding.");
          }
          transaction.update(bookingRef, {
            status: "boarded",
            scannedAt: serverTimestamp(),
            scannedBy: profile.name || auth.currentUser?.email || "Port Staff"
          });
        });

        const boardedDetails = { ...bookingDetails, status: "Boarded" };
        await saveScanHistory(boardedDetails, "accepted", currentBookingDocId);
        setBookingDetails((previous) => ({
          ...previous,
          status: "Boarded",
          isPaid: true,
          canAccept: false
        }));
        setIsPendingAcceptance(false);
        setNotificationMessage("✓ Booking accepted. This QR code has been used and cannot be reused.");
        setNotificationType("success");
      } catch (error) {
        console.error("Error accepting scan:", error);
        setNotificationMessage(`✗ ${error.message || "Error accepting booking. Please try again."}`);
        setNotificationType("error");
      }
    }
  };

  const handleRejectScan = async () => {
    if (bookingDetails) {
      try {
        await saveScanHistory(bookingDetails, "rejected", currentBookingDocId);
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

  const handleCloseBookingDetails = () => {
    setBookingDetails(null);
    setIsPendingAcceptance(false);
    setCurrentBookingDocId(null);
    setScanMessage("Scan a QR code to view booking details");
    setNotificationMessage("");
    setNotificationType("");
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
    setPreviewImage(null);
    setProfilePictureFile(null);
    setIsEditingProfile(true);
  };

  const handleCancelEdit = async () => {
    setIsEditingProfile(false);
    setPreviewImage(null);
    setProfilePictureFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    // Refetch profile data
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const userDocRef = doc(db, "port_staff", currentUser.uid);
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
        const userDocRef = doc(db, "port_staff", currentUser.uid);
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
        e.target.value = "";
        return;
      }

      // Validate file type
      if (!file.type.startsWith("image/")) {
        alert("Please select an image file");
        e.target.value = "";
        return;
      }

      // Convert to Base64 for preview and storage
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
        setProfilePictureFile(file);
      };
      reader.onerror = () => alert("Unable to preview this image. Please choose another file.");
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfilePicture = async () => {
    if (!profilePictureFile) {
      alert("Please select an image first");
      return;
    }

    setIsSaving(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const photoURL = await createProfilePhotoDataUrl(profilePictureFile);
      await setDoc(doc(db, "port_staff", currentUser.uid), {
        photoURL,
      }, { merge: true });
      setProfile((prev) => ({
        ...prev,
        photoURL,
      }));
      setPreviewImage(null);
      setProfilePictureFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      alert("Profile picture saved successfully!");
    } catch (error) {
      alert("Error saving profile picture: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelPicture = () => {
    setPreviewImage(null);
    setProfilePictureFile(null);
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

    setIsSaving(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("User not authenticated");
      await setDoc(doc(db, "port_staff", currentUser.uid), { photoURL: "" }, { merge: true });
      setProfile((prev) => ({ ...prev, photoURL: "" }));
      alert("Profile picture removed!");
    } catch (error) {
      alert("Error removing profile picture: " + error.message);
    } finally {
      setIsSaving(false);
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
      const bookingDoc = await findBookingForBoat(scannedCode, profile.assignedBoat);

      if (bookingDoc) {
        const bookingData = bookingDoc.data();
        if (bookingData.boat && bookingData.boat !== profile.assignedBoat) {
          setBookingDetails(null);
          setNotificationMessage("✗ This booking is not assigned to your boat.");
          setNotificationType("error");
          setCurrentBookingDocId(null);
          return;
        }

        // Check if ticket is already scanned/used
        if (
          ["scanned", "boarded"].includes(String(bookingData.status || "").toLowerCase()) ||
          bookingData.scannedAt
        ) {
          setBookingDetails(null);
          setScanMessage("This QR code was already accepted and cannot be reused.");
          setNotificationMessage(`✗ This QR code was already accepted and cannot be reused. ${bookingData.scannedAt?.toDate?.()?.toLocaleString() || ""}`);
          setNotificationType("error");
          setIsPendingAcceptance(false);
          setCurrentBookingDocId(null);
          setSuccessfulScan(null);
          return;
        }

        const paymentStatus = await getBookingPaymentStatus(bookingDoc.id, bookingData);
        const isPaid = isPaymentPaid(paymentStatus);
        const bookingStatus = String(bookingData.status || "").toLowerCase();
        const canAccept = isPaid &&
          !["cancelled", "departed", "scanned", "boarded"].includes(bookingStatus);
        const routeDetails = getBookingRouteDetails(bookingData);

        // Extract relevant booking information
        const details = {
          passengerName: bookingData.customerName || bookingData.passenger_name || bookingData.name || "N/A",
          booking_id: bookingData.booking_id || scannedCode,
          referenceCode: bookingData.referenceCode || bookingData.reference_number || "N/A",
          route: routeDetails.route,
          departure: routeDetails.departure,
          destination: routeDetails.destination,
          date: bookingData.departure_date || bookingData.departureDate || bookingData.date || "N/A",
          time: getBookingScheduleTime(bookingData),
          vessel: bookingData.vessel_name || bookingData.vessel || bookingData.boat || bookingData.tripName || "N/A",
          status: isPaid ? bookingData.status || "Pending" : "Pending",
          userType: bookingData.userType || "Regular",
          cargoType: bookingData.cargoType || "N/A",
          cargoWeight: bookingData.cargoWeight || "N/A",
          cargoPrice: bookingData.cargoPrice || 0,
          basePrice: bookingData.basePrice || bookingData.price || 0,
          discountRate: bookingData.discountRate || 0,
          discountAmount: bookingData.discountAmount || 0,
          passengerDiscountAmount: bookingData.passengerDiscountAmount ?? Math.max(0, (bookingData.discountAmount || 0) - (bookingData.promoDiscountAmount || 0)),
          promoName: bookingData.promoName || "",
          promoPercentage: bookingData.promoPercentage || 0,
          promoDiscountAmount: bookingData.promoDiscountAmount || 0,
          finalPrice: bookingData.finalPrice || bookingData.total_amount || "0",
          ticketCount: bookingData.ticket_count || bookingData.passengers?.length || 1,
          totalAmount: bookingData.total_amount || bookingData.finalPrice || "0",
          reference_number: bookingData.reference_number || bookingData.referenceCode || "N/A",
          tripId: bookingData.tripId || "N/A",
          email: bookingData.userEmail || "N/A",
          bookedBy: bookingData.bookedByName || "N/A",
          paymentMethod: bookingData.payment || "N/A",
          paymentStatus,
          isPaid,
          canAccept
        };

        setBookingDetails(details);
        setCurrentBookingDocId(bookingDoc.id);
        setScanMessage(`Booking found`);
        setNotificationMessage(
          canAccept
            ? "✓ Payment confirmed. Booking can be accepted for boarding."
            : isPaid
              ? "This booking cannot be accepted for boarding."
              : "Payment is pending. Confirm payment before boarding."
        );
        setNotificationType(canAccept ? "success" : "error");
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
      scanProcessingRef.current = false;
      lastScannedCodeRef.current = "";
      noQrFramesRef.current = 0;
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
    scanProcessingRef.current = false;
    setIsPendingAcceptance(false);
    setScanMessage("Scan a QR code to view booking details");
    setNotificationMessage("");
    setNotificationType("");
  };

  const scanQRCode = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    const context = canvas.getContext("2d");
    if (!context) {
      setNotificationMessage("Unable to start QR scanning. Please restart the camera.");
      setNotificationType("error");
      return;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }

    scanIntervalRef.current = setInterval(async () => {
      if (scanProcessingRef.current) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth && video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
          noQrFramesRef.current = 0;
          // Parse QR code data - expecting booking ID or reference number
          const scannedCode = code.data.trim();
          if (!scannedCode || scannedCode === lastScannedCodeRef.current) return;

          lastScannedCodeRef.current = scannedCode;
          scanProcessingRef.current = true;
          if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
          }
          console.log("QR Code detected:", scannedCode);

          // Fetch booking details from Firebase
          try {
            const bookingDoc = await findBookingForBoat(scannedCode, profile.assignedBoat);

            if (bookingDoc) {
              const bookingData = bookingDoc.data();
              if (bookingData.boat && bookingData.boat !== profile.assignedBoat) {
                setBookingDetails(null);
                setNotificationMessage("✗ This booking is not assigned to your boat.");
                setNotificationType("error");
                setCurrentBookingDocId(null);
                return;
              }
              console.log("Booking found:", bookingData);
              const paymentStatus = await getBookingPaymentStatus(bookingDoc.id, bookingData);
              const isPaid = isPaymentPaid(paymentStatus);
              const bookingStatus = String(bookingData.status || "").toLowerCase();
              const canAccept = isPaid &&
                !["cancelled", "departed", "scanned", "boarded"].includes(bookingStatus);
              const routeDetails = getBookingRouteDetails(bookingData);

              // Check if ticket is already scanned/used
              if (
                ["scanned", "boarded"].includes(String(bookingData.status || "").toLowerCase()) ||
                bookingData.scannedAt
              ) {
                setBookingDetails(null);
                setScanMessage("This QR code was already accepted and cannot be reused.");
                setNotificationMessage(`✗ This QR code was already accepted and cannot be reused. ${bookingData.scannedAt?.toDate?.()?.toLocaleString() || ""}`);
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
                route: routeDetails.route,
                departure: routeDetails.departure,
                destination: routeDetails.destination,
                date: bookingData.departure_date || bookingData.departureDate || bookingData.date || "N/A",
                time: getBookingScheduleTime(bookingData),
                vessel: bookingData.vessel_name || bookingData.vessel || bookingData.boat || bookingData.tripName || "N/A",
                status: isPaid ? bookingData.status || "Pending" : "Pending",
                userType: bookingData.userType || "Regular",
                cargoType: bookingData.cargoType || "N/A",
                cargoWeight: bookingData.cargoWeight || "N/A",
                cargoPrice: bookingData.cargoPrice || 0,
                basePrice: bookingData.basePrice || bookingData.price || 0,
                discountRate: bookingData.discountRate || 0,
                discountAmount: bookingData.discountAmount || 0,
                passengerDiscountAmount: bookingData.passengerDiscountAmount ?? Math.max(0, (bookingData.discountAmount || 0) - (bookingData.promoDiscountAmount || 0)),
                promoName: bookingData.promoName || "",
                promoPercentage: bookingData.promoPercentage || 0,
                promoDiscountAmount: bookingData.promoDiscountAmount || 0,
                finalPrice: bookingData.finalPrice || bookingData.total_amount || "0",
                ticketCount: bookingData.ticket_count || bookingData.passengers?.length || 1,
                totalAmount: bookingData.total_amount || bookingData.finalPrice || "0",
                reference_number: bookingData.reference_number || bookingData.referenceCode || "N/A",
                tripId: bookingData.tripId || "N/A",
                email: bookingData.userEmail || "N/A",
                bookedBy: bookingData.bookedByName || "N/A",
                paymentMethod: bookingData.payment || "N/A",
                paymentStatus,
                isPaid,
                canAccept
              };

              setBookingDetails(details);
              setCurrentBookingDocId(bookingDoc.id);
              setScanMessage(`Booking found`);
              setNotificationMessage(
                canAccept
                  ? "✓ Payment confirmed. Booking can be accepted for boarding."
                  : isPaid
                    ? "This booking cannot be accepted for boarding."
                    : "Payment is pending. Confirm payment before boarding."
              );
              setNotificationType(canAccept ? "success" : "error");
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
          } finally {
            scanProcessingRef.current = false;
            if (streamRef.current) {
              window.setTimeout(() => {
                if (streamRef.current && !scanIntervalRef.current) {
                  scanQRCodeRef.current?.();
                }
              }, 250);
            }
          }

          // Clear notification after 3 seconds
          setTimeout(() => {
            setNotificationMessage("");
            setNotificationType("");
          }, 3000);
        } else {
          noQrFramesRef.current += 1;
          if (noQrFramesRef.current >= 5) {
            lastScannedCodeRef.current = "";
          }
        }
      }
    }, 100);
  }, [profile.assignedBoat]);
  scanQRCodeRef.current = scanQRCode;

  const historyRoutes = useMemo(
    () => [...new Set([
      ...availableBoatRoutes,
      ...recentScans
        .map(getScanRoute)
        .filter((route) => route && !route.includes("N/A"))
    ])].sort((a, b) => a.localeCompare(b)),
    [availableBoatRoutes, recentScans]
  );
  const filteredRecentScans = useMemo(() => {
    return recentScans.filter((scan) => {
      const matchesDate = !appliedHistoryDate ||
        getScanDateKey(scan) === appliedHistoryDate ||
        getTripDateKey(scan) === appliedHistoryDate;
      const matchesRoute = !appliedHistoryRoute || getScanRoute(scan) === appliedHistoryRoute;
      return matchesDate && matchesRoute;
    });
  }, [recentScans, appliedHistoryDate, appliedHistoryRoute]);
  const historyPageSize = 10;
  const historyTotalPages = Math.max(1, Math.ceil(filteredRecentScans.length / historyPageSize));
  const paginatedHistoryScans = filteredRecentScans.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize
  );
  useEffect(() => {
    setHistoryPage(1);
  }, [appliedHistoryDate, appliedHistoryRoute]);

  useEffect(() => {
    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages);
  }, [historyPage, historyTotalPages]);

  const getHistoryExportRows = () => [
    ["Passenger", "Booking ID", "Route", "Schedule", "Status"],
    ...filteredRecentScans.map((scan) => [
      scan.passengerName || "N/A",
      scan.bookingId || "N/A",
      getScanRoute(scan),
      [scan.travelDate, scan.tripTime].filter((value) => value && value !== "N/A").join(" · ") || "N/A",
      getScanDisplayStatus(scan),
    ])
  ];

  const getHistoryExportFileName = () => {
    const routeFilePart = (appliedHistoryRoute || "all-routes").replace(/[\\/:*?"<>|]+/g, "-");
    return `boarding-history-${appliedHistoryDate || "all-dates"}-${routeFilePart}.pdf`;
  };

  const downloadHistoryPdf = () => {
    if (filteredRecentScans.length === 0) return;
    const exportRows = getHistoryExportRows();
    const pdf = new jsPDF();
    pdf.setFontSize(16);
    pdf.text("Boarding Passenger History", 14, 18);
    pdf.setFontSize(9);
    pdf.text(
      `Date: ${appliedHistoryDate || "All"} | Route: ${appliedHistoryRoute || "All routes"} | Total: ${filteredRecentScans.length}`,
      14,
      26
    );

    pdf.autoTable({
      startY: 32,
      head: [["#", ...exportRows[0]]],
      body: exportRows.slice(1).map((row, index) => [index + 1, ...row]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [33, 150, 243] },
    });
    pdf.save(getHistoryExportFileName());
  };

  return (
    <div className={`qr-scanner-container${embedded ? " embedded" : ""}${profileOnly ? " profile-only" : ""}`}>
      {showHistoryDownloadPreview && (
        <div
          className="history-download-preview-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowHistoryDownloadPreview(false);
              setHistoryDownloadError("");
            }
          }}
        >
          <section
            className="history-download-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-download-preview-title"
          >
            <header className="history-download-preview-header">
              <div>
                <h2 id="history-download-preview-title">PDF Download Preview</h2>
                <p>{getHistoryExportFileName()} · {filteredRecentScans.length} scan{filteredRecentScans.length === 1 ? "" : "s"}</p>
              </div>
              <button
                type="button"
                aria-label="Close preview"
                onClick={() => {
                  setShowHistoryDownloadPreview(false);
                  setHistoryDownloadError("");
                }}
              >
                ×
              </button>
            </header>
            {historyDownloadError && <p className="history-download-preview-error" role="alert">{historyDownloadError}</p>}
            <div className="history-download-preview-table-wrap">
              <table className="history-download-preview-table">
                <tbody>
                  {getHistoryExportRows().map((row, rowIndex) => (
                    <tr key={`history-export-row-${rowIndex}`} className={rowIndex === 0 ? "preview-heading-row" : ""}>
                      {rowIndex === 0
                        ? <th scope="col">#</th>
                        : <th scope="row">{rowIndex}</th>}
                      {row.map((cell, cellIndex) => {
                        const Cell = rowIndex === 0 ? "th" : "td";
                        return <Cell key={`history-export-cell-${rowIndex}-${cellIndex}`}>{cell}</Cell>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="history-download-preview-actions">
              <button
                type="button"
                className="history-preview-cancel-button"
                onClick={() => {
                  setShowHistoryDownloadPreview(false);
                  setHistoryDownloadError("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="history-preview-confirm-button"
                onClick={() => {
                  try {
                    downloadHistoryPdf();
                    setHistoryDownloadError("");
                    setShowHistoryDownloadPreview(false);
                  } catch (error) {
                    console.error("Error downloading recent scans PDF:", error);
                    setHistoryDownloadError("Could not download the PDF. Please try again.");
                  }
                }}
              >
                Confirm Download
              </button>
            </footer>
          </section>
        </div>
      )}
      {/* Drawer Overlay */}
      {!embedded && showDrawer && (
        <div
          className="drawer-overlay"
          onClick={() => setShowDrawer(false)}
        />
      )}

      {/* Left-side Drawer */}
      {!embedded && <div className={`scanner-drawer ${showDrawer ? "open" : ""}`}>
        <nav className="drawer-nav">
          <button
            className={`drawer-nav-item ${!showHistory ? "active" : ""}`}
            onClick={() => {
              setShowHistory(false);
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
              setShowDrawer(false);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            </svg>
            History
          </button>
        </nav>
      </div>}

      {/* Header */}
      {!embedded && !profileOnly && <header className="scanner-header">
        <div className="scanner-header-content">
          {!embedded && <button
            className="hamburger-btn"
            onClick={() => setShowDrawer(!showDrawer)}
            title="Menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>}

          <div className="scanner-logo-section">
            <div className="scanner-logo-arch">
              <img 
                src="/logoo.png" 
                alt="PMS Port Logo"
                className="scanner-logo"
              />
            </div>
            <div className="scanner-branding">
              <h1 className="scanner-title">Port Staff</h1>
            </div>
          </div>
        </div>
      </header>}

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
            <div className="scanner-header-row">
              <h2>QR Scanner</h2>
              {!profileOnly && (
                <button
                  type="button"
                  className="scanner-history-button"
                  onClick={() => setShowHistory(true)}
                >
                  Scan History
                </button>
              )}
            </div>
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
        <div
          className={`details-section${bookingDetails ? " details-section-modal" : " details-section-empty"}`}
          ref={detailsSectionRef}
        >
          <div className="details-header">
            <div>
              <h2>Booking Details</h2>
              <p>Passenger and trip information</p>
            </div>
            <button
              type="button"
              className="details-close-button"
              onClick={handleCloseBookingDetails}
              aria-label="Close booking details"
            >
              ×
            </button>
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
                {bookingDetails.passengerDiscountAmount > 0 && (
                  <>
                    <div className="detail-item">
                      <span className="detail-label">Passenger Discount Rate:</span>
                      <span className="detail-value">{(bookingDetails.discountRate * 100).toFixed(0)}%</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Passenger Discount:</span>
                      <span className="detail-value">₱{parseFloat(bookingDetails.passengerDiscountAmount).toFixed(2)}</span>
                    </div>
                  </>
                )}
                {bookingDetails.promoDiscountAmount > 0 && (
                  <div className="detail-item">
                    <span className="detail-label">Promo ({bookingDetails.promoName}, {bookingDetails.promoPercentage}%):</span>
                    <span className="detail-value">-₱{parseFloat(bookingDetails.promoDiscountAmount).toFixed(2)}</span>
                  </div>
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
                      isPaymentPaid(bookingDetails.paymentStatus) ? "status-confirmed" : "status-pending"
                    }`}
                  >
                    {isPaymentPaid(bookingDetails.paymentStatus) ? "Paid" : "Pending"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Status:</span>
                  <span className={`detail-value status-${String(bookingDetails.status || "pending").toLowerCase()}`}>
                    {bookingDetails.status}
                  </span>
                </div>
                {["boarded", "scanned"].includes(String(bookingDetails.status || "").toLowerCase()) && (
                  <p role="status" className="scan-hint">
                    This QR code has been accepted and cannot be reused.
                  </p>
                )}
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
                    {bookingDetails.canAccept ? (
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
                        {isPaymentPaid(bookingDetails.paymentStatus)
                          ? "This booking cannot be accepted for boarding."
                          : "Pending payment confirmation"}
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

        {!profileOnly && showHistory && (
          // History View
          <div className="history-view">
            <div className="history-header">
              <div>
                <h2>Recent Scans</h2>
                <p>View the latest passenger scans or search by date and route.</p>
              </div>
              {!profileOnly && (
                <button
                  type="button"
                  className="history-close-button"
                  aria-label="Back to QR Scanner"
                  title="Back to QR Scanner"
                  onClick={() => setShowHistory(false)}
                >
                  ×
                </button>
              )}
            </div>

            <div className="history-filters">
              <label className="history-filter-field">
                <span>Date</span>
                <input
                  type="date"
                  value={historyDate}
                  onChange={(event) => {
                    setHistoryDate(event.target.value);
                    setHistoryPage(1);
                  }}
                />
              </label>
              <label className="history-filter-field">
                <span>Route</span>
                <select
                  value={historyRoute}
                  onChange={(event) => {
                    setHistoryRoute(event.target.value);
                    setHistoryPage(1);
                  }}
                >
                  <option value="">All routes</option>
                  {historyRoutes.map((route) => (
                    <option key={route} value={route}>{route}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="history-search-button"
                onClick={() => {
                  setAppliedHistoryDate(historyDate);
                  setAppliedHistoryRoute(historyRoute);
                  setHistoryPage(1);
                }}
              >
                Search
              </button>
              <button
                type="button"
                className="history-clear-button"
                onClick={() => {
                  setHistoryDate("");
                  setHistoryRoute("");
                  setAppliedHistoryDate("");
                  setAppliedHistoryRoute("");
                  setHistoryPage(1);
                }}
              >
                Clear
              </button>
            </div>

            <div className="history-results-header">
              <h3>
                Recent Scans for {appliedHistoryDate || "All Dates"} · {appliedHistoryRoute || "All Routes"}
                <span>
                  {filteredRecentScans.length} passenger{filteredRecentScans.length === 1 ? "" : "s"}
                </span>
              </h3>
              <button
                type="button"
                className="history-download-button"
                onClick={() => {
                  setHistoryDownloadError("");
                  setShowHistoryDownloadPreview(true);
                }}
                disabled={!filteredRecentScans.length}
              >
                Preview & Download PDF
              </button>
            </div>

            {filteredRecentScans.length > 0 ? (
              <div className="history-list">
                <div className="history-list-header" aria-hidden="true">
                  <span>User Account</span>
                  <span>Passenger</span>
                  <span>Route</span>
                  <span>Date</span>
                  <span>Time</span>
                  <span>Payment</span>
                  <span>Amount</span>
                  <span>Status</span>
                </div>
                {paginatedHistoryScans.map((scan, index) => (
                  <div key={scan.id || `${scan.bookingId}-${index}`} className="history-item">
                    <div className="history-item-content">
                      <span className="detail-badge history-user-account" data-label="User Account">
                        {scan.userAccount && scan.userAccount !== "N/A"
                          ? scan.userAccount
                          : scan.bookedBy && scan.bookedBy !== "N/A"
                            ? scan.bookedBy
                            : scan.email || "N/A"}
                      </span>
                      <h3>{scan.passengerName || "N/A"}</h3>
                      <div className="history-details">
                        <span className="detail-badge" data-label="Route">{getScanRoute(scan)}</span>
                        <span className="detail-badge" data-label="Date">{scan.travelDate || "N/A"}</span>
                        <span className="detail-badge" data-label="Time">{scan.tripTime || "N/A"}</span>
                        <span className="detail-badge history-payment" data-label="Payment">
                          <span className="history-payment-method">{scan.paymentMethod || "N/A"}</span>
                          <span className={`history-payment-status payment-${getScanPaymentStatus(scan).toLowerCase()}`}>
                            {getScanPaymentStatus(scan)}
                          </span>
                        </span>
                        <span className="detail-badge" data-label="Amount">{getScanPaymentAmount(scan)}</span>
                        <span className={`detail-badge status-${getScanDisplayStatus(scan).toLowerCase()}`} data-label="Status">
                          {getScanDisplayStatus(scan)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {historyTotalPages > 1 && (
                  <div className="history-pagination">
                    <button
                      type="button"
                      onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                      disabled={historyPage === 1}
                    >
                      Previous
                    </button>
                    <span>Page {historyPage} of {historyTotalPages}</span>
                    <button
                      type="button"
                      onClick={() => setHistoryPage((page) => Math.min(historyTotalPages, page + 1))}
                      disabled={historyPage === historyTotalPages}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            ) : recentScans.length === 0 ? (
              <div className="history-empty">
                <p>No boarding scans yet</p>
                <p className="empty-hint">Scans will appear here organized by vessel and date</p>
              </div>
            ) : (
              <div className="history-empty">
                <p>No scans match these filters</p>
                <p className="empty-hint">Try another date or route.</p>
              </div>
            )}

          </div>
        )}

        {showProfile && (
          // Profile View
          <div className="profile-view">
            <header className="profile-only-page-header">
              <h1>{isEditingProfile ? "Edit Profile" : "My Profile"}</h1>
              <p>Manage your personal information and account security.</p>
            </header>
            {!isEditingProfile ? (
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
                  <div className="profile-only-identity">
                    <h2>{profile?.name || "Port Staff"}</h2>
                    <span>Port Staff</span>
                  </div>
                </div>

                {/* Info Header with Edit Button */}
                <div className="profile-info-header">
                  <h2><FiCreditCard aria-hidden="true" />Personal Information</h2>
                  <button 
                    className="profile-edit-btn"
                    onClick={handleEditProfile}
                  >
                    <FiEdit2 aria-hidden="true" />
                    Edit Profile
                  </button>
                </div>

                <div className="profile-content">
                  <div className="profile-fields">
                    <div className="profile-item">
                      <label><FiUser aria-hidden="true" />Full Name</label>
                      <p>{profile?.name || "Not set"}</p>
                    </div>
                    <div className="profile-item">
                      <label><FiMail aria-hidden="true" />Email</label>
                      <p>{profile?.email || "Not set"}</p>
                    </div>
                    <div className="profile-item">
                      <label><FiShield aria-hidden="true" />Role</label>
                      <p>{profile?.role || "Not set"}</p>
                    </div>
                  </div>

                  <div className="profile-section">
                    <h3><FiShield aria-hidden="true" />Account Status</h3>
                    <div className="profile-item">
                      <label>Status</label>
                      <p className={`status-badge ${profile?.status === "active" ? "active" : "inactive"}`}>
                        {profile?.status === "active" ? "✓ Active" : "✗ Inactive"}
                      </p>
                    </div>
                  </div>

                  <div className="profile-section">
                    <h3><FiCalendar aria-hidden="true" />Activity Log</h3>
                    <div className="profile-item">
                      <label>Created Date</label>
                      <p>{profile?.createdAt ? new Date(profile.createdAt.seconds * 1000).toLocaleDateString() : "Not available"}</p>
                    </div>
                    <div className="profile-item">
                      <label>Last Login</label>
                      <p>{profile?.lastLogin ? new Date(profile.lastLogin.seconds * 1000).toLocaleString() : "Not yet"}</p>
                    </div>
                  </div>

                  <div className={`profile-password-section${isChangingPassword ? " is-open" : ""}`}>
                    <div className="profile-password-header">
                      <div className="profile-password-description">
                        <FiLock aria-hidden="true" />
                        <div>
                          <h3>Change Password</h3>
                          <p>Update your account password for security.</p>
                        </div>
                      </div>
                      {!isChangingPassword && (
                        <button
                          type="button"
                          className="profile-password-btn"
                          onClick={() => setIsChangingPassword(true)}
                        >
                          <FiKey aria-hidden="true" />
                          <span>Change Password</span>
                          <FiChevronRight className="profile-password-chevron" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    {isChangingPassword && (
                      <div className="profile-password-card">
                        {passwordError && <div className="password-error" role="alert">{passwordError}</div>}
                        <div className="password-form portstaff-password-fields">
                          <div className="password-field">
                            <label>Current Password</label>
                            <input
                              type="password"
                              value={passwordForm.currentPassword}
                              onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })}
                              disabled={isUpdatingPassword}
                              placeholder="Enter your current password"
                              autoComplete="current-password"
                            />
                          </div>
                          <div className="password-field">
                            <label>New Password</label>
                            <input
                              type="password"
                              value={passwordForm.newPassword}
                              onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })}
                              disabled={isUpdatingPassword}
                              placeholder="Enter your new password"
                              autoComplete="new-password"
                            />
                          </div>
                          <div className="password-field">
                            <label>Confirm New Password</label>
                            <input
                              type="password"
                              value={passwordForm.confirmPassword}
                              onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })}
                              disabled={isUpdatingPassword}
                              placeholder="Confirm your new password"
                              autoComplete="new-password"
                            />
                          </div>
                        </div>
                        <div className="password-actions portstaff-password-actions">
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

                  <div className="profile-action-buttons">
                    <button 
                      className="profile-logout-btn" 
                      onClick={handleLogout}
                    >
                      <FiLogOut aria-hidden="true" />
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            ) : (
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
                          disabled={isSaving}
                        >
                          Choose Photo
                        </button>
                        {profile?.photoURL && (
                          <button 
                            className="picture-remove-btn"
                            onClick={handleRemoveProfilePicture}
                            disabled={isSaving}
                          >
                            {isSaving ? "Removing..." : "Delete Photo"}
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button 
                          className="picture-save-btn"
                          onClick={handleSaveProfilePicture}
                          disabled={isSaving}
                        >
                          {isSaving ? "Saving Photo..." : "Save Photo"}
                        </button>
                        <button 
                          className="picture-cancel-btn"
                          onClick={handleCancelPicture}
                          disabled={isSaving}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                  <p className="profile-picture-hint">Choose an image up to 5 MB. It will be optimized before being saved to your profile.</p>
                </div>

                {/* Edit Fields */}
                <div className="profile-edit-fields">
                  <div className="profile-field">
                    <label><FiUser aria-hidden="true" />Full Name</label>
                    <input 
                      type="text"
                      value={profile.name}
                      onChange={(e) => setProfile({...profile, name: e.target.value})}
                      placeholder="Enter your full name"
                    />
                  </div>

                  <div className="profile-field">
                    <label><FiMail aria-hidden="true" />Email</label>
                    <input 
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile({...profile, email: e.target.value})}
                      placeholder="Enter your email"
                    />
                  </div>

                  <div className="profile-field">
                    <label><FiShield aria-hidden="true" />Role</label>
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
