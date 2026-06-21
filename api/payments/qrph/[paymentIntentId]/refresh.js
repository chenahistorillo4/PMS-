require("../../../server/loadEnv");

const { refreshQrPhCheckout } = require("../../../server/paymongo");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { paymentIntentId } = req.query;

    if (!paymentIntentId) {
      return res.status(400).json({ error: "paymentIntentId is required" });
    }

    const checkout = await refreshQrPhCheckout(paymentIntentId);
    return res.status(200).json(checkout);
  } catch (error) {
    console.error("QR Ph refresh error:", error);
    return res.status(500).json({ error: error.message });
  }
};
