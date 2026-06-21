const { getPaymentIntent } = require("../../../server/paymongo");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { paymentIntentId } = req.query;

    if (!paymentIntentId) {
      return res.status(400).json({ error: "paymentIntentId is required" });
    }

    const paymentIntent = await getPaymentIntent(paymentIntentId);
    return res.status(200).json({
      status: paymentIntent.attributes.status,
      payments: paymentIntent.attributes.payments || [],
    });
  } catch (error) {
    console.error("Payment status error:", error);
    return res.status(500).json({ error: error.message });
  }
};
