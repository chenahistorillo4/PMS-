import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  getPayMongoPaymentStatus,
  getQrPhImageUrl,
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
  const [paymentExpiresAt, setPaymentExpiresAt] = useState(null);
  const [countdownNow, setCountdownNow] = useState(Date.now());
  const [status, setStatus] = useState('awaiting');
  const [message, setMessage] = useState('Waiting for payment...');
  const [qrImageKey] = useState(Date.now());
  const [qrLoadError, setQrLoadError] = useState(false);
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
        const expiryValue = paymentData.paymentExpiresAt;
        const expiryDate = expiryValue?.toDate?.() || (expiryValue ? new Date(expiryValue) : null);
        setPaymentExpiresAt(
          expiryDate && !Number.isNaN(expiryDate.getTime()) ? expiryDate.getTime() : null
        );
        setPaymentIntentId(
          paymentData.paymongoPaymentIntentId || location.state?.paymentIntentId || ''
        );
        setBookingId(paymentData.bookingId || '');

        if (paymentData.status === 'completed') {
          setStatus('success');
          setMessage('Payment received and booking confirmed.');
          if (paymentData.bookingId) {
            notifyPaymentSuccess({
              paymentId,
              bookingId: paymentData.bookingId,
              notifyAdmin: false,
            }).catch((error) => console.warn('Booking confirmation notification failed:', error));
          }
        } else if (['failed', 'cancelled'].includes(paymentData.status)) {
          setStatus('error');
          setMessage('This payment expired and the booking was cancelled. Please book again.');
        } else if (paymentData.paymongoStatus === 'paid') {
          const batch = writeBatch(db);
          batch.update(paymentRef, {
            status: 'completed',
            confirmedAt: new Date(),
          });
          if (paymentData.bookingId) {
            batch.update(doc(db, 'bookings', paymentData.bookingId), {
              status: 'confirmed',
            });
          }
          await batch.commit();
          setStatus('success');
          setMessage('Payment received and booking confirmed.');
          if (paymentData.bookingId) {
            await notifyPaymentSuccess({
              paymentId,
              bookingId: paymentData.bookingId,
              notifyAdmin: false,
            }).catch((error) => console.warn('Payment received notification failed:', error));
          }
        } else {
          await checkPaymentExpiry(paymentId);
          const refreshedSnap = await getDoc(paymentRef);
          if (refreshedSnap.exists() && ['failed', 'cancelled'].includes(refreshedSnap.data().status)) {
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
    if (!paymentExpiresAt) return undefined;

    const updateCountdown = () => setCountdownNow(Date.now());
    updateCountdown();
    const intervalId = setInterval(updateCountdown, 1000);
    return () => clearInterval(intervalId);
  }, [paymentExpiresAt]);

  useEffect(() => {
    if (!paymentIntentId || status === 'success' || status === 'error') {
      return undefined;
    }

    const markPaid = async (paymentRef) => {
      const batch = writeBatch(db);
      batch.update(paymentRef, {
        status: 'completed',
        paymongoStatus: 'paid',
        paidAt: new Date(),
        confirmedAt: new Date(),
      });
      if (bookingId) {
        batch.update(doc(db, 'bookings', bookingId), {
          status: 'confirmed',
        });
      }
      await batch.commit();

      if (bookingId) {
        await notifyPaymentSuccess({ paymentId, bookingId, notifyAdmin: false }).catch((error) =>
          console.warn('Payment received notification failed:', error)
        );
      }
      setStatus('success');
      setMessage('Payment received and booking confirmed.');
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
          setMessage('Payment received and booking confirmed.');
          if (paymentData.bookingId) {
            notifyPaymentSuccess({
              paymentId,
              bookingId: paymentData.bookingId,
              notifyAdmin: false,
            }).catch((error) => console.warn('Booking confirmation notification failed:', error));
          }
          return;
        }

        if (paymentData.paymongoStatus === 'paid') {
          await markPaid(paymentRef);
          return;
        }

        if (['failed', 'cancelled'].includes(paymentData.status)) {
          setStatus('error');
          setMessage('This payment expired and the booking was cancelled. Please book again.');
          return;
        }

        const result = await getPayMongoPaymentStatus(paymentIntentId);
        if (result.status === 'succeeded') {
          await markPaid(paymentRef);
          return;
        }

        await checkPaymentExpiry(paymentId);

        const refreshedSnap = await getDoc(paymentRef);
        if (refreshedSnap.exists()) {
          const refreshedData = refreshedSnap.data();
          if (['failed', 'cancelled'].includes(refreshedData.status)) {
            setStatus('error');
            setMessage('This payment expired and the booking was cancelled. Please book again.');
            return;
          }
        }

      } catch (error) {
        console.error('QR Ph poll error:', error);
      }
    };

    pollStatus();
    const intervalId = setInterval(pollStatus, 3000);
    return () => clearInterval(intervalId);
  }, [paymentId, paymentIntentId, status, bookingId]);

  const apiQrSrc = paymentIntentId ? getQrPhImageUrl(paymentIntentId, qrImageKey) : '';
  const displayQrSrc =
    qrLoadError && fallbackQrImageUrl ? fallbackQrImageUrl : apiQrSrc || fallbackQrImageUrl;
  const secondsRemaining = paymentExpiresAt
    ? Math.max(0, Math.ceil((paymentExpiresAt - countdownNow) / 1000))
    : null;
  const showQr = Boolean(displayQrSrc) && secondsRemaining !== 0;
  const countdownLabel = secondsRemaining === null
    ? `${PAYMENT_QR_VALID_MINUTES}:00`
    : `${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`;

  const statusColor = status === 'success' ? '#2e7d32' : status === 'error' ? '#c62828' : '#1565c0';

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 70px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '90px 20px 20px',
        boxSizing: 'border-box',
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
                    {secondsRemaining === 0
                      ? 'QR code expired. Checking your booking cancellation status...'
                      : 'QR code unavailable. Please return to Manage Booking for help.'}
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
                </div>

                <p style={{ color: secondsRemaining === 0 ? '#c62828' : '#ef6c00', fontSize: '0.85rem', marginBottom: 0 }}>
                  {secondsRemaining === 0
                    ? 'QR expired. Your booking is being checked for automatic cancellation.'
                    : `QR expires in ${countdownLabel}. This page updates automatically after payment.`}
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
