// --- IndexedDB Configuration and Helpers ---
const XFORM_DB_NAME = 'xformMakerDB'; // Renamed to avoid conflicts
const XFORM_DB_VERSION = 1;
const XFORMS_STORE = 'xformsStore'; // Store for all xform data
const XFORM_SETTINGS_STORE = 'settingsStore'; // Store for app settings
const XFORM_DIR_HANDLE_KEY = 'lastDirectoryHandle'; // Keep for backward compatibility

let dbPromise = null;

// Force database reset (for development/testing)
function resetDatabase() {
    return new Promise((resolve, reject) => {
        dbPromise = null; // Clear any existing promise
        
        console.log("DEBUG RESET: Attempting to delete and recreate IndexedDB database...");
        
        // List all current databases
        if (window.indexedDB.databases) {
            window.indexedDB.databases().then(dbs => {
                console.log("DEBUG RESET: Current databases:", dbs.map(db => `${db.name} (v${db.version})`));
            }).catch(err => {
                console.warn("DEBUG RESET: Could not list databases:", err);
            });
        }
        
        // First, make sure all active connections are closed
        const closeAllConnections = () => {
            return new Promise(resolve => {
                // Attempt to open and immediately close a connection to trigger version change events
                const tempRequest = indexedDB.open(XFORM_DB_NAME);
                
                tempRequest.onsuccess = (event) => {
                    const db = event.target.result;
                    console.log("DEBUG RESET: Opened temporary connection to force close existing connections");
                    
                    // Force close by triggering a version change
                    const version = db.version + 1;
                    db.close();
                    
                    // Wait a moment for the close operation to take effect
                    setTimeout(() => {
                        try {
                            // Now try upgrade to force disconnect other connections
                            const upgradeRequest = indexedDB.open(XFORM_DB_NAME, version);
                            
                            upgradeRequest.onupgradeneeded = () => {
                                console.log("DEBUG RESET: Upgrade started - this will disconnect other connections");
                            };
                            
                            upgradeRequest.onsuccess = (event) => {
                                event.target.result.close();
                                console.log("DEBUG RESET: Forced closure of all database connections");
                                resolve();
                            };
                            
                            upgradeRequest.onerror = () => {
                                console.warn("DEBUG RESET: Couldn't upgrade to force connections closed");
                                resolve(); // Continue anyway
                            };
                        } catch (e) {
                            console.warn("DEBUG RESET: Error during force close:", e);
                            resolve(); // Continue anyway
                        }
                    }, 100);
                };
                
                tempRequest.onerror = () => {
                    console.warn("DEBUG RESET: Couldn't open temporary connection");
                    resolve(); // Continue anyway
                };
            });
        };
        
        // Now attempt to close all connections before deleting
        closeAllConnections().then(() => {
            // Add a delay to ensure connections are fully closed
            setTimeout(() => {
                const deleteRequest = indexedDB.deleteDatabase(XFORM_DB_NAME);
                
                deleteRequest.onerror = (event) => {
                    console.error("DEBUG RESET: Error deleting database:", event.target.error);
                    reject("Failed to delete database");
                };
                
                deleteRequest.onblocked = (event) => {
                    console.warn("DEBUG RESET: Database delete operation blocked. Close any other tabs using the database.");
                    
                    // Try one more extreme approach - reload the page
                    if (confirm("The database is still in use by another connection. Refresh the page to close all connections?")) {
                        window.localStorage.setItem('pendingDbReset', 'true');
                        window.location.reload();
                        return;
                    }
                    
                    // Show a more helpful message to the user
                    showInfoDialog(
                        "Database reset is blocked. Please close all other browser tabs that might be using XForm Maker, " +
                        "then try again. If the problem persists, you may need to restart your browser."
                    ).then(() => {
                        reject("Database reset blocked - other connections are still open");
                    });
                };
                
                deleteRequest.onsuccess = () => {
                    console.log("DEBUG RESET: Database successfully deleted, opening fresh database...");
                    // Now open a fresh database with the objects specifically defined
                    openNewDatabase().then(db => {
                        // Clear the list UI immediately
                        refreshListWithEmptyState();
                        resolve(db);
                    }).catch(reject);
                };
            }, 200); // Wait 200ms for connections to fully close
        });
    });
}

// Refresh the list UI to show empty state
function refreshListWithEmptyState() {
    const fileListUl = document.getElementById('savedList');
    if (fileListUl) {
        fileListUl.innerHTML = '<li>No saved xforms found. Import or create new xforms.</li>';
        console.log("List UI refreshed to show empty state");
    }
    
    // Clear any memory of selected items
    window.selectedXforms = [];
    updateExportButtonState();
    
    // Update the count indicator if it exists
    const countElement = document.querySelector('.file-count');
    if (countElement) {
        countElement.textContent = '0 xforms';
    }
}

// Update the DB reset button click handler to not reload the page
function initDbResetButton() {
    // Check if console utility function exists - if so, don't add the button
    if (typeof window.db_reset === 'function') {
        console.log('Console utility db_reset() detected - not adding DB reset button to UI');
        return;
    }
    
    // Add button to the UI
    const headerControls = document.querySelector(".file-header-controls");
    const importButton = document.getElementById("import-file-btn");
    
    if (headerControls && importButton) {
        const resetBtn = document.createElement("button");
        resetBtn.id = "db-troubleshoot-btn";
        resetBtn.className = "mode-icon";
        resetBtn.title = "Database Troubleshooting";
        resetBtn.innerHTML = "<span>🔧 Fix DB</span>";
        resetBtn.style.backgroundColor = "#ff6b6b";
        resetBtn.style.color = "white";
        resetBtn.style.padding = "3px 8px";
        resetBtn.style.borderRadius = "4px";
        resetBtn.style.marginRight = "8px";
        
        resetBtn.addEventListener("click", async () => {
            // Check if there are saved XForms that might be lost
            let xforms = [];
            try {
                xforms = await listXForms();
            } catch (error) {
                console.error("Error checking for existing XForms:", error);
            }
            
            const warningMessage = xforms.length > 0 ? 
                `⚠️ WARNING: You have ${xforms.length} saved XForms that will be deleted. It is strongly recommended to export them first using the 📤 button!\n\nDatabase Troubleshooting: This will reset the database and clear all stored xforms. Continue?` :
                "Database Troubleshooting: This will reset the database. Continue?";
            
            if (confirm(warningMessage)) {
                try {
                    await resetDatabase();
                    
                    // Explicitly refresh the UI again to ensure it's updated
                    refreshListWithEmptyState();
                    
                    // Clear any selections
                    window.selectedXforms = [];
                    updateExportButtonState();
                    
                    // Remove any diagnostic results that might be showing
                    const diagnosticResults = document.getElementById('db-diagnostic-results');
                    if (diagnosticResults) {
                        diagnosticResults.remove();
                    }
                    
                    await showInfoDialog("Database has been reset. All xforms have been cleared.");
                } catch (error) {
                    console.error("Database reset error:", error);
                    // The detailed error dialog will already be shown by the resetDatabase function
                }
            }
        });
        
        // Insert before the import button
        headerControls.insertBefore(resetBtn, importButton);
        console.log("Database troubleshooting button added before import button");
    } else {
        console.error("Could not find header controls or import button to place DB reset button");
    }
}

// Special function to open a brand new database with explicit creation
function openNewDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(XFORM_DB_NAME, XFORM_DB_VERSION);
        
        request.onerror = (event) => {
            console.error("DEBUG OPEN: IndexedDB error:", event.target.error);
            reject("IndexedDB error: " + (event.target.error ? event.target.error.message : "Unknown error"));
        };
        
        request.onupgradeneeded = (event) => {
            console.log("DEBUG OPEN: Database upgrade needed - creating object stores...");
            const db = event.target.result;
            
            // Create settings store explicitly
            if (!db.objectStoreNames.contains(XFORM_SETTINGS_STORE)) {
                db.createObjectStore(XFORM_SETTINGS_STORE);
                console.log(`DEBUG OPEN: Created settings store '${XFORM_SETTINGS_STORE}'`);
            } else {
                console.log(`DEBUG OPEN: Settings store '${XFORM_SETTINGS_STORE}' already exists`);
            }
            
            // Create xforms store explicitly with 'id' as key path
            if (!db.objectStoreNames.contains(XFORMS_STORE)) {
                try {
                    const xformsStore = db.createObjectStore(XFORMS_STORE, { keyPath: 'id' });
                    
                    // Create indexes for common queries
                    try {
                        xformsStore.createIndex('name', 'name', { unique: false });
                        console.log(`DEBUG OPEN: Created 'name' index on ${XFORMS_STORE}`);
                    } catch (nameErr) {
                        console.error(`DEBUG OPEN: Error creating 'name' index:`, nameErr);
                    }
                    
                    try {
                        xformsStore.createIndex('lastModified', 'lastModified', { unique: false });
                        console.log(`DEBUG OPEN: Created 'lastModified' index on ${XFORMS_STORE}`);
                    } catch (timeErr) {
                        console.error(`DEBUG OPEN: Error creating 'lastModified' index:`, timeErr);
                    }
                    
                    console.log(`DEBUG OPEN: Created xforms store '${XFORMS_STORE}' with indexes`);
                } catch (storeErr) {
                    console.error(`DEBUG OPEN: Error creating xforms store:`, storeErr);
                    reject(storeErr);
                }
            } else {
                console.log(`DEBUG OPEN: Xforms store '${XFORMS_STORE}' already exists`);
            }
        };
        
        request.onsuccess = (event) => {
            const db = event.target.result;
            console.log("DEBUG OPEN: IndexedDB opened successfully.");
            
            // Verify the object stores exist
            const storeNames = Array.from(db.objectStoreNames);
            console.log(`DEBUG OPEN: Database contains stores: ${storeNames.join(', ')}`);
            
            if (!storeNames.includes(XFORMS_STORE) || !storeNames.includes(XFORM_SETTINGS_STORE)) {
                console.error(`DEBUG OPEN: Missing required object stores! Found: ${storeNames.join(', ')}`);
                db.close();
                reject("Database opened but missing required object stores");
            } else {
                dbPromise = Promise.resolve(db);
                resolve(db);
            }
        };
    });
}

// Open and initialize the database
function openDB() {
    if (dbPromise) return dbPromise;
    
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(XFORM_DB_NAME, XFORM_DB_VERSION);
        
        request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.error);
            reject("IndexedDB error: " + (event.target.error ? event.target.error.message : "Unknown error"));
        };
        
        request.onsuccess = (event) => {
            console.log("IndexedDB opened successfully.");
            const db = event.target.result;
            
            // Verify the expected stores exist
            if (!db.objectStoreNames.contains(XFORMS_STORE) || 
                !db.objectStoreNames.contains(XFORM_SETTINGS_STORE)) {
                
                console.error("Database opened but missing required object stores!");
                console.log("Closing and attempting to reset the database...");
                
                // Close the database
                db.close();
                
                // Reset the database and try again
                resetDatabase().then(resolve).catch(reject);
            } else {
                resolve(db);
            }
        };
        
        request.onupgradeneeded = (event) => {
            console.log("IndexedDB upgrade needed - creating object stores...");
            const db = event.target.result;
            
            // Create settings store if it doesn't exist
            if (!db.objectStoreNames.contains(XFORM_SETTINGS_STORE)) {
                db.createObjectStore(XFORM_SETTINGS_STORE);
                console.log(`Object store '${XFORM_SETTINGS_STORE}' created.`);
            }
            
            // Create xforms store with 'id' as key path
            if (!db.objectStoreNames.contains(XFORMS_STORE)) {
                const xformsStore = db.createObjectStore(XFORMS_STORE, { keyPath: 'id' });
                // Create indexes for common queries
                xformsStore.createIndex('name', 'name', { unique: false });
                xformsStore.createIndex('lastModified', 'lastModified', { unique: false });
                console.log(`Object store '${XFORMS_STORE}' created with indexes.`);
            }
        };
    });
    
    return dbPromise;
}

