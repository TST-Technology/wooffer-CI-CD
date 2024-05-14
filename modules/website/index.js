"use strict";

const router = require("express").Router();
const website = require("./controller");

//<==================== Public APIs ====================>
router.get("/gitPull", website.gitPull);
router.post("/gitPull", website.gitPull);
router.get("/rebuild", website.rebuild);
router.post("/rebuild", website.rebuild);

module.exports = router;
