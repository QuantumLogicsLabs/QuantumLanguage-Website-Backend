const config = require("../config");
const { resolveQrunPath } = require("../services/qrun.service");

function health(req, res) {
  res.json({
    status: "ok",
    qrunAvailable: Boolean(resolveQrunPath()),
    environment: config.NODE_ENV,
  });
}

module.exports = { health };