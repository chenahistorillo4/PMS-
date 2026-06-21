require("../server/loadEnv");

module.exports = (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    paymongoConfigured: Boolean(process.env.PAYMONGO_SECRET_KEY),
  });
};
