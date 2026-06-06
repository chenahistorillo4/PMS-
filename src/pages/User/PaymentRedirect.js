import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { db, auth } from "../../firebase";
import { collection, addDoc } from "firebase/firestore";

function PaymentRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  const { method, bookingId, amount } = location.state || {};

  // Save payment record to Firestore
  useEffect(() => {
    const savePaymentRecord = async () => {
      const user = auth.currentUser;
      if (method && bookingId && amount && user) {
        try {
          console.log('💳 Saving payment record...');
          await addDoc(collection(db, "payments"), {
            bookingId: bookingId,
            userId: user.uid,
            amount: parseFloat(amount),
            method: method,
            status: "pending", // pending, completed, failed
            createdAt: new Date(),
            notes: ""
          });
          console.log('Payment record saved successfully!');
        } catch (error) {
          console.error('Error saving payment record:', error);
        }
      }
    };
    savePaymentRecord();
  }, [method, bookingId, amount]);

  const renderContent = () => {
    if (!method) return <p>No payment method specified.</p>;

    if (method === "Cash") {
      return (
        <div>
          <h5 className="fw-bold">Cash Payment</h5>
          <p>Please pay in cash at the terminal or to the assigned staff upon arrival/boarding.</p>
          <p><strong>Amount:</strong> ₱{Number(amount || 0).toFixed(2)}</p>
        </div>
      );
    }

    // For GCash / PayMaya provide basic instructions and a QR code for the booking id
    return (
      <div>
        <h5 className="fw-bold">{method} Payment</h5>
        <p>Open your {method} app and send the amount to the official account of the ferry operator.</p>
        <p><strong>Amount:</strong> ₱{Number(amount || 0).toFixed(2)}</p>
        <p className="text-muted">Use this booking reference when paying or paste it in the transaction notes.</p>
        {bookingId && (
          <div className="text-center mt-3">
            <QRCodeCanvas value={bookingId} size={160} />
            <p className="text-muted mt-2">Booking Reference QR</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container mt-5">
      <div className="card p-4 shadow-lg">
        <h4 className="fw-bold mb-3">Payment Instructions</h4>
        {renderContent()}
        <div className="mt-4 d-flex justify-content-end gap-2">
          <button className="btn btn-secondary" onClick={() => navigate('/manage')}>Back to My Bookings</button>
        </div>
      </div>
    </div>
  );
}

export default PaymentRedirect;