// --- Core XForm Storage Functions ---

// Save an xform to IndexedDB
async function saveXForm(xformData) {
    if (!xformData || !xformData.id) {
        console.error('Invalid xform data or missing ID');
        return false;
    }
    
    try {
        // Always update the lastModified timestamp
        xformData.lastModified = Date.now();
        
        const db = await openDB();
        const tx = db.transaction(XFORMS_STORE, 'readwrite');
        const store = tx.objectStore(XFORMS_STORE);
        
        await store.put(xformData);
        await tx.done;
        
        console.log(`XForm "${xformData.name}" (ID: ${xformData.id}) saved to IndexedDB.`);
        return true;
    } catch (error) {
        console.error('Error saving xform to IndexedDB:', error);
        return false;
    }
}

// Load an xform from IndexedDB by ID
async function loadXFormById(id) {
    try {
        const db = await openDB();
        const tx = db.transaction(XFORMS_STORE, 'readonly');
        const store = tx.objectStore(XFORMS_STORE);
        
        const xformData = await store.get(id);
        await tx.done;
        
        if (!xformData) {
            console.log(`No xform found with ID: ${id}`);
            return null;
        }
        
        // Ensure the xform has a name for logging purposes
        const displayName = xformData.name || '[unnamed]';
        console.log(`XForm "${displayName}" loaded from IndexedDB (ID: ${id}).`);
        return xformData;
    } catch (error) {
        console.error('Error loading xform from IndexedDB:', error);
        return null;
    }
}

// Delete an xform from IndexedDB by ID
async function deleteXFormById(id) {
    try {
        const db = await openDB();
        const tx = db.transaction(XFORMS_STORE, 'readwrite');
        const store = tx.objectStore(XFORMS_STORE);
        
        await store.delete(id);
        await tx.done;
        
        console.log(`XForm with ID ${id} deleted from IndexedDB.`);
        return true;
    } catch (error) {
        console.error('Error deleting xform from IndexedDB:', error);
        return false;
    }
}

// List all xforms in IndexedDB with optional sorting
async function listXForms(sortBy = 'name', sortDirection = 'asc') {
    try {
        const db = await openDB();
        
        // Debug: Log object stores in the database
        console.log("DEBUG: Available object stores:", db.objectStoreNames);
        
        const tx = db.transaction(XFORMS_STORE, 'readonly');
        const store = tx.objectStore(XFORMS_STORE);
        
        // Debug: Log the indexes available on the store
        console.log("DEBUG: Available indexes:", store.indexNames);
        
        // Add a count operation to verify total records
        const countRequest = store.count();
        const totalCount = await new Promise((resolve, reject) => {
            countRequest.onsuccess = () => resolve(countRequest.result);
            countRequest.onerror = (event) => reject(event.target.error);
        });
        console.log(`DEBUG: Total records in store: ${totalCount}`);
        
        // Determine which index to use based on sortBy
        let source;
        if (sortBy === 'lastModified') {
            source = store.index('lastModified');
        } else if (sortBy === 'name') {
            source = store.index('name');
        } else {
            source = store; // Default to store (sorted by ID)
        }
        
        // Get all records
        const request = source.getAll();
        
        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                let allXForms = event.target.result || [];
                
                // Make sure we have an array, even if empty
                if (!Array.isArray(allXForms)) {
                    console.warn('listXForms: Expected array but got:', typeof allXForms);
                    allXForms = [];
                }
                
                // Debug: Log individual record IDs and names
                console.log(`DEBUG: Records retrieved: ${allXForms.length}`);
                allXForms.forEach((xform, idx) => {
                    console.log(`DEBUG: Record ${idx+1}: ID=${xform.id}, Name="${xform.name}", lastModified=${new Date(xform.lastModified).toLocaleString()}`);
                });
                
                // Sort the array if needed (for custom sorting or reverse order)
                if (allXForms.length > 0 && sortDirection === 'desc') {
                    try {
                        allXForms.reverse();
                    } catch (sortError) {
                        console.error('Error sorting xforms:', sortError);
                    }
                }
                
                console.log(`Listed ${allXForms.length} xforms from IndexedDB.`);
                resolve(allXForms);
            };
            
            request.onerror = (event) => {
                console.error('Error listing xforms:', event.target.error);
                reject(event.target.error);
            };
        });
    } catch (error) {
        console.error('Error in listXForms transaction:', error);
        // Return empty array on error
        return [];
    }
}

// --- Import/Export Functions ---

// Export a single xform to a JSON file
async function exportXFormToFile(xformData) {
    try {
        const filename = sanitizeFilenameForSystem(xformData.name);
        // Use compact JSON (single line) for JSONL format
        const json = JSON.stringify(xformData);
        
        // Create a Blob with the JSON data
        const blob = new Blob([json], { type: 'application/x-jsonlines' });
        const url = URL.createObjectURL(blob);
        
        // Create a download link and trigger it
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
        
        console.log(`XForm "${xformData.name}" exported as ${filename}`);
        return true;
    } catch (error) {
        console.error('Error exporting xform to file:', error);
        return false;
    }
}

// Export all xforms to a single JSONL file (JSON Lines format)
async function exportAllXFormsToFile() {
    try {
        // Use selected xforms if available, otherwise export all
        let xformsToExport = [];
        let isSelectedOnly = false;
        
        if (window.selectedXforms && window.selectedXforms.length > 0) {
            xformsToExport = window.selectedXforms;
            isSelectedOnly = true;
        } else {
            xformsToExport = await listXForms();
        }
        
        if (xformsToExport.length === 0) {
            console.log('No xforms to export');
            await showInfoDialog('No xforms available to export.');
            return false;
        }
        
        // Ensure each xform has all required properties and correct formatting
        const formattedXforms = xformsToExport.map(xform => {
            // Create a clean copy with only the essential properties
            const cleanXform = {
                id: xform.id,
                name: xform.name || 'Untitled',
                timestamp: xform.timestamp || Date.now(),
                lastModified: xform.lastModified || Date.now(),
                startRect: xform.startRect || { left: 0, top: 0, width: 100, height: 60 },
                endRect: xform.endRect || { left: 100, top: 100, width: 100, height: 60 },
                waypoints: xform.waypoints || [],
                rotations: xform.rotations || { x: 1, y: 1, z: 1 },
                duration: xform.duration || 500
            };
            
            // Remove any circular references or non-serializable values
            return JSON.parse(JSON.stringify(cleanXform));
        });
        
        // Convert each xform to a JSON string and join with newlines
        // Make sure each line ends with just one newline character
        const jsonlContent = formattedXforms
            .map(xform => JSON.stringify(xform))
            .join('\n');
        
        // Create a Blob with the JSONL data
        const blob = new Blob([jsonlContent], { type: 'application/x-jsonlines' });
        
        // Determine filename
        const dateStr = new Date().toISOString().slice(0, 10);
        let suggestedName = '';
        if (isSelectedOnly) {
            const count = xformsToExport.length === 1 ? "1-xform" : `${xformsToExport.length}-xforms`;
            suggestedName = `xforms-selected-${count}-${dateStr}.jsonl`;
        } else {
            suggestedName = `xforms-all-${dateStr}.jsonl`;
        }
        
        // Check if the File System Access API is available
        if ('showSaveFilePicker' in window) {
            try {
                // Use the File System Access API to let the user choose where to save
                const handle = await window.showSaveFilePicker({
                    suggestedName: suggestedName,
                    types: [{
                        description: 'JSON Lines File',
                        accept: {'application/x-jsonlines': ['.jsonl']}
                    }],
                });
                
                // Create a writable stream and write the blob data
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                const exportDesc = isSelectedOnly ? 
                    `${xformsToExport.length} selected xform${xformsToExport.length === 1 ? "" : "s"}` : 
                    "all xforms";
                
                console.log(`Exported ${exportDesc} to: ${handle.name}`);
                await showInfoDialog(`Successfully exported ${exportDesc} to: ${handle.name}`);
                
                return true;
            } catch (err) {
                // The user may have cancelled the save dialog
                if (err.name === 'AbortError') {
                    console.log('Export cancelled by user');
                    return false;
                }
                
                // For other errors, fall back to the traditional download method
                console.warn('Error using File System Access API, falling back to download:', err);
                return await fallbackExport(blob, suggestedName, isSelectedOnly, xformsToExport);
            }
        } else {
            // Fallback for browsers without File System Access API
            console.log('File System Access API not supported, falling back to download');
            return await fallbackExport(blob, suggestedName, isSelectedOnly, xformsToExport);
        }
    } catch (error) {
        console.error('Error exporting xforms:', error);
        await showInfoDialog(`Error exporting xforms: ${error.message}`);
        return false;
    }
}

// Fallback export method using traditional download
async function fallbackExport(blob, filename, isSelectedOnly, xformsToExport) {
    try {
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
        
        const exportDesc = isSelectedOnly ? 
            `${xformsToExport.length} selected xform${xformsToExport.length === 1 ? "" : "s"}` : 
            "all xforms";
        
        console.log(`Exported ${exportDesc} to download folder`);
        await showInfoDialog(`Successfully exported ${exportDesc} to your downloads folder.`);
        
        return true;
    } catch (error) {
        console.error('Error in fallback export:', error);
        await showInfoDialog(`Error exporting xforms: ${error.message}`);
        return false;
    }
}

