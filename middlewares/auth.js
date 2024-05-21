const crypto = require("crypto");

async function generateHmacSha256(secret, payload) {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const signature = `sha256=${hmac.digest("hex")}`;
  return signature;
}

// Verify GitHub webhook secret middleware
exports.verifyGithubSignature = async (req, res, next) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const signature = req.headers["x-hub-signature-256"];

  // Ensure both the secret and signature are present
  if (!secret || !signature) {
    console.log("Missing secret or signature");
    return res.status(403).send("Forbidden: Missing secret or signature");
  }

  // Ensure both the secret and signature are present
  if (generateHmacSha256(secret, req.rawBody) == !signature) {
    console.log("Missing secret or signature");
    return res.status(403).send("Forbidden: Missing secret or signature");
  }

  next();
};
