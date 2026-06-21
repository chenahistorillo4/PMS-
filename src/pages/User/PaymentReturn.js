import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { getPayMongoPaymentStatus } from "../../utils/paymongo";

function PaymentReturn() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const paymentId = searchParams.get("paymentId");
  const paymongoStatus = searchParams.get("paymongo_status");
  const [status, setStatus] = useState("checking");
  const [message, setMessage] = useState("Checking your payment...");

  useEffect(() => {
    const verifyPayment = async () => {
      if (!paymentId) {
        setStatus("error");
        setMessage("Missing payment reference.");
        return;
      }

      try {
        const paymentRef = doc(db, "payments", paymentId);
        const paymentSnap = await getDoc(paymentRef);

        if (!paymentSnap.exists()) {
          setStatus("error");
          setMessage("Payment record not found.");
          return;
        }

        const paymentData = paymentSnap.data();

        if (paymentData.paymongoFlow === "qrph" || paymentData.qrImageUrl) {
          navigate(`/payment-qr?paymentId=${paymentId}`, { replace: true });
          return;
        }

        if (paymentData.status === "completed") {
          setStatus("success");
          setMessage("Payment confirmed! Your booking is now active.");
          return;
        }

        if (paymongoStatus === "failed") {
          setStatus("error");
          setMessage("Payment was cancelled or failed. Please try again.");
          return;
        }

        if (paymentData.paymongoPaymentIntentId) {
          const paymongoStatus = await getPayMongoPaymentStatus(
            paymentData.paymongoPaymentIntentId
          );

          if (paymongoStatus.status === "succeeded") {
            await updateDoc(paymentRef, {
              status: "completed",
              paymongoStatus: "paid",
            });

            if (paymentData.bookingId) {
              await updateDoc(doc(db, "bookings", paymentData.bookingId), {
                status: "confirmed",
              });
            }

            setStatus("success");
            setMessage("Payment confirmed! Your booking is now active.");
            return;
          }
        }

        setStatus("pending");
        setMessage(
          "Payment is still processing. If you completed GCash payment, please check Manage Booking in a few minutes."
        );
      } catch (error) {
        console.error("Payment return error:", error);
        setStatus("error");
        setMessage(error.message || "Unable to verify payment.");
      }
    };

    verifyPayment();
  }, [paymentId, paymongoStatus, navigate]);

  const statusColor =
    status === "success" ? "#2e7d32" : status === "error" ? "#c62828" : "#ef6c00";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        background:
          "linear-gradient(135deg, rgba(255, 255, 255, 0.45) 0%, rgba(240, 248, 255, 0.40) 100%), url('/bg5.avif') center/cover fixed",
      }}
    >
      <div
        className="card shadow p-4"
        style={{ maxWidth: "520px", width: "100%", textAlign: "center" }}
      >
        <h3 style={{ marginBottom: "12px", color: statusColor }}>
          {status === "success"
            ? "Payment Successful"
            : status === "error"
            ? "Payment Error"
            : "Payment Pending"}
        </h3>
        <p style={{ color: "#555", marginBottom: "24px" }}>{message}</p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={() => navigate("/manage")}>
            Go to Manage Booking
          </button>
          <button className="btn btn-secondary" onClick={() => navigate("/home")}>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

export default PaymentReturn;
