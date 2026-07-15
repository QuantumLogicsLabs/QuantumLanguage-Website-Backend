require('dotenv').config();

const app = require('./src/app');
const config = require('./src/config');
const { resolveQrunPath } = require('./src/services/qrun.service');
const { setupWebSocket } = require('./src/socket/socketServer');

const server = app.listen(config.PORT, () => {
  console.log(`Quantum Language Engine API online on port ${config.PORT} (${config.NODE_ENV})`);
  console.log(
    resolveQrunPath()
      ? `Execution engine found at ${resolveQrunPath()}`
      : "Execution engine not found — falling back to demo samples only."
  );

  // Initialize WebSocket server for live execution streaming
  setupWebSocket(server);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.PORT} is already in use. Set PORT to a different value or stop the process using it.`);
  } else {
    console.error('Failed to start server:', err);
  }
  process.exit(1);
});

module.exports = app;
