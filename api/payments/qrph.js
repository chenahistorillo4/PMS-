require("../server/loadEnv");

const { createQrPhCheckout } = require("../server/paymongo");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { paymentId, amount, bookingId } = req.body || {};

    if (!paymentId || !amount) {
      return res.status(400).json({
        error: "paymentId and amount are required",
      });
    }

    const checkout = await createQrPhCheckout({
      amount,
      description: `PMS Ferry booking ${bookingId || paymentId}`,
      metadata: {
        paymentId,
        bookingId: bookingId || "",
      },
    });

    return res.status(200).json(checkout);
  } catch (error) {
    console.error("QR Ph checkout error:", error);
    return res.status(500).json({ error: error.message });
  }
};
