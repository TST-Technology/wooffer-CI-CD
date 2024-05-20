const crypto = require("crypto");

// Verify GitHub webhook secret
exports.verifyGithubSignature = async (req, res, next) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const signature = req.headers["x-hub-signature-256"];

  // Ensure both the secret and signature are present
  if (!secret || !signature) {
    return res.status(403).send("Forbidden");
  }

  const hash = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("hex")}`;

  if (signature !== hash) {
    return res.status(403).send("Forbidden");
  }

  next();
};
