const { createHmac, timingSafeEqual } = require("crypto");

function getPaymongoMode(apiSecretKey) {
  if (typeof apiSecretKey !== "string") return null;
  if (apiSecretKey.startsWith("sk_live_")) return "live";
  if (apiSecretKey.startsWith("sk_test_")) return "test";
  return null;
}

function parseSignatureHeader(header) {
  if (typeof header !== "string") return null;

  const fields = {};
  for (const part of header.split(",")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex < 1) return null;

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (Object.prototype.hasOwnProperty.call(fields, key)) return null;
    fields[key] = value;
  }

  if (
    Object.keys(fields).length !== 3 ||
    !/^\d+$/.test(fields.t || "") ||
    typeof fields.te !== "string" ||
    typeof fields.li !== "string"
  ) {
    return null;
  }

  return fields;
}

function verifyPaymongoSignature({ header, rawBody, secret, mode }) {
  if (
    !secret ||
    !Buffer.isBuffer(rawBody) ||
    !["test", "live"].includes(mode)
  ) {
    return false;
  }

  const fields = parseSignatureHeader(header);
  if (!fields) return false;

  const receivedSignature = mode === "live" ? fields.li : fields.te;
  if (!/^[a-f\d]{64}$/i.test(receivedSignature)) return false;

  const expectedSignature = createHmac("sha256", secret)
    .update(fields.t)
    .update(".")
    .update(rawBody)
    .digest();
  const actualSignature = Buffer.from(receivedSignature, "hex");

  return (
    actualSignature.length === expectedSignature.length &&
    timingSafeEqual(actualSignature, expectedSignature)
  );
}

async function readRawBody(request, maxBytes = 1024 * 1024) {
  if (!request || typeof request[Symbol.asyncIterator] !== "function") return null;

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      const error = new Error("Webhook request body exceeds the allowed size.");
      error.code = "WEBHOOK_BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks, totalBytes);
}

module.exports = {
  getPaymongoMode,
  readRawBody,
  verifyPaymongoSignature,
};
