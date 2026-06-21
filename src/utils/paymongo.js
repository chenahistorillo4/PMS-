const API_BASE_URL =
  process.env.REACT_APP_API_URL !== undefined
    ? process.env.REACT_APP_API_URL
    : process.env.NODE_ENV === "production"
    ? ""
    : "http://localhost:5001";

export { API_BASE_URL };
export const isPayMongoEnabled = () =>
  process.env.REACT_APP_PAYMONGO_ENABLED === "true";

export const isPayMongoGcash = (paymentMethod) =>
  isPayMongoEnabled() && paymentMethod === "gcash";

export async function checkPayMongoReady() {
  if (!isPayMongoEnabled()) {
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const payload = await response.json();
    return Boolean(payload.ok && payload.paymongoConfigured);
  } catch {
    return false;
  }
}

export async function createQrPhCheckout({
  paymentId,
  amount,
  bookingId,
}) {
  const response = await fetch(`${API_BASE_URL}/api/payments/qrph`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      paymentId,
      amount,
      bookingId,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Failed to generate QR Ph payment");
  }

  return payload;
}

export async function getPayMongoPaymentStatus(paymentIntentId) {
  const response = await fetch(
    `${API_BASE_URL}/api/payments/status/${paymentIntentId}`
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Failed to check payment status");
  }
  return payload;
}

export function getQrPhImageUrl(paymentIntentId, cacheBust = "") {
  if (!paymentIntentId) {
    return "";
  }

  const suffix = cacheBust ? `?t=${cacheBust}` : "";
  return `${API_BASE_URL}/api/payments/qrph/${paymentIntentId}/image${suffix}`;
}

export async function refreshQrPhCheckout(paymentIntentId) {
  const response = await fetch(
    `${API_BASE_URL}/api/payments/qrph/${paymentIntentId}/refresh`,
    { method: "POST" }
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Failed to refresh QR code");
  }
  return payload;
}
