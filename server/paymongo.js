require("./loadEnv");

const PAYMONGO_API = "https://api.paymongo.com/v1";

function getAuthHeader() {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) {
    throw new Error("PAYMONGO_SECRET_KEY is not configured");
  }
  const encoded = Buffer.from(`${secretKey}:`).toString("base64");
  return `Basic ${encoded}`;
}

async function paymongoRequest(method, path, body) {
  const response = await fetch(`${PAYMONGO_API}${path}`, {
    method,
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json();
  if (!response.ok) {
    const message =
      payload?.errors?.[0]?.detail ||
      payload?.errors?.[0]?.code ||
      "PayMongo request failed";
    throw new Error(message);
  }

  return payload;
}

function toCentavos(amount) {
  return Math.round(Number(amount) * 100);
}

const GCASH_NOT_ENABLED_MESSAGE =
  "GCash is not enabled on your PayMongo account. Go to PayMongo Dashboard → Settings → Payment Methods and activate GCash, or email support@paymongo.com.";

async function createGcashCheckoutViaSource({
  amount,
  customerName,
  customerEmail,
  returnUrl,
  metadata = {},
}) {
  const failedUrl = returnUrl.includes("?")
    ? `${returnUrl}&paymongo_status=failed`
    : `${returnUrl}?paymongo_status=failed`;

  const source = await paymongoRequest("POST", "/sources", {
    data: {
      attributes: {
        amount: toCentavos(amount),
        currency: "PHP",
        type: "gcash",
        redirect: {
          success: returnUrl,
          failed: failedUrl,
        },
        billing: {
          name: customerName || "Ferry Customer",
          email: customerEmail || "customer@pmsferry.local",
        },
        metadata,
      },
    },
  });

  const checkoutUrl = source.data.attributes.redirect?.checkout_url;
  if (!checkoutUrl) {
    throw new Error("PayMongo did not return a GCash checkout URL");
  }

  return {
    flow: "source",
    sourceId: source.data.id,
    paymentIntentId: null,
    redirectUrl: checkoutUrl,
    status: source.data.attributes.status,
  };
}

async function createGcashCheckoutViaPaymentIntent({
  amount,
  description,
  customerName,
  customerEmail,
  returnUrl,
  metadata = {},
}) {
  const paymentIntent = await paymongoRequest("POST", "/payment_intents", {
    data: {
      attributes: {
        amount: toCentavos(amount),
        payment_method_allowed: ["gcash"],
        currency: "PHP",
        description,
        statement_descriptor: "PMS Ferry",
        metadata,
      },
    },
  });

  const paymentIntentId = paymentIntent.data.id;
  const clientKey = paymentIntent.data.attributes.client_key;

  const paymentMethod = await paymongoRequest("POST", "/payment_methods", {
    data: {
      attributes: {
        type: "gcash",
        billing: {
          name: customerName || "Ferry Customer",
          email: customerEmail || "customer@pmsferry.local",
        },
      },
    },
  });

  const attached = await paymongoRequest(
    "POST",
    `/payment_intents/${paymentIntentId}/attach`,
    {
      data: {
        attributes: {
          payment_method: paymentMethod.data.id,
          client_key: clientKey,
          return_url: returnUrl,
        },
      },
    }
  );

  const redirectUrl =
    attached?.data?.attributes?.next_action?.redirect?.url || null;

  if (!redirectUrl) {
    throw new Error("PayMongo did not return a GCash redirect URL");
  }

  return {
    flow: "payment_intent",
    sourceId: null,
    paymentIntentId,
    redirectUrl,
    status: attached.data.attributes.status,
  };
}

async function createQrPhCheckout({
  amount,
  description,
  metadata = {},
}) {
  const paymentIntent = await paymongoRequest("POST", "/payment_intents", {
    data: {
      attributes: {
        amount: toCentavos(amount),
        payment_method_allowed: ["qrph"],
        currency: "PHP",
        description,
        statement_descriptor: "PMS Ferry",
        metadata,
      },
    },
  });

  const paymentIntentId = paymentIntent.data.id;
  const clientKey = paymentIntent.data.attributes.client_key;

  const paymentMethod = await paymongoRequest("POST", "/payment_methods", {
    data: {
      attributes: {
        type: "qrph",
      },
    },
  });

  const attached = await paymongoRequest(
    "POST",
    `/payment_intents/${paymentIntentId}/attach`,
    {
      data: {
        attributes: {
          payment_method: paymentMethod.data.id,
          client_key: clientKey,
        },
      },
    }
  );

  const qrImageUrl = normalizeQrImageUrl(
    attached?.data?.attributes?.next_action?.code?.image_url
  );

  if (!qrImageUrl) {
    throw new Error("PayMongo did not return a QR Ph code image");
  }

  return {
    flow: "qrph",
    sourceId: null,
    paymentIntentId,
    qrImageUrl,
    redirectUrl: null,
    status: attached.data.attributes.status,
  };
}

function normalizeQrImageUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") {
    return null;
  }

  const trimmed = imageUrl.trim();
  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }

  return `data:image/png;base64,${trimmed}`;
}

