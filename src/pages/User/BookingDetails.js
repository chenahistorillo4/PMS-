import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { db, auth } from '../../firebase';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore';
import { formatTime12Hour } from '../../utils/timeFormatter';
import { isTripDepartureInPast } from '../../utils/tripSchedule';
import {
  createQrPhCheckout,
  isPayMongoEnabled,
  isPayMongoGcash,
  checkPayMongoReady,
  isProductionDeployment,
} from '../../utils/paymongo';
import { PAYMENT_PENDING_NOTICE, PAYMENT_QR_VALID_MINUTES } from '../../constants/paymentNotice';
import {
  calculatePromoDiscount,
  getActivePromo,
  getPromoReservationCounts,
} from '../../utils/promotionHelpers';
import { notifyNewBookingReceived } from '../../utils/notificationHelper';
import {
  comparePassengerNames,
  extractDiscountIdDetails,
  getDiscountIdAdditionalFields,
  getMissingDiscountIdDetails,
  hasReadableDiscountIdDetails,
  isDiscountIdEligible,
  identifyDiscountCategoryFromOcr,
} from '../../utils/discountIdOcr';
import {
  calculateCargoTotal,
  createCargoBookingSnapshot,
  isValidCargoQuantity,
} from '../../utils/cargoPricing';

