const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { Readable } = require("node:stream");
const { test } = require("node:test");
const {
  getPaymongoMode,
  readRawBody,
  verifyPaymongoSignature,
} = require("./paymongoWebhookSignature");

const secret = "test-webhook-secret";
const timestamp = "1496734173";
const rawBody = Buffer.from('{"data":{"attributes":{"type":"payment.paid"}}}');

function sign(body = rawBody, signingSecret = secret) {
  return createHmac("sha256", signingSecret)
    .update(timestamp)
    .update(".")
    .update(body)
    .digest("hex");
}

function signatureHeader(testSignature = sign(), liveSignature = sign()) {
  return `t=${timestamp},te=${testSignature},li=${liveSignature}`;
}

test("selects PayMongo environment from the API key prefix", () => {
  assert.equal(getPaymongoMode("sk_test_example"), "test");
  assert.equal(getPaymongoMode("sk_live_example"), "live");
  assert.equal(getPaymongoMode("invalid"), null);
});

test("verifies the test and live signature fields against the exact raw body", () => {
  const testSignature = sign(rawBody, secret);
  const liveSecret = "live-webhook-secret";
  const liveSignature = sign(rawBody, liveSecret);

  assert.equal(
    verifyPaymongoSignature({
      header: signatureHeader(testSignature, liveSignature),
      rawBody,
      secret,
      mode: "test",
    }),
    true
  );
  assert.equal(
    verifyPaymongoSignature({
      header: signatureHeader(testSignature, liveSignature),
      rawBody,
      secret: liveSecret,
      mode: "live",
    }),
    true
  );
});

test("rejects altered payloads, malformed signatures, and missing configuration", () => {
  assert.equal(
    verifyPaymongoSignature({
      header: signatureHeader(),
      rawBody: Buffer.from(`${rawBody.toString()} `),
      secret,
      mode: "test",
    }),
    false
  );
  assert.equal(
    verifyPaymongoSignature({
      header: `t=${timestamp},te=bad,li=`,
      rawBody,
      secret,
      mode: "test",
    }),
    false
  );
  assert.equal(
    verifyPaymongoSignature({
      header: signatureHeader(),
      rawBody,
      secret: "",
      mode: "test",
    }),
    false
  );
  assert.equal(
    verifyPaymongoSignature({
      header: signatureHeader(),
      rawBody: JSON.parse(rawBody.toString()),
      secret,
      mode: "test",
    }),
    false
  );
});

test("reads exact request bytes without rebuilding parsed JSON", async () => {
  const nonCanonicalJson = Buffer.from('{ "data" : { "value" : 1 } }\n');
  const received = await readRawBody(Readable.from([nonCanonicalJson]));

  assert.deepEqual(received, nonCanonicalJson);
  assert.equal(
    verifyPaymongoSignature({
      header: signatureHeader(sign(nonCanonicalJson)),
      rawBody: received,
      secret,
      mode: "test",
    }),
    true
  );
  assert.equal(await readRawBody({ body: { data: { value: 1 } } }), null);
});

test("rejects oversized webhook bodies", async () => {
  await assert.rejects(
    readRawBody(Readable.from([Buffer.alloc(5)]), 4),
    { code: "WEBHOOK_BODY_TOO_LARGE" }
  );
});
