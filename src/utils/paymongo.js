function getApiBaseUrl() {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:5001";
    }
    return "";
  }

  return "http://localhost:5001";
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Payment request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export { getApiBaseUrl };

export const isPayMongoEnabled = () => true;

export const isPayMongoGcash = (paymentMethod) =>
  isPayMongoEnabled() && paymentMethod === "gcash";

export async function checkPayMongoReady() {
  if (!isPayMongoEnabled()) {
    return false;
  }

  try {
    const response = await fetchWithTimeout(`${getApiBaseUrl()}/health`, {}, 10000);
    if (!response.ok) {
      return false;
    }

    const payload = await response.json();
    return Boolean(payload.ok && payload.paymongoConfigured);
  } catch {
    return false;
  }
}

export function isProductionDeployment() {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    return host !== "localhost" && host !== "127.0.0.1";
  }

  return process.env.NODE_ENV === "production";
}

export async function createQrPhCheckout({
  paymentId,
  amount,
  bookingId,
}) {
  const response = await fetchWithTimeout(`${getApiBaseUrl()}/api/payments/qrph`, {
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
  const response = await fetchWithTimeout(
    `${getApiBaseUrl()}/api/payments/status/${paymentIntentId}`
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
  return `${getApiBaseUrl()}/api/payments/qrph/${paymentIntentId}/image${suffix}`;
}

export async function refreshQrPhCheckout(paymentIntentId) {
  const response = await fetchWithTimeout(
    `${getApiBaseUrl()}/api/payments/qrph/${paymentIntentId}/refresh`,
    { method: "POST" }
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Failed to refresh QR code");
  }
  return payload;
}
