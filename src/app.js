const express = require("express");
const cors = require("cors");
const config = require("./config");
const executeRoutes = require("./routes/execute.routes");
const healthRoutes = require("./routes/health.routes");

const app = express();

// CORS: use the allow-list if provided (and not wildcard), else allow all.
const corsOrigin =
  config.ALLOWED_ORIGINS.length && !config.ALLOWED_ORIGINS.includes("*")
    ? config.ALLOWED_ORIGINS
    : true;

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "256kb" }));

app.use("/api/health", healthRoutes);
app.use("/api/execute", executeRoutes);

// 404 handler for anything unmatched.
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Not found." });
});

// Central error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, error: "Internal server error." });
});

module.exports = app;