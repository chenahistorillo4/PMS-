require("./loadEnv");

const admin = require("firebase-admin");

let initialized = false;

function initFirebaseAdmin() {
  if (initialized) {
    return admin;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }

  initialized = true;
  return admin;
}

async function markPaymentCompletedByIntentId(paymongoPaymentIntentId) {
  const app = initFirebaseAdmin();
  const db = app.firestore();
  const paymentsQuery = await db
    .collection("payments")
    .where("paymongoPaymentIntentId", "==", paymongoPaymentIntentId)
    .limit(1)
    .get();

  if (paymentsQuery.empty) {
    throw new Error(`No payment found for intent ${paymongoPaymentIntentId}`);
  }

  const paymentDoc = paymentsQuery.docs[0];
  const paymentData = paymentDoc.data();

  await paymentDoc.ref.update({
    status: "completed",
    paymongoStatus: "paid",
    confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (paymentData.bookingId) {
    await db.collection("bookings").doc(paymentData.bookingId).update({
      status: "confirmed",
    });
  }
}

async function markPaymentFailedByIntentId(paymongoPaymentIntentId) {
  const app = initFirebaseAdmin();
  const db = app.firestore();
  const paymentsQuery = await db
    .collection("payments")
    .where("paymongoPaymentIntentId", "==", paymongoPaymentIntentId)
    .limit(1)
    .get();

  if (paymentsQuery.empty) {
    throw new Error(`No payment found for intent ${paymongoPaymentIntentId}`);
  }

  await paymentsQuery.docs[0].ref.update({
    status: "failed",
    paymongoStatus: "failed",
  });
}

async function markPaymentCompletedBySourceId(paymongoSourceId) {
  const app = initFirebaseAdmin();
  const db = app.firestore();
  const paymentsQuery = await db
    .collection("payments")
    .where("paymongoSourceId", "==", paymongoSourceId)
    .limit(1)
    .get();

  if (paymentsQuery.empty) {
    throw new Error(`No payment found for source ${paymongoSourceId}`);
  }

  const paymentDoc = paymentsQuery.docs[0];
  const paymentData = paymentDoc.data();

  await paymentDoc.ref.update({
    status: "completed",
    paymongoStatus: "paid",
    confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (paymentData.bookingId) {
    await db.collection("bookings").doc(paymentData.bookingId).update({
      status: "confirmed",
    });
  }
}

async function markPaymentFailedBySourceId(paymongoSourceId) {
  const app = initFirebaseAdmin();
  const db = app.firestore();
  const paymentsQuery = await db
    .collection("payments")
    .where("paymongoSourceId", "==", paymongoSourceId)
    .limit(1)
    .get();

  if (paymentsQuery.empty) {
    throw new Error(`No payment found for source ${paymongoSourceId}`);
  }

  await paymentsQuery.docs[0].ref.update({
    status: "failed",
    paymongoStatus: "failed",
  });
}

module.exports = {
  initFirebaseAdmin,
  markPaymentCompletedByIntentId,
  markPaymentFailedByIntentId,
  markPaymentCompletedBySourceId,
  markPaymentFailedBySourceId,
};