// Import xform(s) from a JSON or JSONL file
async function importXFormsFromFile(file) {
    try {
        // Debug logging
        console.log(`DEBUG IMPORT: Starting import of file: ${file.name}, size: ${file.size} bytes`);
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (event) => {
                try {
                    const content = event.target.result;
                    console.log(`DEBUG IMPORT: File content length: ${content.length} chars`);
                    
                    let xformsToImport = [];
                    let parseMethod = "unknown";
                    
                    // Check if this is a JSONL file (each line is a separate JSON object)
                    if (file.name.endsWith('.jsonl') || content.includes('\n')) {
                        parseMethod = "JSONL";
                        // Split by newlines and parse each line
                        const lines = content.split('\n').filter(line => line.trim());
                        console.log(`DEBUG IMPORT: JSONL format detected with ${lines.length} lines`);
                        
                        // Process each line individually with better error reporting
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            try {
                                // Log a preview of the line for debugging
                                const linePreview = line.length > 50 ? line.substring(0, 50) + '...' : line;
                                console.log(`DEBUG IMPORT: Processing line ${i+1}: ${linePreview}`);
                                
                                const xform = JSON.parse(line);
                                if (xform && xform.name) { // Only check for name, we'll generate new IDs
                                    xformsToImport.push(xform);
                                    console.log(`DEBUG IMPORT: Successfully parsed line ${i+1} as XForm "${xform.name}"`);
                                } else {
                                    console.warn(`DEBUG IMPORT: Skipping line ${i+1}: missing name property`);
                                }
                            } catch (lineError) {
                                console.warn(`DEBUG IMPORT: Error parsing line ${i+1}:`, lineError);
                                console.warn(`DEBUG IMPORT: Problematic line content: "${line.substring(0, 100)}${line.length > 100 ? '...' : ''}"`);
                                // Continue with other lines
                            }
                        }
                    } else {
                        // Try parsing as regular JSON (either a single xform or our old nested format)
                        parseMethod = "JSON";
                        try {
                            const parsed = JSON.parse(content);
                            console.log(`DEBUG IMPORT: JSON format detected, type:`, typeof parsed, Array.isArray(parsed) ? "array" : "object");
                            
                            if (Array.isArray(parsed.xforms)) {
                                // This is our old export format with nested xforms array
                                console.log(`DEBUG IMPORT: Nested format with ${parsed.xforms.length} xforms`);
                                xformsToImport = parsed.xforms.filter(x => x && x.name);
                            } else if (parsed.name) {
                                // This is a single xform - check just for name
                                console.log(`DEBUG IMPORT: Single xform with name "${parsed.name}"`);
                                xformsToImport = [parsed];
                            } else if (Array.isArray(parsed)) {
                                // This is a JSON array of xforms
                                console.log(`DEBUG IMPORT: JSON array with ${parsed.length} items`);
                                xformsToImport = parsed.filter(x => x && x.name);
                                console.log(`DEBUG IMPORT: After filtering for valid xforms: ${xformsToImport.length} items`);
                            } else {
                                console.error('DEBUG IMPORT: Invalid format, cannot determine structure');
                                throw new Error('Invalid file format: No valid xform data found');
                            }
                        } catch (jsonError) {
                            console.error('DEBUG IMPORT: Error parsing JSON:', jsonError);
                            throw new Error(`Invalid JSON format: ${jsonError.message}`);
                        }
                    }
                    
                    if (xformsToImport.length === 0) {
                        console.warn('DEBUG IMPORT: No valid xforms found in the file');
                        throw new Error('No valid xforms found in the file');
                    }
                    
                    console.log(`DEBUG IMPORT: Found ${xformsToImport.length} xforms to import via ${parseMethod}`);
                    
                    // List all found xforms with original IDs
                    xformsToImport.forEach((xform, idx) => {
                        console.log(`DEBUG IMPORT: Xform ${idx+1}: Original ID=${xform.id}, Name="${xform.name}"`);
                    });
                    
                    let importCount = 0;
                    let errors = [];
                    
                    // Process each xform and collect results
                    const importPromises = xformsToImport.map(async (xform, idx) => {
                        try {
                            // ALWAYS generate new unique IDs for ALL imported xforms
                            // to prevent duplicates overwriting each other
                            const originalId = xform.id;
                            const now = Date.now();
                            xform.id = now + idx; // Use current time + index for uniqueness
                            
                            console.log(`DEBUG IMPORT: Assigned new unique ID ${xform.id} (was ${originalId}) to xform "${xform.name}"`);
                            
                            // Update timestamps to current
                            xform.lastModified = now + idx; // Add idx to ensure uniqueness
                            if (!xform.timestamp) {
                                xform.timestamp = now + idx;
                            }
                            
                            console.log(`DEBUG IMPORT: Saving xform "${xform.name}" with ID ${xform.id}`);
                            const success = await saveXForm(xform);
                            
                            if (success) {
                                console.log(`DEBUG IMPORT: Successfully saved xform "${xform.name}"`);
                                return true;
                            } else {
                                console.error(`DEBUG IMPORT: Failed to save xform "${xform.name}"`);
                                errors.push(`Failed to save "${xform.name}"`);
                                return false;
                            }
                        } catch (err) {
                            console.error(`DEBUG IMPORT: Error saving xform "${xform.name}":`, err);
                            errors.push(`Error with "${xform.name}": ${err.message}`);
                            return false;
                        }
                    });
                    
                    // Wait for all imports to complete
                    const results = await Promise.all(importPromises);
                    importCount = results.filter(Boolean).length;
                    
                    if (errors.length > 0) {
                        console.warn(`DEBUG IMPORT: Completed with ${errors.length} errors:`, errors);
                    }
                    
                    console.log(`DEBUG IMPORT: Successfully imported ${importCount} of ${xformsToImport.length} xforms`);
                    
                    // Verify the database count after import
                    try {
                        const db = await openDB();
                        const tx = db.transaction(XFORMS_STORE, 'readonly');
                        const store = tx.objectStore(XFORMS_STORE);
                        const count = await new Promise(resolve => {
                            const countRequest = store.count();
                            countRequest.onsuccess = () => resolve(countRequest.result);
                            countRequest.onerror = () => resolve(0);
                        });
                        console.log(`DEBUG IMPORT: Total xforms in database after import: ${count}`);
                    } catch (err) {
                        console.error('DEBUG IMPORT: Error counting database records after import:', err);
                    }
                    
                    resolve({
                        success: importCount > 0,
                        imported: importCount,
                        total: xformsToImport.length,
                        errors: errors
                    });
                } catch (error) {
                    console.error('DEBUG IMPORT: Error processing import file:', error);
                    reject(error);
                }
            };
            
            reader.onerror = (error) => {
                console.error('DEBUG IMPORT: Error reading file:', error);
                reject(error);
            };
            
            reader.readAsText(file);
        });
    } catch (error) {
        console.error('DEBUG IMPORT: Error in importXFormsFromFile:', error);
        throw error;
    }
}

// Helper function to sanitize filenames
function sanitizeFilenameForSystem(originalName) {
    const MAX_BASE_LENGTH = 64; 
    const allowedCharsRegex = /[^a-zA-Z0-9_\-()]/g;
    let sanitizedBase = originalName.trim()
        .replace(allowedCharsRegex, '_') 
        .replace(/-+/g, '-')        
        .replace(/_+/g, '_');       
    sanitizedBase = sanitizedBase.replace(/^[-_]+|[-_]+$/g, '');
    if (!sanitizedBase) sanitizedBase = 'Untitled_X-Form';
    if (sanitizedBase.length > MAX_BASE_LENGTH) {
        sanitizedBase = sanitizedBase.substring(0, MAX_BASE_LENGTH);
        sanitizedBase = sanitizedBase.replace(/^[-_]+|[-_]+$/g, ''); 
    }
    if (!sanitizedBase) sanitizedBase = 'Untitled_X-Form'; 
    return `${sanitizedBase}_xform.json`;
}

// --- UI Integration Functions ---

// Render the xform list in the UI
async function renderXFormList(sortBy = 'lastModified', sortDirection = 'desc') {
    const fileListUl = document.getElementById('savedList');
    if (!fileListUl) return;
    
    // Track selected items
    window.selectedXforms = window.selectedXforms || [];
    
    // Clear the list
    fileListUl.innerHTML = '<li>Loading xforms...</li>';
    
    try {
        const xforms = await listXForms(sortBy, sortDirection);
        
        if (xforms.length === 0) {
            fileListUl.innerHTML = '<li>No saved xforms found</li>';
            return;
        }
        
        fileListUl.innerHTML = '';
        
        // Last clicked item for shift+click
        let lastClickedIndex = -1;
        
        xforms.forEach((xform, index) => {
            const li = document.createElement('li');
            li.className = 'file-list-item';
            li.dataset.xformId = xform.id;
            li.dataset.lastModified = xform.lastModified;
            li.dataset.index = index; // Store index for shift+click
            
            // Create name column
            const nameSpan = document.createElement('span');
            nameSpan.className = 'file-name-column';
            nameSpan.textContent = xform.name;
            nameSpan.title = xform.name;
            
            // Create date column
            const dateSpan = document.createElement('span');
            dateSpan.className = 'file-date-column';
            const dateObj = new Date(parseInt(xform.lastModified, 10));
            const dateFormatted = dateObj.toLocaleDateString() + ' ' + 
                                  dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            dateSpan.textContent = dateFormatted;
            dateSpan.title = `Last modified: ${dateObj.toLocaleString()}`;
            
            // Add columns in the correct order based on sort mode
            if (sortBy === 'lastModified' && sortDirection === 'desc') {
                li.appendChild(dateSpan);
                li.appendChild(nameSpan);
            } else {
                li.appendChild(nameSpan);
                li.appendChild(dateSpan);
            }
            
            // Add delete button (no export button per item)
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-file-btn';
            deleteBtn.innerHTML = '×';
            deleteBtn.title = `Delete "${xform.name}"`;
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteXForm(xform.id, xform.name);
            });
            li.appendChild(deleteBtn);
            
            // Double-click handler for loading XForms
            li.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Clear all selections
                clearAllSelections();
                
                // Load the double-clicked XForm
                loadXForm(xform.id);
                
                // Apply single-selected style to this item
                li.classList.add('single-selected');
                window.selectedXforms = [xform];
                
                console.log(`Double-clicked to load XForm: "${xform.name}" (ID: ${xform.id})`);
            });
            
            // Multi-selection click handler
            li.addEventListener('click', (e) => {
                // Check if this is a Shift+Click
                if (e.shiftKey && lastClickedIndex >= 0) {
                    // Clear existing selection
                    clearSelectionWithoutUpdatingState();
                    
                    // Select range
                    const start = Math.min(lastClickedIndex, index);
                    const end = Math.max(lastClickedIndex, index);
                    
                    window.selectedXforms = [];
                    for (let i = start; i <= end; i++) {
                        const item = document.querySelector(`#savedList li[data-index="${i}"]`);
                        if (item) {
                            item.classList.add('multi-selected');
                            const itemId = item.dataset.xformId;
                            if (itemId) {
                                window.selectedXforms.push(xforms[i]);
                            }
                        }
                    }
                } 
                // Check if this is a Ctrl/Cmd+Click for multi-select
                else if (e.ctrlKey || e.metaKey) {
                    // Toggle selection for this item
                    const isSelected = li.classList.contains('multi-selected');
                    
                    if (isSelected) {
                        // Remove from selection
                        li.classList.remove('multi-selected');
                        window.selectedXforms = window.selectedXforms.filter(item => 
                            item.id.toString() !== xform.id.toString());
                    } else {
                        // Add to selection
                        li.classList.add('multi-selected');
                        window.selectedXforms.push(xform);
                    }
                }
                // Regular click - single select or toggle
                else {
                    // Check if this item is already selected
                    const wasSelected = li.classList.contains('single-selected');
                    
                    // Clear all selections
                    clearAllSelections();
                    
                    // Toggle selection state
                    if (!wasSelected) {
                        // If not previously selected, select it
                        li.classList.add('single-selected');
                        window.selectedXforms = [xform];
                    }
                    // If it was already selected, leave it unselected (clearAllSelections already did this)
                }
                
                // Update the last clicked index
                lastClickedIndex = index;
                
                // Update export button state based on selections
                updateExportButtonState();
                
                // Update UI based on selection count
                updateUIForSelectionCount();
            });
            
            fileListUl.appendChild(li);
        });
        
        // Add CSS for multi-select
        addOrUpdateMultiSelectStyles();
        
    } catch (error) {
        console.error('Error rendering xform list:', error);
        fileListUl.innerHTML = '<li>Error loading saved xforms</li>';
    }
}