// Generate a unique reference code
const generateReferenceCode = () => {
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${randomStr}${timestamp}`;
};

const getPassengerDiscountRate = (discounts, type) => {
  const matchingType = Object.keys(discounts).find(
    (discountType) => discountType.toLowerCase() === String(type).toLowerCase()
  );
  return matchingType ? Number(discounts[matchingType]) || 0 : 0;
};

const getDiscountCategoryFromType = (discountType) => {
  const normalizedType = String(discountType || '').toLowerCase();
  if (normalizedType.includes('student')) return 'student';
  if (normalizedType.includes('senior') || normalizedType.includes('osca')) return 'senior';
  if (normalizedType.includes('pwd') || normalizedType.includes('disability')) return 'pwd';
  return null;
};

const normalizeIdValue = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const stopIdOcrWorker = (workerRef) => {
  const worker = workerRef.current;
  workerRef.current = null;
  if (worker) {
    worker.terminate().catch((error) =>
      console.warn('Could not stop the ID OCR worker:', error)
    );
  }
};

const createEnhancedIdImage = async (file) => {
  const imageBitmap = await createImageBitmap(file);
  const scale = Math.min(2, 3000 / imageBitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(imageBitmap.width * scale));
  canvas.height = Math.max(1, Math.round(imageBitmap.height * scale));
  const context = canvas.getContext('2d');

  if (!context) {
    imageBitmap.close();
    throw new Error('Could not prepare the ID image for OCR.');
  }

  context.filter = 'grayscale(1) contrast(1.35)';
  context.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
  imageBitmap.close();
  return canvas;
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
  const tripPaymentMethod = trip?.paymentMethod || (trip?.allowPayLater ? 'pay_later' : 'gcash');
  const tripUsesPayLater = tripPaymentMethod === 'pay_later';

  if (!userId && auth.currentUser) {
    userId = auth.currentUser.uid;
  }

  const [form, setForm] = useState({
    bookingType: 'passenger_cargo',
    customerName: '',
    cargoId: '',
    cargoQuantity: '',
    userType: userType || 'regular',
    payment: tripUsesPayLater ? 'Pay Later' : '',
    idProof: null,
    idProofBase64: null,
    idPreview: null,
    idVerificationStatus: 'not_required',
    idVerificationAttempts: 0,
    idDetails: null,
    idAdditionalInfo: { fullName: '', idNumber: '', issuer: '' },
  });
  const [registeredPassengerName, setRegisteredPassengerName] = useState('');
  const [isRegisteredNameLoaded, setIsRegisteredNameLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bookingId, setBookingId] = useState(null);
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState([]);
  const [isLoadingPaymentMethods, setIsLoadingPaymentMethods] = useState(true);
  const [selectedPaymentAccount, setSelectedPaymentAccount] = useState(null);
  const [paymentProof, setPaymentProof] = useState(null);
  const [paymentProofBase64, setPaymentProofBase64] = useState(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState(null);
  const [boatDiscounts, setBoatDiscounts] = useState({});
  const [cargoTypes, setCargoTypes] = useState([]);
  const [cargoCatalogError, setCargoCatalogError] = useState('');
  const [boatPromos, setBoatPromos] = useState([]);
  const [promoReservationCounts, setPromoReservationCounts] = useState({});
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [payMongoReady, setPayMongoReady] = useState(false);
  const paymentAutoSelectedRef = useRef(false);
  const idProofInputRef = useRef(null);
  const idProofReaderRef = useRef(null);
  const idOcrWorkerRef = useRef(null);
  const idOcrRequestRef = useRef(0);
  const usesPayMongoGcash = isPayMongoGcash(form.payment);
  const isPayLater = form.payment === 'Pay Later';

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let isCurrent = true;
    setIsRegisteredNameLoaded(false);

    const fetchRegisteredName = async () => {
      try {
        if (!userId) {
          setRegisteredPassengerName(auth.currentUser?.displayName || '');
          return;
        }

        const userSnapshot = await getDoc(doc(db, 'users', userId));
        if (!isCurrent) return;

        const userData = userSnapshot.exists() ? userSnapshot.data() : {};
        setRegisteredPassengerName(
          userData.fullName ||
            userData.name ||
            userData.displayName ||
            auth.currentUser?.displayName ||
            ''
        );
      } catch (error) {
        console.error('Error fetching registered passenger name:', error);
        if (isCurrent) {
          setRegisteredPassengerName(auth.currentUser?.displayName || '');
        }
      } finally {
        if (isCurrent) setIsRegisteredNameLoaded(true);
      }
    };

    fetchRegisteredName();
    return () => {
      isCurrent = false;
    };
  }, [userId]);

  useEffect(
    () => () => {
      idOcrRequestRef.current += 1;
      idProofReaderRef.current?.abort();
      idProofReaderRef.current = null;
      stopIdOcrWorker(idOcrWorkerRef);
    },
    []
  );

  const selectedCargo = cargoTypes.find((cargo) => cargo.id === form.cargoId) || null;
  const passengerDiscountTypes = Object.entries(boatDiscounts).filter(
    ([type, rate]) =>
      type.toLowerCase() !== 'regular' &&
      Number.isFinite(Number(rate)) &&
      Number(rate) > 0 &&
      Number(rate) <= 1
  );
  const idAdditionalFields = getDiscountIdAdditionalFields(form.userType);
  const isIdAdditionalInfoComplete = idAdditionalFields.every((field) =>
    String(form.idAdditionalInfo[field.key] || '').trim()
  );
  // Price calculations
  const cargoPrice = form.bookingType === 'passenger_only' || !selectedCargo
    ? 0
    : calculateCargoTotal(selectedCargo.price, Number(form.cargoQuantity) || 0, selectedCargo.pricingBasis);

  const activePromo = getActivePromo(boatPromos, promoReservationCounts);
  let basePrice, discountRate, passengerDiscountAmount, promoDiscountAmount, discountAmount, finalPrice;
  const discountVerified =
    form.userType !== 'regular' && form.idVerificationStatus === 'verified';

  if (form.bookingType === 'cargo_only') {
    // Cargo-only: only charge cargo fee, no passenger base price
    basePrice = cargoPrice;
    discountRate = 0;
    passengerDiscountAmount = 0;
    promoDiscountAmount = 0;
    discountAmount = 0;
    finalPrice = cargoPrice;
  } else {
    // Passenger-only bookings exclude cargo from the discounted fare.
    basePrice =
      parseFloat(trip?.price || 0) +
      (form.bookingType === 'passenger_cargo' ? cargoPrice : 0);
    discountRate = discountVerified
      ? getPassengerDiscountRate(boatDiscounts, form.userType)
      : 0;
    passengerDiscountAmount = parseFloat(trip?.price || 0) * discountRate;
    promoDiscountAmount = calculatePromoDiscount(basePrice - passengerDiscountAmount, activePromo);
    discountAmount = passengerDiscountAmount + promoDiscountAmount;
    finalPrice = Math.max(0, basePrice - discountAmount);
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
    setCargoCatalogError('');
    setCargoTypes([]);
    if (!trip?.boat) return undefined;

    return onSnapshot(
      query(
        collection(db, 'cargoTypes'),
        where('boat', '==', trip.boat)
      ),
      (snapshot) => {
        setCargoTypes(snapshot.docs
          .map((cargoDoc) => ({ id: cargoDoc.id, ...cargoDoc.data() }))
          .filter((cargo) => cargo.status === 'active')
          .filter((cargo) => Number.isFinite(Number(cargo.price)) && Number(cargo.price) > 0)
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))));
      },
      (error) => {
        console.error('Error loading available cargo types:', error);
        setCargoCatalogError('Cargo pricing is temporarily unavailable. Please try again later.');
        setCargoTypes([]);
      }
    );
  }, [trip?.boat]);

  useEffect(() => {
    const fetchBoatDiscounts = async () => {
      try {
        if (!trip?.boat) {
          console.log('No boat selected, skipping discount fetch');
          setBoatDiscounts({});
          setBoatPromos([]);
          setPromoReservationCounts({});
          return;
        }

        console.log('[INFO] Fetching discounts for boat:', trip.boat);

        // Query discounts collection filtered by boatName
        const discountQuery = query(
          collection(db, 'discounts'),
          where('boatName', '==', trip.boat)
        );

        const [discountSnap, bookingsSnap] = await Promise.all([
          getDocs(discountQuery),
          getDocs(query(collection(db, 'bookings'), where('boat', '==', trip.boat))),
        ]);
        setPromoReservationCounts(
          getPromoReservationCounts(bookingsSnap.docs.map((bookingDoc) => bookingDoc.data()))
        );

        if (discountSnap.empty) {
          console.log('[ERROR] No discounts found for boat:', trip.boat);
          setBoatDiscounts({});
          setBoatPromos([]);
          setPromoReservationCounts({});
          return;
        }

        const discountData = discountSnap.docs[0].data();
        console.log('[SUCCESS] Discounts found:', discountData);
        setBoatDiscounts(discountData.discounts || {});
        setBoatPromos(Array.isArray(discountData.promos) ? discountData.promos : []);
      } catch (error) {
        console.error('Error fetching boat discounts:', error);
        setBoatDiscounts({});
        setBoatPromos([]);
        setPromoReservationCounts({});
      }
    };

    fetchBoatDiscounts();
  }, [trip?.boat]);

  // Fetch payment methods and validate user type for the selected boat
  useEffect(() => {
    let isCurrent = true;

    const fetchPaymentMethods = async () => {
      try {
        setIsLoadingPaymentMethods(true);
        if (!trip?.boat) {
          setAvailablePaymentMethods([]);
          setPayMongoReady(false);
          setIsLoadingPaymentMethods(false);
          return;
        }

        const payMongoConfigured = await checkPayMongoReady();
        if (!isCurrent) return;
        setPayMongoReady(payMongoConfigured);

        let methods = [];
        try {
          // Keep legacy payment accounts, but PayMongo is configured once for the whole app.
          const adminsQuery = query(
            collection(db, 'admins'),
            where('assignedBoat', '==', trip.boat)
          );
          const adminsSnap = await getDocs(adminsQuery);

          if (adminsSnap.empty) {
            console.warn('No admin found for boat:', trip.boat);
          } else {
            const adminId = adminsSnap.docs[0].id;

            const paymentQuery = query(
              collection(db, 'paymentAccounts'),
              where('adminId', '==', adminId),
              where('isActive', '==', true)
            );
            const paymentSnap = await getDocs(paymentQuery);

            methods = paymentSnap.docs.map((paymentDoc) => ({
              id: paymentDoc.id,
              accountType: paymentDoc.data().accountType,
              accountName: paymentDoc.data().accountName,
              accountNumber: paymentDoc.data().accountNumber,
              accountHolder: paymentDoc.data().accountHolder,
            }));
          }
        } catch (error) {
          console.error('Error fetching admin payment accounts:', error);
        }

        // GCash is processed through the shared PayMongo merchant account.
        methods = methods.filter((method) => method.accountType !== 'gcash');
        if (payMongoConfigured) {
          methods.unshift({
            id: null,
            accountType: 'gcash',
            accountName: 'PayMongo QR Ph',
            accountNumber: null,
            accountHolder: null,
          });
        }

        if (tripPaymentMethod === 'gcash') {
          methods = methods.filter((method) => method.accountType === 'gcash');
        }

        if (!isCurrent) return;
        setAvailablePaymentMethods(methods);

        if (tripUsesPayLater) {
          setForm((prev) => ({ ...prev, payment: 'Pay Later' }));
          setSelectedPaymentAccount(null);
          paymentAutoSelectedRef.current = true;
        } else if (methods.length > 0 && !paymentAutoSelectedRef.current) {
          // Auto-select first available payment method only once
          setForm((prev) => ({ ...prev, payment: methods[0].accountType }));
          setSelectedPaymentAccount(methods[0]);
          paymentAutoSelectedRef.current = true;
        }
        setIsLoadingPaymentMethods(false);
      } catch (error) {
        console.error('Error fetching payment methods:', error);
        if (isCurrent) {
          setAvailablePaymentMethods([]);
          setIsLoadingPaymentMethods(false);
        }
      }
    };

    fetchPaymentMethods();
    return () => {
      isCurrent = false;
    };
  }, [tripPaymentMethod, tripUsesPayLater, trip?.boat]);

  // Validate user type when boat discounts change
  useEffect(() => {
    if (boatDiscounts && Object.keys(boatDiscounts).length > 0 && form.userType !== 'regular') {
      if (!getPassengerDiscountRate(boatDiscounts, form.userType)) {
        console.log(
          `User type "${form.userType}" not available for boat "${trip.boat}". Resetting to "regular".`
        );
        idOcrRequestRef.current += 1;
        stopIdOcrWorker(idOcrWorkerRef);
        idProofReaderRef.current?.abort();
        idProofReaderRef.current = null;
        if (form.idPreview) URL.revokeObjectURL(form.idPreview);
        if (idProofInputRef.current) idProofInputRef.current.value = '';
        setForm((prev) => ({
          ...prev,
          userType: 'regular',
          idProof: null,
          idProofBase64: null,
          idPreview: null,
          idVerificationStatus: 'not_required',
          idVerificationAttempts: 0,
          idDetails: null,
        }));
      }
    }
  }, [boatDiscounts, form.userType, form.idPreview, trip?.boat]);

  const handleChange = (e) => {
    if (e.target.name === 'idProof') {
      const file = e.target.files[0];
      if (file) {
        if (!isIdAdditionalInfoComplete) {
          alert('Please complete the ID details before uploading your ID.');
          e.target.value = '';
          return;
        }

        if (!file.type.startsWith('image/')) {
          alert('Please upload an image of your ID.');
          e.target.value = '';
          return;
        }

        if (form.idVerificationAttempts >= 2) {
          alert('The ID could not be verified after two attempts. Regular fare will apply.');
          e.target.value = '';
          return;
        }

        idOcrRequestRef.current += 1;
        const requestId = idOcrRequestRef.current;
        const attemptNumber = form.idVerificationAttempts + 1;
        const discountType = form.userType;
        const providedInfo = { ...form.idAdditionalInfo };
        stopIdOcrWorker(idOcrWorkerRef);
        idProofReaderRef.current?.abort();
        if (form.idPreview) URL.revokeObjectURL(form.idPreview);
        const preview = URL.createObjectURL(file);
        const reader = new FileReader();
        idProofReaderRef.current = reader;
        reader.onloadend = () => {
          if (idProofReaderRef.current !== reader) return;
          idProofReaderRef.current = null;
          setForm((current) => ({
            ...current,
            idProof: file,
            idProofBase64: reader.result,
            idPreview: preview,
          }));
        };
        reader.readAsDataURL(file);

        e.target.value = '';
        setForm((current) => ({
          ...current,
          idVerificationStatus: 'processing',
          idVerificationAttempts: attemptNumber,
        }));

        const verifyId = async () => {
          let worker;
          try {
            const { createWorker } = await import('tesseract.js');
            worker = await createWorker('eng');
            if (requestId !== idOcrRequestRef.current) return;
            idOcrWorkerRef.current = worker;
            let result = await worker.recognize(file);
            if (requestId !== idOcrRequestRef.current) return;

            let ocrText = result.data.text;
            let idDetails = extractDiscountIdDetails(ocrText);
            if (!hasReadableDiscountIdDetails(idDetails, discountType)) {
              try {
                const enhancedImage = await createEnhancedIdImage(file);
                result = await worker.recognize(enhancedImage);
                if (requestId !== idOcrRequestRef.current) return;
                ocrText = `${ocrText}\n${result.data.text}`;
                idDetails = extractDiscountIdDetails(ocrText);
              } catch (error) {
                console.warn('Could not retry OCR with an enhanced ID image:', error);
              }
            }

            const missingDetails = getMissingDiscountIdDetails(idDetails, discountType);
            if (!hasReadableDiscountIdDetails(idDetails, discountType)) {
              const missingMessage = `Could not read the ${missingDetails.join(', ')} from the ID.`;
              const failedMessage =
                attemptNumber === 1
                  ? `${missingMessage} Please upload a clearer image.`
                  : `${missingMessage} Verification failed after two attempts. Regular fare will apply.`;
              setForm((current) => ({
                ...current,
                userType: attemptNumber === 2 ? 'regular' : current.userType,
                idProof: null,
                idProofBase64: null,
                idPreview: null,
                idVerificationStatus: 'failed',
                idDetails: {
                  ...idDetails,
                  nameMatch: null,
                  registeredName: registeredPassengerName || '',
                },
              }));
              alert(failedMessage);
              idProofReaderRef.current?.abort();
              idProofReaderRef.current = null;
              URL.revokeObjectURL(preview);
              return;
            }

            let profileName = registeredPassengerName;
            if (!isRegisteredNameLoaded && userId) {
              try {
                const userSnapshot = await getDoc(doc(db, 'users', userId));
                const userData = userSnapshot.exists() ? userSnapshot.data() : {};
                profileName =
                  userData.fullName ||
                  userData.name ||
                  userData.displayName ||
                  auth.currentUser?.displayName ||
                  '';
                setRegisteredPassengerName(profileName);
              } catch (error) {
                console.error('Error fetching registered passenger name for ID check:', error);
              }
            }

            const nameMatch = comparePassengerNames(idDetails.name, profileName);
            idDetails = {
              ...idDetails,
              nameMatch,
              registeredName: profileName,
            };
            const detectedCategory = identifyDiscountCategoryFromOcr(ocrText);
            idDetails.detectedCategory = detectedCategory;
            idDetails.providedNameMatch = comparePassengerNames(
              idDetails.name,
              providedInfo.fullName
            );
            if (isDiscountIdEligible(idDetails, providedInfo, discountType)) {
              setForm((current) => ({
                ...current,
                idVerificationStatus: 'verified',
                idDetails,
              }));
              alert(`${discountType} ID verified. The applicable discount has been applied.`);
              return;
            }

            const reviewReason =
              detectedCategory && detectedCategory !== getDiscountCategoryFromType(discountType)
                ? `The ID appears to be ${detectedCategory}, not ${discountType}.`
                : nameMatch === false
                ? 'The name on the ID does not match the registered passenger name.'
                : idDetails.providedNameMatch === false
                ? 'The name entered does not match the name on the ID.'
                : normalizeIdValue(idDetails.idNumber) !== normalizeIdValue(providedInfo.idNumber)
                ? 'The ID number entered does not match the ID.'
                : 'The entered ID details could not be matched to the ID.';
            setForm((current) => ({
              ...current,
              userType: attemptNumber === 2 ? 'regular' : current.userType,
              idProof: null,
              idProofBase64: null,
              idPreview: null,
              idVerificationStatus: 'failed',
              idDetails,
            }));
            alert(
              attemptNumber === 1
                ? `${reviewReason} Please upload another ID.`
                : `${reviewReason} Verification failed after two attempts. Regular fare will apply.`
            );
            idProofReaderRef.current?.abort();
            idProofReaderRef.current = null;
            URL.revokeObjectURL(preview);
          } catch (error) {
            if (requestId !== idOcrRequestRef.current) return;
            console.error('Error reading uploaded ID with OCR:', error);
            const failedMessage =
              attemptNumber === 1
                ? 'OCR could not process the ID image. Please upload a clearer image once more.'
                : 'OCR could not process the ID image after two attempts, so regular fare will apply.';
            setForm((current) => ({
              ...current,
              userType: attemptNumber === 2 ? 'regular' : current.userType,
              idProof: null,
              idProofBase64: null,
              idPreview: null,
              idVerificationStatus: 'failed',
              idDetails: null,
            }));
            alert(failedMessage);
            idProofReaderRef.current?.abort();
            idProofReaderRef.current = null;
            URL.revokeObjectURL(preview);
          } finally {
            if (idOcrWorkerRef.current === worker) idOcrWorkerRef.current = null;
            if (worker) {
              try {
                await worker.terminate();
              } catch (error) {
                console.warn('Could not stop the ID OCR worker:', error);
              }
            }
          }
        };
        verifyId();
      } else {
        idOcrRequestRef.current += 1;
        stopIdOcrWorker(idOcrWorkerRef);
        idProofReaderRef.current?.abort();
        idProofReaderRef.current = null;
        if (form.idPreview) URL.revokeObjectURL(form.idPreview);
        setForm((current) => ({
          ...current,
          idProof: null,
          idProofBase64: null,
          idPreview: null,
          idVerificationStatus: 'not_started',
          idVerificationAttempts: 0,
          idDetails: null,
        }));
      }
    } else if (e.target.name === 'userType') {
      idOcrRequestRef.current += 1;
      stopIdOcrWorker(idOcrWorkerRef);
      idProofReaderRef.current?.abort();
      idProofReaderRef.current = null;
      if (form.idPreview) URL.revokeObjectURL(form.idPreview);
      if (idProofInputRef.current) idProofInputRef.current.value = '';
      setForm((current) => ({
        ...current,
        userType: e.target.value,
        idProof: null,
        idProofBase64: null,
        idPreview: null,
        idVerificationStatus: 'not_required',
        idVerificationAttempts: 0,
        idDetails: null,
        idAdditionalInfo: { fullName: '', idNumber: '', issuer: '' },
      }));
    } else if (e.target.name.startsWith('idAdditionalInfo.')) {
      idOcrRequestRef.current += 1;
      stopIdOcrWorker(idOcrWorkerRef);
      idProofReaderRef.current?.abort();
      idProofReaderRef.current = null;
      if (form.idPreview) URL.revokeObjectURL(form.idPreview);
      if (idProofInputRef.current) idProofInputRef.current.value = '';
      const fieldKey = e.target.name.slice('idAdditionalInfo.'.length);
      setForm((current) => ({
        ...current,
        idAdditionalInfo: {
          ...current.idAdditionalInfo,
          [fieldKey]: e.target.value,
        },
        idProof: null,
        idProofBase64: null,
        idPreview: null,
        idVerificationStatus: current.idVerificationAttempts ? 'failed' : 'not_started',
        idDetails: null,
      }));
    } else if (e.target.name === 'paymentProof') {
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
    } else if (e.target.name === 'payment') {
      const accountType = e.target.value;
      setForm({ ...form, payment: accountType });
      // Update selected account details
      const selected = availablePaymentMethods.find((m) => m.accountType === accountType);
      setSelectedPaymentAccount(selected);
    } else {
      setForm({ ...form, [e.target.name]: e.target.value });
    }
  };

  const handleCancelIdProof = () => {
    idOcrRequestRef.current += 1;
    stopIdOcrWorker(idOcrWorkerRef);
    idProofReaderRef.current?.abort();
    idProofReaderRef.current = null;
    if (form.idPreview) URL.revokeObjectURL(form.idPreview);
    if (idProofInputRef.current) idProofInputRef.current.value = '';
    setForm((current) => ({
      ...current,
      idProof: null,
      idProofBase64: null,
      idPreview: null,
      idVerificationStatus: 'not_started',
      idVerificationAttempts: 0,
      idDetails: null,
    }));
  };

  const handleConfirmBooking = async () => {
    if (!form.customerName || !form.payment) {
      alert('Please complete all required fields.');
      return;
    }
    if (form.bookingType !== 'passenger_only') {
      if (form.bookingType === 'cargo_only' && !selectedCargo) {
        alert('Please select an available cargo type.');
        return;
      }
      if (form.cargoId && !selectedCargo) {
        alert('The selected cargo type is no longer available. Please choose another type or remove it.');
        return;
      }
      if (form.cargoId && !isValidCargoQuantity(form.cargoQuantity, selectedCargo?.pricingBasis)) {
        alert(selectedCargo?.pricingBasis === 'Per Kilo'
          ? 'Cargo weight must be greater than zero and use up to two decimal places.'
          : 'Cargo quantity must be a whole number greater than zero.');
        return;
      }
    }

    // Only validate passenger-specific fields if booking includes passenger
    if (form.bookingType !== 'cargo_only') {
      // Validate user type is available for this boat
      if (form.userType !== 'regular' && !getPassengerDiscountRate(boatDiscounts, form.userType)) {
        alert(
          `The discount type "${form.userType}" is not available for ${trip.boat}. Please select a different user type or contact support.`
        );
        return;
      }

      if (
        form.userType !== 'regular' &&
        (form.idVerificationStatus !== 'verified' || !form.idProofBase64)
      ) {
        alert(
          form.idVerificationStatus === 'processing'
            ? 'Please wait while your ID is being read.'
            : form.idVerificationStatus === 'verified'
            ? 'Please wait until the ID image has finished loading.'
            : form.idVerificationAttempts === 0
            ? 'Please upload your valid ID for verification.'
            : 'Your ID could not be verified. Please upload a clearer or correct ID, or select Regular.'
        );
        return;
      }

      if (form.userType !== 'regular' && !isIdAdditionalInfoComplete) {
        alert('Please complete the required details for this ID category.');
        return;
      }
    }

    // Manual proof is only required for non-PayMongo payments
    if (!isPayLater && !usesPayMongoGcash && !paymentProofBase64) {
      alert('Please upload your proof of payment screenshot.');
      return;
    }

    if (!userId) {
      alert('User not found. Please log in again or reselect your trip.');
      navigate('/login');
      return;
    }
    if (!trip) {
      alert('Trip data is missing. Please select a trip again.');
      navigate('/booking');
      return;
    }

    if (isTripDepartureInPast(trip)) {
      alert('This trip has already departed. Please select an available schedule.');
      if (onCloseModal) {
        onCloseModal();
      } else {
        navigate('/booking');
      }
      return;
    }

    try {
      setLoading(true);

      console.log('[INFO] Preparing booking data...');

      // Fetch user's name from Firestore users collection
      let bookedByName = auth.currentUser?.email || 'Guest';
      let userPhone = null;
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          userPhone = userData.phone || null;
          // Try different field names for the user's name
          bookedByName =
            userData.name ||
            userData.fullName ||
            userData.displayName ||
            auth.currentUser?.displayName ||
            auth.currentUser?.email ||
            'Guest';
        }
      } catch (error) {
        console.warn('Error fetching user name from database:', error);
        bookedByName = auth.currentUser?.displayName || auth.currentUser?.email || 'Guest';
      }

      // Booking data with Base64 encoded image
      const referenceCode = generateReferenceCode();
      const paymentExpiresAt = new Date(Date.now() + PAYMENT_QR_VALID_MINUTES * 60 * 1000);
      const latestBookingsSnapshot = await getDocs(
        query(collection(db, 'bookings'), where('boat', '==', trip.boat))
      );
      const latestPromo = getActivePromo(
        boatPromos,
        getPromoReservationCounts(latestBookingsSnapshot.docs.map((bookingDoc) => bookingDoc.data()))
      );
      if ((latestPromo?.id || null) !== (activePromo?.id || null)) {
        alert('Promo availability has changed. Please review the updated price before booking.');
        setLoading(false);
        return;
      }

      let cargoSnapshot = null;
      if (form.bookingType !== 'passenger_only' && selectedCargo) {
        const latestCargoDoc = await getDoc(doc(db, 'cargoTypes', selectedCargo.id));
        if (!latestCargoDoc.exists() || latestCargoDoc.data().status !== 'active') {
          throw new Error('This cargo type is no longer available. Please choose another cargo type.');
        }
        const latestCargo = { id: latestCargoDoc.id, ...latestCargoDoc.data() };
        if (
          latestCargo.boat !== trip.boat ||
          latestCargo.name !== selectedCargo.name ||
          latestCargo.pricingBasis !== selectedCargo.pricingBasis ||
          Number(latestCargo.price) !== Number(selectedCargo.price)
        ) {
          throw new Error('Cargo pricing has changed. Please review the updated cargo price before booking.');
        }
        cargoSnapshot = createCargoBookingSnapshot(latestCargo, form.cargoQuantity);
        if (!cargoSnapshot) {
          throw new Error('Please enter a valid cargo quantity and select a cargo type.');
        }
      }

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
        userType:
          form.bookingType === 'cargo_only'
            ? null
            : discountVerified
            ? form.userType
            : 'regular',
        cargoType: cargoSnapshot?.name || '',
        cargoQuantity: cargoSnapshot?.quantity || 0,
        cargoPricingBasis: cargoSnapshot?.pricingBasis || '',
        cargoSnapshot,
        cargoPrice,
        basePrice: form.bookingType === 'cargo_only' ? 0 : parseFloat(trip?.price || 0),
        passengerPrice: form.bookingType === 'cargo_only' ? 0 : parseFloat(trip?.price || 0),
        discountRate,
        discountAmount,
        passengerDiscountAmount,
        promoName: promoDiscountAmount > 0 ? activePromo?.name || null : null,
        promoId: promoDiscountAmount > 0 ? activePromo?.id || null : null,
        promoPercentage: promoDiscountAmount > 0 ? Number(activePromo?.percentage) : 0,
        promoDiscountAmount,
        finalPrice,
        payment: form.payment,
        paymentMode: isPayLater ? 'pay_later' : 'prepaid',
        userId: userId || null,
        userEmail: auth.currentUser?.email || null,
        userPhone: userPhone || null,
        bookedByName: bookedByName,
        idProofBase64:
          form.bookingType === 'cargo_only' || !discountVerified
            ? null
            : form.idProofBase64 || null,
        idProofFileName:
          form.bookingType === 'cargo_only' || !discountVerified
            ? null
            : form.idProof?.name || null,
        idVerificationStatus:
          form.bookingType === 'cargo_only'
            ? null
            : discountVerified
            ? 'verified'
            : form.idVerificationStatus,
        idVerificationAttempts:
          form.bookingType === 'cargo_only' ? null : form.idVerificationAttempts,
        idAdditionalInfo:
          form.bookingType !== 'cargo_only' && discountVerified
            ? form.idAdditionalInfo
            : null,
        status: 'pending',
        referenceCode: referenceCode,
        qrCodeValue: referenceCode,
        paymentExpiresAt: isPayLater ? null : paymentExpiresAt,
        createdAt: new Date(),
      };

      console.log('Adding booking to Firestore...');
      const docRef = await addDoc(collection(db, 'bookings'), bookingData);
      console.log('[SUCCESS] Booking successfully saved! ID:', docRef.id);

      // Create payment record with pending status
      console.log('[INFO] Creating payment record...');
      const paymentData = {
        bookingId: docRef.id,
        userId: userId || null,
        userEmail: auth.currentUser?.email || null,
        userPhone: userPhone || null,
        customerName: form.customerName,
        boat: trip.boat,
        trip: trip.name,
        amount: finalPrice,
        method: form.payment,
        paymentMode: isPayLater ? 'pay_later' : 'prepaid',
        paymentAccountId: selectedPaymentAccount?.id || null,
        paymentAccountNumber: selectedPaymentAccount?.accountNumber || null,
        status: 'pending',
        paymentProvider: usesPayMongoGcash ? 'paymongo' : 'manual',
        proofOfPaymentBase64: usesPayMongoGcash ? null : paymentProofBase64,
        proofOfPaymentFileName: usesPayMongoGcash ? null : paymentProof?.name || null,
        paymentExpiresAt: isPayLater ? null : paymentExpiresAt,
        createdAt: new Date(),
      };

      const paymentRef = await addDoc(collection(db, 'payments'), paymentData);
      console.log('[SUCCESS] Payment record created! ID:', paymentRef.id);
      await notifyNewBookingReceived(bookingData, docRef.id, trip.capacity).catch((error) =>
        console.warn('New booking in-app notification failed:', error)
      );

      if (usesPayMongoGcash) {
        if (!payMongoReady) {
          alert(
            isProductionDeployment()
              ? 'Online payment is not ready. Configure PAYMONGO_SECRET_KEY in your hosting provider environment settings, then redeploy.'
              : 'Online GCash payment is not ready yet. Start the payment server (npm run server) and add your PAYMONGO_SECRET_KEY in server/.env, then refresh this page.'
          );
          setLoading(false);
          return;
        }

        if (finalPrice <= 0) {
          alert('Online payment requires a total amount greater than ₱0.00.');
          setLoading(false);
          return;
        }

        const checkout = await createQrPhCheckout({
          paymentId: paymentRef.id,
          amount: finalPrice,
          bookingId: docRef.id,
        });

        await updateDoc(doc(db, 'payments', paymentRef.id), {
          paymongoPaymentIntentId: checkout.paymentIntentId || null,
          paymongoFlow: 'qrph',
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

      console.log('[SUCCESS] Booking successfully saved.');
      setBookingId(docRef.id);
      alert(
        isPayLater
          ? 'Booking successful! Payment is pending. Please pay manually; the admin will confirm your booking after receiving payment.'
          : 'Booking successful! Your proof of payment has been submitted. The admin will review and confirm shortly.'
      );

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
      alert('Error booking trip: ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="bookingdetails-page-content"
      style={{
        minHeight: isModal ? 'auto' : '100vh',
        background: isModal
          ? 'transparent'
          : "linear-gradient(135deg, rgba(255, 255, 255, 0.45) 0%, rgba(240, 248, 255, 0.40) 100%), url('/bg5.avif') center/cover fixed",
        padding: isModal ? '0' : isMobile ? '86px 14px 24px' : '40px 20px',
      }}
    >
      <div
        style={{
          maxWidth: isModal ? '100%' : '900px',
          margin: '0 auto',
          padding: isModal ? '0' : '0',
        }}
      >
        {/* Header */}
        <h1
          style={{
            textAlign: 'center',
            fontSize: isModal ? (isMobile ? '1.2rem' : '1.5rem') : isMobile ? '1.3rem' : '2rem',
            fontWeight: 700,
            marginTop: 0,
            marginBottom: isMobile ? '18px' : isModal ? '20px' : '32px',
            color: '#1a1a1a',
            letterSpacing: '-0.5px',
          }}
        >
          Booking Details
        </h1>

        {/* Main Card */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: isMobile ? (isModal ? '12px' : '20px') : isModal ? '20px' : '35px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            border: '1px solid #f0f0f0',
          }}
        >
          {/* Trip Information Section */}
          <div style={{ marginBottom: isMobile ? '24px' : '35px' }}>
            <h3
              style={{
                fontSize: isMobile ? '0.95rem' : '1.1rem',
                fontWeight: 800,
                color: '#1a1a1a',
                marginBottom: isMobile ? '14px' : '20px',
                paddingBottom: isMobile ? '9px' : '12px',
                borderBottom: '2px solid #2196f3',
              }}
            >
              Trip Information
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))',
                gap: isMobile ? '14px 10px' : '20px',
                fontSize: isMobile ? '0.8rem' : '0.95rem',
              }}
            >
              <div>
                <label
                  style={{
                    fontWeight: 600,
                    color: '#999',
                    fontSize: isMobile ? '0.65rem' : '0.85rem',
                    marginBottom: '6px',
                    display: 'block',
                    textTransform: 'uppercase',
                  }}
                >
                  Boat
                </label>
                <div
                  style={{
                    color: '#1a1a1a',
                    fontSize: isMobile ? '0.8rem' : '1rem',
                    fontWeight: 500,
                  }}
                >
                  {trip.boat}
                </div>
              </div>
              <div>
                <label
                  style={{
                    fontWeight: 600,
                    color: '#999',
                    fontSize: isMobile ? '0.65rem' : '0.85rem',
                    marginBottom: '6px',
                    display: 'block',
                    textTransform: 'uppercase',
                  }}
                >
                  Trip Name
                </label>
                <div
                  style={{
                    color: '#1a1a1a',
                    fontSize: isMobile ? '0.8rem' : '1rem',
                    fontWeight: 500,
                  }}
                >
                  {trip.name}
                </div>
              </div>
              <div>
                <label
                  style={{
                    fontWeight: 600,
                    color: '#999',
                    fontSize: isMobile ? '0.65rem' : '0.85rem',
                    marginBottom: '6px',
                    display: 'block',
                    textTransform: 'uppercase',
                  }}
                >
                  Route
                </label>
                <div
                  style={{
                    color: '#1a1a1a',
                    fontSize: isMobile ? '0.8rem' : '1rem',
                    fontWeight: 500,
                  }}
                >
                  {trip.routeDirection}
                </div>
              </div>
              <div>
                <label
                  style={{
                    fontWeight: 600,
                    color: '#999',
                    fontSize: isMobile ? '0.65rem' : '0.85rem',
                    marginBottom: '6px',
                    display: 'block',
                    textTransform: 'uppercase',
                  }}
                >
                  Date
                </label>
                <div
                  style={{
                    color: '#1a1a1a',
                    fontSize: isMobile ? '0.8rem' : '1rem',
                    fontWeight: 500,
                  }}
                >
                  {trip.date}
                </div>
              </div>
              <div>
                <label
                  style={{
                    fontWeight: 600,
                    color: '#999',
                    fontSize: isMobile ? '0.65rem' : '0.85rem',
                    marginBottom: '6px',
                    display: 'block',
                    textTransform: 'uppercase',
                  }}
                >
                  Departure
                </label>
                <div
                  style={{
                    color: '#1a1a1a',
                    fontSize: isMobile ? '0.8rem' : '1rem',
                    fontWeight: 500,
                  }}
                >
                  {formatTime12Hour(trip.departure)}
                </div>
              </div>
              <div>
                <label
                  style={{
                    fontWeight: 600,
                    color: '#999',
                    fontSize: isMobile ? '0.65rem' : '0.85rem',
                    marginBottom: '6px',
                    display: 'block',
                    textTransform: 'uppercase',
                  }}
                >
                  Arrival
                </label>
                <div
                  style={{
                    color: '#1a1a1a',
                    fontSize: isMobile ? '0.8rem' : '1rem',
                    fontWeight: 500,
                  }}
                >
                  {formatTime12Hour(trip.arrival)}
                </div>
              </div>
            </div>
          </div>

          {/* Booking Type Selection Section */}
          <div style={{ marginBottom: isMobile ? '24px' : '35px' }}>
            <h3
              style={{
                fontSize: isMobile ? '0.95rem' : '1.1rem',
                fontWeight: 800,
                color: '#1a1a1a',
                marginBottom: isMobile ? '14px' : '20px',
                paddingBottom: isMobile ? '9px' : '12px',
                borderBottom: '2px solid #2196f3',
              }}
            >
              Booking Type
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
              gap: isMobile ? '8px' : '12px',
            }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  fontSize: isMobile ? '0.78rem' : '0.95rem',
                  fontWeight: 500,
                  color: '#333',
                  padding: '12px 15px',
                  background: form.bookingType === 'passenger_cargo' ? '#e3f2fd' : '#f5f5f5',
                  borderRadius: '8px',
                  border:
                    form.bookingType === 'passenger_cargo' ? '2px solid #2196f3' : '2px solid #ddd',
                  transition: 'all 0.2s ease',
                }}
              >
                <input
                  type="radio"
                  name="bookingType"
                  value="passenger_cargo"
                  onChange={handleChange}
                  checked={form.bookingType === 'passenger_cargo'}
                  style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                />
                <span style={{ fontWeight: 600 }}>Passenger + Cargo</span>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  fontSize: isMobile ? '0.78rem' : '0.95rem',
                  fontWeight: 500,
                  color: '#333',
                  padding: '12px 15px',
                  background: form.bookingType === 'passenger_only' ? '#e3f2fd' : '#f5f5f5',
                  borderRadius: '8px',
                  border:
                    form.bookingType === 'passenger_only' ? '2px solid #2196f3' : '2px solid #ddd',
                  transition: 'all 0.2s ease',
                }}
              >
                <input
                  type="radio"
                  name="bookingType"
                  value="passenger_only"
                  onChange={handleChange}
                  checked={form.bookingType === 'passenger_only'}
                  style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                />
                <span style={{ fontWeight: 600 }}>Passenger Only</span>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  fontSize: isMobile ? '0.78rem' : '0.95rem',
                  fontWeight: 500,
                  color: '#333',
                  padding: '12px 15px',
                  background: form.bookingType === 'cargo_only' ? '#fff3e0' : '#f5f5f5',
                  borderRadius: '8px',
                  border:
                    form.bookingType === 'cargo_only' ? '2px solid #ff9800' : '2px solid #ddd',
                  transition: 'all 0.2s ease',
                }}
              >
                <input
                  type="radio"
                  name="bookingType"
                  value="cargo_only"
                  onChange={handleChange}
                  checked={form.bookingType === 'cargo_only'}
                  style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                />
                <span style={{ fontWeight: 600 }}>Cargo Only</span>
              </label>
            </div>
          </div>

          {/* Customer Information Section */}
          <div style={{ marginBottom: isMobile ? '24px' : '35px' }}>
            <h3
              style={{
                fontSize: isMobile ? '0.95rem' : '1.1rem',
                fontWeight: 800,
                color: '#1a1a1a',
                marginBottom: isMobile ? '14px' : '20px',
                paddingBottom: isMobile ? '9px' : '12px',
                borderBottom: '2px solid #2196f3',
              }}
            >
              Customer Information
            </h3>
            <input
              type="text"
              name="customerName"
              placeholder="Enter your full name"
              value={form.customerName}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: '12px 15px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: isMobile ? '0.8rem' : '0.95rem',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                marginBottom: '15px',
                transition: 'border-color 0.2s ease',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#2196f3')}
              onBlur={(e) => (e.target.style.borderColor = '#ddd')}
            />
          </div>

          {/* User Type Section - Only show for passenger bookings */}
          {form.bookingType !== 'cargo_only' && (
            <div style={{ marginBottom: isMobile ? '24px' : '35px' }}>
              <h3
                style={{
                  fontSize: isMobile ? '0.95rem' : '1.1rem',
                  fontWeight: 800,
                  color: '#1a1a1a',
                  marginBottom: isMobile ? '14px' : '20px',
                  paddingBottom: isMobile ? '9px' : '12px',
                  borderBottom: '2px solid #2196f3',
                }}
              >
                Passenger Type
              </h3>
              {passengerDiscountTypes.length > 0 && (
                <p
                  style={{
                    fontSize: isMobile ? '0.72rem' : '0.85rem',
                    color: '#666',
                    marginBottom: '15px',
                    padding: '10px 12px',
                    background: '#f0f7ff',
                    borderLeft: '4px solid #2196f3',
                    borderRadius: '4px',
                  }}
                >
                  [INFO] Available discounts for <strong>{trip.boat}</strong>:{' '}
                  {passengerDiscountTypes
                    .map(([type]) => type.charAt(0).toUpperCase() + type.slice(1))
                    .join(', ')}
                </p>
              )}
              {passengerDiscountTypes.length === 0 && (
                <p
                  style={{
                    fontSize: isMobile ? '0.72rem' : '0.85rem',
                    color: '#ff6f00',
                    marginBottom: '15px',
                    padding: '10px 12px',
                    background: '#fff3e0',
                    borderLeft: '4px solid #ff9800',
                    borderRadius: '4px',
                  }}
                >
                  [WARNING] No special discounts available for <strong>{trip.boat}</strong>. Only
                  regular rates apply.
                </p>
              )}
              <select
                name="userType"
                value={form.userType}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '12px 15px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  fontSize: isMobile ? '0.8rem' : '0.95rem',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  background: 'white',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s ease',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#2196f3')}
                onBlur={(e) => (e.target.style.borderColor = '#ddd')}
              >
                <option value="regular">Regular</option>
                {passengerDiscountTypes.map(([type, rate]) => (
                  <option
                    key={type}
                    value={type}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)} (
                    {(Number(rate) * 100).toFixed(0)}% discount)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ID Upload Section - Only show for passenger bookings with non-regular type */}
          {form.bookingType !== 'cargo_only' &&
            (form.userType !== 'regular' || form.idDetails) && (
            <div style={{ marginBottom: isMobile ? '24px' : '35px' }}>
              <h3
                style={{
                  fontSize: isMobile ? '0.95rem' : '1.1rem',
                  fontWeight: 800,
                  color: '#1a1a1a',
                  marginBottom: isMobile ? '14px' : '20px',
                  paddingBottom: isMobile ? '9px' : '12px',
                  borderBottom: '2px solid #2196f3',
                }}
              >
                ID Verification
              </h3>
              {form.userType !== 'regular' && (
                <>
                  {idAdditionalFields.map((field) => (
                    <label
                      key={field.key}
                      style={{
                        display: 'block',
                        marginBottom: '12px',
                        fontWeight: 600,
                        color: '#333',
                        fontSize: isMobile ? '0.78rem' : '0.9rem',
                      }}
                    >
                      {field.label}
                      <input
                        type="text"
                        name={`idAdditionalInfo.${field.key}`}
                        value={form.idAdditionalInfo[field.key] || ''}
                        placeholder={field.placeholder}
                        onChange={handleChange}
                        required
                        style={{
                          display: 'block',
                          width: '100%',
                          marginTop: '6px',
                          padding: '11px 12px',
                          border: '1px solid #ddd',
                          borderRadius: '8px',
                          fontSize: isMobile ? '0.8rem' : '0.95rem',
                          fontFamily: 'inherit',
                          boxSizing: 'border-box',
                        }}
                      />
                    </label>
                  ))}
                  <label
                    style={{
                      display: 'block',
                      fontWeight: 600,
                      color: '#333',
                      marginBottom: '12px',
                      fontSize: isMobile ? '0.78rem' : '0.95rem',
                    }}
                  >
                    Upload a clear photo of your valid ID
                  </label>
                  <input
                    ref={idProofInputRef}
                    type="file"
                    name="idProof"
                    accept="image/*"
                    onChange={handleChange}
                    disabled={!isIdAdditionalInfoComplete}
                    style={{
                      width: '100%',
                      padding: '12px 15px',
                      border: `2px dashed ${isIdAdditionalInfoComplete ? '#2196f3' : '#bbb'}`,
                      borderRadius: '8px',
                      fontSize: isMobile ? '0.8rem' : '0.95rem',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      cursor: isIdAdditionalInfoComplete ? 'pointer' : 'not-allowed',
                      background: isIdAdditionalInfoComplete ? 'white' : '#f5f5f5',
                      transition: 'border-color 0.2s ease',
                    }}
                  />
                </>
              )}
              {form.idPreview && (
                <div
                  style={{
                    marginTop: '20px',
                    textAlign: 'center',
                    padding: '15px',
                    background: '#f9f9f9',
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                  }}
                >
                  <p
                    style={{
                      fontSize: isMobile ? '0.7rem' : '0.85rem',
                      color: '#666',
                      marginBottom: '12px',
                      fontWeight: 600,
                    }}
                  >
                    ID Preview
                  </p>
                  <img
                    src={form.idPreview}
                    alt="ID Preview"
                    style={{ maxWidth: '200px', maxHeight: '200px', borderRadius: '6px' }}
                  />
                  <button
                    type="button"
                    onClick={handleCancelIdProof}
                    style={{
                      display: 'block',
                      margin: '12px auto 0',
                      padding: '8px 14px',
                      color: '#b42318',
                      background: '#fff1f0',
                      border: '1px solid #f2b8b5',
                      borderRadius: '6px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Remove ID
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Cargo Information Section */}
          {form.bookingType !== 'passenger_only' && (
          <div style={{ marginBottom: isMobile ? '24px' : '35px' }}>
            <h3
              style={{
                fontSize: isMobile ? '0.95rem' : '1.1rem',
                fontWeight: 800,
                color: '#1a1a1a',
                marginBottom: isMobile ? '14px' : '20px',
                paddingBottom: isMobile ? '9px' : '12px',
                borderBottom: '2px solid #2196f3',
              }}
            >
              Cargo Information
            </h3>
            <div style={{ marginBottom: '15px' }}>
              <label
                style={{
                  display: 'block',
                  fontWeight: 600,
                  color: '#333',
                  marginBottom: '8px',
                  fontSize: isMobile ? '0.78rem' : '0.95rem',
                }}
              >
                Cargo Type and Price
              </label>
              <select
                name="cargoId"
                value={form.cargoId}
                onChange={handleChange}
                required={form.bookingType === 'cargo_only'}
                style={{
                  width: '100%',
                  padding: '12px 15px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  fontSize: isMobile ? '0.8rem' : '0.95rem',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s ease',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#2196f3')}
                onBlur={(e) => (e.target.style.borderColor = '#ddd')}
              >
                <option value="">{form.bookingType === 'cargo_only' ? 'Select cargo type' : 'No cargo'}</option>
                {cargoTypes.map((cargo) => (
                  <option key={cargo.id} value={cargo.id}>
                    {cargo.name} — ₱{Number(cargo.price).toFixed(2)} {cargo.pricingBasis}
                  </option>
                ))}
              </select>
              {cargoCatalogError ? (
                <p role="alert" style={{ color: '#b42318', margin: '8px 0 0' }}>{cargoCatalogError}</p>
              ) : cargoTypes.length === 0 ? (
                <p style={{ color: '#777', margin: '8px 0 0' }}>No cargo types are currently available.</p>
              ) : null}
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontWeight: 600,
                  color: '#333',
                  marginBottom: '8px',
                  fontSize: isMobile ? '0.78rem' : '0.95rem',
                }}
              >
                Quantity {selectedCargo ? `(${selectedCargo.pricingBasis.replace('Per ', '')})` : ''}
              </label>
              <input
                type="number"
                name="cargoQuantity"
                min={selectedCargo?.pricingBasis === 'Per Kilo' ? '0.01' : '1'}
                step={selectedCargo?.pricingBasis === 'Per Kilo' ? '0.01' : '1'}
                placeholder={selectedCargo?.pricingBasis === 'Per Kilo' ? 'Enter weight in kg' : 'Enter quantity'}
                value={form.cargoQuantity}
                onChange={handleChange}
                disabled={!selectedCargo}
                style={{
                  width: '100%',
                  padding: '12px 15px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  fontSize: isMobile ? '0.8rem' : '0.95rem',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  background: !selectedCargo ? '#f5f5f5' : 'white',
                  cursor: !selectedCargo ? 'not-allowed' : 'text',
                  transition: 'border-color 0.2s ease',
                  color: !selectedCargo ? '#999' : '#333',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#2196f3')}
                onBlur={(e) => (e.target.style.borderColor = '#ddd')}
              />
              {selectedCargo && (
                <p style={{ color: '#555', margin: '8px 0 0', fontSize: isMobile ? '0.76rem' : '0.88rem' }}>
                  ₱{Number(selectedCargo.price).toFixed(2)} {selectedCargo.pricingBasis}
                  {' · Cargo total: '}₱{cargoPrice.toFixed(2)}
                </p>
              )}
            </div>
          </div>
          )}

          {/* Price Breakdown Section */}
          <div style={{ marginBottom: isMobile ? '24px' : '35px' }}>
            <h3
              style={{
                fontSize: isMobile ? '0.95rem' : '1.1rem',
                fontWeight: 800,
                color: '#1a1a1a',
                marginBottom: isMobile ? '14px' : '20px',
                paddingBottom: isMobile ? '9px' : '12px',
                borderBottom: '2px solid #2196f3',
              }}
            >
              Price Breakdown
            </h3>
            <div
              style={{
                background: '#f9f9f9',
                padding: isMobile ? '14px' : '20px',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
              }}
            >
              {form.bookingType === 'cargo_only' ? (
                <>
                  {form.bookingType === 'passenger_cargo' && <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '12px',
                      fontSize: isMobile ? '0.78rem' : '0.95rem',
                    }}
                  >
                    <span style={{ color: '#666', fontWeight: 500 }}>Cargo Price:</span>
                    <span style={{ fontWeight: 600, color: '#1a1a1a' }}>
                      ₱{Number(cargoPrice).toFixed(2)}
                    </span>
                  </div>}
                  {!activePromo && (
                    <p
                      style={{
                        margin: '0 0 12px',
                        color: '#666',
                        fontSize: isMobile ? '0.78rem' : '0.9rem',
                      }}
                    >
                      No promotions available at the moment.
                    </p>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      paddingTop: '12px',
                      borderTop: '2px solid #ddd',
                      fontSize: isMobile ? '0.9rem' : '1.1rem',
                    }}
                  >
                    <span style={{ color: '#1a1a1a', fontWeight: 700 }}>Total Price:</span>
                    <span
                      style={{
                        fontWeight: 800,
                        color: '#ff9800',
                        fontSize: isMobile ? '1rem' : '1.3rem',
                      }}
                    >
                      ₱{Number(finalPrice).toFixed(2)}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '12px',
                      fontSize: isMobile ? '0.78rem' : isMobile ? '0.78rem' : '0.95rem',
                    }}
                  >
                    <span style={{ color: '#666', fontWeight: 500 }}>Base Price:</span>
                    <span style={{ fontWeight: 600, color: '#1a1a1a' }}>
                      ₱{Number(trip.price).toFixed(2)}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '12px',
                      fontSize: isMobile ? '0.78rem' : '0.95rem',
                    }}
                  >
                    <span style={{ color: '#666', fontWeight: 500 }}>Cargo Price:</span>
                    <span style={{ fontWeight: 600, color: '#1a1a1a' }}>
                      ₱{Number(cargoPrice).toFixed(2)}
                    </span>
                  </div>
                  {passengerDiscountAmount > 0 && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '12px',
                      fontSize: isMobile ? '0.78rem' : '0.95rem',
                      color: '#f44336',
                    }}>
                      <span style={{ fontWeight: 500 }}>
                        {form.userType} Discount ({(discountRate * 100).toFixed(0)}%):
                      </span>
                      <span style={{ fontWeight: 600 }}>-₱{Number(passengerDiscountAmount).toFixed(2)}</span>
                    </div>
                  )}
                  {promoDiscountAmount > 0 && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '12px',
                      fontSize: isMobile ? '0.78rem' : '0.95rem',
                      color: '#f44336',
                    }}>
                      <span style={{ fontWeight: 500 }}>
                        Promo: {activePromo.name} ({Number(activePromo.percentage)}%):
                      </span>
                      <span style={{ fontWeight: 600 }}>-₱{Number(promoDiscountAmount).toFixed(2)}</span>
                    </div>
                  )}
                  {!activePromo && (
                    <p
                      style={{
                        margin: '0 0 12px',
                        color: '#666',
                        fontSize: isMobile ? '0.78rem' : '0.9rem',
                      }}
                    >
                      No promotions available at the moment.
                    </p>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      paddingTop: '12px',
                      borderTop: '2px solid #ddd',
                      fontSize: isMobile ? '0.9rem' : '1.1rem',
                    }}
                  >
                    <span style={{ color: '#1a1a1a', fontWeight: 700 }}>Total Price:</span>
                    <span
                      style={{
                        fontWeight: 800,
                        color: '#2196f3',
                        fontSize: isMobile ? '1rem' : '1.3rem',
                      }}
                    >
                      ₱{Number(finalPrice).toFixed(2)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Payment Method Section */}
          <div style={{ marginBottom: isMobile ? '24px' : '35px' }}>
            <h3
              style={{
                fontSize: isMobile ? '0.95rem' : '1.1rem',
                fontWeight: 800,
                color: '#1a1a1a',
                marginBottom: isMobile ? '14px' : '20px',
                paddingBottom: isMobile ? '9px' : '12px',
                borderBottom: '2px solid #2196f3',
              }}
            >
              {tripUsesPayLater ? 'Booking Only' : 'Payment Method'}
            </h3>
            {tripUsesPayLater ? (
              <div
                style={{
                  padding: '15px',
                  background: '#fff9e6',
                  border: '1px solid #ffc107',
                  borderRadius: '8px',
                  color: '#856404',
                  fontSize: isMobile ? '0.75rem' : '0.9rem',
                  fontWeight: 500,
                  lineHeight: 1.5,
                }}
              >
                Reserve this trip now and pay ₱{Number(finalPrice).toFixed(2)} at the port.
              </div>
            ) : isLoadingPaymentMethods ? (
              <div
                style={{
                  padding: '15px',
                  background: '#f5f5f5',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  color: '#555',
                  fontSize: isMobile ? '0.75rem' : '0.9rem',
                }}
              >
                Loading payment methods...
              </div>
            ) : availablePaymentMethods.length === 0 ? (
              <div
                style={{
                  padding: '15px',
                  background: '#fff3cd',
                  border: '1px solid #ffc107',
                  borderRadius: '8px',
                  color: '#856404',
                  fontSize: isMobile ? '0.75rem' : '0.9rem',
                  fontWeight: 500,
                }}
              >
                Online payment is not configured for this boat. Please contact the administrator
                to configure the shared PayMongo account.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '25px', flexWrap: 'wrap' }}>
                {availablePaymentMethods.map((method) => (
                  <label
                    key={method.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                      fontSize: isMobile ? '0.78rem' : '0.95rem',
                      fontWeight: 5,
                      color: '#333',
                    }}
                  >
                    <input
                      type="radio"
                      name="payment"
                      value={method.accountType}
                      onChange={handleChange}
                      checked={form.payment === method.accountType}
                      style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                    />
                    {method.accountType === 'gcash'
                      ? isPayMongoEnabled()
                        ? 'GCash (QR Ph Scan)'
                        : 'GCash'
                      : method.accountType === 'paymaya'
                      ? 'PayMaya'
                      : method.accountType.charAt(0).toUpperCase() + method.accountType.slice(1)}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Payment Instructions Section - Show when payment method selected BEFORE booking */}
          {form.payment && !bookingId && !isPayLater && (
            <div
              style={{
                background: usesPayMongoGcash ? '#e8f5e9' : '#fff9e6',
                border: usesPayMongoGcash ? '2px solid #4caf50' : '2px solid #ffc107',
                borderRadius: '8px',
                padding: 'clamp(20px, 5vw, 30px)',
                marginBottom: '30px',
                marginLeft: '15px',
                marginRight: '15px',
              }}
            >
              <h3
                style={{
                  fontSize:
                    isModal || isMobile
                      ? 'clamp(0.9rem, 1.1vw, 1rem)'
                      : 'clamp(1rem, 1.2vw, 1.1rem)',
                  fontWeight: 800,
                  color: '#1a1a1a',
                  marginBottom: '20px',
                  paddingBottom: '12px',
                  borderBottom: usesPayMongoGcash ? '2px solid #4caf50' : '2px solid #ffc107',
                }}
              >
                {isPayLater
                  ? 'Pay Later'
                  : usesPayMongoGcash
                  ? 'Pay with QR Ph (GCash / Bank Apps)'
                  : 'Payment Instructions'}
              </h3>

              <div
                style={{
                  background: 'white',
                  padding: isMobile ? 'clamp(12px, 2vw, 15px)' : 'clamp(15px, 3vw, 20px)',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  border: usesPayMongoGcash ? '1px solid #4caf50' : '1px solid #ffc107',
                }}
              >
                {isPayLater ? (
                  <p
                    style={{
                      fontSize: isMobile
                        ? 'clamp(0.7rem, 0.85vw, 0.78rem)'
                        : 'clamp(0.85rem, 1vw, 0.9rem)',
                      color: '#666',
                      marginBottom: '15px',
                      lineHeight: '1.6',
                    }}
                  >
                    You can pay ₱<strong>{Number(finalPrice).toFixed(2)}</strong> later. Your booking
                    and payment will stay pending until the admin confirms payment.
                  </p>
                ) : usesPayMongoGcash ? (
                  <>
                    <p
                      style={{
                        fontSize: isMobile
                          ? 'clamp(0.7rem, 0.85vw, 0.78rem)'
                          : 'clamp(0.85rem, 1vw, 0.9rem)',
                        color: '#666',
                        marginBottom: '15px',
                        lineHeight: '1.6',
                      }}
                    >
                      You will pay <strong>₱{Number(finalPrice).toFixed(2)}</strong> via{' '}
                      <strong>QR Ph</strong>. After confirming, a QR code will appear — scan it
                      using the GCash app or any participating bank/e-wallet app.
                    </p>
                    {!payMongoReady && (
                      <p
                        style={{
                          fontSize: isMobile
                            ? 'clamp(0.65rem, 0.8vw, 0.72rem)'
                            : 'clamp(0.75rem, 0.9vw, 0.85rem)',
                          color: '#c62828',
                          fontWeight: 600,
                          marginBottom: '10px',
                          lineHeight: '1.5',
                        }}
                      >
                        {isProductionDeployment()
                          ? 'Online payment is not ready. Configure PAYMONGO_SECRET_KEY in your hosting provider environment settings, then redeploy.'
                          : 'Payment server is not ready. Run `npm run server` and set PAYMONGO_SECRET_KEY in server/.env, then refresh.'}
                      </p>
                    )}
                    <p
                      style={{
                        fontSize: isMobile
                          ? 'clamp(0.65rem, 0.8vw, 0.72rem)'
                          : 'clamp(0.75rem, 0.9vw, 0.85rem)',
                        color: '#5d4037',
                        fontWeight: 600,
                        marginBottom: '8px',
                        lineHeight: '1.5',
                        background: '#fff8e1',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid #ffe082',
                      }}
                    >
                      {PAYMENT_PENDING_NOTICE}
                    </p>
                  </>
                ) : (
                  <>
                    <p
                      style={{
                        fontSize: isMobile
                          ? 'clamp(0.7rem, 0.85vw, 0.78rem)'
                          : 'clamp(0.85rem, 1vw, 0.9rem)',
                        color: '#666',
                        marginBottom: '15px',
                        lineHeight: '1.6',
                      }}
                    >
                      Please send ₱<strong>{Number(finalPrice).toFixed(2)}</strong> to the following
                      account:
                    </p>

                    {selectedPaymentAccount && (
                      <div
                        style={{
                          background: '#f5f5f5',
                          padding: 'clamp(12px, 2vw, 15px)',
                          borderRadius: '6px',
                          marginBottom: '15px',
                          border: '1px solid #ddd',
                        }}
                      >
                        <p
                          style={{
                            margin: '0 0 10px 0',
                            fontSize: isMobile
                              ? 'clamp(0.68rem, 0.8vw, 0.75rem)'
                              : 'clamp(0.8rem, 0.95vw, 0.9rem)',
                            color: '#333',
                          }}
                        >
                          <strong>Payment Method:</strong>{' '}
                          {selectedPaymentAccount.accountType === 'gcash'
                            ? 'GCash'
                            : selectedPaymentAccount.accountType === 'paymaya'
                            ? 'PayMaya'
                            : selectedPaymentAccount.accountType}
                        </p>
                        <p
                          style={{
                            margin: '0 0 10px 0',
                            fontSize: isMobile
                              ? 'clamp(0.68rem, 0.8vw, 0.75rem)'
                              : 'clamp(0.8rem, 0.95vw, 0.9rem)',
                            color: '#333',
                          }}
                        >
                          <strong>Account Number:</strong> {selectedPaymentAccount.accountNumber}
                        </p>
                        <p
                          style={{
                            margin: '0 0 10px 0',
                            fontSize: isMobile
                              ? 'clamp(0.68rem, 0.8vw, 0.75rem)'
                              : 'clamp(0.8rem, 0.95vw, 0.9rem)',
                            color: '#333',
                          }}
                        >
                          <strong>Account Holder:</strong> {selectedPaymentAccount.accountHolder}
                        </p>
                        {bookingId && (
                          <p
                            style={{
                              margin: '0',
                              fontSize: isMobile
                                ? 'clamp(0.68rem, 0.8vw, 0.75rem)'
                                : 'clamp(0.8rem, 0.95vw, 0.9rem)',
                              color: '#333',
                            }}
                          >
                            <strong>Reference/Booking ID:</strong>{' '}
                            <span
                              style={{
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                wordBreak: 'break-word',
                              }}
                            >
                              {bookingId}
                            </span>
                          </p>
                        )}
                      </div>
                    )}

                    <p
                      style={{
                        fontSize: isMobile
                          ? 'clamp(0.65rem, 0.8vw, 0.72rem)'
                          : 'clamp(0.75rem, 0.9vw, 0.85rem)',
                        color: '#ff6f00',
                        fontWeight: 600,
                        marginBottom: '0',
                        lineHeight: '1.5',
                      }}
                    >
                      [NOTE]{' '}
                      {bookingId
                        ? `Please include your Booking ID ${bookingId} as reference so we can match your payment.`
                        : 'Your Booking ID will be generated after you confirm the booking. Please include it as reference when transferring.'}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Proof of Payment Upload Section - manual payments only */}
          {form.payment && !bookingId && !usesPayMongoGcash && !isPayLater && (
            <div
              style={{
                background: 'white',
                border: '2px solid #4caf50',
                borderRadius: '8px',
                padding: 'clamp(20px, 5vw, 30px)',
                marginBottom: '30px',
                marginLeft: '15px',
                marginRight: '15px',
              }}
            >
              <h3
                style={{
                  fontSize:
                    isModal || isMobile
                      ? 'clamp(0.9rem, 1.1vw, 1rem)'
                      : 'clamp(1rem, 1.2vw, 1.1rem)',
                  fontWeight: 800,
                  color: '#1a1a1a',
                  marginBottom: '20px',
                  paddingBottom: '12px',
                  borderBottom: '2px solid #4caf50',
                }}
              >
                ✓ Prepare Proof of Payment
              </h3>

              <p
                style={{
                  fontSize: isMobile
                    ? 'clamp(0.75rem, 0.95vw, 0.85rem)'
                    : 'clamp(0.9rem, 1vw, 0.95rem)',
                  color: '#555',
                  marginBottom: '20px',
                  lineHeight: '1.6',
                }}
              >
                After making the payment to the account above, you can upload a screenshot or
                receipt here. You'll need this proof to confirm your booking.
              </p>

              <div
                style={{
                  marginBottom: '20px',
                }}
              >
                <label
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    color: '#333',
                    marginBottom: '12px',
                    fontSize: isMobile
                      ? 'clamp(0.72rem, 0.88vw, 0.82rem)'
                      : 'clamp(0.85rem, 0.95vw, 0.95rem)',
                  }}
                >
                  Payment Receipt/Screenshot
                </label>
                <input
                  type="file"
                  name="paymentProof"
                  accept="image/*"
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '12px 15px',
                    border: '2px dashed #4caf50',
                    borderRadius: '8px',
                    fontSize: isMobile ? '0.8rem' : '0.95rem',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s ease',
                  }}
                />
                <p
                  style={{
                    fontSize: isMobile
                      ? 'clamp(0.65rem, 0.8vw, 0.72rem)'
                      : 'clamp(0.75rem, 0.85vw, 0.8rem)',
                    color: '#999',
                    marginTop: '8px',
                    marginBottom: '0',
                  }}
                >
                  JPG, PNG accepted. Max size: 5MB
                </p>
              </div>

              {paymentProofPreview && (
                <div
                  style={{
                    marginBottom: '20px',
                    textAlign: 'center',
                    padding: '15px',
                    background: '#f9f9f9',
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                  }}
                >
                  <p
                    style={{
                      fontSize: isMobile ? '0.7rem' : '0.85rem',
                      color: '#666',
                      marginBottom: '12px',
                      fontWeight: 600,
                    }}
                  >
                    Receipt Preview
                  </p>
                  <img
                    src={paymentProofPreview}
                    alt="Payment Proof"
                    style={{ maxWidth: '100%', maxHeight: '250px', borderRadius: '6px' }}
                  />
                </div>
              )}
            </div>
          )}

          {isPayLater && (
            <div
              role="note"
              style={{
                marginBottom: '16px',
                padding: '14px 16px',
                background: '#fff3e0',
                border: '1px solid #ffb74d',
                borderLeft: '5px solid #f57c00',
                borderRadius: '8px',
                color: '#7a3e00',
                fontSize: isMobile ? '0.78rem' : '0.92rem',
                lineHeight: 1.6,
              }}
            >
              <strong>Reminder:</strong> Please arrive at the venue at least 30 minutes before the
              ferry's departure. If you do not arrive by the 30-minute cutoff, your booking will be
              canceled and passengers already at the venue will be given priority.
            </div>
          )}

          {/* Confirm Booking Button - at dulo, after payment instructions */}
          {!bookingId && (
            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
                marginBottom: '30px',
                padding: '0 15px',
                flexWrap: 'wrap',
              }}
            >
              <button
                onClick={() => (isModal ? onCloseModal() : navigate(-1))}
                style={{
                  padding: 'clamp(10px, 2vw, 12px) clamp(16px, 3vw, 24px)',
                  background: '#f5f5f5',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: 'clamp(0.8rem, 0.95vw, 0.95rem)',
                  cursor: 'pointer',
                  color: '#333',
                  transition: 'all 0.3s ease',
                  letterSpacing: '0.3px',
                  flex: '1 1 auto',
                  minWidth: '80px',
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#e8e8e8';
                  e.target.style.borderColor = '#999';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = '#f5f5f5';
                  e.target.style.borderColor = '#ddd';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBooking}
                disabled={loading || !form.payment}
                style={{
                  padding: 'clamp(10px, 2vw, 12px) clamp(16px, 3vw, 24px)',
                  background: loading || !form.payment ? '#ccc' : '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: 'clamp(0.8rem, 0.95vw, 0.95rem)',
                  cursor: loading || !form.payment ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease',
                  letterSpacing: '0.3px',
                  flex: '1 1 auto',
                  minWidth: '130px',
                }}
                onMouseEnter={(e) => {
                  if (!loading && form.payment) {
                    e.target.style.background = '#45a049';
                    e.target.style.boxShadow = '0 4px 12px rgba(76,175,80,0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading && form.payment) {
                    e.target.style.background = '#4caf50';
                    e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                  }
                }}
              >
                {loading
                  ? 'Processing...'
                  : isPayLater
                  ? 'Confirm Booking (Pay Later)'
                  : usesPayMongoGcash
                  ? 'Confirm & Show QR Code'
                  : 'Confirm Booking'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BookingDetails;
