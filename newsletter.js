const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Define the file path for storing subscribers
const filePath = path.join(__dirname, 'subscribers.txt');

router.post('/subscribe', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: "Email is required" });
    }

    try {
        // Read existing file content if it exists
        let data = '';
        if (fs.existsSync(filePath)) {
            data = fs.readFileSync(filePath, 'utf8');
        }

        // Check for duplicate emails
        if (data.includes(email)) {
            return res.status(400).json({ success: false, message: "Already subscribed!" });
        }

        // Append the new email
        fs.appendFileSync(filePath, email + '\n');
        
        console.log("New Subscriber saved:", email);
        res.json({ success: true, message: "Subscribed!" });

    } catch (error) {
        console.error("Storage error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

module.exports = router;