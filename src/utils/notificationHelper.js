import { collection, addDoc, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  sendNotification,
  getAdminEmailsForBoat,
  getAdminPhonesForBoat,
  getUserPhone,
  pickBookingFields,
} from './emailNotifications';

/**
 * Create a notification for admin about trip update/cancellation
 */
export const createAdminNotification = async (boat, type, title, message, tripDetails) => {
  try {
    await addDoc(collection(db, 'notifications'), {
      boat,
      type,
      title,
      message,
      tripDetails,
      recipientType: 'admin',
      isRead: false,
      createdAt: new Date(),
    });
    console.log('Admin notification created successfully');
  } catch (error) {
    console.error('Error creating admin notification:', error);
  }
};

/**
 * Create notifications for all users who have bookings for a specific trip
 */
export const createUserNotifications = async (
  tripId,
  type,
  title,
  message,
  tripDetails,
  options = {}
) => {
  try {
    const bookingsQuery = query(collection(db, 'bookings'), where('tripId', '==', tripId));
    const bookingsSnap = await getDocs(bookingsQuery);

    const notificationPromises = bookingsSnap.docs.map((bookingDoc) => {
      const bookingData = bookingDoc.data();
      return addDoc(collection(db, 'notifications'), {
        userId: bookingData.userId,
        type,
        title,
        message,
        tripDetails,
        bookingId: bookingDoc.id,
        bookingAmount: bookingData.finalPrice || 0,
        recipientType: 'user',
        isRead: false,
        createdAt: new Date(),
      });
    });

    await Promise.all(notificationPromises);
    console.log(`User notifications created for ${bookingsSnap.docs.length} users`);

    if (type === 'trip_cancelled') {
      const results = await Promise.all(
        bookingsSnap.docs.map(async (bookingDoc) => {
          const bookingData = bookingDoc.data();
          const toPhone =
            bookingData.userPhone || (await getUserPhone(bookingData.userId));

          if (!bookingData.userEmail && !toPhone) return null;

          const result = await sendNotification({
            type: 'passenger_trip_cancellation',
            to: bookingData.userEmail,
            toPhone,
            payload: {
              customerName: bookingData.customerName || bookingData.bookedByName,
              message,
              tripDetails,
              reason:
                options.reason ||
                'Trip cancelled due to operational conditions such as heavy rain. Refund or reschedule is available.',
            },
          });

          if (result?.result?.sms?.skipped || result?.result?.sms?.error) {
            console.warn('Passenger cancellation SMS issue:', result.result.sms);
          }
          if (result?.ok === false) {
            console.warn('Passenger cancellation notification failed:', result.error);
          }

          return result;
        })
      );
      console.log(`Cancellation SMS/email sent for ${results.filter(Boolean).length} passengers`);
    }
  } catch (error) {
    console.error('Error creating user notifications:', error);
  }
};

/**
 * Create both admin and user notifications
 */
export const createTripNotifications = async (
  boat,
  tripId,
  type,
  title,
  adminMessage,
  userMessage,
  tripDetails,
  options = {}
) => {
  try {
    await createAdminNotification(boat, type, title, adminMessage, tripDetails);
    await createUserNotifications(tripId, type, title, userMessage, tripDetails, options);

    if (type === 'trip_cancelled') {
      const [adminEmails, adminPhones] = await Promise.all([
        getAdminEmailsForBoat(boat),
        getAdminPhonesForBoat(boat),
      ]);

      const result = await sendNotification({
        type: 'admin_trip_alert',
        adminEmails,
        adminPhones,
        payload: {
          title: 'Trip Cancelled',
          message: adminMessage,
          tripDetails,
        },
      });

      if (result?.result?.sms?.skipped || result?.result?.sms?.error) {
        console.warn('Admin cancellation SMS issue:', result.result.sms);
      }
      if (result?.ok === false) {
        console.warn('Admin cancellation notification failed:', result.error);
      }
    }
  } catch (error) {
    console.error('Error creating notifications:', error);
  }
};