function decodeQrImageBuffer(imageUrl) {
  const normalized = normalizeQrImageUrl(imageUrl);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    mimeType: `image/${match[1]}`,
    buffer: Buffer.from(match[2], "base64"),
  };
}

async function getQrPhImageFromIntent(paymentIntentId) {
  const paymentIntent = await getPaymentIntent(paymentIntentId);
  const status = paymentIntent.attributes.status;
  const imageUrl = paymentIntent.attributes?.next_action?.code?.image_url;

  if (!imageUrl) {
    if (status === "awaiting_payment_method") {
      throw new Error(
        "QR code expired. Generate a new code and try again."
      );
    }
    throw new Error("QR code is not available for this payment.");
  }

  const decoded = decodeQrImageBuffer(imageUrl);
  if (!decoded) {
    throw new Error("PayMongo returned an invalid QR code image.");
  }

  return {
    status,
    imageUrl: normalizeQrImageUrl(imageUrl),
    ...decoded,
  };
}

async function refreshQrPhCheckout(paymentIntentId) {
  const paymentIntent = await getPaymentIntent(paymentIntentId);
  const clientKey = paymentIntent.attributes.client_key;

  const paymentMethod = await paymongoRequest("POST", "/payment_methods", {
    data: {
      attributes: {
        type: "qrph",
      },
    },
  });

  const attached = await paymongoRequest(
    "POST",
    `/payment_intents/${paymentIntentId}/attach`,
    {
      data: {
        attributes: {
          payment_method: paymentMethod.data.id,
          client_key: clientKey,
        },
      },
    }
  );

  const qrImageUrl = normalizeQrImageUrl(
    attached?.data?.attributes?.next_action?.code?.image_url
  );

  if (!qrImageUrl) {
    throw new Error("PayMongo did not return a refreshed QR Ph code image");
  }

  return {
    paymentIntentId,
    qrImageUrl,
    status: attached.data.attributes.status,
  };
}

async function createGcashCheckout(params) {
  const errors = [];

  try {
    return await createGcashCheckoutViaSource(params);
  } catch (sourceError) {
    errors.push(`Sources: ${sourceError.message}`);
  }

  try {
    return await createGcashCheckoutViaPaymentIntent(params);
  } catch (intentError) {
    errors.push(`Payment Intent: ${intentError.message}`);
  }

  const notAllowed = errors.some((entry) =>
    entry.toLowerCase().includes("not allowed")
  );

  if (notAllowed) {
    throw new Error(GCASH_NOT_ENABLED_MESSAGE);
  }

  throw new Error(errors.join(" | "));
}

async function getPaymentIntent(paymentIntentId) {
  const payload = await paymongoRequest(
    "GET",
    `/payment_intents/${paymentIntentId}`
  );
  return payload.data;
}

async function getSource(sourceId) {
  const payload = await paymongoRequest("GET", `/sources/${sourceId}`);
  return payload.data;
}

async function chargeSource(sourceId) {
  const source = await getSource(sourceId);
  const sourceStatus = source.attributes.status;

  if (sourceStatus === "paid") {
    return { status: "paid", sourceStatus };
  }

  if (sourceStatus !== "chargeable") {
    return { status: sourceStatus, sourceStatus };
  }

  await paymongoRequest("POST", "/payments", {
    data: {
      attributes: {
        amount: source.attributes.amount,
        source: {
          id: sourceId,
          type: "source",
        },
        currency: "PHP",
      },
    },
  });

  return { status: "paid", sourceStatus: "paid" };
}

module.exports = {
  createQrPhCheckout,
  createGcashCheckout,
  getPaymentIntent,
  getQrPhImageFromIntent,
  refreshQrPhCheckout,
  getSource,
  chargeSource,
};
