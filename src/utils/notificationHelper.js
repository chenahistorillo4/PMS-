import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  sendNotification,
  getAdminEmailsForBoat,
  getAdminPhonesForBoat,
  getUserPhone,
  pickBookingFields,
} from './emailNotifications';

const createInAppNotification = async (notification, eventId) => {
  if (!eventId) {
    throw new Error('An event ID is required to create an in-app notification.');
  }

  const notificationId = `${notification.recipientType}_${notification.type}_${eventId}`;
  const notificationRef = doc(db, 'notifications', notificationId);
  return runTransaction(db, async (transaction) => {
    const existingNotification = await transaction.get(notificationRef);
    if (existingNotification.exists()) return false;

    transaction.set(notificationRef, {
      ...notification,
      isRead: false,
      createdAt: new Date(),
    });
    return true;
  });
};

const createAdminInAppNotification = async ({
  boat,
  type,
  title,
  message,
  eventId,
  ...details
}) => {
  if (!boat) return false;

  return createInAppNotification(
    { boat, type, title, message, recipientType: 'admin', ...details },
    eventId
  );
};

export const notifyNewBookingReceived = async (booking, bookingId, capacity) => {
  await createAdminInAppNotification({
    boat: booking.boat,
    type: 'new_booking_received',
    title: 'New Booking Received',
    message: `${booking.customerName || 'A passenger'} booked ${booking.tripName || 'a trip'}.`,
    eventId: bookingId,
    bookingId,
    tripId: booking.tripId,
    tripDetails: {
      name: booking.tripName,
      date: booking.date,
      departure: booking.departure,
      arrival: booking.arrival,
      boat: booking.boat,
    },
  });

  const tripCapacity = Number(capacity);
  if (!booking.tripId || !Number.isFinite(tripCapacity) || tripCapacity <= 0) return;

  const bookingsSnapshot = await getDocs(
    query(collection(db, 'bookings'), where('tripId', '==', booking.tripId))
  );
  const occupiedSeats = bookingsSnapshot.docs.filter((bookingDoc) => {
    const status = String(bookingDoc.data().status || '').toLowerCase();
    return !['cancelled', 'failed'].includes(status);
  }).length;

  if (occupiedSeats >= tripCapacity) {
    await createAdminInAppNotification({
      boat: booking.boat,
      type: 'fully_booked_trip',
      title: 'Fully Booked Trip Alert',
      message: `Trip "${booking.tripName || 'Schedule'}" is fully booked (${occupiedSeats}/${tripCapacity} seats).`,
      eventId: booking.tripId,
      tripId: booking.tripId,
      tripDetails: {
        name: booking.tripName,
        date: booking.date,
        departure: booking.departure,
        arrival: booking.arrival,
        boat: booking.boat,
      },
    });
  }
};

