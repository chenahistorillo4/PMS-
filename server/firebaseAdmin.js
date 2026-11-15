require('./loadEnv');

const admin = require('firebase-admin');

let initialized = false;

async function createInAppNotification(db, notificationId, notification) {
  const notificationRef = db.collection('notifications').doc(notificationId);
  await db.runTransaction(async (transaction) => {
    const notificationSnap = await transaction.get(notificationRef);
    if (notificationSnap.exists) return;

    transaction.set(notificationRef, {
      ...notification,
      isRead: false,
      createdAt: new Date(),
    });
  });
}

async function createPaymentInAppNotifications(db, paymentId, payment, booking, bookingConfirmed) {
  if (!booking) return;

  const amount = Number(payment.amount || booking.finalPrice || 0).toFixed(2);
  const reference = booking.referenceCode ? ` (${booking.referenceCode})` : '';
  const paymentMessage = `We received your payment of ₱${amount} for ${booking.tripName || 'your trip'}${reference}.`;
  const tasks = [
    createInAppNotification(db, `admin_new_payment_received_${paymentId}`, {
      boat: booking.boat || payment.boat || null,
      type: 'new_payment_received',
      title: 'New Payment Received',
      message: `Payment of ₱${amount} received for ${booking.tripName || 'a trip'}${reference}.`,
      recipientType: 'admin',
      paymentId,
      bookingId: payment.bookingId,
      tripId: booking.tripId || null,
    }),
  ];

  const userId = booking.userId || payment.userId;
  if (userId) {
    tasks.push(
      createInAppNotification(db, `user_payment_confirmation_${paymentId}`, {
        userId,
        type: 'payment_confirmation',
        title: bookingConfirmed
          ? 'Payment Confirmed'
          : 'Payment Received',
        message: bookingConfirmed
          ? `${paymentMessage} Your booking is confirmed.`
          : `${paymentMessage} Your booking is awaiting port staff confirmation.`,
        recipientType: 'user',
        bookingId: payment.bookingId,
        tripId: booking.tripId || null,
      })
    );

    if (bookingConfirmed) {
      tasks.push(
        createInAppNotification(db, `user_booking_confirmation_${payment.bookingId}`, {
          userId,
          type: 'booking_confirmation',
          title: 'Booking Confirmed',
          message: `Your booking for ${booking.tripName || 'your trip'} is confirmed.`,
          recipientType: 'user',
          bookingId: payment.bookingId,
          tripId: booking.tripId || null,
        })
      );
    }
  }

  await Promise.all(tasks);
}

async function createPaymentCancellationNotification(db, paymentId, payment, booking) {
  const userId = booking?.userId || payment?.userId;
  if (!userId) {
    console.warn(`Cannot notify passenger about cancelled payment ${paymentId}: userId is missing.`);
    return;
  }

  await createInAppNotification(db, `user_payment_expired_${paymentId}`, {
    userId,
    type: 'payment_expired',
    title: 'Payment Expired - Booking Cancelled',
    message: `Payment for ${booking.tripName || payment.trip || 'your trip'} was not completed. Your booking was cancelled.`,
    recipientType: 'user',
    bookingId: payment.bookingId || booking.id,
    tripId: booking.tripId || null,
  });
}

function initFirebaseAdmin() {
  if (initialized) {
    return admin;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'pms-ferry';
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
      projectId,
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  }

  initialized = true;
  return admin;
}

