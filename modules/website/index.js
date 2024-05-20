"use strict";

const router = require("express").Router();
const website = require("./controller");
const { verifyGithubSignature } = require("../../middlewares/auth");

// Public APIs
// router.get("/gitPull",verifyGithubSignature, website.gitPull);
router.post("/gitPull", verifyGithubSignature, website.gitPull);
router.get("/rebuild", website.rebuild);
router.post("/rebuild", website.rebuild);

module.exports = router;
