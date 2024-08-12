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
  try {
    console.log("req.body-------------------------------------", req.body);
    console.log(
      "req.rawBody-------------------------------------",
      req.rawBody
    );
    const payload = req.rawBody; // Directly use req.body if JSON parsing is correct
    const projectName = payload.repository?.name;

    if (!projectName) {
      console.error("No repository name found in payload");
      return res.status(400).send("Invalid payload");
    }

    console.log("Received payload for project:", projectName);

    const projectConfig = projectsConfig[projectName];
    if (!projectConfig) {
      console.error(`Project config not found for project: ${projectName}`);
      return res.status(400).send("Project not found");
    }

    const secret = projectConfig.githubWebhookSecret;
    const signature = req.headers["x-hub-signature-256"];

    console.log("Received signature:", signature);
    console.log("Secret for project:", secret);

    if (!secret) {
      console.error("GitHub Webhook Secret is not set for this project");
      return res
        .status(403)
        .send("Forbidden: GitHub Webhook Secret is not set for this project");
    }

    if (!signature) {
      console.error("'x-hub-signature-256' header is missing");
      return res
        .status(403)
        .send("Forbidden: 'x-hub-signature-256' header is missing");
    }

    const generatedSignature = await generateHmacSha256(secret, req.rawBody);
    console.log("Generated signature:", generatedSignature);

    if (
      !crypto.timingSafeEqual(
        Buffer.from(generatedSignature),
        Buffer.from(signature)
      )
    ) {
      console.error("Invalid signature");
      return res.status(403).send("Forbidden: Invalid signature");
    }

    next();
  } catch (error) {
    console.error("Error verifying GitHub signature:", error);
    return res
      .status(500)
      .send("Internal Server Error: Failed to verify GitHub signature");
  }
};
