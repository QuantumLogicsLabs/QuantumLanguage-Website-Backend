const express = require("express");
const rateLimit = require("express-rate-limit");
const config = require("../config");
const { runLanguage, listLanguages } = require("../controllers/language.controller");

// Mounted at both /api and / (see app.js): POST /api/cpp and POST /cpp are
// the same endpoint, and both share one rate-limit budget per client.
const router = express.Router();

const runLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many execution requests. Please slow down." },
});

router.get("/languages", listLanguages);

for (const id of Object.keys(config.LANGUAGES)) {
  router.post(`/${id}`, runLimiter, runLanguage(id));
  router.all(`/${id}`, (req, res) => {
    res.set("Allow", "POST");
    res.status(405).json({ success: false, error: `Use POST /api/${id} with a JSON body { "code": "..." }.` });
  });
}

module.exports = router;