// Load an xform from IndexedDB and apply it to the UI
async function loadXForm(id) {
    try {
        const xformData = await loadXFormById(id);
        if (!xformData) {
            console.error(`Failed to load xform with ID ${id}`);
            await showInfoDialog('Failed to load the selected xform.');
            return false;
        }
        
        // Before applying XForm data, ensure we have a working viewport and rectangles
        if (!window.viewport) {
            window.viewport = document.getElementById('viewport');
            if (!window.viewport) {
                console.error("Viewport element not found!");
                return false;
            }
        }
        
        // Force cleanup of all elements to ensure they work correctly
        // Remove existing rectangles if they exist
        const existingStart = document.getElementById('startRect');
        const existingEnd = document.getElementById('endRect');
        if (existingStart) existingStart.remove();
        if (existingEnd) existingEnd.remove();
        
        // Reset rectangle references
        window.startRect = null;
        window.endRect = null;
        
        // Clear all existing waypoints from the DOM
        document.querySelectorAll('.point-marker').forEach(marker => marker.remove());
        
        // Clear intermediate points array
        if (window.intermediatePoints && Array.isArray(window.intermediatePoints)) {
            window.intermediatePoints.forEach(p => p.element && p.element.remove());
            window.intermediatePoints = [];
        } else {
            window.intermediatePoints = [];
        }
        
        // Reset waypoint state
        window.lastModifiedPointIndex = -1;
        window.draggingPointIndex = -1;
        window.selectedPointIndex = -1;
        
        console.log("Preparing viewport for XForm loading - elements will be re-created");
        
        // Apply the loaded xform data to the UI
        if (typeof applyXFormData === 'function') {
            applyXFormData(xformData);
            
            // Highlight the selected item in the list
            document.querySelectorAll('#savedList li.file-list-item').forEach(el => {
                if (el.dataset.xformId === id.toString()) {
                    el.classList.add('single-selected');
                } else {
                    el.classList.remove('single-selected');
                }
            });
            
            // Ensure rectangles are draggable after loading
            if (typeof window.makeDraggable === 'function') {
                if (window.startRect) window.makeDraggable(window.startRect);
                if (window.endRect) window.makeDraggable(window.endRect);
                console.log("Re-applied draggable functionality to rectangles after loading XForm");
            }
            
            // Ensure waypoints are draggable after loading
            if (typeof window.makeDraggableWaypoint === 'function' && 
                window.intermediatePoints && 
                window.intermediatePoints.length > 0) {
                
                window.intermediatePoints.forEach((point, index) => {
                    if (point && point.element) {
                        window.makeDraggableWaypoint(point.element, index);
                    }
                });
                console.log(`Re-applied draggable functionality to ${window.intermediatePoints.length} waypoints`);
            }
            
            // Update UI counters
            if (typeof window.updateWaypointCounter === 'function') {
                window.updateWaypointCounter();
                console.log("Updated waypoint counter");
            } else {
                // Fallback counter update if the function doesn't exist
                updateWaypointCounterFallback();
            }
            
            // Update delete waypoint button state
            updateDeleteWaypointButton();
            
            // Reapply path visualization if a style is set
            if (window.currentPathStyleIndex !== undefined && 
                window.pathStyleModes && 
                window.pathStyleModes[window.currentPathStyleIndex] &&
                window.pathStyleModes[window.currentPathStyleIndex].style !== 'none') {
                
                const currentStyle = window.pathStyleModes[window.currentPathStyleIndex].style;
                if (typeof applyPathStyle === 'function') {
                    applyPathStyle(currentStyle);
                    console.log(`Reapplied path visualization style: ${currentStyle}`);
                }
            }
            
            // Update path visualization if it exists and no style is set
            if (document.getElementById('path-visualization')) {
                if (typeof window.drawPathVisualization === 'function') {
                    window.drawPathVisualization();
                    console.log("Updated path visualization after loading");
                }
            }
            
            // Update single-selection state
            window.selectedXforms = [xformData];
            updateUIForSelectionCount();
            
            console.log(`Successfully loaded XForm "${xformData.name}" with ${window.intermediatePoints?.length || 0} waypoints`);
            return true;
        } else {
            console.error('applyXFormData function not available');
            return false;
        }
    } catch (error) {
        console.error('Error in loadXForm:', error);
        return false;
    }
}

// Fallback function to update the waypoint counter if the main function doesn't exist
function updateWaypointCounterFallback() {
    const counter = document.getElementById('waypointCounter');
    const deleteBtn = document.getElementById('deleteLastWaypointBtn');
    
    if (!counter) return;
    
    const count = window.intermediatePoints?.length || 0;
    counter.textContent = count.toString();
    
    if (deleteBtn) {
        if (count > 0) {
            deleteBtn.disabled = false;
            deleteBtn.style.opacity = '1';
            deleteBtn.style.pointerEvents = 'auto';
            deleteBtn.style.cursor = 'pointer';
        } else {
            deleteBtn.disabled = true;
            deleteBtn.style.opacity = '0.5';
            deleteBtn.style.pointerEvents = 'none';
            deleteBtn.style.cursor = 'not-allowed';
        }
    }
    
    console.log(`Waypoint counter updated (fallback method): ${count}`);
}

// Update the delete waypoint button state based on waypoint count
function updateDeleteWaypointButton() {
    const deleteBtn = document.getElementById('deleteLastWaypointBtn');
    if (!deleteBtn) return;
    
    const count = window.intermediatePoints?.length || 0;
    
    if (count > 0) {
        deleteBtn.disabled = false;
        deleteBtn.style.opacity = '1';
        deleteBtn.style.pointerEvents = 'auto';
        deleteBtn.style.cursor = 'pointer';
    } else {
        deleteBtn.disabled = true;
        deleteBtn.style.opacity = '0.5';
        deleteBtn.style.pointerEvents = 'none';
        deleteBtn.style.cursor = 'not-allowed';
    }
    
    console.log(`Delete waypoint button state updated: ${count > 0 ? 'enabled' : 'disabled'}`);
}

// Delete an xform with confirmation dialog
async function deleteXForm(id, name) {
    try {
        const result = await showModalDialog({
            message: `Delete "${name}"? This cannot be undone.`,
            buttons: [
                { id: 'delete', label: 'Delete', class: 'danger' },
                { id: 'cancel', label: 'Cancel', class: 'secondary' }
            ]
        });
        
        if (result !== 'delete') {
            return false;
        }
        
        const success = await deleteXFormById(id);
        if (success) {
            // Refresh the list
            await renderXFormList();
            await showInfoDialog('XForm deleted successfully.');
            return true;
        } else {
            await showInfoDialog('Failed to delete the xform.');
            return false;
        }
    } catch (error) {
        console.error('Error in deleteXForm:', error);
        await showInfoDialog(`Error deleting xform: ${error.message}`);
        return false;
    }
}

// Save the current xform to IndexedDB
async function saveCurrentXForm() {
    try {
        // Create an xform data object from the current state
        const xformData = createXFormDataObject();
        
        // Ensure it has an ID
        if (!xformData.id) {
            xformData.id = Date.now();
        }
        
        // Check if an XForm with this name already exists (except for the current one)
        const existingXForms = await listXForms();
        const nameExists = existingXForms.some(x => 
            x.name === xformData.name && x.id.toString() !== xformData.id.toString()
        );
        
        // If name exists, prompt for action
        if (nameExists) {
            const result = await showModalDialog({
                message: `An XForm named "${xformData.name}" already exists. What would you like to do?`,
                buttons: [
                    { id: 'overwrite', label: 'Overwrite Existing', class: 'danger' },
                    { id: 'saveBoth', label: 'Save Both', class: 'primary' },
                    { id: 'cancel', label: 'Cancel', class: 'secondary' }
                ]
            });
            
            if (result === 'cancel') {
                return null;
            }
            
            if (result === 'saveBoth') {
                // Create a unique name by adding timestamp
                const timestamp = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})
                    .replace(/:/g, '-').replace(/\s/g, '');
                xformData.name = `${xformData.name} (${timestamp})`;
                console.log(`Creating duplicate with unique name: "${xformData.name}"`);
            } else {
                // For 'overwrite', find and delete the existing one first
                const existingXForm = existingXForms.find(x => x.name === xformData.name);
                if (existingXForm) {
                    console.log(`Overwriting existing XForm with ID ${existingXForm.id}`);
                    await deleteXFormById(existingXForm.id);
                }
            }
        }
        
        const success = await saveXForm(xformData);
        if (success) {
            // Refresh the list to show the new/updated xform
            await renderXFormList();
            await showInfoDialog(`"${xformData.name}" saved successfully.`);
            return xformData;
        } else {
            await showInfoDialog('Failed to save the xform.');
            return null;
        }
    } catch (error) {
        console.error('Error saving current xform:', error);
        await showInfoDialog(`Error saving xform: ${error.message}`);
        return null;
    }
}

// --- Import/Export UI Handlers ---

// Handle file import via input element
function setupImportHandler() {
    const importInput = document.getElementById('import-file-input');
    const importBtn = document.getElementById('import-file-btn');
    
    if (importInput && importBtn) {
        // Just add the event listeners to existing elements
        importInput.addEventListener('change', async (e) => {
            if (e.target.files && e.target.files.length > 0) {
                try {
                    let totalImported = 0;
                    let totalAttempted = 0;
                    
                    // Process each selected file
                    for (const file of e.target.files) {
                        try {
                            const result = await importXFormsFromFile(file);
                            totalImported += result.imported;
                            totalAttempted += result.total;
                        } catch (fileError) {
                            console.error(`Error importing file ${file.name}:`, fileError);
                        }
                    }
                    
                    await showInfoDialog(`Imported ${totalImported} of ${totalAttempted} xforms successfully.`);
                    await renderXFormList();
                } catch (error) {
                    await showInfoDialog(`Import failed: ${error.message}`);
                }
                // Reset the input to allow selecting the same file again
                e.target.value = '';
            }
        });
        
        importBtn.addEventListener('click', () => {
            importInput.click();
        });
        
        console.log('Import handler set up');
    } else {
        console.error('Import button or input not found');
    }
}

// Setup export all button
function setupExportAllHandler() {
    const exportAllBtn = document.getElementById('export-all-btn');
    
    if (exportAllBtn) {
        // Make sure there's a span inside the button
        if (!exportAllBtn.querySelector('span')) {
            exportAllBtn.innerHTML = "<span>📤</span>";
        }
        
        exportAllBtn.addEventListener('click', async () => {
            const hasSelection = window.selectedXforms && window.selectedXforms.length > 0;
            const selectionMessage = hasSelection ? 
                `Export ${window.selectedXforms.length} selected xform${window.selectedXforms.length === 1 ? "" : "s"}?` :
                "Export all xforms?";
                
            if (await confirmDialog(selectionMessage)) {
                await exportAllXFormsToFile();
            }
        });
        
        // Initialize button state
        updateExportButtonState();
        
        console.log('Export handler set up with multi-selection support');
    } else {
        console.error('Export button not found');
    }
}

// Confirmation dialog wrapper using showModalDialog
async function confirmDialog(message) {
    const result = await showModalDialog({
        message,
        buttons: [
            { id: 'confirm', label: 'Export', class: 'primary' },
            { id: 'cancel', label: 'Cancel', class: 'secondary' }
        ]
    });
    return result === 'confirm';
}

