const express = require("express");
const router = express.Router();

// router.use("/appConfig", require("../modules/appConfig"));
router.use("/website", require("../modules/website"));

module.exports = router;