export const notifyPaymentReceived = async ({ paymentId, bookingId, notifyAdmin = true }) => {
  if (!paymentId || !bookingId) return null;

  const [paymentSnap, bookingSnap] = await Promise.all([
    getDoc(doc(db, 'payments', paymentId)),
    getDoc(doc(db, 'bookings', bookingId)),
  ]);
  if (!paymentSnap.exists() || !bookingSnap.exists()) return null;

  const payment = paymentSnap.data();
  const booking = { id: bookingSnap.id, ...bookingSnap.data() };
  const reference = booking.referenceCode ? ` (${booking.referenceCode})` : '';
  const bookingConfirmed = payment.status === 'completed' || booking.status === 'confirmed';
  const paymentMessage = `We received your payment of ₱${Number(payment.amount || booking.finalPrice || 0).toFixed(2)} for ${booking.tripName || 'your trip'}${reference}.`;
  const tasks = [];

  if (booking.userId) {
    tasks.push(
      createInAppNotification(
        {
          userId: booking.userId,
          type: 'payment_confirmation',
          title: bookingConfirmed ? 'Payment Confirmed' : 'Payment Received',
          message: bookingConfirmed
            ? `${paymentMessage} Your booking is confirmed.`
            : `${paymentMessage} Your booking is awaiting port staff confirmation.`,
          recipientType: 'user',
          bookingId,
          tripId: booking.tripId,
        },
        paymentId
      )
    );
  }

  if (notifyAdmin) {
    tasks.push(
      createAdminInAppNotification({
        boat: booking.boat || payment.boat,
        type: 'new_payment_received',
        title: 'New Payment Received',
        message: `Payment of ₱${Number(payment.amount || booking.finalPrice || 0).toFixed(2)} received for ${booking.tripName || 'a trip'}${reference}.`,
        eventId: paymentId,
        paymentId,
        bookingId,
        tripId: booking.tripId,
      })
    );
  }

  await Promise.all(tasks);
  return { ok: true };
};

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
    const passengerBookings = bookingsSnap.docs.filter((bookingDoc) =>
      Boolean(bookingDoc.data().userId)
    );

    const notificationPromises = passengerBookings.map((bookingDoc) => {
      const bookingData = bookingDoc.data();
      return addDoc(collection(db, 'notifications'), {
        userId: bookingData.userId,
        type,
        title,
        message,
        tripDetails,
        tripId,
        bookingId: bookingDoc.id,
        bookingAmount: bookingData.finalPrice || 0,
        recipientType: 'user',
        isRead: false,
        createdAt: new Date(),
      });
    });

    await Promise.all(notificationPromises);
    console.log(`User notifications created for ${passengerBookings.length} passengers`);

    if (type === 'trip_cancelled') {
      const results = await Promise.all(
        passengerBookings.map(async (bookingDoc) => {
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

export const notifyBookingConfirmed = async (booking, userEmail, userPhone) => {
  if (booking.userId) {
    try {
      await createInAppNotification(
        {
          userId: booking.userId,
          type: 'booking_confirmation',
          title: 'Booking Confirmed',
          message: `Your booking for ${booking.tripName || 'your trip'} is confirmed.`,
          recipientType: 'user',
          bookingId: booking.id,
          tripId: booking.tripId,
        },
        booking.id
      );
    } catch (error) {
      console.error('Booking confirmation in-app notification failed:', error);
    }
  }

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
    const bookingSnap = await getDoc(doc(db, 'bookings', bookingId));
    if (!bookingSnap.exists()) return null;

    const booking = pickBookingFields({
      id: bookingSnap.id,
      ...bookingSnap.data(),
      status: 'confirmed',
    });

    await notifyPaymentReceived({ paymentId, bookingId, notifyAdmin: true }).catch((error) =>
      console.error('Payment in-app notification failed:', error)
    );

    if (booking.userId) {
      try {
        await createInAppNotification(
          {
            userId: booking.userId,
            type: 'booking_confirmation',
            title: 'Booking Confirmed',
            message: `Your booking for ${booking.tripName || 'your trip'} is confirmed.`,
            recipientType: 'user',
            bookingId,
            tripId: booking.tripId,
          },
          bookingId
        );
      } catch (error) {
        console.error('Booking confirmation in-app notification failed:', error);
      }
    }

    if (paymentData.confirmationNotified) return { ok: true, alreadyNotified: true };

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

    const results = await Promise.all(tasks);
    const failed = results.filter((result) => result?.ok === false);

    if (failed.length === 0) {
      await updateDoc(paymentRef, {
        confirmationNotified: true,
        confirmationNotifiedAt: new Date(),
      });
    }

    return failed.length === 0 ? { ok: true, result: results } : { ok: false, result: results };
  } catch (error) {
    console.warn('Payment success notification failed:', error.message);
    return { ok: false, error: error.message };
  }
};

export const notifyRefundRequest = async (refund, boat) => {
  const refundId = refund.id || refund.refundId;
  if (refund.userId && refundId) {
    try {
      await createAdminInAppNotification({
        boat,
        type: 'refund_request_submitted',
        title: 'Refund Request Submitted',
        message: `${refund.userEmail || 'A passenger'} submitted a refund request for ${refund.tripName || 'a trip'}.`,
        eventId: refundId,
        refundId,
        bookingId: refund.bookingId,
        tripId: refund.tripId,
      });
    } catch (error) {
      console.error('Refund request in-app notification failed:', error);
    }
  }

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

export const notifyPassengerRefundStatus = async ({ refund, status, userEmail, userPhone, customerName }) => {
  return sendNotification({
    type: 'passenger_refund_status',
    to: userEmail || refund.userEmail,
    toPhone: userPhone,
    payload: {
      customerName,
      refund,
      status,
    },
  });
};