// --- Add SaveFileBtn Event Handler ---
function setupSaveButtonHandler() {
    const saveButton = document.getElementById('saveFileBtn');
    if (saveButton) {
        saveButton.addEventListener('click', async () => {
            const result = await saveCurrentXForm();
            if (result) {
                console.log('Successfully saved current xform:', result.name);
            }
        });
        console.log('Save button handler set up');
    }
}

// --- Modal Dialog Helper ---
function showModalDialog({ message = '', buttons = [] }) {
    return new Promise(resolve => {
        // Ensure at least one button
        if (!buttons.length) buttons = [{ id: 'ok', label: 'OK', class: 'primary' }];

        // Build or reuse backdrop
        let backdrop = document.getElementById('genericModalBackdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'genericModalBackdrop';
            backdrop.className = 'modal-backdrop';
            backdrop.innerHTML = `
                <div class="custom-confirm-modal">
                    <div class="custom-confirm-message"></div>
                    <div class="custom-confirm-buttons"></div>
                </div>`;
            document.body.appendChild(backdrop);
        }

        // Update message
        backdrop.querySelector('.custom-confirm-message').textContent = message;

        // Create buttons
        const btnContainer = backdrop.querySelector('.custom-confirm-buttons');
        btnContainer.innerHTML = '';
        buttons.forEach(btn => {
            const el = document.createElement('button');
            el.className = `modal-btn ${btn.class || ''}`.trim();
            el.textContent = btn.label;
            el.onclick = () => finish(btn.id);
            btnContainer.appendChild(el);
        });

        // Show backdrop
        backdrop.style.display = 'flex';

        const finish = (result) => {
            backdrop.style.display = 'none';
            resolve(result);
        };

        // backdrop click dismiss
        backdrop.onclick = (e) => { if (e.target === backdrop) finish('cancel'); };
        // ESC key
        const escHandler = (ev) => { if (ev.key === 'Escape') { finish('cancel'); document.removeEventListener('keydown', escHandler); } };
        document.addEventListener('keydown', escHandler);
    });
}

// Lightweight convenience wrapper for simple OK dialogs
function showInfoDialog(message, btnLabel = 'OK') {
    return showModalDialog({ message, buttons: [{ id: 'ok', label: btnLabel, class: 'primary' }] });
}

// Setup keyboard shortcuts for selection management
function setupSelectionKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
        // Select All: Ctrl+A / Cmd+A
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            const listContainer = document.getElementById('savedList');
            if (listContainer && document.activeElement === document.body) {
                e.preventDefault(); // Prevent browser's select all
                
                // Select all items
                clearSelectionWithoutUpdatingState();
                window.selectedXforms = []; // Reset and rebuild
                
                const allItems = document.querySelectorAll('#savedList li.file-list-item');
                allItems.forEach(item => {
                    item.classList.add('multi-selected');
                    
                    // Find the corresponding xform data
                    const itemId = item.dataset.xformId;
                    const itemIndex = item.dataset.index;
                    if (itemId && itemIndex) {
                        const xforms = document.querySelectorAll('#savedList li.file-list-item');
                        if (xforms.length > itemIndex) {
                            // Use the direct DOM index approach
                            try {
                                listXForms().then(allXforms => {
                                    window.selectedXforms = allXforms;
                                    updateExportButtonState();
                                });
                            } catch (err) {
                                console.error('Error with select all:', err);
                            }
                        }
                    }
                });
                
                console.log('Select all shortcut used');
            }
        }
        
        // Escape to clear selection
        if (e.key === 'Escape') {
            if (window.selectedXforms && window.selectedXforms.length > 0) {
                clearAllSelections();
                console.log('Selection cleared with Escape key');
            }
        }
    });
    
    console.log('Selection keyboard shortcuts initialized');
}

// Setup sort button function
function setupSortButton() {
    const sortBtn = document.getElementById('sortFilesBtn');
    if (!sortBtn) {
        console.warn('Sort button not found');
        return;
    }
    
    // Current sort state (0: name asc, 1: name desc, 2: date asc, 3: date desc)
    window.fileListSortMode = window.fileListSortMode || 3; // Default to date desc
    
    // Sort labels and icons
    const sortModes = [
        { by: 'name', dir: 'asc', label: '↑A-Z', title: 'Sort by name (A to Z)' },
        { by: 'name', dir: 'desc', label: '↓Z-A', title: 'Sort by name (Z to A)' },
        { by: 'lastModified', dir: 'asc', label: '↑Old', title: 'Sort by date (oldest first)' },
        { by: 'lastModified', dir: 'desc', label: '↓New', title: 'Sort by date (newest first)' }
    ];
    
    // Helper to update the button's appearance
    function updateSortButtonAppearance() {
        const mode = window.fileListSortMode;
        
        // Create or get the label span
        let labelSpan = sortBtn.querySelector('.sort-label');
        if (!labelSpan) {
            const img = sortBtn.querySelector('img');
            if (img) {
                // If there's an image, replace it with our label
                labelSpan = document.createElement('span');
                labelSpan.className = 'sort-label';
                sortBtn.replaceChild(labelSpan, img);
            } else {
                // Otherwise, just append the label
                labelSpan = document.createElement('span');
                labelSpan.className = 'sort-label';
                sortBtn.appendChild(labelSpan);
            }
        }
        
        // Update the label and title
        labelSpan.textContent = sortModes[mode].label;
        sortBtn.title = sortModes[mode].title;
    }
    
    console.log(`Debug: Setting up sort button, current mode: ${window.fileListSortMode}`);
    updateSortButtonAppearance(); // Initial update
    
    sortBtn.addEventListener('click', async () => {
        console.log(`Debug: Sort button clicked, current mode: ${window.fileListSortMode}`);
        
        // Save current selections before resorting
        const currentSelections = window.selectedXforms || [];
        const selectedIds = currentSelections.map(x => x.id.toString());
        
        // Cycle through sort modes
        window.fileListSortMode = (window.fileListSortMode + 1) % 4;
        
        // Update button appearance
        updateSortButtonAppearance();
        
        // Determine sort parameters
        const sortBy = sortModes[window.fileListSortMode].by;
        const sortDirection = sortModes[window.fileListSortMode].dir;
        
        console.log(`Debug: Sorting by ${sortBy} ${sortDirection}`);
        
        // Refresh the list with new sort order
        await renderXFormList(sortBy, sortDirection);
        
        // Restore selections after resorting
        if (selectedIds.length > 0) {
            // Get all items in new order
            const items = document.querySelectorAll('#savedList li.file-list-item');
            
            // Re-select previously selected items
            let newSelections = [];
            items.forEach(item => {
                const id = item.dataset.xformId;
                if (selectedIds.includes(id)) {
                    // Apply the appropriate selection class
                    if (selectedIds.length === 1) {
                        item.classList.add('single-selected');
                    } else {
                        item.classList.add('multi-selected');
                    }
                    
                    // Find the xform object for this id
                    const xform = currentSelections.find(x => x.id.toString() === id);
                    if (xform) {
                        newSelections.push(xform);
                    }
                }
            });
            
            // Update the global selection state
            window.selectedXforms = newSelections;
            
            // Update UI based on selection count
            updateExportButtonState();
            updateUIForSelectionCount();
            
            console.log(`Debug: Restored ${newSelections.length} selections after sorting`);
        }
    });
    
    console.log('Sort button handler set up');
    
    // Add styles for the sort button
    let style = document.getElementById('sort-button-styles');
    if (!style) {
        style = document.createElement('style');
        style.id = 'sort-button-styles';
        document.head.appendChild(style);
        
        style.textContent = `
            #sortFilesBtn .sort-label {
                font-weight: bold;
                padding: 2px 5px;
            }
        `;
    }
}

// Database diagnostics function
async function runDatabaseDiagnostics() {
    const results = document.createElement('div');
    results.style.fontSize = '12px';
    results.style.fontFamily = 'monospace';
    results.style.backgroundColor = '#f0f0f0';
    results.style.padding = '10px';
    results.style.borderRadius = '4px';
    results.style.maxHeight = '400px';
    results.style.overflow = 'auto';
    results.style.whiteSpace = 'pre-wrap';
    results.style.marginTop = '10px';
    
    // Dark theme support
    if (document.documentElement.classList.contains('dark-theme')) {
        results.style.backgroundColor = '#333';
        results.style.color = '#eee';
    }
    
    try {
        const addLine = (text) => {
            results.innerHTML += text + '<br>';
        };
        
        addLine('🔍 DATABASE DIAGNOSTICS:');
        addLine('--------------------');
        
        // Check if we can access the database
        addLine('Attempting to open database...');
        const db = await openDB();
        addLine(`✅ Database opened: ${XFORM_DB_NAME} (version ${db.version})`);
        
        // Check available object stores
        addLine('\nObject Stores:');
        const storeNames = Array.from(db.objectStoreNames);
        addLine(`Found ${storeNames.length} object stores: ${storeNames.join(', ')}`);
        
        // Check xforms store specifically
        if (storeNames.includes(XFORMS_STORE)) {
            addLine(`\nExamining xforms store (${XFORMS_STORE}):`);
            
            // Check indexes
            const tx = db.transaction(XFORMS_STORE, 'readonly');
            const store = tx.objectStore(XFORMS_STORE);
            const indexNames = Array.from(store.indexNames);
            addLine(`Indexes available: ${indexNames.join(', ')}`);
            
            // Count total records
            const countRequest = store.count();
            const count = await new Promise((resolve) => {
                countRequest.onsuccess = () => resolve(countRequest.result);
                countRequest.onerror = () => resolve('ERROR');
            });
            
            addLine(`Total records in store: ${count}`);
            
            // Get all records
            const getAllRequest = store.getAll();
            const allRecords = await new Promise((resolve) => {
                getAllRequest.onsuccess = () => resolve(getAllRequest.result);
                getAllRequest.onerror = () => resolve([]);
            });
            
            addLine(`Records retrieved: ${allRecords.length}`);
            
            // Check for discrepancy
            if (count !== allRecords.length) {
                addLine(`⚠️ WARNING: Count (${count}) doesn't match retrieved records (${allRecords.length})`);
            }
            
            // List all IDs and names
            addLine('\nRecord Details:');
            allRecords.forEach((record, idx) => {
                const date = new Date(record.lastModified).toLocaleString();
                addLine(`${idx+1}. ID: ${record.id}, Name: "${record.name}", Modified: ${date}`);
            });
            
            // Check for potential duplicate IDs
            const ids = allRecords.map(r => r.id);
            const uniqueIds = new Set(ids);
            if (ids.length !== uniqueIds.size) {
                addLine(`\n⚠️ WARNING: Found ${ids.length - uniqueIds.size} duplicate IDs!`);
                
                // Find duplicates
                const idCounts = {};
                ids.forEach(id => {
                    idCounts[id] = (idCounts[id] || 0) + 1;
                });
                
                Object.entries(idCounts)
                    .filter(([_, count]) => count > 1)
                    .forEach(([id, count]) => {
                        addLine(`  - ID ${id} appears ${count} times`);
                    });
            }
            
            // Transaction complete
            await tx.done;
            addLine('\n✅ Diagnostics complete');
        } else {
            addLine(`⚠️ WARNING: xforms store (${XFORMS_STORE}) not found in database!`);
        }
    } catch (error) {
        results.innerHTML += `<div style="color: red;">❌ ERROR: ${error.message}</div>`;
        console.error('Diagnostics error:', error);
    }
    
    // Add to the page
    const container = document.querySelector('.file-list-container');
    if (container) {
        // Remove any existing diagnostic results
        const existingResults = document.getElementById('db-diagnostic-results');
        if (existingResults) {
            existingResults.remove();
        }
        
        results.id = 'db-diagnostic-results';
        container.appendChild(results);
    } else {
        // Show in an alert if we can't find the container
        alert('Please see console for database diagnostics');
        console.log(results.innerHTML.replace(/<br>/g, '\n'));
    }
    
    return results.innerHTML;
}

