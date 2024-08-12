const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const projectsConfigPath = path.join(__dirname, "../configs.json");
const projectsConfig = JSON.parse(fs.readFileSync(projectsConfigPath, "utf8"));

async function generateHmacSha256(secret, payload) {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  return `sha256=${hmac.digest("hex")}`;
}

exports.verifyGithubSignature = async (req, res, next) => {
  const projectName = req.body.repository.name;
  const projectConfig = projectsConfig.projects[projectName];

  if (!projectConfig) {
    return res.status(400).send("Project not found");
  }

  const secret = projectConfig.githubWebhookSecret;
  const signature = req.headers["x-hub-signature-256"];

  if (!secret) {
    return res
      .status(403)
      .send("Forbidden: GitHub Webhook Secret is not set for this project");
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