export const notifyNewBooking = async (booking, boat) => {
  const [adminEmails, adminPhones] = await Promise.all([
    getAdminEmailsForBoat(boat),
    getAdminPhonesForBoat(boat),
  ]);

  return sendNotification({
    type: 'admin_new_booking',
    adminEmails,
    adminPhones,
    payload: { booking: pickBookingFields(booking) },
  });
};

/** Temporary testing: notify admin when QR payment screen is shown (once per payment). */
export const notifyQrScreenBooking = async ({ paymentId, bookingId, boat }) => {
  if (!paymentId || !bookingId) return null;

  try {
    const paymentRef = doc(db, 'payments', paymentId);
    const paymentSnap = await getDoc(paymentRef);
    if (!paymentSnap.exists() || paymentSnap.data().qrScreenNotified) {
      return null;
    }

    const bookingSnap = await getDoc(doc(db, 'bookings', bookingId));
    if (!bookingSnap.exists()) return null;

    const booking = pickBookingFields({
      id: bookingSnap.id,
      ...bookingSnap.data(),
      status: bookingSnap.data().status || 'pending',
    });

    const result = await notifyNewBooking(booking, boat || booking.boat);

    if (result?.ok !== false && !result?.result?.sms?.error) {
      await updateDoc(paymentRef, {
        qrScreenNotified: true,
        qrScreenNotifiedAt: new Date(),
      });
    }

    if (result?.result?.sms?.skipped || result?.result?.sms?.error) {
      console.warn('QR screen SMS issue:', result.result.sms);
    }
    if (result?.ok === false) {
      console.warn('QR screen notification failed:', result.error, result.hint || '');
    }
    return result;
  } catch (error) {
    console.warn('QR screen notification error:', error.message);
    return { ok: false, error: error.message };
  }
};

export const notifyBookingConfirmed = async (booking, userEmail, userPhone) => {
  if (!userEmail && !userPhone) return null;

  const resolvedPhone =
    userPhone || booking.userPhone || (await getUserPhone(booking.userId));

  return sendNotification({
    type: 'passenger_booking_confirmation',
    to: userEmail,
    toPhone: resolvedPhone,
    payload: {
      customerName: booking.customerName || booking.bookedByName,
      booking,
    },
  });
};

export const notifyPaymentSuccess = async ({
  paymentId,
  bookingId,
  notifyAdmin = true,
}) => {
  if (!paymentId || !bookingId) return null;

  try {
    const paymentRef = doc(db, 'payments', paymentId);
    const paymentSnap = await getDoc(paymentRef);
    if (!paymentSnap.exists()) return null;

    const paymentData = paymentSnap.data();
    if (paymentData.confirmationNotified) return null;

    const bookingSnap = await getDoc(doc(db, 'bookings', bookingId));
    if (!bookingSnap.exists()) return null;

    const booking = {
      id: bookingSnap.id,
      ...bookingSnap.data(),
      status: 'confirmed',
    };

    await updateDoc(paymentRef, {
      confirmationNotified: true,
      confirmationNotifiedAt: new Date(),
    });

    const tasks = [
      notifyBookingConfirmed(
        booking,
        paymentData.userEmail || booking.userEmail,
        paymentData.userPhone || booking.userPhone
      ),
    ];

    if (notifyAdmin) {
      tasks.push(notifyNewBooking(booking, booking.boat || paymentData.boat));
    }

    await Promise.all(tasks);
    return { ok: true };
  } catch (error) {
    console.warn('Payment success notification failed:', error.message);
    return { ok: false, error: error.message };
  }
};

export const notifyRefundRequest = async (refund, boat) => {
  const [adminEmails, adminPhones] = await Promise.all([
    getAdminEmailsForBoat(boat),
    getAdminPhonesForBoat(boat),
  ]);

  return sendNotification({
    type: 'admin_refund_request',
    adminEmails,
    adminPhones,
    payload: { refund },
  });
};
