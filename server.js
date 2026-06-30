const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }

    next();
});

const allowedExtensions = ['.sa', '.js', '.cpp', '.c'];

function resolveCommand(extension, tempFilePath) {
    const projectRoot = path.resolve(__dirname, '..', 'QuantumLanguage');
    const tempDir = path.dirname(tempFilePath);

    if (extension === '.sa') {
        const candidates = [
            path.join(projectRoot, 'qrun.exe'),
            path.join(projectRoot, 'qrun.bat'),
            path.join(projectRoot, 'build', 'qrun.exe'),
            path.join(projectRoot, 'build', 'qrun.bat'),
            path.join(projectRoot, 'build', 'Release', 'qrun.exe'),
            path.join(projectRoot, 'build', 'Debug', 'qrun.exe')
        ];

        const existing = candidates.find(candidate => fs.existsSync(candidate));
        if (existing) {
            return { command: `"${existing}" "${tempFilePath}"`, cwd: projectRoot };
        }

        return { command: `qrun "${tempFilePath}"`, cwd: projectRoot };
    }

    if (extension === '.js') {
        const nodeCommand = process.platform === 'win32' ? 'node.exe' : 'node';
        return { command: `${nodeCommand} "${tempFilePath}"`, cwd: tempDir };
    }

    if (extension === '.c') {
        const compiler = process.platform === 'win32' ? 'gcc.exe' : 'gcc';
        const outputPath = tempFilePath.replace(/\.[^.]+$/, '.exe');
        return { command: `${compiler} "${tempFilePath}" -o "${outputPath}"`, cwd: tempDir, outputPath };
    }

    if (extension === '.cpp') {
        const compiler = process.platform === 'win32' ? 'g++.exe' : 'g++';
        const outputPath = tempFilePath.replace(/\.[^.]+$/, '.exe');
        return { command: `${compiler} "${tempFilePath}" -o "${outputPath}"`, cwd: tempDir, outputPath };
    }

    return { command: `echo Unsupported extension`, cwd: tempDir };
}

app.post('/api/execute', (req, res) => {
    const { extension, code } = req.body;

    if (!extension || !code) {
        return res.status(400).json({
            success: false,
            error: "Missing required fields: 'extension' and 'code'."
        });
    }

    if (!allowedExtensions.includes(extension)) {
        return res.status(400).json({
            success: false,
            error: `Unsupported file type. Allowed formats: ${allowedExtensions.join(', ')}`
        });
    }

    const fileHash = crypto.randomBytes(8).toString('hex');
    const tempFileName = `sandbox_${fileHash}${extension}`;
    const tempFilePath = path.join(__dirname, tempFileName);

    fs.writeFile(tempFilePath, code, (err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                error: 'Failed to allocate space in execution sandbox.'
            });
        }

        const execution = resolveCommand(extension, tempFilePath);
        const runCommand = execution.command;

        const executeAndRespond = (execError, stdout, stderr) => {
            const cleanup = () => {
                fs.unlink(tempFilePath, () => {});
                if (execution.outputPath) {
                    fs.unlink(execution.outputPath, () => {});
                }
            };

            cleanup();

            const isSyntaxError = stdout.includes('[Syntax Error]') || stderr.includes('[Syntax Error]');
            const isTypeWarning = stdout.includes('[StaticTypeWarning]');
            const cleanOutput = stdout ? stdout.replace(/\u001b\[[0-9;]*m/g, '').trim() : null;
            const cleanError = stderr ? stderr.replace(/\u001b\[[0-9;]*m/g, '').trim() : null;

            res.json({
                success: !execError && !isSyntaxError,
                hasWarnings: isTypeWarning,
                compiledOutput: cleanOutput,
                compilerError: isSyntaxError && stdout ? stdout.replace(/\u001b\[[0-9;]*m/g, '').trim() : cleanError
            });
        };

        if (extension === '.c' || extension === '.cpp') {
            exec(runCommand, { cwd: execution.cwd }, (compileError, stdout, stderr) => {
                if (compileError) {
                    fs.unlink(tempFilePath, () => {});
                    return res.json({
                        success: false,
                        hasWarnings: false,
                        compiledOutput: null,
                        compilerError: stderr || stdout || compileError.message
                    });
                }

                const outputPath = execution.outputPath;
                const runOutputCommand = outputPath ? `"${outputPath}"` : '';
                exec(runOutputCommand, { cwd: execution.cwd }, executeAndRespond);
            });
            return;
        }

        exec(runCommand, { cwd: execution.cwd }, executeAndRespond);
    });
});

app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'quantum-backend' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Quantum Language Engine API online on port ${PORT}`);
});