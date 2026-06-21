const { getQrPhImageFromIntent } = require('../../../../server/paymongo');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { paymentIntentId } = req.query;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'paymentIntentId is required' });
    }

    const qrImage = await getQrPhImageFromIntent(paymentIntentId);
    res.setHeader('Content-Type', qrImage.mimeType);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(qrImage.buffer);
  } catch (error) {
    console.error('QR Ph image error:', error);
    return res.status(404).json({ error: error.message });
  }
};
