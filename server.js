const express = require('express');
const fs = require('fs').promises; // Use promise-based fs
const path = require('path');
const cors = require('cors'); // To allow requests from frontend

const app = express();
const PORT = 3000; // You can change this port
const XFORMS_DIR = path.join(__dirname, 'xforms_data'); // Data storage directory

// --- Helper function to sanitize filename parameters --- 
// Allows only alphanumeric, underscore, hyphen. Prevents path traversal.
function sanitizeFilenameParam(filename) {
    if (!filename || typeof filename !== 'string') {
        return null;
    }
    // Remove potentially harmful characters and path traversal attempts
    const sanitized = path.basename(filename).replace(/[^a-zA-Z0-9_\-]/g, '_');
    // Ensure it ends with _xform.json (or just .json if already there)
    if (sanitized.endsWith('_xform.json')) {
        return sanitized;
    } else if (sanitized.endsWith('.json')) { 
        // Handle cases where it might already have .json but not _xform
        return sanitized.replace(/\.json$/, '') + '_xform.json';
    } else {
        // Add the suffix if missing
        return sanitized + '_xform.json';
    }
}

// --- Middleware --- 
app.use(cors()); // Enable CORS for all origins (adjust for production)
app.use(express.json()); // Parse JSON request bodies

// --- Ensure data directory exists --- 
async function ensureDataDir() {
    try {
        await fs.mkdir(XFORMS_DIR, { recursive: true });
        console.log(`Data directory ensured: ${XFORMS_DIR}`);
    } catch (error) {
        console.error(`Error creating data directory: ${XFORMS_DIR}`, error);
        process.exit(1); // Exit if we can't create the data dir
    }
}

// --- API Routes --- 

// GET /api/xforms - List all *.json files
app.get('/api/xforms', async (req, res) => {
    try {
        const entries = await fs.readdir(XFORMS_DIR, { withFileTypes: true });
        const files = entries
            .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
            .map(entry => entry.name)
            .sort(); // Sort alphabetically
        res.status(200).json(files);
    } catch (error) {
        console.error("Error listing files:", error);
        res.status(500).json({ message: "Error listing files", error: error.message });
    }
});

// GET /api/xforms/:filename - Read a specific file
app.get('/api/xforms/:filename', async (req, res) => {
    const sanitizedFilename = sanitizeFilenameParam(req.params.filename);
    if (!sanitizedFilename) {
        return res.status(400).json({ message: "Invalid filename format provided." });
    }
    const filePath = path.join(XFORMS_DIR, sanitizedFilename);

    try {
        // Basic check to prevent reading outside intended dir (double check)
        if (!filePath.startsWith(XFORMS_DIR)) {
             throw new Error("Attempted path traversal");
        }
        const data = await fs.readFile(filePath, 'utf8');
        res.status(200).json(JSON.parse(data)); // Assume file contains JSON
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.status(404).json({ message: `File not found: ${sanitizedFilename}` });
        } else {
            console.error(`Error reading file ${sanitizedFilename}:`, error);
            res.status(500).json({ message: "Error reading file", error: error.message });
        }
    }
});

// POST /api/xforms/:filename - Save/Overwrite a file
app.post('/api/xforms/:filename', async (req, res) => {
    const sanitizedFilename = sanitizeFilenameParam(req.params.filename);
     if (!sanitizedFilename) {
        return res.status(400).json({ message: "Invalid filename format provided." });
    }
    const filePath = path.join(XFORMS_DIR, sanitizedFilename);
    const dataToSave = req.body; // Get data from request body

    if (!dataToSave || typeof dataToSave !== 'object') {
         return res.status(400).json({ message: "Invalid/missing JSON data in request body." });
    }

    try {
        // Basic check to prevent writing outside intended dir
        if (!filePath.startsWith(XFORMS_DIR)) {
             throw new Error("Attempted path traversal");
        }
        await fs.writeFile(filePath, JSON.stringify(dataToSave, null, 2)); // Pretty print JSON
        console.log(`File saved: ${sanitizedFilename}`);
        res.status(200).json({ message: `File saved successfully: ${sanitizedFilename}` });
    } catch (error) {
        console.error(`Error saving file ${sanitizedFilename}:`, error);
        res.status(500).json({ message: "Error saving file", error: error.message });
    }
});

// DELETE /api/xforms/:filename - Delete a file
app.delete('/api/xforms/:filename', async (req, res) => {
    const sanitizedFilename = sanitizeFilenameParam(req.params.filename);
    if (!sanitizedFilename) {
        return res.status(400).json({ message: "Invalid filename format provided." });
    }
    const filePath = path.join(XFORMS_DIR, sanitizedFilename);

    try {
        // Basic check to prevent deleting outside intended dir
        if (!filePath.startsWith(XFORMS_DIR)) {
             throw new Error("Attempted path traversal");
        }
        await fs.unlink(filePath);
        console.log(`File deleted: ${sanitizedFilename}`);
        res.status(200).json({ message: `File deleted successfully: ${sanitizedFilename}` });
    } catch (error) {
         if (error.code === 'ENOENT') {
            // Arguably not an error if it's already gone
            res.status(200).json({ message: `File already deleted or not found: ${sanitizedFilename}` });
        } else {
            console.error(`Error deleting file ${sanitizedFilename}:`, error);
            res.status(500).json({ message: "Error deleting file", error: error.message });
        }
    }
});

// --- Start Server --- 
ensureDataDir().then(() => {
    app.listen(PORT, () => {
        console.log(`X-Form API server listening on http://localhost:${PORT}`);
        console.log(`Data directory: ${XFORMS_DIR}`);
    });
}); 