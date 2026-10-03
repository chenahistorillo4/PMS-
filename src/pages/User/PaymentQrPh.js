import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  getPayMongoPaymentStatus,
  getQrPhImageUrl,
  refreshQrPhCheckout,
} from '../../utils/paymongo';
import { notifyPaymentSuccess } from '../../utils/notificationHelper';
import { PAYMENT_PENDING_NOTICE, PAYMENT_QR_VALID_MINUTES } from '../../constants/paymentNotice';
import { checkPaymentExpiry } from '../../utils/paymentExpiryCheck';

function PaymentQrPh() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const paymentId = searchParams.get('paymentId');

  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState(0);
  const [paymentIntentId, setPaymentIntentId] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [status, setStatus] = useState('awaiting');
  const [message, setMessage] = useState('Waiting for payment...');
  const [qrImageKey, setQrImageKey] = useState(Date.now());
  const [qrLoadError, setQrLoadError] = useState(false);
  const [refreshingQr, setRefreshingQr] = useState(false);
  const [fallbackQrImageUrl] = useState(location.state?.qrImageUrl || '');

  useEffect(() => {
    const loadPayment = async () => {
      if (!paymentId) {
        setStatus('error');
        setMessage('Missing payment reference.');
        setLoading(false);
        return;
      }

      try {
        const paymentRef = doc(db, 'payments', paymentId);
        const paymentSnap = await getDoc(paymentRef);

        if (!paymentSnap.exists()) {
          setStatus('error');
          setMessage('Payment record not found.');
          setLoading(false);
          return;
        }

        const paymentData = paymentSnap.data();
        setAmount(paymentData.amount || 0);
        setPaymentIntentId(
          paymentData.paymongoPaymentIntentId || location.state?.paymentIntentId || ''
        );
        setBookingId(paymentData.bookingId || '');

        if (paymentData.status === 'completed') {
          setStatus('success');
          setMessage('Payment confirmed! Your booking is now active.');
          if (paymentData.bookingId) {
            notifyPaymentSuccess({
              paymentId,
              bookingId: paymentData.bookingId,
              notifyAdmin: true,
            }).catch((error) => console.warn('Payment success notification failed:', error));
          }
        } else if (paymentData.status === 'failed') {
          setStatus('error');
          setMessage('This payment expired and the booking was cancelled. Please book again.');
        } else {
          await checkPaymentExpiry(paymentId);
          const refreshedSnap = await getDoc(paymentRef);
          if (refreshedSnap.exists() && refreshedSnap.data().status === 'failed') {
            setStatus('error');
            setMessage('This payment expired and the booking was cancelled. Please book again.');
          }
        }

        setLoading(false);
      } catch (error) {
        setStatus('error');
        setMessage(error.message || 'Unable to load payment.');
        setLoading(false);
      }
    };

    loadPayment();
  }, [paymentId, location.state?.paymentIntentId]);

  useEffect(() => {
    if (!paymentIntentId || status === 'success' || status === 'error') {
      return undefined;
    }

    const markPaid = async (paymentRef, paymentData) => {
      if (paymentData.bookingId) {
        const batch = writeBatch(db);
        batch.update(paymentRef, {
          status: 'completed',
          paymongoStatus: 'paid',
        });
        batch.update(doc(db, 'bookings', paymentData.bookingId), {
          status: 'confirmed',
        });
        await batch.commit();

        notifyPaymentSuccess({
          paymentId,
          bookingId: paymentData.bookingId,
          notifyAdmin: true,
        }).catch((error) => console.warn('Payment success notification failed:', error));
      } else {
        await updateDoc(paymentRef, {
          status: 'completed',
          paymongoStatus: 'paid',
        });
      }

      setStatus('success');
      setMessage('Payment confirmed! Your booking is now active.');
    };

    const pollStatus = async () => {
      try {
        const paymentRef = doc(db, 'payments', paymentId);
        const paymentSnap = await getDoc(paymentRef);

        if (!paymentSnap.exists()) {
          return;
        }

        const paymentData = paymentSnap.data();
        if (paymentData.status === 'completed') {
          setStatus('success');
          setMessage('Payment confirmed! Your booking is now active.');
          if (paymentData.bookingId) {
            notifyPaymentSuccess({
              paymentId,
              bookingId: paymentData.bookingId,
              notifyAdmin: true,
            }).catch((error) => console.warn('Payment success notification failed:', error));
          }
          return;
        }

        if (paymentData.status === 'failed') {
          setStatus('error');
          setMessage('This payment expired and the booking was cancelled. Please book again.');
          return;
        }

        await checkPaymentExpiry(paymentId);

        const refreshedSnap = await getDoc(paymentRef);
        if (refreshedSnap.exists()) {
          const refreshedData = refreshedSnap.data();
          if (refreshedData.status === 'failed') {
            setStatus('error');
            setMessage('This payment expired and the booking was cancelled. Please book again.');
            return;
          }
        }

        const result = await getPayMongoPaymentStatus(paymentIntentId);
        if (result.status === 'succeeded') {
          await markPaid(paymentRef, paymentData);
        }
      } catch (error) {
        console.error('QR Ph poll error:', error);
      }
    };

    pollStatus();
    const intervalId = setInterval(pollStatus, 3000);
    return () => clearInterval(intervalId);
  }, [paymentId, paymentIntentId, status]);

  const handleRefreshQr = async () => {
    if (!paymentIntentId || refreshingQr) {
      return;
    }

    setRefreshingQr(true);
    setQrLoadError(false);

    try {
      await refreshQrPhCheckout(paymentIntentId);
      setQrImageKey(Date.now());
      setMessage('New QR code generated. Scan it with GCash.');
    } catch (error) {
      setQrLoadError(true);
      setMessage(error.message || 'Unable to refresh QR code.');
    } finally {
      setRefreshingQr(false);
    }
  };

  const apiQrSrc = paymentIntentId ? getQrPhImageUrl(paymentIntentId, qrImageKey) : '';
  const displayQrSrc =
    qrLoadError && fallbackQrImageUrl ? fallbackQrImageUrl : apiQrSrc || fallbackQrImageUrl;
  const showQr = Boolean(displayQrSrc);

  const statusColor = status === 'success' ? '#2e7d32' : status === 'error' ? '#c62828' : '#1565c0';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background:
          "linear-gradient(135deg, rgba(255, 255, 255, 0.45) 0%, rgba(240, 248, 255, 0.40) 100%), url('/bg5.avif') center/cover fixed",
      }}
    >
      <div
        className="card shadow p-4"
        style={{ maxWidth: '560px', width: '100%', textAlign: 'center' }}
      >
        {loading ? (
          <p style={{ color: '#555' }}>Loading QR code...</p>
        ) : (
          <>
            <h3 style={{ marginBottom: '8px', color: statusColor }}>
              {status === 'success'
                ? 'Payment Successful'
                : status === 'error'
                ? 'Payment Error'
                : 'Scan to Pay with GCash (QR Ph)'}
            </h3>

            {status !== 'success' && status !== 'error' && (
              <>
                <p style={{ color: '#555', marginBottom: '8px' }}>
                  Amount: <strong>₱{Number(amount).toFixed(2)}</strong>
                </p>
                <div
                  style={{
                    textAlign: 'left',
                    background: '#fff8e1',
                    border: '1px solid #ffe082',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    marginBottom: '16px',
                    fontSize: '0.9rem',
                    color: '#5d4037',
                  }}
                >
                  <strong>Important:</strong> {PAYMENT_PENDING_NOTICE}
                </div>

                <div
                  style={{
                    textAlign: 'left',
                    background: '#f5f9ff',
                    border: '1px solid #dbeafe',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    marginBottom: '20px',
                    fontSize: '0.9rem',
                    color: '#444',
                  }}
                >
                  <strong>How to pay:</strong>
                  <ol style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
                    <li>Open the GCash app on your phone.</li>
                    <li>
                      Tap <strong>Scan</strong> (QR scanner).
                    </li>
                    <li>
                      Scan this QR from another phone or computer screen. On the same phone, tap{' '}
                      <strong>Download QR</strong>, then in GCash upload from gallery.
                    </li>
                    <li>Confirm the exact amount shown above.</li>
                  </ol>
                </div>

                {showQr ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      marginBottom: '16px',
                    }}
                  >
                    <div
                      style={{
                        padding: '16px',
                        background: '#fff',
                        border: '2px solid #e0e0e0',
                        borderRadius: '12px',
                      }}
                    >
                      <img
                        src={displayQrSrc}
                        alt="QR Ph payment code"
                        onError={() => setQrLoadError(true)}
                        style={{
                          width: 'min(320px, 80vw)',
                          height: 'auto',
                          display: 'block',
                          margin: '0 auto',
                          imageRendering: 'pixelated',
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <p style={{ color: '#c62828', marginBottom: '16px' }}>
                    QR code unavailable. Please try booking again or tap New QR Code.
                  </p>
                )}

                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                    marginBottom: '12px',
                  }}
                >
                  {showQr && (
                    <a
                      className="btn btn-outline-primary"
                      href={displayQrSrc}
                      download={`ferry-payment-${paymentId}.png`}
                    >
                      Download QR
                    </a>
                  )}
                  {paymentIntentId && (
                    <button
                      className="btn btn-outline-secondary"
                      onClick={handleRefreshQr}
                      disabled={refreshingQr}
                    >
                      {refreshingQr ? 'Refreshing...' : 'New QR Code'}
                    </button>
                  )}
                </div>

                <p style={{ color: '#ef6c00', fontSize: '0.85rem', marginBottom: 0 }}>
                  QR code expires in {PAYMENT_QR_VALID_MINUTES} minutes. This page updates automatically after payment.
                </p>
              </>
            )}

            <p style={{ color: '#555', margin: '20px 0' }}>{message}</p>

            <div
              style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}
            >
              <button
                className="btn btn-primary"
                onClick={() => navigate('/manage')}
              >
                Go to Manage Booking
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => navigate('/home')}
              >
                Back to Home
              </button>
            </div>

            {bookingId && status !== 'success' && (
              <p style={{ color: '#999', fontSize: '0.8rem', marginTop: '16px', marginBottom: 0 }}>
                Booking ref: {bookingId}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default PaymentQrPh;