// Add diagnostics button to the UI
function addDiagnosticsButton() {
    // Check if console utility function exists - if so, don't add the button
    if (typeof window.db_diagnose === 'function') {
        console.log('Console utility db_diagnose() detected - not adding diagnostics button to UI');
        return;
    }
    
    const headerControls = document.querySelector(".file-list-header");
    if (!headerControls) return;
    
    // Create diagnostics button
    const diagBtn = document.createElement("button");
    diagBtn.id = "db-diagnostics-btn";
    diagBtn.className = "mode-icon";
    diagBtn.title = "Show Database Diagnostics";
    diagBtn.innerHTML = "<span>🔍</span>";
    diagBtn.style.marginLeft = "auto";
    
    // Add click handler
    diagBtn.addEventListener("click", runDatabaseDiagnostics);
    
    // Add to header
    headerControls.appendChild(diagBtn);
    console.log("Diagnostics button added");
}

// Add the diagnostics button to the setup function
async function setupIndexedDBPersistence() {
    try {
        console.log('Setting up IndexedDB persistence...');
        
        // Check if there's a pending database reset from a page reload
        const pendingReset = window.localStorage.getItem('pendingDbReset');
        if (pendingReset === 'true') {
            console.log('Pending database reset detected - performing reset after page reload');
            window.localStorage.removeItem('pendingDbReset');
            
            try {
                await resetDatabase();
                await showInfoDialog("Database has been reset successfully after page reload.");
            } catch (resetError) {
                console.error('Error during pending reset:', resetError);
                await showInfoDialog("There was an error resetting the database. Please try again.");
            }
        }
        
        try {
            // Try to initialize the database
            await openDB();
        } catch (dbError) {
            console.error('Error initializing database:', dbError);
            console.log('Attempting to reset the database...');
            
            // Try to reset the database
            await resetDatabase();
        }
        
        // Set up the UI components
        setupImportHandler();
        setupExportAllHandler();
        setupSaveButtonHandler();
        setupSelectionKeyboardShortcuts();
        setupSortButton();
        setupPathStyleButton(); // Add path style button setup
        setupFilenameModeButtons(); // Add filename mode button setup
        
        // Only initialize these buttons if the console utility functions don't exist
        if (typeof window.db_reset !== 'function') {
            initDbResetButton();
        } else {
            console.log('Console utility db_reset() detected - skipping DB reset button initialization');
        }
        
        if (typeof window.db_diagnose !== 'function') {
            addDiagnosticsButton(); // Add diagnostics button
        } else {
            console.log('Console utility db_diagnose() detected - skipping diagnostics button initialization');
        }
        
        // Render the initial list of saved xforms - catching errors
        try {
            await renderXFormList();
        } catch (listError) {
            console.error('Error rendering xform list:', listError);
            // Show empty list with message
            refreshListWithEmptyState();
        }
        
        console.log('IndexedDB persistence setup complete.');
        return true;
    } catch (error) {
        console.error('Error setting up IndexedDB persistence:', error);
        
        // Try to show something useful in the UI
        const fileListUl = document.getElementById('savedList');
        if (fileListUl) {
            fileListUl.innerHTML = '<li>Error setting up storage. Please try refreshing the page.</li>';
        }
        
        return false;
    }
}

// --- Make functions available globally ---
window.openDB = openDB;
window.saveXForm = saveXForm;
window.loadXFormById = loadXFormById;
window.deleteXFormById = deleteXFormById;
window.listXForms = listXForms;
window.exportXFormToFile = exportXFormToFile;
window.exportAllXFormsToFile = exportAllXFormsToFile;
window.importXFormsFromFile = importXFormsFromFile;
window.renderXFormList = renderXFormList;
window.loadXForm = loadXForm;
window.deleteXForm = deleteXForm;
window.saveCurrentXForm = saveCurrentXForm;
window.setupIndexedDBPersistence = setupIndexedDBPersistence;
window.showModalDialog = showModalDialog;
window.showInfoDialog = showInfoDialog;
window.resetDatabase = resetDatabase;
window.applyXFormData = applyXFormData;
window.createXFormDataObject = createXFormDataObject;
window.applyTheme = applyTheme;
window.updateIconsForTheme = updateIconsForTheme;
window.applyThemeFromLocalStorage = applyThemeFromLocalStorage;
window.clearAllSelections = clearAllSelections;
window.updateExportButtonState = updateExportButtonState;
window.confirmDialog = confirmDialog;
window.initDbResetButton = initDbResetButton;
window.refreshListWithEmptyState = refreshListWithEmptyState;
window.runDatabaseDiagnostics = runDatabaseDiagnostics;
window.addDiagnosticsButton = addDiagnosticsButton;

// Add the missing createXFormDataObject function
function createXFormDataObject() {
    // Get the name from the filename input
    const filenameInput = document.getElementById('filenameInput');
    const name = filenameInput ? filenameInput.value : new Date().toISOString();
    
    // Get current rect dimensions
    const rectWidth = window.widthInput ? parseInt(window.widthInput.value, 10) : 100;
    const rectHeight = window.heightInput ? parseInt(window.heightInput.value, 10) : 60;
    
    // Get rotation values
    const xRotation = window.xRotationDirection !== undefined ? window.xRotationDirection : 1;
    const yRotation = window.yRotationDirection !== undefined ? window.yRotationDirection : 1;
    const zRotation = window.zRotationDirection !== undefined ? window.zRotationDirection : 1;
    
    // Get animation duration
    const duration = window.durationInput ? parseInt(window.durationInput.value, 10) : 500;
    
    console.log(`Creating XForm object with width=${rectWidth}, height=${rectHeight}, ` +
                `rotations=[${xRotation},${yRotation},${zRotation}], duration=${duration}ms`);
    
    // Assumes global state variables like startRect, endRect, intermediatePoints, etc. are accessible via window
    return {
        name: name || window.currentXFormName || new Date().toISOString(),
        id: window.currentXFormId || Date.now(),
        timestamp: Date.now(),
        lastModified: Date.now(), // Add lastModified timestamp
        startRect: {
            left: window.startRect ? parseFloat(window.startRect.style.left) || 0 : 78.5, // Provide defaults
            top: window.startRect ? parseFloat(window.startRect.style.top) || 0 : 49.5,
            width: rectWidth,
            height: rectHeight
        },
        endRect: {
            left: window.endRect ? parseFloat(window.endRect.style.left) || 0 : 250.5,
            top: window.endRect ? parseFloat(window.endRect.style.top) || 0 : 217.5,
            width: rectWidth,
            height: rectHeight
        },
        waypoints: window.intermediatePoints ? window.intermediatePoints.map(point => ({ x: point.x, y: point.y })) : [],
        rotations: {
            x: xRotation,
            y: yRotation,
            z: zRotation
        },
        duration: duration
    };
}

// Apply loaded XForm data to the UI
function applyXFormData(data) {
    if (!data) return;
    
    console.log("Applying XForm data:", data.name || "[unnamed]");

    // Update global state
    window.currentXFormName = data.name || new Date().toISOString();
    window.currentXFormId = data.id || Date.now();
    window.currentXFormHasRun = true; 

    // Initialize viewport if needed
    if (!window.viewport) {
        window.viewport = document.getElementById('viewport');
        if (!window.viewport) {
            console.error("Viewport element not found!");
            return;
        }
    }

    // Important: Check if we need to initialize the rectangles completely
    const needsInit = !window.startRect || !window.endRect || 
                      !document.getElementById('startRect') || 
                      !document.getElementById('endRect');
    
    if (needsInit) {
        console.log("Rectangles not properly initialized, running full initialization...");
        
        // Use the global initializeRects function from xform-controls.js if available
        if (typeof window.initializeRects === 'function') {
            window.initializeRects();
            console.log("Initialized rectangles using initializeRects");
        } else {
            // Fallback manual initialization
            console.warn("initializeRects function not available, using fallback initialization");
            
            // Clean up any existing elements first
            const existingStart = document.getElementById('startRect');
            const existingEnd = document.getElementById('endRect');
            if (existingStart) existingStart.remove();
            if (existingEnd) existingEnd.remove();
            
            // Create start rectangle
            window.startRect = document.createElement('div');
            window.startRect.id = 'startRect';
            window.startRect.className = 'rect rect-start';
            window.startRect.textContent = 'Start';
            window.viewport.appendChild(window.startRect);
            
            // Create end rectangle
            window.endRect = document.createElement('div');
            window.endRect.id = 'endRect';
            window.endRect.className = 'rect rect-end';
            window.endRect.textContent = 'End';
            window.viewport.appendChild(window.endRect);
            
            // Make rectangles draggable
            if (typeof window.makeDraggable === 'function') {
                window.makeDraggable(window.startRect);
                window.makeDraggable(window.endRect);
                console.log("Made rectangles draggable");
            } else {
                console.error("makeDraggable function not available!");
            }
        }
    }

    // Update dimensions
    if (window.widthInput && data.startRect) window.widthInput.value = data.startRect.width;
    if (window.heightInput && data.startRect) window.heightInput.value = data.startRect.height;
    
    // Apply the size
    if (typeof window.applyRectangleSize === 'function') {
        window.applyRectangleSize();
        console.log("Applied rectangle size");
    } else {
        // Manual fallback for sizing
        if (window.startRect && data.startRect) {
            window.startRect.style.width = `${data.startRect.width}px`;
            window.startRect.style.height = `${data.startRect.height}px`;
        }
        if (window.endRect && data.endRect) {
            window.endRect.style.width = `${data.endRect.width}px`;
            window.endRect.style.height = `${data.endRect.height}px`;
        }
        console.log("Applied manual size fallback");
    }

    // Set rectangle positions
    if (window.startRect && data.startRect) {
        window.startRect.style.left = `${data.startRect.left}px`;
        window.startRect.style.top = `${data.startRect.top}px`;
        console.log(`Set startRect position to (${data.startRect.left}, ${data.startRect.top})`);
    }
    
    if (window.endRect && data.endRect) {
        window.endRect.style.left = `${data.endRect.left}px`;
        window.endRect.style.top = `${data.endRect.top}px`;
        console.log(`Set endRect position to (${data.endRect.left}, ${data.endRect.top})`);
    }

    // Clear existing visual waypoints
    if (window.intermediatePoints && Array.isArray(window.intermediatePoints)) {
        window.intermediatePoints.forEach(p => p.element && p.element.remove());
        window.intermediatePoints = [];
    } else {
        window.intermediatePoints = [];
    }
    
    // Add new waypoints
    if (data.waypoints && Array.isArray(data.waypoints)) {
        data.waypoints.forEach((point, index) => {
            const marker = document.createElement('div');
            marker.className = 'point-marker';
            marker.style.left = `${point.x}px`;
            marker.style.top = `${point.y}px`;
            window.viewport.appendChild(marker);
            
            const pointData = { x: point.x, y: point.y, element: marker };
            window.intermediatePoints.push(pointData);
            
            if (typeof window.makeDraggableWaypoint === 'function') {
                 window.makeDraggableWaypoint(marker, index);
                 console.log(`Made waypoint ${index} draggable`);
            }
        });
    }

    // Set rotation values
    if (data.rotations) {
        window.xRotationDirection = data.rotations.x;
        window.yRotationDirection = data.rotations.y;
        window.zRotationDirection = data.rotations.z;
        if (typeof window.updateRotationButtonsUI === 'function') {
            window.updateRotationButtonsUI();
            console.log("Updated rotation buttons UI");
        }
    }

    // Set animation duration
    if (window.durationInput && data.duration) {
        window.durationInput.value = data.duration;
        // Update the duration feedback if available
        const durationFeedback = document.getElementById('durationFeedback');
        if (durationFeedback) {
            const seconds = (data.duration / 1000).toFixed(1);
            durationFeedback.textContent = `(${seconds}s)`;
            durationFeedback.style.display = 'inline';
        }
        console.log(`Set duration to ${data.duration}`);
    }

    if (typeof window.updateWaypointCounter === 'function') {
        window.updateWaypointCounter();
    }
    window.lastModifiedPointIndex = window.intermediatePoints.length - 1;
    
    // Update filename display
    const filenameInput = document.getElementById('filenameInput');
    if (filenameInput) {
        filenameInput.value = window.currentXFormName;
        
        // If using the manual mode (not ATM), make sure it's set
        if (window.isFilenameModeATM === false) {
            localStorage.setItem('xformMaker_filenameValue', window.currentXFormName);
        }
    }

    // Ensure draggable functionality is applied
    if (!needsInit && typeof window.makeDraggable === 'function') {
        // Re-apply draggable functionality to ensure it works
        window.makeDraggable(window.startRect);
        window.makeDraggable(window.endRect);
        console.log("Re-applied draggable functionality to rectangles");
    }

    console.log("Applied X-Form data:", window.currentXFormName);
}

