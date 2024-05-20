const crypto = require("crypto");

exports.verifyGithubSignature = async (req, res, next) => {
  const secret = process.env.WEBHOOK_SECRET;
  const signature = req.headers["x-hub-signature-256"];
  const payload = JSON.stringify(req.body);

  if (!signature) {
    return res.status(403).send("No signature found");
  }

  const hash = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  if (hash !== signature) {
    return res.status(403).send("Signature mismatch");
  }

  next();
};
