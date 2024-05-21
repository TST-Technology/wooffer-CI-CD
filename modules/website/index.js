"use strict";

const router = require("express").Router();
const website = require("./controller");
const { verifyGithubSignature } = require("../../middlewares/auth");

// Public APIs
router.post("/webhook", verifyGithubSignature, website.gitPull);
// router.get("/webhook", website.gitPull);
router.post("/rebuild", website.rebuild);
// router.get("/rebuild", website.rebuild);

module.exports = router;
