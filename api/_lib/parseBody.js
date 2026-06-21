function parseJsonBody(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString("utf8"));
    } catch {
      return {};
    }
  }

  return req.body;
}

module.exports = { parseJsonBody };
