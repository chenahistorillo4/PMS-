export async function checkPaymentExpiry(paymentId) {
  if (!paymentId) {
    return null;
  }

  try {
    const response = await fetch(
      `/api/payments/qrph?paymentId=${encodeURIComponent(paymentId)}`
    );

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    console.warn('Payment expiry check failed:', error);
    return null;
  }
}
