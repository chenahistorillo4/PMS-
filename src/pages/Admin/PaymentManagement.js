import { useEffect, useState } from 'react';
import { db } from '../../firebase';
import {
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import AdminLayout from './AdminLayout';
import { QRCodeCanvas } from 'qrcode.react';
import { notifyPaymentSuccess, notifyPassengerRefundStatus } from '../../utils/notificationHelper';
import { useAuthReloadKey, useAuthUser } from '../../hooks/useAuthUser';

function PaymentManagement() {
  const getEmptyAccountForm = () => ({
    accountName: '',
    accountType: '',
    accountNumber: '',
    accountHolder: '',
    isActive: true,
  });

  const [adminData, setAdminData] = useState(null);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [refundRequests, setRefundRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [proofModal, setProofModal] = useState({
    isOpen: false,
    paymentId: null,
    proofImage: null,
  });
  const [qrModal, setQrModal] = useState({ isOpen: false, paymentId: null, bookingId: null });
  const [newAccount, setNewAccount] = useState(getEmptyAccountForm());
  const [showForm, setShowForm] = useState(false);
  const [showManagePaymentAccounts, setShowManagePaymentAccounts] = useState(false);
  const [currentPaymentPage, setCurrentPaymentPage] = useState(1);
  const [showHistoryView, setShowHistoryView] = useState(false);
  const [currentHistoryPage, setCurrentHistoryPage] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const { user, authReady } = useAuthUser();
  const reloadKey = useAuthReloadKey();

  // Pagination logic
  const itemsPerPage = 10;

  // For transactions: exclude completed payments
  const transactionPayments = payments.filter((p) => p.status !== 'completed');
  const totalPaymentPages = Math.ceil(transactionPayments.length / itemsPerPage);
  const startIndex = (currentPaymentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPayments = transactionPayments.slice(startIndex, endIndex);

  // History logic - filter completed payments
  const completedPayments = payments.filter((p) => p.status === 'completed');
  const totalHistoryPages = Math.ceil(completedPayments.length / itemsPerPage);
  const historyStartIndex = (currentHistoryPage - 1) * itemsPerPage;
  const historyEndIndex = historyStartIndex + itemsPerPage;
  const paginatedHistory = completedPayments.slice(historyStartIndex, historyEndIndex);

  const getPaymentStatusLabel = (status) => {
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

    const fetchAdminData = async () => {
      if (!user) {
        setAdminData(null);
        setPayments([]);
        setRefundRequests([]);
        setPaymentAccounts([]);
        return;
      }

      try {
          console.log('Current user:', user.uid);

          // Fetch admin data
          const docRef = doc(db, 'admins', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            console.log('Admin data found:', docSnap.data());
            setAdminData(docSnap.data());

            // Fetch payments for this boat
            const boatName = docSnap.data().assignedBoat;
            const paymentsQuery = query(collection(db, 'payments'), where('boat', '==', boatName));
            const paymentsSnap = await getDocs(paymentsQuery);
            const paymentsList = paymentsSnap.docs
              .map((doc) => ({
                id: doc.id,
                ...doc.data(),
              }))
              .sort((a, b) => b.createdAt - a.createdAt);
            setPayments(paymentsList);
            console.log('Payments found:', paymentsList.length);

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

          // Fetch payment accounts
          console.log('Fetching payment accounts for adminId:', user.uid);
          const accountsQuery = query(
            collection(db, 'paymentAccounts'),
            where('adminId', '==', user.uid)
          );
          const accountsSnap = await getDocs(accountsQuery);
          console.log('Payment accounts found:', accountsSnap.docs.length);

          const accounts = accountsSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

          console.log('Accounts data:', accounts);
          setPaymentAccounts(accounts);
      } catch (error) {
        console.error('Error fetching data:', error.code, error.message);
        alert('Error loading payment accounts:\n' + error.message);
      }
    };
    fetchAdminData();
  }, [authReady, user, reloadKey]);

  const handleAddAccount = async (e) => {
    e.preventDefault();
    if (!newAccount.accountName || !newAccount.accountType || !newAccount.accountNumber) {
      alert('Please fill all required fields');
      return;
    }

    try {
      setLoading(true);
      console.log('Adding payment account:', newAccount);
      console.log('👤 Admin ID:', user.uid);

      const accountsRef = collection(db, 'paymentAccounts');
      const docRef = await addDoc(accountsRef, {
        adminId: user.uid,
        ...newAccount,
        createdAt: new Date(),
      });

      console.log('Account added successfully! ID:', docRef.id);

      // Refresh the list
      const accountsQuery = query(
        collection(db, 'paymentAccounts'),
        where('adminId', '==', user.uid)
      );
      const accountsSnap = await getDocs(accountsQuery);
      const accounts = accountsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      console.log('Updated accounts list:', accounts);
      setPaymentAccounts(accounts);

      // Reset form
      setNewAccount(getEmptyAccountForm());
      setShowForm(false);
      alert('Payment account added successfully!');
      setLoading(false);
    } catch (error) {
      console.error('❌ Error adding account:', error.code, error.message);
      alert('Error adding account: ' + error.message);
      setLoading(false);
    }
  };

  const handleToggleStatus = async (accountId, currentStatus) => {
    try {
      const accountRef = doc(db, 'paymentAccounts', accountId);
      await updateDoc(accountRef, {
        isActive: !currentStatus,
      });

      // Update local state
      setPaymentAccounts(
        paymentAccounts.map((acc) =>
          acc.id === accountId ? { ...acc, isActive: !currentStatus } : acc
        )
      );
    } catch (error) {
      console.error('Error updating account:', error);
      alert('Error updating account: ' + error.message);
    }
  };

  const handleEditAccount = async (accountId) => {
    const account = paymentAccounts.find((acc) => acc.id === accountId);
    if (account) {
      setNewAccount({
        accountName: account.accountName,
        accountType: account.accountType,
        accountNumber: account.accountNumber,
        accountHolder: account.accountHolder,
        isActive: account.isActive,
      });
      setShowForm(true);
      // Note: Edit functionality can be enhanced to update existing account
      console.log('Edit account:', account);
    }
  };

  const handleToggleForm = () => {
    if (showForm) {
      setShowForm(false);
      setNewAccount(getEmptyAccountForm());
      return;
    }

    setNewAccount(getEmptyAccountForm());
    setShowForm(true);
  };

  const handleDeleteAccount = async (accountId) => {
    if (window.confirm('Are you sure you want to delete this payment account?')) {
      try {
        await deleteDoc(doc(db, 'paymentAccounts', accountId));
        setPaymentAccounts(paymentAccounts.filter((acc) => acc.id !== accountId));
        alert('Payment account deleted successfully!');
      } catch (error) {
        console.error('Error deleting account:', error);
        alert('Error deleting account: ' + error.message);
      }
    }
  };

  const handleConfirmPayment = async (paymentId) => {
    try {
      // Find the payment record to get booking ID
      const payment = payments.find((p) => p.id === paymentId);
      if (!payment) {
        alert('Payment record not found');
        return;
      }

      // Update payment status to completed
      const paymentRef = doc(db, 'payments', paymentId);
      await updateDoc(paymentRef, { status: 'completed' });

      // Update corresponding booking status to confirmed
      const bookingRef = doc(db, 'bookings', payment.bookingId);
      await updateDoc(bookingRef, { status: 'confirmed' });

      const bookingSnap = await getDoc(bookingRef);
      if (bookingSnap.exists()) {
        notifyPaymentSuccess({
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

  const handleRejectPayment = async (paymentId) => {
    if (window.confirm('Are you sure you want to reject this payment?')) {
      try {
        const payment = payments.find((p) => p.id === paymentId);
        const paymentRef = doc(db, 'payments', paymentId);
        await updateDoc(paymentRef, { status: 'failed' });

        if (payment?.bookingId) {
          await updateDoc(doc(db, 'bookings', payment.bookingId), { status: 'cancelled' });
        }

        setPayments(payments.map((p) => (p.id === paymentId ? { ...p, status: 'failed' } : p)));
        alert('Payment rejected!');
      } catch (error) {
        console.error('Error rejecting payment:', error);
        alert('Error rejecting payment: ' + error.message);
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

  return (
    <AdminLayout active="payment">
      {refundRequests.filter((refund) => refund.status === 'pending').length > 0 && (
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
            Pending Refund Requests
          </h3>
          {refundRequests
            .filter((refund) => refund.status === 'pending')
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
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
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

      {/* View Manage Payment Accounts & History Buttons */}
      <div
        style={{
          marginBottom: isMobile ? '18px' : '30px',
          display: 'flex',
          gap: isMobile ? '8px' : '12px',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => setShowManagePaymentAccounts(!showManagePaymentAccounts)}
          style={{
            background: showManagePaymentAccounts ? '#f44336' : '#2196f3',
            color: 'white',
            border: 'none',
            padding: isMobile ? '10px 8px' : '10px 18px',
            borderRadius: '8px',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: isMobile ? '0.65rem' : '0.85rem',
            transition: 'all 0.3s ease',
            boxShadow: '0 2px 8px rgba(33,150,243,0.2)',
            flex: isMobile ? '1' : '0 1 auto',
            minWidth: isMobile ? '0' : '200px',
            whiteSpace: isMobile ? 'normal' : 'normal',
            lineHeight: isMobile ? '1.3' : '1.5',
            wordBreak: isMobile ? 'break-word' : 'normal',
            minHeight: isMobile ? '40px' : 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(33,150,243,0.35)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(33,150,243,0.2)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {showManagePaymentAccounts ? '✕ Hide' : ' View'} Manage Payment Accounts
        </button>

        <button
          onClick={() => setShowHistoryView(!showHistoryView)}
          style={{
            background: showHistoryView ? '#f44336' : '#4caf50',
            color: 'white',
            border: 'none',
            padding: isMobile ? '10px 8px' : '10px 18px',
            borderRadius: '8px',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: isMobile ? '0.65rem' : '0.85rem',
            transition: 'all 0.3s ease',
            boxShadow: '0 2px 8px rgba(76,175,80,0.2)',
            flex: isMobile ? '1' : '0 1 auto',
            minWidth: isMobile ? '0' : '150px',
            whiteSpace: isMobile ? 'normal' : 'normal',
            lineHeight: isMobile ? '1.3' : '1.5',
            wordBreak: isMobile ? 'break-word' : 'normal',
            minHeight: isMobile ? '40px' : 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(76,175,80,0.35)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(76,175,80,0.2)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {showHistoryView ? '✕ Hide' : ' View'} Payment History
        </button>
      </div>

      {/* Manage Payment Accounts Section - Conditionally Rendered */}
      {showManagePaymentAccounts && (
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '30px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            border: '2px solid #2196f3',
            marginBottom: '30px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: isMobile ? '18px' : '25px',
              gap: isMobile ? '12px' : '0',
              flexWrap: isMobile ? 'wrap' : 'nowrap',
            }}
          >
            <h2
              style={{
                fontSize: isMobile ? '1rem' : '1.2rem',
                fontWeight: 800,
                color: '#1a1a1a',
                marginBottom: '0',
                order: isMobile ? 1 : 0,
              }}
            >
              Manage Payment Accounts
            </h2>
            <button
              onClick={handleToggleForm}
              style={{
                background: showForm ? '#f44336' : '#4caf50',
                color: 'white',
                border: 'none',
                padding: isMobile ? '7px 10px' : '10px 20px',
                borderRadius: '8px',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: isMobile ? '0.7rem' : '0.9rem',
                transition: 'all 0.3s ease',
                order: isMobile ? 2 : 0,
                width: isMobile ? 'auto' : 'auto',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(76,175,80,0.3)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {showForm ? '✕ Cancel' : '+ Add Account'}
            </button>
          </div>

          {/* Add Account Form */}
          {showForm && (
            <div
              style={{
                background: '#f8f9fa',
                border: '2px solid #2196f3',
                borderRadius: '10px',
                padding: isMobile ? '15px' : '25px',
                marginBottom: '20px',
              }}
            >
              <h3
                style={{
                  fontSize: isMobile ? '0.95rem' : '1.1rem',
                  fontWeight: 800,
                  color: '#1a1a1a',
                  marginBottom: isMobile ? '15px' : '20px',
                }}
              >
                Add New Payment Account
              </h3>
              <form onSubmit={handleAddAccount}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: isMobile ? '12px' : '20px',
                    marginBottom: '20px',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: isMobile ? '0.8rem' : '0.9rem',
                        fontWeight: 700,
                        color: '#333',
                        marginBottom: isMobile ? '6px' : '8px',
                      }}
                    >
                      Account Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Main GCash, John's PayMaya"
                      value={newAccount.accountName}
                      onChange={(e) =>
                        setNewAccount({ ...newAccount, accountName: e.target.value })
                      }
                      style={{
                        width: '100%',
                        padding: isMobile ? '8px 10px' : '10px 12px',
                        border: '1px solid #ddd',
                        borderRadius: '8px',
                        fontSize: isMobile ? '0.85rem' : '0.9rem',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: isMobile ? '0.8rem' : '0.9rem',
                        fontWeight: 700,
                        color: '#333',
                        marginBottom: isMobile ? '6px' : '8px',
                      }}
                    >
                      Account Type *
                    </label>
                    <select
                      value={newAccount.accountType}
                      onChange={(e) =>
                        setNewAccount({ ...newAccount, accountType: e.target.value })
                      }
                      style={{
                        width: '100%',
                        padding: isMobile ? '8px 10px' : '10px 12px',
                        border: '1px solid #ddd',
                        borderRadius: '8px',
                        fontSize: isMobile ? '0.85rem' : '0.9rem',
                        fontFamily: 'inherit',
                      }}
                    >
                      <option
                        value=""
                        disabled
                      >
                        Select account type
                      </option>
                      <option value="gcash">GCash</option>
                      <option value="paymaya">PayMaya</option>
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: isMobile ? '0.8rem' : '0.9rem',
                        fontWeight: 700,
                        color: '#333',
                        marginBottom: isMobile ? '6px' : '8px',
                      }}
                    >
                      Account Number/ID *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., 09123456789 or Account #"
                      value={newAccount.accountNumber}
                      onChange={(e) =>
                        setNewAccount({ ...newAccount, accountNumber: e.target.value })
                      }
                      style={{
                        width: '100%',
                        padding: isMobile ? '8px 10px' : '10px 12px',
                        border: '1px solid #ddd',
                        borderRadius: '8px',
                        fontSize: isMobile ? '0.85rem' : '0.9rem',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: isMobile ? '0.8rem' : '0.9rem',
                        fontWeight: 700,
                        color: '#333',
                        marginBottom: isMobile ? '6px' : '8px',
                      }}
                    >
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      placeholder="Full name"
                      value={newAccount.accountHolder}
                      onChange={(e) =>
                        setNewAccount({ ...newAccount, accountHolder: e.target.value })
                      }
                      style={{
                        width: '100%',
                        padding: isMobile ? '8px 10px' : '10px 12px',
                        border: '1px solid #ddd',
                        borderRadius: '8px',
                        fontSize: isMobile ? '0.85rem' : '0.9rem',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: loading ? '#ccc' : '#4caf50',
                    color: 'white',
                    border: 'none',
                    padding: isMobile ? '8px 16px' : '10px 24px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: isMobile ? '0.85rem' : '0.9rem',
                    transition: 'all 0.3s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.background = '#45a049';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(76,175,80,0.3)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!loading) {
                      e.currentTarget.style.background = '#4caf50';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  {loading ? 'Saving...' : 'Save Account'}
                </button>
              </form>
            </div>
          )}

          {/* Payment Accounts Table */}
          <div
            style={{
              overflowX: 'auto',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginTop: '0',
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
                      fontSize: isMobile ? '0.65rem' : '0.9rem',
                    }}
                  >
                    Account Name
                  </th>
                  <th
                    style={{
                      padding: isMobile ? '8px 6px' : '14px 12px',
                      textAlign: 'left',
                      fontWeight: 700,
                      fontSize: isMobile ? '0.65rem' : '0.9rem',
                    }}
                  >
                    Type
                  </th>
                  <th
                    style={{
                      padding: isMobile ? '8px 6px' : '14px 12px',
                      textAlign: 'left',
                      fontWeight: 700,
                      fontSize: isMobile ? '0.65rem' : '0.9rem',
                    }}
                  >
                    Account Number
                  </th>
                  <th
                    style={{
                      padding: isMobile ? '8px 6px' : '14px 12px',
                      textAlign: 'left',
                      fontWeight: 700,
                      fontSize: isMobile ? '0.65rem' : '0.9rem',
                    }}
                  >
                    Holder
                  </th>
                  <th
                    style={{
                      padding: isMobile ? '8px 6px' : '14px 12px',
                      textAlign: 'left',
                      fontWeight: 700,
                      fontSize: isMobile ? '0.65rem' : '0.9rem',
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      padding: isMobile ? '8px 6px' : '14px 12px',
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: isMobile ? '0.65rem' : '0.9rem',
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paymentAccounts.length > 0 ? (
                  paymentAccounts.map((account, index) => (
                    <tr
                      key={account.id}
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
                          fontWeight: 700,
                          color: '#333',
                          fontSize: isMobile ? '0.7rem' : '0.9rem',
                        }}
                      >
                        {account.accountName}
                      </td>
                      <td
                        style={{
                          padding: isMobile ? '8px 6px' : '12px',
                          fontSize: isMobile ? '0.7rem' : '0.9rem',
                        }}
                      >
                        <span
                          style={{
                            background: '#2196f3',
                            color: 'white',
                            padding: isMobile ? '3px 5px' : '4px 8px',
                            borderRadius: '4px',
                            fontSize: isMobile ? '0.6rem' : '0.8rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}
                        >
                          {account.accountType}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: isMobile ? '8px 6px' : '12px',
                          color: '#666',
                          fontSize: isMobile ? '0.7rem' : '0.9rem',
                        }}
                      >
                        {account.accountNumber}
                      </td>
                      <td
                        style={{
                          padding: isMobile ? '8px 6px' : '12px',
                          color: '#666',
                          fontSize: isMobile ? '0.7rem' : '0.9rem',
                        }}
                      >
                        {account.accountHolder || 'N/A'}
                      </td>
                      <td
                        style={{
                          padding: isMobile ? '8px 6px' : '12px',
                          fontSize: isMobile ? '0.7rem' : '0.9rem',
                        }}
                      >
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            cursor: 'pointer',
                            gap: '8px',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={account.isActive}
                            onChange={() => handleToggleStatus(account.id, account.isActive)}
                            style={{
                              cursor: 'pointer',
                              width: '18px',
                              height: '18px',
                            }}
                          />
                          <span
                            style={{
                              color: account.isActive ? '#4caf50' : '#999',
                              fontWeight: 700,
                            }}
                          >
                            {account.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </label>
                      </td>
                      <td
                        style={{
                          padding: '12px',
                          textAlign: isMobile ? 'center' : 'center',
                          display: 'flex',
                          justifyContent: isMobile ? 'space-around' : 'center',
                          gap: '8px',
                          width: '100%',
                        }}
                      >
                        <button
                          onClick={() => handleEditAccount(account.id)}
                          style={{
                            background: '#FFC107',
                            color: 'white',
                            border: 'none',
                            padding: isMobile ? '4px 6px' : '6px 12px',
                            borderRadius: '6px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: isMobile ? '0.6rem' : '0.8rem',
                            transition: 'all 0.3s ease',
                            flex: isMobile ? '0 1 auto' : '0 1 1fr',
                            minWidth: isMobile ? 'auto' : '60px',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#FFA000';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(255,193,7,0.3)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#FFC107';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteAccount(account.id)}
                          style={{
                            background: '#f44336',
                            color: 'white',
                            border: 'none',
                            padding: isMobile ? '4px 6px' : '6px 12px',
                            borderRadius: '6px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: isMobile ? '0.6rem' : '0.8rem',
                            transition: 'all 0.3s ease',
                            flex: isMobile ? '0 1 auto' : '0 1 1fr',
                            minWidth: isMobile ? 'auto' : '60px',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#d32f2f';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(244,67,54,0.3)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#f44336';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="6"
                      style={{
                        padding: '40px 20px',
                        textAlign: 'center',
                        color: '#999',
                        fontSize: '0.95rem',
                      }}
                    >
                      No payment accounts added yet. Click "Add Account" to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
          {showHistoryView ? 'Payment History (Completed Payments)' : 'Payment Transactions'}
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
                    fontSize: isMobile ? '0.65rem' : '0.9rem',
                  }}
                >
                  Booking ID
                </th>
                <th
                  style={{
                    padding: isMobile ? '8px 6px' : '14px 12px',
                    textAlign: 'left',
                    fontWeight: 700,
                    fontSize: isMobile ? '0.65rem' : '0.9rem',
                  }}
                >
                  Passenger
                </th>
                <th
                  style={{
                    padding: isMobile ? '8px 6px' : '14px 12px',
                    textAlign: 'left',
                    fontWeight: 700,
                    fontSize: isMobile ? '0.65rem' : '0.9rem',
                  }}
                >
                  Trip
                </th>
                <th
                  style={{
                    padding: isMobile ? '8px 6px' : '14px 12px',
                    textAlign: 'left',
                    fontWeight: 700,
                    fontSize: isMobile ? '0.65rem' : '0.9rem',
                  }}
                >
                  Date & Time
                </th>
                <th
                  style={{
                    padding: isMobile ? '8px 6px' : '14px 12px',
                    textAlign: 'right',
                    fontWeight: 700,
                    fontSize: isMobile ? '0.65rem' : '0.9rem',
                  }}
                >
                  Amount
                </th>
                <th
                  style={{
                    padding: isMobile ? '8px 6px' : '14px 12px',
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: isMobile ? '0.65rem' : '0.9rem',
                  }}
                >
                  Method
                </th>
                <th
                  style={{
                    padding: isMobile ? '8px 6px' : '14px 12px',
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: isMobile ? '0.65rem' : '0.9rem',
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    padding: isMobile ? '8px 6px' : '14px 12px',
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: isMobile ? '0.65rem' : '0.9rem',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {(showHistoryView ? completedPayments.length : transactionPayments.length) > 0 ? (
                (showHistoryView ? paginatedHistory : paginatedPayments).map((payment, index) => {
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
                          fontWeight: 700,
                          color: '#333',
                          fontSize: isMobile ? '0.7rem' : '0.85rem',
                          fontFamily: 'monospace',
                        }}
                      >
                        {payment.bookingId?.substring(0, 8)}...
                      </td>
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
                          fontSize: isMobile ? '0.65rem' : '0.85rem',
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
                              payment.method === 'gcash'
                                ? '#00D4FF'
                                : payment.method === 'paymaya'
                                ? '#1F3A93'
                                : '#FF6B35',
                            color: 'white',
                            padding: isMobile ? '3px 5px' : '4px 8px',
                            borderRadius: '4px',
                            fontSize: isMobile ? '0.6rem' : '0.75rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}
                        >
                          {payment.method === 'gcash'
                            ? 'GCash'
                            : payment.method === 'paymaya'
                            ? 'PayMaya'
                            : payment.method}
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
                                ? '#ff9800'
                                : payment.status === 'completed'
                                ? '#4caf50'
                                : '#f44336',
                            color: 'white',
                            padding: isMobile ? '3px 6px' : '4px 10px',
                            borderRadius: '4px',
                            fontSize: isMobile ? '0.6rem' : '0.75rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}
                        >
                          {getPaymentStatusLabel(payment.status)}
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
                                  fontSize: isMobile ? '0.55rem' : '0.7rem',
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
                                fontSize: isMobile ? '0.55rem' : '0.7rem',
                                transition: 'all 0.3s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.background = '#45a049';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.background = '#4caf50';
                              }}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => handleRejectPayment(payment.id)}
                              style={{
                                background: '#f44336',
                                color: 'white',
                                border: 'none',
                                padding: isMobile ? '4px 5px' : '6px 10px',
                                borderRadius: '4px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                fontSize: isMobile ? '0.55rem' : '0.7rem',
                                transition: 'all 0.3s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.background = '#d32f2f';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.background = '#f44336';
                              }}
                            >
                              Reject
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
                                  fontSize: isMobile ? '0.55rem' : '0.7rem',
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
                                fontSize: isMobile ? '0.55rem' : '0.7rem',
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
                    colSpan="8"
                    style={{
                      padding: '50px 20px',
                      textAlign: 'center',
                      color: '#999',
                      fontSize: '0.95rem',
                    }}
                  >
                    {showHistoryView
                      ? 'No completed payments yet.'
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
        {(showHistoryView ? completedPayments.length : transactionPayments.length) >
          itemsPerPage && (
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
              onClick={() =>
                showHistoryView
                  ? setCurrentHistoryPage((prev) => Math.max(1, prev - 1))
                  : setCurrentPaymentPage((prev) => Math.max(1, prev - 1))
              }
              disabled={showHistoryView ? currentHistoryPage === 1 : currentPaymentPage === 1}
              style={{
                background: (showHistoryView ? currentHistoryPage === 1 : currentPaymentPage === 1)
                  ? '#ccc'
                  : '#2196f3',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '6px',
                fontWeight: 700,
                cursor: (showHistoryView ? currentHistoryPage === 1 : currentPaymentPage === 1)
                  ? 'not-allowed'
                  : 'pointer',
                fontSize: '0.9rem',
                transition: 'all 0.3s ease',
                opacity: (showHistoryView ? currentHistoryPage === 1 : currentPaymentPage === 1)
                  ? 0.5
                  : 1,
              }}
              onMouseEnter={(e) => {
                if (!(showHistoryView ? currentHistoryPage === 1 : currentPaymentPage === 1)) {
                  e.currentTarget.style.background = '#1976d2';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(33,150,243,0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (!(showHistoryView ? currentHistoryPage === 1 : currentPaymentPage === 1)) {
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
              Page {showHistoryView ? currentHistoryPage : currentPaymentPage} of{' '}
              {showHistoryView ? totalHistoryPages : totalPaymentPages}
            </span>

            <button
              onClick={() =>
                showHistoryView
                  ? setCurrentHistoryPage((prev) => Math.min(totalHistoryPages, prev + 1))
                  : setCurrentPaymentPage((prev) => Math.min(totalPaymentPages, prev + 1))
              }
              disabled={
                showHistoryView
                  ? currentHistoryPage === totalHistoryPages
                  : currentPaymentPage === totalPaymentPages
              }
              style={{
                background: (
                  showHistoryView
                    ? currentHistoryPage === totalHistoryPages
                    : currentPaymentPage === totalPaymentPages
                )
                  ? '#ccc'
                  : '#2196f3',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '6px',
                fontWeight: 700,
                cursor: (
                  showHistoryView
                    ? currentHistoryPage === totalHistoryPages
                    : currentPaymentPage === totalPaymentPages
                )
                  ? 'not-allowed'
                  : 'pointer',
                fontSize: '0.9rem',
                transition: 'all 0.3s ease',
                opacity: (
                  showHistoryView
                    ? currentHistoryPage === totalHistoryPages
                    : currentPaymentPage === totalPaymentPages
                )
                  ? 0.5
                  : 1,
              }}
              onMouseEnter={(e) => {
                if (
                  !(showHistoryView
                    ? currentHistoryPage === totalHistoryPages
                    : currentPaymentPage === totalPaymentPages)
                ) {
                  e.currentTarget.style.background = '#1976d2';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(33,150,243,0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (
                  !(showHistoryView
                    ? currentHistoryPage === totalHistoryPages
                    : currentPaymentPage === totalPaymentPages)
                ) {
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
