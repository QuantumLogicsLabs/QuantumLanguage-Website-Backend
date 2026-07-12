const express = require("express")
const rateLimit = require("express-rate-limit")
const config = require("../config")
const {execute} = require("../controllers/execute.controller")

const router = express.Router();

const executeLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many execution requests. Please slow down." },
});

router.post("/", executeLimiter, execute);

module.exports = router;