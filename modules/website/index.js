const router = require("express").Router();
const websiteController = require("./controller");
const { verifyGithubSignature } = require("../../middlewares/auth");

router.post("/webhook", verifyGithubSignature, websiteController.gitPull);
router.post("/rebuild", websiteController.rebuild);

module.exports = router;
