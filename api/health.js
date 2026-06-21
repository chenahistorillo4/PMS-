const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, "../server/.env"),
});

module.exports = (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    paymongoConfigured: Boolean(process.env.PAYMONGO_SECRET_KEY),
  });
};
