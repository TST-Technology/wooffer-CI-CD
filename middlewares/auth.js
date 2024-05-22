const crypto = require("crypto");

async function generateHmacSha256(secret, payload) {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  return `sha256=${hmac.digest("hex")}`;
}

exports.verifyGithubSignature = async (req, res, next) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const signature = req.headers["x-hub-signature-256"];

  if (!secret) {
    return res
      .status(403)
      .send("Forbidden: GITHUB_WEBHOOK_SECRET environment variable is not set");
  }

  if (!signature) {
    return res
      .status(403)
      .send("Forbidden: 'x-hub-signature-256' header is missing");
  }

  try {
    const generatedSignature = await generateHmacSha256(secret, req.rawBody);
    if (
      !crypto.timingSafeEqual(
        Buffer.from(generatedSignature),
        Buffer.from(signature)
      )
    ) {
      return res.status(403).send("Forbidden: Invalid signature");
    }
  } catch (error) {
    console.error("Error verifying GitHub signature:", error);
    return res
      .status(500)
      .send("Internal Server Error: Failed to verify GitHub signature");
  }

  next();
};
