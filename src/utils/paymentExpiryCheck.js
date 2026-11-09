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
