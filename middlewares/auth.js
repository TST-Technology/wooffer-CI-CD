const crypto = require("crypto");

// Verify GitHub webhook secret
exports.verifyGithubSignature = (req, res, next) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const signature = req.headers["x-hub-signature-256"];

  // Log the values for debugging
  console.log("Secret:", secret);
  console.log("Signature:", signature);

  // Ensure both the secret and signature are present
  if (!secret || !signature) {
    return res.status(403).send("Forbidden: Missing secret or signature");
  }

  const hash = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("hex")}`;

  console.log("Calculated Hash:", hash);

  if (signature !== hash) {
    return res.status(403).send("Forbidden: Signature mismatch");
  }

  next();
};
