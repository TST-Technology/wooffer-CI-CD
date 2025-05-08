const router = require("express").Router();
const websiteController = require("./controller");
const { verifyGithubSignature } = require("../../middlewares/auth");

// GitHub webhook endpoint for automatic deployments
router.post("/webhook", verifyGithubSignature, websiteController.gitPull);

// Manual deployment endpoint
router.post("/deploy", websiteController.rebuild);

module.exports = router;