async function markPaymentCompletedByIntentId(paymongoPaymentIntentId) {
  const app = initFirebaseAdmin();
  const db = app.firestore();
  const paymentsQuery = await db
    .collection('payments')
    .where('paymongoPaymentIntentId', '==', paymongoPaymentIntentId)
    .limit(1)
    .get();

  if (paymentsQuery.empty) {
    throw new Error(`No payment found for intent ${paymongoPaymentIntentId}`);
  }

  const paymentDoc = paymentsQuery.docs[0];
  const paymentData = paymentDoc.data();

  const batch = db.batch();
  batch.update(paymentDoc.ref, {
    status: 'completed',
    paymongoStatus: 'paid',
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
    confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (paymentData.bookingId) {
    batch.update(db.collection('bookings').doc(paymentData.bookingId), {
      status: 'confirmed',
    });
  }
  await batch.commit();

  if (paymentData.bookingId) {
    const bookingSnap = await db.collection('bookings').doc(paymentData.bookingId).get();
    if (bookingSnap.exists) {
      await createPaymentInAppNotifications(
        db,
        paymentDoc.id,
        paymentData,
        bookingSnap.data(),
        true
      );
    }
  }
}

async function markPaymentFailedByIntentId(paymongoPaymentIntentId) {
  const app = initFirebaseAdmin();
  const db = app.firestore();
  const paymentsQuery = await db
    .collection('payments')
    .where('paymongoPaymentIntentId', '==', paymongoPaymentIntentId)
    .limit(1)
    .get();

  if (paymentsQuery.empty) {
    throw new Error(`No payment found for intent ${paymongoPaymentIntentId}`);
  }

  const paymentDoc = paymentsQuery.docs[0];
  const paymentData = paymentDoc.data();
  if (!paymentData.bookingId) {
    throw new Error(`Payment ${paymentDoc.id} is not linked to a booking`);
  }

  const bookingRef = db.collection('bookings').doc(paymentData.bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    throw new Error(`Booking ${paymentData.bookingId} was not found`);
  }

  const booking = { id: bookingSnap.id, ...bookingSnap.data() };
  if (paymentData.status === 'completed' || booking.status === 'confirmed') {
    return;
  }

  const batch = db.batch();
  batch.update(paymentDoc.ref, {
    status: 'failed',
    paymongoStatus: 'failed',
    cancelReason: 'payment_expired',
  });
  batch.update(bookingRef, {
    status: 'cancelled',
    cancelReason: 'payment_expired',
  });
  await batch.commit();
  await createPaymentCancellationNotification(db, paymentDoc.id, paymentData, booking);
}

async function markPaymentCompletedBySourceId(paymongoSourceId) {
  const app = initFirebaseAdmin();
  const db = app.firestore();
  const paymentsQuery = await db
    .collection('payments')
    .where('paymongoSourceId', '==', paymongoSourceId)
    .limit(1)
    .get();

  if (paymentsQuery.empty) {
    throw new Error(`No payment found for source ${paymongoSourceId}`);
  }

  const paymentDoc = paymentsQuery.docs[0];
  const paymentData = paymentDoc.data();

  const batch = db.batch();
  batch.update(paymentDoc.ref, {
    status: 'completed',
    paymongoStatus: 'paid',
    confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (paymentData.bookingId) {
    batch.update(db.collection('bookings').doc(paymentData.bookingId), {
      status: 'confirmed',
    });
  }
  await batch.commit();

  if (paymentData.bookingId) {
    const bookingSnap = await db.collection('bookings').doc(paymentData.bookingId).get();
    if (bookingSnap.exists) {
      await createPaymentInAppNotifications(
        db,
        paymentDoc.id,
        paymentData,
        bookingSnap.data(),
        true
      );
    }
  }
}

async function markPaymentFailedBySourceId(paymongoSourceId) {
  const app = initFirebaseAdmin();
  const db = app.firestore();
  const paymentsQuery = await db
    .collection('payments')
    .where('paymongoSourceId', '==', paymongoSourceId)
    .limit(1)
    .get();

  if (paymentsQuery.empty) {
    throw new Error(`No payment found for source ${paymongoSourceId}`);
  }

  const paymentDoc = paymentsQuery.docs[0];
  const paymentData = paymentDoc.data();
  if (!paymentData.bookingId) {
    throw new Error(`Payment ${paymentDoc.id} is not linked to a booking`);
  }

  const bookingRef = db.collection('bookings').doc(paymentData.bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    throw new Error(`Booking ${paymentData.bookingId} was not found`);
  }

  const booking = { id: bookingSnap.id, ...bookingSnap.data() };
  if (paymentData.status === 'completed' || booking.status === 'confirmed') {
    return;
  }

  const batch = db.batch();
  batch.update(paymentDoc.ref, {
    status: 'failed',
    paymongoStatus: 'failed',
    cancelReason: 'payment_expired',
  });
  batch.update(bookingRef, {
    status: 'cancelled',
    cancelReason: 'payment_expired',
  });
  await batch.commit();
  await createPaymentCancellationNotification(db, paymentDoc.id, paymentData, booking);
}

module.exports = {
  initFirebaseAdmin,
  markPaymentCompletedByIntentId,
  markPaymentFailedByIntentId,
  markPaymentCompletedBySourceId,
  markPaymentFailedBySourceId,
};
