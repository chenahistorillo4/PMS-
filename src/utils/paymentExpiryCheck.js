export function isExpiredPayMongoQr(payment, now = Date.now()) {
  const status = String(payment?.status || "").toLowerCase();
  const provider = String(payment?.paymentProvider || "").toLowerCase();
  const flow = String(payment?.paymongoFlow || "").toLowerCase();
  const paymongoStatus = String(payment?.paymongoStatus || "").toLowerCase();
  const expiryValue = payment?.paymentExpiresAt;
  const expiresAt = expiryValue?.toDate?.() || (expiryValue ? new Date(expiryValue) : null);

  return Boolean(
    status === "pending" &&
      provider === "paymongo" &&
      flow === "qrph" &&
      paymongoStatus !== "paid" &&
      expiresAt &&
      !Number.isNaN(expiresAt.getTime()) &&
      expiresAt.getTime() <= now
  );
}

export async function checkPaymentExpiry(paymentId) {
  if (!paymentId) {
    return null;
  }

  const response = await fetch(
    `/api/payments/qrph?paymentId=${encodeURIComponent(paymentId)}`
  );

  if (!response.ok) {
    throw new Error(`Payment expiry check failed with HTTP ${response.status}`);
  }

  return response.json();
}