// Make the function available globally
window.applyXFormData = applyXFormData;

// --- Theme Functions ---
function applyTheme(theme) {
    const htmlElement = document.documentElement;
    if (theme === 'dark') {
        htmlElement.classList.add('dark-theme');
    } else {
        htmlElement.classList.remove('dark-theme');
    }
    localStorage.setItem('xformMakerTheme', theme);
    // Update icons 
    updateIconsForTheme();
}

function updateIconsForTheme() {
    const isDark = document.documentElement.classList.contains('dark-theme');
    console.log("Updating icons for theme:", isDark ? "Dark" : "Light");

    // Update all icons with data-dark-src attribute
    document.querySelectorAll('img.btn-icon[data-dark-src]').forEach(img => {
        const lightSrc = img.getAttribute('src');
        const darkSrc = img.getAttribute('data-dark-src');
        if (isDark && darkSrc) {
            // Check if we need to update (prevent unnecessary reloads)
            if (img.src !== darkSrc) {
                img.src = darkSrc;
                console.log(`Switched ${img.alt} icon to dark: ${darkSrc}`);
            }
        } else {
            // Check if we need to update
            if (img.src !== lightSrc) {
                img.src = lightSrc;
                console.log(`Switched ${img.alt} icon to light: ${lightSrc}`);
            }
        }
    });
}

function applyThemeFromLocalStorage() {
    const savedTheme = localStorage.getItem('xformMakerTheme') || 'light';
    applyTheme(savedTheme);
}

// Make theme functions available globally
window.applyTheme = applyTheme;
window.updateIconsForTheme = updateIconsForTheme;
window.applyThemeFromLocalStorage = applyThemeFromLocalStorage;

// Helper to clear visual selection without changing state
function clearSelectionWithoutUpdatingState() {
    document.querySelectorAll('#savedList li.multi-selected, #savedList li.single-selected')
        .forEach(el => {
            el.classList.remove('multi-selected', 'single-selected');
        });
}

// Helper to clear all selections
function clearAllSelections() {
    clearSelectionWithoutUpdatingState();
    window.selectedXforms = [];
    updateExportButtonState();
}

// Add or update CSS for multi-select styling
function addOrUpdateMultiSelectStyles() {
    let style = document.getElementById('multi-select-styles');
    if (!style) {
        style = document.createElement('style');
        style.id = 'multi-select-styles';
        document.head.appendChild(style);
    }
    
    style.textContent = `
        .file-list-item.multi-selected {
            background-color: var(--button-primary-bg) !important;
            color: var(--button-primary-color) !important;
        }
        .dark-theme .file-list-item.multi-selected {
            background-color: var(--button-primary-bg) !important;
            color: var(--button-primary-color) !important;
        }
        #export-all-btn[disabled] {
            opacity: 0.5;
            cursor: not-allowed;
        }
        #export-all-btn.has-selection span {
            font-weight: bold;
            color: #fff;
        }
        .selection-info {
            font-size: 11px;
            color: #666;
            margin-top: 4px;
            padding: 2px 8px;
            text-align: center;
            background-color: #f0f0f0;
            border-radius: 3px;
            display: none;
        }
        .dark-theme .selection-info {
            background-color: #333;
            color: #ccc;
        }
        .selection-info.active {
            display: block;
        }
    `;
    
    // Add selection info element if it doesn't exist
    let infoElement = document.getElementById('selection-info');
    if (!infoElement) {
        const listContainer = document.querySelector('.file-list-container');
        if (listContainer) {
            infoElement = document.createElement('div');
            infoElement.id = 'selection-info';
            infoElement.className = 'selection-info';
            listContainer.appendChild(infoElement);
        }
    }
}

// Update export button state based on selection
function updateExportButtonState() {
    const exportBtn = document.getElementById('export-all-btn');
    if (!exportBtn) return;
    
    const hasSelection = window.selectedXforms && window.selectedXforms.length > 0;
    const infoElement = document.getElementById('selection-info');
    
    if (hasSelection) {
        const itemText = window.selectedXforms.length === 1 ? "item" : "items";
        exportBtn.title = `Export ${window.selectedXforms.length} selected ${itemText}`;
        exportBtn.classList.add('has-selection');
        exportBtn.querySelector('span').textContent = `📤 ${window.selectedXforms.length}`;
        
        // Update selection info
        if (infoElement) {
            infoElement.textContent = `${window.selectedXforms.length} ${itemText} selected. Use Shift+Click for range selection, Ctrl/Cmd+Click for individual selection.`;
            infoElement.classList.add('active');
        }
    } else {
        exportBtn.title = 'Export All XForms';
        exportBtn.classList.remove('has-selection');
        exportBtn.querySelector('span').textContent = '📤';
        
        // Hide selection info
        if (infoElement) {
            infoElement.classList.remove('active');
        }
    }
}

// Update UI based on selection count
function updateUIForSelectionCount() {
    const selectionCount = window.selectedXforms ? window.selectedXforms.length : 0;
    
    // Get UI elements
    const filenameInput = document.getElementById('filenameInput');
    const saveButton = document.getElementById('saveFileBtn');
    const atmButton = document.getElementById('filenameModeATM');
    const memButton = document.getElementById('filenameModeManual');
    
    // Create or get the delete selected button
    const deleteSelectedBtn = createDeleteSelectedButton();
    
    if (selectionCount === 1) {
        // Single selection - enable editing
        if (filenameInput) {
            filenameInput.value = window.selectedXforms[0].name;
            filenameInput.disabled = false;
            filenameInput.classList.remove('disabled');
        }
        
        // Enable buttons
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.style.pointerEvents = '';
            saveButton.classList.remove('disabled');
        }
        
        if (atmButton) {
            atmButton.disabled = false;
            atmButton.style.pointerEvents = '';
            atmButton.classList.remove('disabled');
        }
        
        if (memButton) {
            memButton.disabled = false;
            memButton.style.pointerEvents = '';
            memButton.classList.remove('disabled');
        }
        
        // Hide delete selected button for single selection
        if (deleteSelectedBtn) {
            deleteSelectedBtn.style.display = 'none';
        }
    } else if (selectionCount > 1) {
        // Multiple selection - disable editing
        if (filenameInput) {
            filenameInput.value = `${selectionCount} XForms selected`;
            filenameInput.disabled = true;
            filenameInput.classList.add('disabled');
        }
        
        // Disable buttons
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.style.pointerEvents = 'none';
            saveButton.classList.add('disabled');
        }
        
        if (atmButton) {
            atmButton.disabled = true;
            atmButton.style.pointerEvents = 'none';
            atmButton.classList.add('disabled');
        }
        
        if (memButton) {
            memButton.disabled = true;
            memButton.style.pointerEvents = 'none';
            memButton.classList.add('disabled');
        }
        
        // Show delete selected button for multiple selections
        if (deleteSelectedBtn) {
            deleteSelectedBtn.style.display = 'block';
            deleteSelectedBtn.textContent = `Delete (${selectionCount})`;
        }
    } else {
        // No selection - clear and disable
        if (filenameInput) {
            filenameInput.value = '';
            filenameInput.disabled = false;
            filenameInput.classList.remove('disabled');
        }
        
        // Enable buttons
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.style.pointerEvents = '';
            saveButton.classList.remove('disabled');
        }
        
        if (atmButton) {
            atmButton.disabled = false;
            atmButton.style.pointerEvents = '';
            atmButton.classList.remove('disabled');
        }
        
        if (memButton) {
            memButton.disabled = false;
            memButton.style.pointerEvents = '';
            memButton.classList.remove('disabled');
        }
        
        // Hide delete selected button when no selection
        if (deleteSelectedBtn) {
            deleteSelectedBtn.style.display = 'none';
        }
    }
}

// Setup path style button function
function setupPathStyleButton() {
    // Check if the button already exists, if not, create it
    let pathStyleBtn = document.getElementById('pathStyleBtn');
    
    if (!pathStyleBtn) {
        // Find a suitable location to add the button
        const viewportActions = document.querySelector('.viewport-actions');
        if (!viewportActions) {
            console.error('Could not find viewport actions to add path style button');
            return;
        }
        
        // Create the button
        pathStyleBtn = document.createElement('button');
        pathStyleBtn.id = 'pathStyleBtn';
        pathStyleBtn.title = 'Change Path Style';
        pathStyleBtn.textContent = 'Path: None';
        
        // Add it after the reset button
        const resetBtn = document.getElementById('resetPositions');
        if (resetBtn && resetBtn.nextSibling) {
            viewportActions.insertBefore(pathStyleBtn, resetBtn.nextSibling);
        } else {
            viewportActions.appendChild(pathStyleBtn);
        }
        
        console.log('Path style button created and added to viewport actions');
    }
    
    // Path style modes
    window.pathStyleModes = [
        { id: 'none', label: 'Path: None', style: 'none' },
        { id: 'dotted', label: 'Path: Dotted', style: 'dotted' },
        { id: 'dashed', label: 'Path: Dashed', style: 'dashed' },
        { id: 'solid', label: 'Path: Solid', style: 'solid' },
        { id: 'circles', label: 'Path: Circles', style: 'circles' },
        { id: 'boxes', label: 'Path: Boxes', style: 'boxes' }
    ];
    
    // Current mode index
    window.currentPathStyleIndex = window.currentPathStyleIndex || 0;
    
    // Set initial button text
    pathStyleBtn.textContent = window.pathStyleModes[window.currentPathStyleIndex].label;
    
    // Add styles for path visualization if not already present
    addPathVisualizationStyles();
    
    // Add click handler
    pathStyleBtn.addEventListener('click', () => {
        // Cycle to next style
        window.currentPathStyleIndex = (window.currentPathStyleIndex + 1) % window.pathStyleModes.length;
        const newMode = window.pathStyleModes[window.currentPathStyleIndex];
        
        // Update button text
        pathStyleBtn.textContent = newMode.label;
        
        // Apply the new style
        applyPathStyle(newMode.style);
        
        console.log(`Path style changed to: ${newMode.style}`);
    });
    
    // Initial path style application (if not 'none')
    const initialMode = window.pathStyleModes[window.currentPathStyleIndex];
    if (initialMode.id !== 'none') {
        applyPathStyle(initialMode.style);
    }
    
    console.log('Path style button handler set up');
}

