const express = require("express");
const router = express.Router();

// API routes
router.use("/api/v1/deployment", require("../modules/website"));

module.exports = router;
