function getApiBaseUrl() {
  // Use same-origin /api routes (CRA proxy in dev, Vercel functions in production).
  return '';
}

export function pickBookingFields(booking = {}) {
  return {
    id: booking.id,
    referenceCode: booking.referenceCode,
    tripName: booking.tripName,
    boat: booking.boat,
    date: booking.date,
    departure: booking.departure,
    arrival: booking.arrival,
    customerName: booking.customerName,
    bookedByName: booking.bookedByName,
    finalPrice: booking.finalPrice,
    amount: booking.amount,
    status: booking.status,
    payment: booking.payment,
    userEmail: booking.userEmail,
    userPhone: booking.userPhone,
    userId: booking.userId,
  };
}

export async function sendNotification({
  type,
  to,
  toPhone,
  adminEmails,
  adminPhones,
  payload,
  sendSms = true,
}) {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        type,
        to,
        toPhone,
        adminEmails,
        adminPhones,
        payload,
        sendSms,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.warn(
        'Notification failed:',
        data.error || response.statusText,
        data.hint || '',
        data.result || ''
      );
      return {
        ok: false,
        error: data.error || response.statusText,
        hint: data.hint,
        result: data.result,
      };
    }

    const data = await response.json();
    if (data?.result?.sms?.error) {
      console.warn('SMS channel failed:', data.result.sms.error);
    }
    if (data?.result?.email?.error) {
      console.warn('Email channel failed:', data.result.email.error);
    }

    return data;
  } catch (error) {
    console.warn('Notification error:', error.message);
    return { ok: false, error: error.message };
  }
}

export async function sendEmailNotification(args) {
  return sendNotification(args);
}

export async function getAdminEmailsForBoat(boat) {
  if (!boat) return [];

  try {
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const { db } = await import('../firebase');

    const adminsSnap = await getDocs(
      query(collection(db, 'admins'), where('assignedBoat', '==', boat))
    );

    return adminsSnap.docs.map((adminDoc) => adminDoc.data().email).filter(Boolean);
  } catch (error) {
    console.warn('Unable to load admin emails:', error.message);
    return [];
  }
}

export async function getAdminPhonesForBoat(boat) {
  if (!boat) return [];

  try {
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const { db } = await import('../firebase');

    const adminsSnap = await getDocs(
      query(collection(db, 'admins'), where('assignedBoat', '==', boat))
    );

    return adminsSnap.docs.map((adminDoc) => adminDoc.data().phone).filter(Boolean);
  } catch (error) {
    console.warn('Unable to load admin phones:', error.message);
    return [];
  }
}

export async function getUserPhone(userId) {
  if (!userId) return null;

  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const { db } = await import('../firebase');

    const userSnap = await getDoc(doc(db, 'users', userId));
    if (!userSnap.exists()) return null;

    return userSnap.data().phone || null;
  } catch (error) {
    console.warn('Unable to load user phone:', error.message);
    return null;
  }
}

export async function notifyAdminSystemError(errorMessage, context) {
  return sendNotification({
    type: 'admin_system_error',
    payload: { errorMessage, context },
  });
}
