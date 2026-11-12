import { useEffect, useState } from 'react';
import { db } from '../../firebase';
import {
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  query,
  where,
  writeBatch,
  onSnapshot,
} from 'firebase/firestore';
import AdminLayout from './AdminLayout';
import { QRCodeCanvas } from 'qrcode.react';
import { notifyPaymentSuccess, notifyPassengerRefundStatus } from '../../utils/notificationHelper';
import { useAuthReloadKey, useAuthUser } from '../../hooks/useAuthUser';
import { getStaffAccount } from '../../utils/staffAccount';
import { checkPaymentExpiry } from '../../utils/paymentExpiryCheck';

const getPaymentMethodLabel = (method, paymentMode) => {
  if (String(paymentMode || '').toLowerCase().replace(/[\s_-]/g, '') === 'paylater') {
    return 'Pay Later';
  }

  const normalizedMethod = String(method || '').trim().toLowerCase().replace(/[\s_-]/g, '');
  if (normalizedMethod === 'cash' || normalizedMethod.includes('gcash')) return 'GCash';
  if (normalizedMethod === 'paylater') return 'Pay Later';
  if (normalizedMethod === 'paymaya') return 'PayMaya';
  return method || 'Unknown';
};

function PaymentManagement() {
  const [adminData, setAdminData] = useState(null);
  const [payments, setPayments] = useState([]);
  const [refundRequests, setRefundRequests] = useState([]);
  const [proofModal, setProofModal] = useState({
    isOpen: false,
    paymentId: null,
    proofImage: null,
  });
  const [qrModal, setQrModal] = useState({ isOpen: false, paymentId: null, bookingId: null });
  const [currentPaymentPage, setCurrentPaymentPage] = useState(1);
  const [transactionDate, setTransactionDate] = useState('');
  const [transactionRoute, setTransactionRoute] = useState('all');
  const [transactionStatus, setTransactionStatus] = useState('all');
  const [searchedTransactionDate, setSearchedTransactionDate] = useState('');
  const [searchedTransactionRoute, setSearchedTransactionRoute] = useState('all');
  const [searchedTransactionStatus, setSearchedTransactionStatus] = useState('all');
  const [transactionNameSearch, setTransactionNameSearch] = useState('');
  const [routeOptions, setRouteOptions] = useState([]);
  const [isMobile, setIsMobile] = useState(false);
  const { user, authReady } = useAuthUser();
  const reloadKey = useAuthReloadKey();

  // Pagination logic
  const itemsPerPage = 10;

  const matchesCustomerName = (payment, searchTerm) =>
    !searchTerm.trim() ||
    String(payment.customerName || payment.passengerName || '')
      .toLowerCase()
      .includes(searchTerm.trim().toLowerCase());
  const transactionPayments = payments.filter(
    (payment) => {
      if (!matchesCustomerName(payment, transactionNameSearch)) {
        return false;
      }
      if (
        searchedTransactionRoute !== 'all' &&
        (payment.routeDirection || payment.route) !== searchedTransactionRoute
      ) {
        return false;
      }
      if (searchedTransactionStatus !== 'all') {
        const status = payment.status === 'completed' ? 'confirmed' : payment.status || 'pending';
        if (status !== searchedTransactionStatus) return false;
      }
      if (!searchedTransactionDate) return true;

      const rawDate = payment.createdAt?.toDate?.() || payment.createdAt;
      const createdDate = rawDate ? new Date(rawDate) : null;
      if (!createdDate || Number.isNaN(createdDate.getTime())) return false;

      const dateKey = [
        createdDate.getFullYear(),
        String(createdDate.getMonth() + 1).padStart(2, '0'),
        String(createdDate.getDate()).padStart(2, '0'),
      ].join('-');
      return dateKey === searchedTransactionDate;
    }
  );
  const totalPaymentPages = Math.ceil(transactionPayments.length / itemsPerPage);
  const startIndex = (currentPaymentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPayments = transactionPayments.slice(startIndex, endIndex);
  const getPaymentStatusLabel = (payment) => {
    if (payment.paymongoStatus === 'paid' && payment.status === 'pending') {
      return 'Paid - Awaiting Port Confirmation';
    }
    const { status } = payment;
    if (status === 'completed') return 'confirmed';
    return status || 'pending';
  };

  // Handle window resize for responsive design
  useEffect(() => {
    // Set initial value
    setIsMobile(window.innerWidth <= 768);

    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!authReady) return;

    let isCurrent = true;
    let unsubscribePayments;
    let paymentExpiryInterval;
    let latestPaymentDocs = [];
    const expiryChecksInProgress = new Set();

    const checkExpiredPayments = () => {
      latestPaymentDocs.forEach((paymentDoc) => {
        const payment = paymentDoc.data();
        const expiryValue = payment.paymentExpiresAt;
        const expiresAt = expiryValue?.toDate?.() || (expiryValue ? new Date(expiryValue) : null);

        if (
          payment.status !== 'pending' ||
          payment.paymongoStatus === 'paid' ||
          !expiresAt ||
          Number.isNaN(expiresAt.getTime()) ||
          expiresAt.getTime() > Date.now() ||
          expiryChecksInProgress.has(paymentDoc.id)
        ) {
          return;
        }

        expiryChecksInProgress.add(paymentDoc.id);
        checkPaymentExpiry(paymentDoc.id)
          .catch((error) => {
            console.error(`Unable to expire payment ${paymentDoc.id}:`, error);
          })
          .finally(() => {
            expiryChecksInProgress.delete(paymentDoc.id);
          });
      });
    };

    const fetchAdminData = async () => {
      if (!user) {
        setAdminData(null);
        setPayments([]);
        setRefundRequests([]);
        setRouteOptions([]);
        return;
      }

      try {
          console.log('Current user:', user.uid);

          // Fetch the assigned boat for either an admin or Port Staff account.
          const account = await getStaffAccount(user.uid);
          if (account) {
            console.log('Staff account data found:', account.data);
            setAdminData(account.data);

            // Fetch payments for this boat
            const boatName = account.data.assignedBoat;
            if (!boatName) {
              setPayments([]);
              setRefundRequests([]);
              setRouteOptions([]);
              console.warn('Staff account has no assigned boat; payment data was not loaded.');
              return;
            }
            const bookingsSnap = await getDocs(
              query(collection(db, 'bookings'), where('boat', '==', boatName))
            );
            if (!isCurrent) return;

            const bookingsById = new Map(
              bookingsSnap.docs.map((bookingDoc) => [bookingDoc.id, bookingDoc.data()])
            );
            const bookingRoutes = bookingsSnap.docs
              .map((bookingDoc) => bookingDoc.data().routeDirection || bookingDoc.data().route)
              .filter(Boolean);
            setRouteOptions(
              [...new Set([...(account.data.availableRoutes || []), ...bookingRoutes])].sort()
            );
            unsubscribePayments = onSnapshot(
              query(collection(db, 'payments'), where('boat', '==', boatName)),
              (paymentsSnap) => {
                if (!isCurrent) return;

                latestPaymentDocs = paymentsSnap.docs;
                const paymentsList = paymentsSnap.docs
                  .map((paymentDoc) => {
                    const payment = paymentDoc.data();
                    const booking = bookingsById.get(payment.bookingId);
                    const paymentMode = payment.paymentMode || booking?.paymentMode;
                    return {
                      id: paymentDoc.id,
                      ...payment,
                      method: getPaymentMethodLabel(
                        payment.method || booking?.payment,
                        paymentMode
                      ),
                      paymentMode,
                      customerName:
                        payment.customerName ||
                        booking?.customerName ||
                        booking?.bookedByName ||
                        '',
                      routeDirection:
                        payment.routeDirection ||
                        booking?.routeDirection ||
                        booking?.route ||
                        payment.route ||
                        '',
                    };
                  })
                  .sort((a, b) => b.createdAt - a.createdAt);
                setPayments(paymentsList);
                console.log('Payments found:', paymentsList.length);
                checkExpiredPayments();
              },
              (error) => {
                console.error('Error listening for payment updates:', error);
              }
            );
            paymentExpiryInterval = setInterval(checkExpiredPayments, 15000);

            const refundsQuery = query(
              collection(db, 'refund_requests'),
              where('boat', '==', boatName)
            );
            const refundsSnap = await getDocs(refundsQuery);
            const refundsList = refundsSnap.docs
              .map((refundDoc) => ({ id: refundDoc.id, ...refundDoc.data() }))
              .sort((a, b) => {
                const aTime = a.createdAt?.toDate?.() || a.createdAt || 0;
                const bTime = b.createdAt?.toDate?.() || b.createdAt || 0;
                return bTime - aTime;
              });
            setRefundRequests(refundsList);
          } else {
            console.warn('⚠️ No admin data found for user:', user.uid);
          }

      } catch (error) {
        console.error('Error fetching data:', error.code, error.message);
        alert('Error loading payment data:\n' + error.message);
      }
    };
    fetchAdminData();

    return () => {
      isCurrent = false;
      clearInterval(paymentExpiryInterval);
      unsubscribePayments?.();
    };
  }, [authReady, user, reloadKey]);

  const handleConfirmPayment = async (paymentId) => {
    try {
      // Find the payment record to get booking ID
      const payment = payments.find((p) => p.id === paymentId);
      if (!payment) {
        alert('Payment record not found');
        return;
      }

      const paymentRef = doc(db, 'payments', paymentId);
      if (!payment.bookingId) {
        alert('This payment is not linked to a booking.');
        return;
      }
      const bookingRef = doc(db, 'bookings', payment.bookingId);
      const batch = writeBatch(db);
      batch.update(paymentRef, { status: 'completed' });
      batch.update(bookingRef, { status: 'confirmed' });
      await batch.commit();

      const bookingSnap = await getDoc(bookingRef);
      if (bookingSnap.exists()) {
        await notifyPaymentSuccess({
          paymentId,
          bookingId: payment.bookingId,
          notifyAdmin: false,
        }).catch((error) => console.warn('Payment success notification failed:', error));
      }

      // Update local state
      setPayments(payments.map((p) => (p.id === paymentId ? { ...p, status: 'completed' } : p)));
      alert('Payment confirmed successfully! Booking is now confirmed.');
    } catch (error) {
      console.error('Error confirming payment:', error);
      alert('Error confirming payment: ' + error.message);
    }
  };

  const handleCancelBooking = async (paymentId) => {
    if (window.confirm('Cancel this booking because payment was not received? The seat will be released.')) {
      try {
        const payment = payments.find((p) => p.id === paymentId);
        if (!payment?.bookingId) {
          alert('This payment is not linked to a booking.');
          return;
        }
        const paymentRef = doc(db, 'payments', paymentId);
        const batch = writeBatch(db);
        batch.update(paymentRef, { status: 'cancelled' });
        batch.update(doc(db, 'bookings', payment.bookingId), { status: 'cancelled' });
        await batch.commit();

        setPayments(payments.map((p) => (p.id === paymentId ? { ...p, status: 'cancelled' } : p)));
        alert('Booking cancelled. Its seat is now available again.');
      } catch (error) {
        console.error('Error cancelling booking:', error);
        alert('Error cancelling booking: ' + error.message);
      }
    }
  };

  const handleRefundDecision = async (refundId, decision) => {
    const refund = refundRequests.find((item) => item.id === refundId);
    if (!refund) return;

    const note =
      decision === 'approved'
        ? window.prompt('Optional note for the passenger (e.g. refund reference):', '') || ''
        : window.prompt('Optional reason for declining the refund:', '') || '';

    try {
      await updateDoc(doc(db, 'refund_requests', refundId), {
        status: decision,
        adminNote: note,
        processedAt: new Date(),
        processedBy: adminData?.email || user?.email || 'admin',
      });

      await addDoc(collection(db, 'notifications'), {
        userId: refund.userId,
        type: 'refund_status',
        title: decision === 'approved' ? 'Refund Approved' : 'Refund Declined',
        message:
          decision === 'approved'
            ? `Your refund request for ${refund.tripName || 'your trip'} was approved.`
            : `Your refund request for ${refund.tripName || 'your trip'} was declined.`,
        recipientType: 'user',
        isRead: false,
        createdAt: new Date(),
      });

      notifyPassengerRefundStatus({
        refund: { ...refund, adminNote: note },
        status: decision,
        userEmail: refund.userEmail,
        customerName: refund.userEmail,
      }).catch((error) => console.warn('Refund status notification failed:', error));

      setRefundRequests((current) =>
        current.map((item) =>
          item.id === refundId
            ? { ...item, status: decision, adminNote: note, processedAt: new Date() }
            : item
        )
      );
      alert(`Refund ${decision === 'approved' ? 'approved' : 'declined'} successfully.`);
    } catch (error) {
      console.error('Error processing refund:', error);
      alert('Error processing refund: ' + error.message);
    }
  };

  const handleMarkRefunded = async (refundId) => {
    const refund = refundRequests.find((item) => item.id === refundId);
    if (!refund || refund.status !== 'approved') return;
    if (!window.confirm('Confirm that you have manually sent this refund to the passenger?')) {
      return;
    }

    const note =
      window.prompt('Optional refund reference or note for the passenger:', '') || '';

    try {
      const processedAt = new Date();
      await updateDoc(doc(db, 'refund_requests', refundId), {
        status: 'refunded',
        refundNote: note,
        refundedAt: processedAt,
        processedBy: adminData?.email || user?.email || 'admin',
      });

      setRefundRequests((current) =>
        current.map((item) =>
          item.id === refundId
            ? { ...item, status: 'refunded', refundNote: note, refundedAt: processedAt }
            : item
        )
      );

      let passengerNotified = true;
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: refund.userId,
          type: 'refund_status',
          title: 'Refund Sent',
          message: `Your refund for ${refund.tripName || 'your trip'} has been marked as sent.`,
          recipientType: 'user',
          isRead: false,
          createdAt: processedAt,
        });
      } catch (notificationError) {
        passengerNotified = false;
        console.error('Refund completion app notification failed:', notificationError);
      }

      try {
        const emailResult = await notifyPassengerRefundStatus({
          refund: { ...refund, refundNote: note },
          status: 'refunded',
          userEmail: refund.userEmail,
          customerName: refund.userEmail,
        });
        if (
          emailResult?.ok === false ||
          emailResult?.result?.email?.error ||
          emailResult?.result?.email?.skipped
        ) {
          passengerNotified = false;
          console.warn('Refund completion email failed:', emailResult.error || emailResult.result);
        }
      } catch (notificationError) {
        passengerNotified = false;
        console.error('Refund completion email failed:', notificationError);
      }

      alert(
        passengerNotified
          ? 'Refund marked as sent. The passenger has been notified.'
          : 'Refund marked as sent, but one or more passenger notifications could not be sent.'
      );
    } catch (error) {
      console.error('Error marking refund as sent:', error);
      alert('Could not mark the refund as sent: ' + error.message);
    }
  };

  return (
    <AdminLayout active="payment">
      {refundRequests.some((refund) => ['pending', 'approved'].includes(refund.status)) && (
        <div
          style={{
            background: '#fff8e1',
            border: '1px solid #ffe082',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '20px',
          }}
        >
          <h3 style={{ margin: '0 0 12px', color: '#5d4037', fontSize: '1.05rem' }}>
            Refund Requests
          </h3>
          {refundRequests
            .filter((refund) => ['pending', 'approved'].includes(refund.status))
            .map((refund) => (
              <div
                key={refund.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '12px',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderTop: '1px solid #ffe082',
                }}
              >
                <div style={{ minWidth: '220px' }}>
                  <div style={{ fontWeight: 700 }}>{refund.tripName || 'Trip refund'}</div>
                  <div style={{ color: '#666', fontSize: '0.9rem' }}>
                    {refund.userEmail} · ₱{Number(refund.amount || 0).toFixed(2)}
                  </div>
                  <div style={{ color: '#666', fontSize: '0.85rem' }}>{refund.reason}</div>
                  <div style={{ color: '#5d4037', fontSize: '0.85rem', fontWeight: 700 }}>
                    Status: {refund.status === 'approved' ? 'Approved — send refund manually' : 'Pending'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {refund.status === 'pending' ? (
                    <>
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => handleRefundDecision(refund.id, 'approved')}
                      >
                        Approve
                      </button>
                      <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => handleRefundDecision(refund.id, 'rejected')}
                      >
                        Decline
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleMarkRefunded(refund.id)}
                    >
                      Mark as Refunded
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
      <h2
        style={{
          fontWeight: '800',
          fontSize: isMobile ? '1.1rem' : '1.3rem',
          color: '#1a1a1a',
          marginBottom: isMobile ? '12px' : '25px',
          marginTop: '0',
          letterSpacing: '0.3px',
        }}
      >
        Payment Management
      </h2>

      {adminData && (
        <p
          style={{
            fontSize: isMobile ? '0.8rem' : '0.95rem',
            color: '#666',
            marginBottom: isMobile ? '18px' : '30px',
            fontWeight: '500',
            lineHeight: isMobile ? '1.4' : '1.5',
          }}
        >
          Payment transactions overview for <strong>{adminData.assignedBoat}</strong>
        </p>
      )}

      {/* Payment transaction search */}
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: isMobile ? '15px' : '25px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          border: '1px solid #e0e8f0',
          marginBottom: isMobile ? '18px' : '30px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <h3
          style={{
            fontSize: isMobile ? '0.85rem' : '1.05rem',
            fontWeight: 800,
            color: '#1e3a5f',
            margin: `0 0 ${isMobile ? '10px' : '15px'}`,
          }}
        >
          Search Payment Transactions by Customer, Date, Route & Status
        </h3>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSearchedTransactionDate(transactionDate);
            setSearchedTransactionRoute(transactionRoute);
            setSearchedTransactionStatus(transactionStatus);
            setCurrentPaymentPage(1);
          }}
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile
              ? 'minmax(0, 1fr)'
              : 'minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr) auto',
            gap: isMobile ? '10px' : '16px',
            alignItems: 'end',
            width: '100%',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <label
              htmlFor="payment-customer-search"
              style={{
                display: 'block',
                minHeight: isMobile ? '14px' : '17px',
                lineHeight: isMobile ? '14px' : '17px',
                marginBottom: isMobile ? '4px' : '8px',
                color: '#666',
                fontSize: isMobile ? '0.7rem' : '0.85rem',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              Search Customer Name
            </label>
            <input
              id="payment-customer-search"
              type="search"
              value={transactionNameSearch}
              onChange={(event) => {
                setTransactionNameSearch(event.target.value);
                setCurrentPaymentPage(1);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault();
              }}
              placeholder="Enter customer name..."
              style={{
                boxSizing: 'border-box',
                width: '100%',
                minWidth: 0,
                height: isMobile ? '32px' : '42px',
                padding: isMobile ? '6px 8px' : '10px 12px',
                border: '1px solid #d0d0d0',
                borderRadius: '6px',
                background: '#fff',
                color: '#333',
                fontSize: isMobile ? '0.8rem' : '1rem',
              }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <label
              htmlFor="payment-transaction-date"
              style={{
                display: 'block',
                minHeight: isMobile ? '14px' : '17px',
                lineHeight: isMobile ? '14px' : '17px',
                marginBottom: isMobile ? '4px' : '8px',
                color: '#666',
                fontSize: isMobile ? '0.7rem' : '0.85rem',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              Choose Date
            </label>
            <input
              id="payment-transaction-date"
              type="date"
              value={transactionDate}
              onChange={(event) => setTransactionDate(event.target.value)}
              style={{
                boxSizing: 'border-box',
                width: '100%',
                minWidth: 0,
                height: isMobile ? '32px' : '42px',
                padding: isMobile ? '6px 8px' : '10px 12px',
                border: '1px solid #d0d0d0',
                borderRadius: '6px',
                background: '#fff',
                color: '#555',
                fontSize: isMobile ? '0.8rem' : '1rem',
              }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <label
              htmlFor="payment-transaction-route"
              style={{
                display: 'block',
                minHeight: isMobile ? '14px' : '17px',
                lineHeight: isMobile ? '14px' : '17px',
                marginBottom: isMobile ? '4px' : '8px',
                color: '#666',
                fontSize: isMobile ? '0.7rem' : '0.85rem',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              Select Route
            </label>
            <select
              id="payment-transaction-route"
              value={transactionRoute}
              onChange={(event) => setTransactionRoute(event.target.value)}
              style={{
                boxSizing: 'border-box',
                width: '100%',
                minWidth: 0,
                height: isMobile ? '32px' : '42px',
                padding: isMobile ? '6px 8px' : '10px 12px',
                border: '1px solid #d0d0d0',
                borderRadius: '6px',
                background: '#fff',
                color: '#444',
                fontSize: isMobile ? '0.8rem' : '1rem',
              }}
            >
              <option value="all">All routes</option>
              {routeOptions.map((route) => (
                <option key={route} value={route}>
                  {route}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 0 }}>
            <label
              htmlFor="payment-transaction-status"
              style={{
                display: 'block',
                minHeight: isMobile ? '14px' : '17px',
                lineHeight: isMobile ? '14px' : '17px',
                marginBottom: isMobile ? '4px' : '8px',
                color: '#666',
                fontSize: isMobile ? '0.7rem' : '0.85rem',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              Select Status
            </label>
            <select
              id="payment-transaction-status"
              value={transactionStatus}
              onChange={(event) => setTransactionStatus(event.target.value)}
              style={{
                boxSizing: 'border-box',
                width: '100%',
                minWidth: 0,
                height: isMobile ? '32px' : '42px',
                padding: isMobile ? '6px 8px' : '10px 12px',
                border: '1px solid #d0d0d0',
                borderRadius: '6px',
                background: '#fff',
                color: '#444',
                fontSize: isMobile ? '0.8rem' : '1rem',
              }}
            >
              <option value="all">All statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div style={{
            display: 'flex',
            gap: '8px',
            width: isMobile ? '100%' : 'auto',
            alignSelf: 'end',
          }}>
            <button
              type="submit"
              style={{
                height: isMobile ? '32px' : '42px',
                padding: isMobile ? '6px 10px' : '10px 24px',
                border: 'none',
                borderRadius: '6px',
                background: '#2196f3',
                color: '#fff',
                fontSize: isMobile ? '0.7rem' : '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flex: isMobile ? 1 : 'initial',
                boxSizing: 'border-box',
              }}
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => {
                setTransactionNameSearch('');
                setTransactionDate('');
                setTransactionRoute('all');
                setTransactionStatus('all');
                setSearchedTransactionDate('');
                setSearchedTransactionRoute('all');
                setSearchedTransactionStatus('all');
                setCurrentPaymentPage(1);
              }}
              style={{
                height: isMobile ? '32px' : '42px',
                padding: isMobile ? '6px 10px' : '10px 20px',
                border: '1px solid #d0d0d0',
                borderRadius: '6px',
                background: '#fff',
                color: '#1e3a5f',
                fontSize: isMobile ? '0.7rem' : '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxSizing: 'border-box',
              }}
            >
              Clear
            </button>
          </div>
        </form>
      </div>

      {/* Transactions Table */}
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '30px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          border: '2px solid #e0e8f0',
        }}
      >
        <h2
          style={{
            fontSize: isMobile ? '1rem' : '1.2rem',
            fontWeight: 800,
            color: '#1a1a1a',
            marginBottom: isMobile ? '15px' : '25px',
          }}
        >
          Payment Transactions
        </h2>
        <div
          style={{
            overflowX: 'auto',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'linear-gradient(135deg, #2196f3 0%, #1976d2 100%)',
                  color: 'white',
                }}
              >
                <th
                  style={{
                    padding: isMobile ? '8px 6px' : '14px 12px',
                    textAlign: 'left',
                    fontWeight: 700,
                    fontSize: isMobile ? '0.7rem' : '0.9rem',
                  }}
                >
                  Passenger
                </th>
                <th
                  style={{
                    padding: isMobile ? '8px 6px' : '14px 12px',
                    textAlign: 'left',
                    fontWeight: 700,
                    fontSize: isMobile ? '0.7rem' : '0.9rem',
                  }}
                >
                  Trip
                </th>
                <th
                  style={{
                    padding: isMobile ? '8px 6px' : '14px 12px',
                    textAlign: 'left',
                    fontWeight: 700,
                    fontSize: isMobile ? '0.7rem' : '0.9rem',
                  }}
                >
                  Date & Time
                </th>
                <th
                  style={{
                    padding: isMobile ? '8px 6px' : '14px 12px',
                    textAlign: 'right',
                    fontWeight: 700,
                    fontSize: isMobile ? '0.7rem' : '0.9rem',
                  }}
                >
                  Amount
                </th>
                <th
                  style={{
                    padding: isMobile ? '8px 6px' : '14px 12px',
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: isMobile ? '0.7rem' : '0.9rem',
                  }}
                >
                  Method
                </th>
                <th
                  style={{
                    padding: isMobile ? '8px 6px' : '14px 12px',
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: isMobile ? '0.7rem' : '0.9rem',
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    padding: isMobile ? '8px 6px' : '14px 12px',
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: isMobile ? '0.7rem' : '0.9rem',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {transactionPayments.length > 0 ? (
                paginatedPayments.map((payment, index) => {
                  const createdDate = new Date(payment.createdAt?.toDate?.() || payment.createdAt);
                  const dateStr = createdDate.toLocaleDateString();
                  const timeStr = createdDate.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr
                      key={payment.id}
                      style={{
                        borderBottom: '1px solid #e0e0e0',
                        background: index % 2 === 0 ? 'white' : '#f9f9f9',
                        transition: 'all 0.3s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f0f7fb';
                        e.currentTarget.style.boxShadow = 'inset 0 0 6px rgba(33,150,243,0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = index % 2 === 0 ? 'white' : '#f9f9f9';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <td
                        style={{
                          padding: isMobile ? '8px 6px' : '12px',
                          color: '#333',
                          fontSize: isMobile ? '0.7rem' : '0.9rem',
                          fontWeight: 600,
                        }}
                      >
                        {payment.customerName}
                      </td>
                      <td
                        style={{
                          padding: isMobile ? '8px 6px' : '12px',
                          color: '#666',
                          fontSize: isMobile ? '0.7rem' : '0.9rem',
                        }}
                      >
                        {payment.trip}
                      </td>
                      <td
                        style={{
                          padding: isMobile ? '8px 6px' : '12px',
                          color: '#666',
                          fontSize: isMobile ? '0.7rem' : '0.85rem',
                        }}
                      >
                        {dateStr} {timeStr}
                      </td>
                      <td
                        style={{
                          padding: isMobile ? '8px 6px' : '12px',
                          color: '#333',
                          fontSize: isMobile ? '0.75rem' : '0.95rem',
                          fontWeight: 700,
                          textAlign: 'right',
                        }}
                      >
                        ₱{Number(payment.amount).toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: isMobile ? '8px 6px' : '12px',
                          textAlign: 'center',
                        }}
                      >
                        <span
                          style={{
                            background:
                              payment.method === 'GCash'
                                ? '#00D4FF'
                                : payment.method === 'PayMaya'
                                ? '#1F3A93'
                                : '#FF6B35',
                            color: 'white',
                            padding: isMobile ? '3px 5px' : '4px 8px',
                            borderRadius: '4px',
                            fontSize: isMobile ? '0.65rem' : '0.75rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}
                        >
                          {payment.method}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: isMobile ? '8px 6px' : '12px',
                          textAlign: 'center',
                        }}
                      >
                        <span
                          style={{
                            background:
                              payment.status === 'pending'
                                ? payment.paymongoStatus === 'paid'
                                  ? '#ef6c00'
                                  : '#ff9800'
                                : payment.status === 'completed'
                                ? '#4caf50'
                                : '#f44336',
                            color: 'white',
                            padding: isMobile ? '3px 6px' : '4px 10px',
                            borderRadius: '4px',
                            fontSize: isMobile ? '0.65rem' : '0.75rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}
                        >
                          {getPaymentStatusLabel(payment)}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: isMobile ? '8px 6px' : '12px',
                          textAlign: 'center',
                        }}
                      >
                        {payment.status === 'pending' ? (
                          <div
                            style={{
                              display: 'flex',
                              gap: isMobile ? '3px' : '6px',
                              justifyContent: 'center',
                              flexWrap: 'wrap',
                            }}
                          >
                            {payment.proofOfPaymentBase64 && (
                              <button
                                onClick={() =>
                                  setProofModal({
                                    isOpen: true,
                                    paymentId: payment.id,
                                    proofImage: payment.proofOfPaymentBase64,
                                  })
                                }
                                style={{
                                  background: '#9c27b0',
                                  color: 'white',
                                  border: 'none',
                                  padding: isMobile ? '4px 5px' : '6px 10px',
                                  borderRadius: '4px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  fontSize: isMobile ? '0.65rem' : '0.7rem',
                                  transition: 'all 0.3s ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.target.style.background = '#7b1fa2';
                                }}
                                onMouseLeave={(e) => {
                                  e.target.style.background = '#9c27b0';
                                }}
                              >
                                👁 Proof
                              </button>
                            )}
                            <button
                              onClick={() => handleConfirmPayment(payment.id)}
                              style={{
                                background: '#4caf50',
                                color: 'white',
                                border: 'none',
                                padding: isMobile ? '4px 5px' : '6px 10px',
                                borderRadius: '4px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                fontSize: isMobile ? '0.65rem' : '0.7rem',
                                transition: 'all 0.3s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.background = '#45a049';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.background = '#4caf50';
                              }}
                            >
                              {payment.paymongoStatus === 'paid' ? 'Confirm Booking' : 'Confirm Paid'}
                            </button>
                            <button
                              onClick={() => handleCancelBooking(payment.id)}
                              style={{
                                background: '#f44336',
                                color: 'white',
                                border: 'none',
                                padding: isMobile ? '4px 5px' : '6px 10px',
                                borderRadius: '4px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                fontSize: isMobile ? '0.65rem' : '0.7rem',
                                transition: 'all 0.3s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.background = '#d32f2f';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.background = '#f44336';
                              }}
                            >
                              Cancel Booking
                            </button>
                          </div>
                        ) : payment.status === 'completed' ? (
                          <div
                            style={{
                              display: 'flex',
                              gap: isMobile ? '3px' : '6px',
                              justifyContent: 'center',
                              flexWrap: 'wrap',
                            }}
                          >
                            {payment.proofOfPaymentBase64 && (
                              <button
                                onClick={() =>
                                  setProofModal({
                                    isOpen: true,
                                    paymentId: payment.id,
                                    proofImage: payment.proofOfPaymentBase64,
                                  })
                                }
                                style={{
                                  background: '#9c27b0',
                                  color: 'white',
                                  border: 'none',
                                  padding: isMobile ? '4px 5px' : '6px 10px',
                                  borderRadius: '4px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  fontSize: isMobile ? '0.65rem' : '0.7rem',
                                  transition: 'all 0.3s ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.target.style.background = '#7b1fa2';
                                }}
                                onMouseLeave={(e) => {
                                  e.target.style.background = '#9c27b0';
                                }}
                              >
                                👁 Proof
                              </button>
                            )}
                            <button
                              onClick={() =>
                                setQrModal({
                                  isOpen: true,
                                  paymentId: payment.id,
                                  bookingId: payment.bookingId,
                                })
                              }
                              style={{
                                background: '#2196f3',
                                color: 'white',
                                border: 'none',
                                padding: isMobile ? '4px 5px' : '6px 10px',
                                borderRadius: '4px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                fontSize: isMobile ? '0.65rem' : '0.7rem',
                                transition: 'all 0.3s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.background = '#1976d2';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.background = '#2196f3';
                              }}
                            >
                              ⊡ View QR
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: '#999', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan="7"
                    style={{
                      padding: '50px 20px',
                      textAlign: 'center',
                      color: '#999',
                      fontSize: '0.95rem',
                    }}
                  >
                    {transactionNameSearch ||
                    searchedTransactionDate ||
                    searchedTransactionRoute !== 'all' ||
                    searchedTransactionStatus !== 'all'
                      ? 'No payment transactions match your search filters.'
                      : `No payment data available yet for ${
                          adminData ? adminData.assignedBoat : 'this boat'
                        }.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {transactionPayments.length > itemsPerPage && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '20px',
              paddingTop: '20px',
              borderTop: '1px solid #e0e0e0',
            }}
          >
            <button
              onClick={() => setCurrentPaymentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPaymentPage === 1}
              style={{
                background: currentPaymentPage === 1 ? '#ccc' : '#2196f3',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '6px',
                fontWeight: 700,
                cursor: currentPaymentPage === 1 ? 'not-allowed' : 'pointer',
                fontSize: '0.9rem',
                transition: 'all 0.3s ease',
                opacity: currentPaymentPage === 1 ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (currentPaymentPage !== 1) {
                  e.currentTarget.style.background = '#1976d2';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(33,150,243,0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (currentPaymentPage !== 1) {
                  e.currentTarget.style.background = '#2196f3';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              ← Previous
            </button>

            <span
              style={{
                fontSize: '0.95rem',
                fontWeight: 600,
                color: '#666',
              }}
            >
              Page {currentPaymentPage} of {totalPaymentPages}
            </span>

            <button
              onClick={() => setCurrentPaymentPage((prev) => Math.min(totalPaymentPages, prev + 1))}
              disabled={currentPaymentPage === totalPaymentPages}
              style={{
                background: currentPaymentPage === totalPaymentPages ? '#ccc' : '#2196f3',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '6px',
                fontWeight: 700,
                cursor: currentPaymentPage === totalPaymentPages ? 'not-allowed' : 'pointer',
                fontSize: '0.9rem',
                transition: 'all 0.3s ease',
                opacity: currentPaymentPage === totalPaymentPages ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (currentPaymentPage !== totalPaymentPages) {
                  e.currentTarget.style.background = '#1976d2';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(33,150,243,0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (currentPaymentPage !== totalPaymentPages) {
                  e.currentTarget.style.background = '#2196f3';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {qrModal.isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: isMobile ? '15px' : '30px',
              maxWidth: '500px',
              width: '100%',
              position: 'relative',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
              maxHeight: '90vh',
              overflowY: 'auto',
              textAlign: 'center',
            }}
          >
            {/* Close Button */}
            <button
              onClick={() => setQrModal({ isOpen: false, paymentId: null, bookingId: null })}
              style={{
                position: 'absolute',
                top: isMobile ? '8px' : '12px',
                right: isMobile ? '8px' : '12px',
                background: 'none',
                border: 'none',
                fontSize: isMobile ? '1rem' : '1.5rem',
                cursor: 'pointer',
                color: '#666',
                padding: '0',
                width: isMobile ? '24px' : '32px',
                height: isMobile ? '24px' : '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => {
                e.target.style.color = '#333';
              }}
              onMouseLeave={(e) => {
                e.target.style.color = '#666';
              }}
            >
              ✕
            </button>

            <h3
              style={{
                fontSize: isMobile ? '1rem' : '1.3rem',
                fontWeight: 800,
                color: '#1a1a1a',
                marginBottom: isMobile ? '12px' : '20px',
                paddingRight: isMobile ? '20px' : '30px',
              }}
            >
              Booking QR Code
            </h3>

            {/* QR Code Display */}
            {qrModal.bookingId && (
              <div
                style={{
                  background: '#f5f5f5',
                  padding: isMobile ? '12px' : '20px',
                  borderRadius: '8px',
                  marginBottom: isMobile ? '12px' : '20px',
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <QRCodeCanvas
                  value={qrModal.bookingId}
                  size={isMobile ? 150 : 250}
                  level="H"
                />
              </div>
            )}

            {/* Booking ID */}
            {qrModal.bookingId && (
              <div
                style={{
                  background: '#f9f9f9',
                  padding: isMobile ? '8px' : '12px',
                  borderRadius: '8px',
                  marginBottom: isMobile ? '12px' : '20px',
                  border: '1px solid #e0e0e0',
                }}
              >
                <p
                  style={{
                    margin: '0 0 4px 0',
                    fontSize: isMobile ? '0.7rem' : '0.8rem',
                    color: '#999',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                  }}
                >
                  Booking ID
                </p>
                <p
                  style={{
                    margin: '0',
                    fontSize: isMobile ? '0.9rem' : '1rem',
                    color: '#333',
                    fontWeight: '700',
                    fontFamily: 'monospace',
                  }}
                >
                  {qrModal.bookingId}
                </p>
              </div>
            )}

            {/* Close Button */}
            <button
              onClick={() => setQrModal({ isOpen: false, paymentId: null, bookingId: null })}
              style={{
                width: '100%',
                background: '#2196f3',
                color: 'white',
                border: 'none',
                padding: isMobile ? '8px 12px' : '12px',
                borderRadius: '6px',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: isMobile ? '0.8rem' : '0.95rem',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#1976d2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#2196f3';
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
      {/* Proof of Payment Modal */}
      {proofModal.isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: isMobile ? '15px' : '30px',
              maxWidth: '600px',
              width: '100%',
              position: 'relative',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            {/* Close Button */}
            <button
              onClick={() => setProofModal({ isOpen: false, paymentId: null, proofImage: null })}
              style={{
                position: 'absolute',
                top: isMobile ? '8px' : '12px',
                right: isMobile ? '8px' : '12px',
                background: 'none',
                border: 'none',
                fontSize: isMobile ? '1rem' : '1.5rem',
                cursor: 'pointer',
                color: '#666',
                padding: '0',
                width: isMobile ? '24px' : '32px',
                height: isMobile ? '24px' : '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => {
                e.target.style.color = '#333';
              }}
              onMouseLeave={(e) => {
                e.target.style.color = '#666';
              }}
            >
              ✕
            </button>

            <h3
              style={{
                fontSize: isMobile ? '1rem' : '1.3rem',
                fontWeight: 800,
                color: '#1a1a1a',
                marginBottom: isMobile ? '12px' : '20px',
                paddingRight: isMobile ? '20px' : '30px',
              }}
            >
              Proof of Payment
            </h3>

            {/* Image Display */}
            {proofModal.proofImage && (
              <img
                src={proofModal.proofImage}
                alt="Payment proof"
                style={{
                  width: '100%',
                  maxHeight: isMobile ? '250px' : '400px',
                  objectFit: 'contain',
                  borderRadius: '8px',
                  border: '2px solid #e0e0e0',
                  marginBottom: isMobile ? '12px' : '20px',
                }}
              />
            )}

            {/* Close Button */}
            <button
              onClick={() => setProofModal({ isOpen: false, paymentId: null, proofImage: null })}
              style={{
                width: '100%',
                background: '#9c27b0',
                color: 'white',
                border: 'none',
                padding: isMobile ? '8px 12px' : '12px',
                borderRadius: '6px',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: isMobile ? '0.8rem' : '0.95rem',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#7b1fa2';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = '#9c27b0';
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

export default PaymentManagement;
