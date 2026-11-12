const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  app.use(
    ["/api", "/health"],
    createProxyMiddleware({
      target: process.env.API_PROXY_TARGET || "http://localhost:5001",
      changeOrigin: true,
      onError(error, request, response) {
        console.error(`API proxy unavailable for ${request.method} ${request.url}:`, error.message);
        if (!response.headersSent) {
          response.writeHead(503, { "Content-Type": "application/json" });
        }
        response.end(JSON.stringify({
          error: "Payment API is unavailable. Start the app with npm start."
        }));
      },
    })
  );
};
