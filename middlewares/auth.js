const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Load project configurations
const configPath = path.join(__dirname, "../config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

// Function to generate HMAC SHA-256 signature
async function generateHmacSha256(secret, payload) {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  return `sha256=${hmac.digest("hex")}`;
}

// Helper function to find project by URL
function findProjectByUrl(repoUrl) {
  // Normalize URL by removing any trailing .git
  const normalizedUrl = repoUrl.replace(/\.git$/, "");
  return config[normalizedUrl];
}

// Middleware to verify GitHub webhook signature
exports.verifyGithubSignature = async (req, res, next) => {
  try {
    // Log the request body for debugging
    console.log("Received request body:", req.body);

    // Extract repository URL from the payload
    const repoUrl = req.body.repository?.html_url;

    if (!repoUrl) {
      console.error("No repository URL found in payload");
      return res.status(400).send("Invalid payload");
    }

    console.log("Received payload for repository:", repoUrl);

    // Load project-specific configuration
    const project = findProjectByUrl(repoUrl);
    if (!project) {
      console.error(`Project config not found for repository: ${repoUrl}`);
      return res.status(400).send("Project not found");
    }

    const secret = project.secret;
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

    // Generate signature from request payload
    const generatedSignature = await generateHmacSha256(secret, req.rawBody);
    console.log("Generated signature:", generatedSignature);

    // Compare signatures using a timing-safe comparison
    if (
      !crypto.timingSafeEqual(
        Buffer.from(generatedSignature),
        Buffer.from(signature)
      )
    ) {
      console.error("Invalid signature");
      return res.status(403).send("Forbidden: Invalid signature");
    }

    // Proceed to the next middleware if signature is valid
    next();
  } catch (error) {
    console.error("Error verifying GitHub signature:", error);
    return res
      .status(500)
      .send("Internal Server Error: Failed to verify GitHub signature");
  }
};
