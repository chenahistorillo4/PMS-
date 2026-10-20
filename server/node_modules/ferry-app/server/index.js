require("dotenv").config();

const { createApp } = require("./app");

const app = createApp();
const PORT = process.env.API_PORT || 5001;

app.listen(PORT, () => {
  console.log(`PayMongo server listening on http://localhost:${PORT}`);
});
