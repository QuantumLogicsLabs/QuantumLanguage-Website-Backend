const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { resolveQrunPath } = require("../services/qrun.service");
const config = require("../config");

let activeConnection = null;
let activeProcess = null;

function setupWebSocket(server) {
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
        if (activeConnection) activeConnection.close();
        activeConnection = ws;

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);

                switch (data.type) {
                    case 'run':
                        if (activeProcess) {
                            activeProcess.kill();
                            activeProcess = null;
                        }

                        // Execute directly - no intermediate status messages
                        const fileHash = crypto.randomBytes(8).toString('hex');
                        const rawExt = typeof data.ext === 'string' ? data.ext : '.sa';
const safeExt = config.ALLOWED_EXTENSIONS.includes(rawExt) ? rawExt : '.sa';
const tempFilePath = path.join(config.SANDBOX_DIR, `sandbox_${fileHash}${safeExt}`);

                        fs.writeFile(tempFilePath, data.payload, (err) => {
                            if (err) {
                                ws.send(JSON.stringify({ type: 'stderr', payload: '\x1b[31mSystem Error: Failed to allocate sandbox space.\x1b[0m\r\n' }));
                                return;
                            }

                            const qrunPath = resolveQrunPath();
                            if (!qrunPath) {
                                ws.send(JSON.stringify({ type: 'stderr', payload: '\x1b[31mExecution engine (qrun) not found in backend.\x1b[0m\r\n' }));
                                fs.unlink(tempFilePath, () => {});
                                return;
                            }

                            const needsShell = qrunPath.toLowerCase().endsWith('.bat');
activeProcess = spawn(qrunPath, [tempFilePath], { shell: needsShell });

                            activeProcess.stdout.on('data', (outputData) => {
                                const text = outputData.toString().replace(/\n/g, '\r\n');
                                ws.send(JSON.stringify({ type: 'stdout', payload: text }));
                            });

                            activeProcess.stderr.on('data', (errorData) => {
                                const text = errorData.toString().replace(/\n/g, '\r\n');
                                ws.send(JSON.stringify({ type: 'stderr', payload: text }));
                            });

                            activeProcess.on('close', (code) => {
                                fs.unlink(tempFilePath, () => {});
                                activeProcess = null;
                            });
                            activeProcess.on('error', (spawnErr) => {
    ws.send(JSON.stringify({ type: 'stderr', payload: `\x1b[31mFailed to start execution engine: ${spawnErr.message}\x1b[0m\r\n` }));
    fs.unlink(tempFilePath, () => {});
    activeProcess = null;
});
                        });
                        break;

                    case 'input':
                        if (activeProcess && activeProcess.stdin) {
                            activeProcess.stdin.write(data.payload);
                        }
                        break;

                    case 'stop':
                        if (activeProcess) {
                            activeProcess.kill();
                            activeProcess = null;
                            ws.send(JSON.stringify({ type: 'status', payload: '\x1b[31mProcess terminated by user.\x1b[0m' }));
                            ws.send(JSON.stringify({ type: 'process_completion' }));
                        }
                        break;
                }
            } catch (err) {
                console.error("WebSocket Error:", err);
            }
        });

        ws.on('close', () => {
            if (activeProcess) {
                activeProcess.kill();
                activeProcess = null;
            }
            if (activeConnection === ws) activeConnection = null;
        });
    });

    return wss;
}

module.exports = { setupWebSocket };
