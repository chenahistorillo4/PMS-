require('./loadEnv');

const admin = require('firebase-admin');

let initialized = false;

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
    confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (paymentData.bookingId) {
    batch.update(db.collection('bookings').doc(paymentData.bookingId), {
      status: 'confirmed',
    });
  }
  await batch.commit();
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

  await paymentsQuery.docs[0].ref.update({
    status: 'failed',
    paymongoStatus: 'failed',
  });
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

  await paymentsQuery.docs[0].ref.update({
    status: 'failed',
    paymongoStatus: 'failed',
  });
}

module.exports = {
  initFirebaseAdmin,
  markPaymentCompletedByIntentId,
  markPaymentFailedByIntentId,
  markPaymentCompletedBySourceId,
  markPaymentFailedBySourceId,
};