// Add CSS styles for path visualization
function addPathVisualizationStyles() {
    let style = document.getElementById('path-visualization-styles');
    if (!style) {
        style = document.createElement('style');
        style.id = 'path-visualization-styles';
        document.head.appendChild(style);
        
        // Get the current path thickness from settings or use default
        const pathThickness = window.pathThickness || 2;
        
        style.textContent = `
            .path-visualization {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 4;
            }
            
            .path-line {
                stroke: rgba(65, 105, 225, 0.7);
                fill: none;
                stroke-width: ${pathThickness}px;
            }
            
            .path-line.dotted {
                stroke-dasharray: 2, 5;
            }
            
            .path-line.dashed {
                stroke-dasharray: 10, 5;
            }
            
            .path-marker-circle {
                fill: rgba(65, 105, 225, 0.5);
                stroke: rgba(65, 105, 225, 0.9);
                stroke-width: 1px;
            }
            
            .path-marker-box {
                fill: rgba(65, 105, 225, 0.3);
                stroke: rgba(65, 105, 225, 0.9);
                stroke-width: 1px;
            }
        `;
    }
}

// Apply the selected path style
function applyPathStyle(style) {
    const viewport = document.getElementById('viewport');
    if (!viewport) return;
    
    // Remove any existing path visualization
    const existingPath = document.getElementById('path-visualization');
    if (existingPath) {
        existingPath.remove();
    }
    
    // If style is 'none', we're done
    if (style === 'none') {
        return;
    }
    
    // Create SVG container
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'path-visualization');
    svg.setAttribute('class', 'path-visualization');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    
    // Get start, end, and waypoints
    const startRect = document.getElementById('startRect');
    const endRect = document.getElementById('endRect');
    
    if (!startRect || !endRect) {
        console.error('Start or end rectangle not found');
        return;
    }
    
    // Get center points
    const startRectStyle = window.getComputedStyle(startRect);
    const endRectStyle = window.getComputedStyle(endRect);
    
    const startX = parseFloat(startRectStyle.left) + parseFloat(startRectStyle.width) / 2;
    const startY = parseFloat(startRectStyle.top) + parseFloat(startRectStyle.height) / 2;
    
    const endX = parseFloat(endRectStyle.left) + parseFloat(endRectStyle.width) / 2;
    const endY = parseFloat(endRectStyle.top) + parseFloat(endRectStyle.height) / 2;
    
    // Collect all points in order
    const points = [{ x: startX, y: startY }];
    
    // Add waypoints if they exist
    if (window.intermediatePoints && window.intermediatePoints.length > 0) {
        window.intermediatePoints.forEach(point => {
            points.push({ x: point.x, y: point.y });
        });
    }
    
    // Add end point
    points.push({ x: endX, y: endY });
    
    // Draw based on style
    if (style === 'dotted' || style === 'dashed' || style === 'solid') {
        // Create path element
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', `path-line ${style}`);
        
        // Generate path data
        let pathData = `M ${points[0].x},${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            pathData += ` L ${points[i].x},${points[i].y}`;
        }
        
        path.setAttribute('d', pathData);
        svg.appendChild(path);
    }
    
    if (style === 'circles') {
        // Add circles at each point
        points.forEach((point, index) => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('class', 'path-marker-circle');
            circle.setAttribute('cx', point.x);
            circle.setAttribute('cy', point.y);
            
            // Start/end points are larger
            const radius = (index === 0 || index === points.length - 1) ? 6 : 4;
            circle.setAttribute('r', radius);
            
            svg.appendChild(circle);
            
            // Connect with lines
            if (index > 0) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('class', 'path-line');
                line.setAttribute('x1', points[index - 1].x);
                line.setAttribute('y1', points[index - 1].y);
                line.setAttribute('x2', point.x);
                line.setAttribute('y2', point.y);
                svg.appendChild(line);
            }
        });
    }
    
    if (style === 'boxes') {
        // Add rectangles at each point
        points.forEach((point, index) => {
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('class', 'path-marker-box');
            
            // Start/end points are larger
            const size = (index === 0 || index === points.length - 1) ? 10 : 7;
            rect.setAttribute('width', size);
            rect.setAttribute('height', size);
            rect.setAttribute('x', point.x - size / 2);
            rect.setAttribute('y', point.y - size / 2);
            
            svg.appendChild(rect);
            
            // Connect with lines
            if (index > 0) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('class', 'path-line');
                line.setAttribute('x1', points[index - 1].x);
                line.setAttribute('y1', points[index - 1].y);
                line.setAttribute('x2', point.x);
                line.setAttribute('y2', point.y);
                svg.appendChild(line);
            }
        });
    }
    
    // Add to viewport
    viewport.appendChild(svg);
}

// Create the delete selected button
function createDeleteSelectedButton() {
    const headerControls = document.querySelector(".file-header-controls");
    const importButton = document.getElementById("import-file-btn");
    
    if (!headerControls || !importButton) {
        console.error("Could not find header controls or import button");
        return null;
    }
    
    // Create the button if it doesn't exist
    let deleteSelectedBtn = document.getElementById("delete-selected-btn");
    if (!deleteSelectedBtn) {
        deleteSelectedBtn = document.createElement("button");
        deleteSelectedBtn.id = "delete-selected-btn";
        deleteSelectedBtn.className = "mode-icon";
        deleteSelectedBtn.title = "Delete Selected XForms";
        deleteSelectedBtn.innerHTML = "<span>🗑️</span>";
        deleteSelectedBtn.style.backgroundColor = "#dc3545";
        deleteSelectedBtn.style.color = "white";
        deleteSelectedBtn.style.padding = "3px 8px";
        deleteSelectedBtn.style.borderRadius = "4px";
        deleteSelectedBtn.style.marginRight = "8px";
        deleteSelectedBtn.style.display = "none"; // Initially hidden
        
        // Add click handler
        deleteSelectedBtn.addEventListener("click", async () => {
            const selectedCount = window.selectedXforms?.length || 0;
            if (selectedCount === 0) return;
            
            const result = await showModalDialog({
                message: `Delete ${selectedCount} selected XForm${selectedCount > 1 ? 's' : ''}? This cannot be undone.`,
                buttons: [
                    { id: 'delete', label: 'Delete Selected', class: 'danger' },
                    { id: 'cancel', label: 'Cancel', class: 'secondary' }
                ]
            });
            
            if (result === 'cancel') {
                // Clear all selections if canceled
                clearAllSelections();
                return;
            }
            
            // Delete all selected XForms
            try {
                const deletedCount = await deleteSelectedXForms();
                await showInfoDialog(`Successfully deleted ${deletedCount} XForm${deletedCount > 1 ? 's' : ''}.`);
                
                // Refresh the list
                await renderXFormList();
            } catch (error) {
                console.error("Error deleting selected XForms:", error);
                await showInfoDialog(`Error deleting XForms: ${error.message}`);
            }
        });
        
        // Insert to the left of the import button
        headerControls.insertBefore(deleteSelectedBtn, importButton);
        console.log("Delete selected button added");
    }
    
    return deleteSelectedBtn;
}

// Delete all selected XForms
async function deleteSelectedXForms() {
    if (!window.selectedXforms || window.selectedXforms.length === 0) {
        return 0;
    }
    
    let deleteCount = 0;
    const errors = [];
    
    // Delete each selected XForm
    for (const xform of window.selectedXforms) {
        try {
            const success = await deleteXFormById(xform.id);
            if (success) {
                deleteCount++;
            } else {
                errors.push(`Failed to delete "${xform.name}"`);
            }
        } catch (error) {
            console.error(`Error deleting XForm "${xform.name}":`, error);
            errors.push(`Error deleting "${xform.name}": ${error.message}`);
        }
    }
    
    // Clear the selection after deletion
    window.selectedXforms = [];
    
    // If there were errors, log them
    if (errors.length > 0) {
        console.error(`Errors during deletion: ${errors.join('; ')}`);
    }
    
    return deleteCount;
}

// Setup the filename mode buttons (ATM and MEM)
function setupFilenameModeButtons() {
    const atmButton = document.getElementById('filenameModeATM');
    const memButton = document.getElementById('filenameModeManual');
    const filenameInput = document.getElementById('filenameInput');
    
    if (!atmButton || !memButton || !filenameInput) {
        console.error("Cannot find filename mode buttons or input field");
        return;
    }
    
    // Initialize from saved state or default to ATM mode
    window.isFilenameModeATM = localStorage.getItem('xformMaker_filenameMode') !== 'MEM';
    
    // Function to update button states based on current mode
    const updateButtonStates = () => {
        if (window.isFilenameModeATM) {
            // ATM mode active
            atmButton.classList.add('active');
            memButton.classList.remove('active');
            filenameInput.readOnly = true;
            filenameInput.classList.add('readonly');
            
            // Generate timestamp-based filename
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
            filenameInput.value = `XForm-${timestamp}`;
        } else {
            // MEM mode active
            atmButton.classList.remove('active');
            memButton.classList.add('active');
            filenameInput.readOnly = false;
            filenameInput.classList.remove('readonly');
            
            // Load saved manual filename or use empty string
            const savedValue = localStorage.getItem('xformMaker_filenameValue');
            if (savedValue) {
                filenameInput.value = savedValue;
            } else {
                filenameInput.value = '';
            }
        }
    };
    
    // Add click handler for ATM button
    atmButton.addEventListener('click', () => {
        if (!window.isFilenameModeATM) {
            window.isFilenameModeATM = true;
            localStorage.setItem('xformMaker_filenameMode', 'ATM');
            updateButtonStates();
            console.log("Switched to ATM mode");
        }
    });
    
    // Add click handler for MEM button
    memButton.addEventListener('click', () => {
        if (window.isFilenameModeATM) {
            window.isFilenameModeATM = false;
            localStorage.setItem('xformMaker_filenameMode', 'MEM');
            
            // Save current value for future MEM mode
            if (filenameInput.value) {
                localStorage.setItem('xformMaker_filenameValue', filenameInput.value);
            }
            
            updateButtonStates();
            console.log("Switched to MEM mode");
        }
    });
    
    // Add input handler for filename in MEM mode
    filenameInput.addEventListener('input', () => {
        if (!window.isFilenameModeATM) {
            localStorage.setItem('xformMaker_filenameValue', filenameInput.value);
        }
    });
    
    // Apply initial state
    updateButtonStates();
    console.log(`Filename mode buttons initialized. Current mode: ${window.isFilenameModeATM ? 'ATM' : 'MEM'}`);
}