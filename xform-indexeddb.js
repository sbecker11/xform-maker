// --- IndexedDB Configuration and Helpers ---
const XFORM_DB_NAME = 'xformMakerDB'; // Renamed to avoid conflicts
const XFORM_DB_VERSION = 2; // <-- INCREMENTED VERSION
const XFORMS_STORE = 'xforms'; // Changed from 'xformsStore' to match what's used in the code
const XFORM_SETTINGS_STORE = 'settingsStore'; // Store for app settings
const XFORM_DIR_HANDLE_KEY = 'lastDirectoryHandle'; // Keep for backward compatibility

// Access path-style helpers attached by xform-path-styles.js
const xformPathStyles = window.xformPathStyles || {};

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
                console.log("DEBUG RESET: Attempting indexedDB.deleteDatabase..."); // Log before delete
                const deleteRequest = indexedDB.deleteDatabase(XFORM_DB_NAME);

                deleteRequest.onerror = (event) => {
                    console.error("DEBUG RESET: Error deleting database:", event.target.error);
                    reject("Failed to delete database");
                };

                deleteRequest.onblocked = (event) => {
                    console.warn("DEBUG RESET: Database delete operation blocked. Close any other tabs using the database.");
                    console.warn("DEBUG RESET: Blocked event:", event); // Log blocked event
                    
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
                         console.log("DEBUG RESET: Rejecting due to block after dialog.");
                         reject("Database reset blocked - other connections are still open");
                    });
                };
                
                deleteRequest.onsuccess = () => {
                    console.log("DEBUG RESET: Database successfully deleted, opening fresh database via openNewDatabase()..."); // Log success
                    // Now open a fresh database with the objects specifically defined
                    openNewDatabase().then(db => {
                        // Clear the list UI immediately
                         console.log("DEBUG RESET: openNewDatabase() successful. Refreshing UI list.");
                         refreshListWithEmptyState();
                         resolve(db);
                    }).catch(err => {
                         console.error("DEBUG RESET: openNewDatabase() FAILED after delete.");
                         reject(err);
                    });
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
                    await resetDatabase(); // Wait for the reset to finish
                    
                    // Explicitly refresh the UI list AFTER successful reset
                    if (typeof refreshListWithEmptyState === 'function') {
                        refreshListWithEmptyState();
                        console.log("UI list refreshed after DB reset.");
                    } else {
                        // Fallback: try full render if specific refresh unavailable
                        if(typeof renderXFormList === 'function') renderXFormList();
                    }
                    
                    // Clear any selections in memory
                    window.selectedXforms = [];
                    if (typeof updateExportButtonState === 'function') updateExportButtonState();
                    
                    // Remove any diagnostic results UI
                    const diagnosticResults = document.getElementById('db-diagnostic-results');
                    if (diagnosticResults) diagnosticResults.remove();
                    
                    await showInfoDialog("Database has been reset. All xforms have been cleared.");
                } catch (error) {
                    console.error("Database reset error:", error);
                    // Error dialog shown by resetDatabase if necessary
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
    // --- Restored Original Logic --- 
    if (dbPromise) return dbPromise;
    
    dbPromise = new Promise((resolve, reject) => {
        // Use VERSION 2 defined at top of file
        const request = indexedDB.open(XFORM_DB_NAME, XFORM_DB_VERSION);
        
        request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.error);
            dbPromise = null; // Clear promise cache on error
            reject("IndexedDB error: " + (event.target.error ? event.target.error.message : "Unknown error"));
        };
        
        request.onsuccess = (event) => {
            console.log("IndexedDB opened successfully.");
            const db = event.target.result;
            const storeNames = db.objectStoreNames;
            console.log(`DEBUG: Stores found onsuccess: [${[...storeNames].join(', ')}]`); 

            // Verify the expected stores exist
            if (!storeNames.contains(XFORMS_STORE) ||
                !storeNames.contains(XFORM_SETTINGS_STORE)) {

                console.error("Database opened but missing required object stores!");
                console.error(`DEBUG: Missing: ${!storeNames.contains(XFORMS_STORE) ? XFORMS_STORE : ''} ${!storeNames.contains(XFORM_SETTINGS_STORE) ? XFORM_SETTINGS_STORE : ''}`);
                console.log("Closing and attempting to reset the database...");
                
                db.close(); // Close the problematic connection
                dbPromise = null; // Clear promise cache before reset

                // Reset the database and try again
                resetDatabase().then(newDb => {
                     console.log("DEBUG: resetDatabase() call within onsuccess completed.");
                     // IMPORTANT: Resolve with the NEW db instance from reset
                     // Re-cache the promise with the result of the reset
                     dbPromise = Promise.resolve(newDb); 
                     resolve(newDb); 
                }).catch(err => {
                     console.error("DEBUG: resetDatabase() call within onsuccess FAILED.");
                     dbPromise = null; // Clear promise cache on error
                     reject(err); // Reject if reset fails
                });
            } else {
                console.log("DEBUG: Both required stores found. Resolving openDB.");
                // DB is valid, resolve with it (promise already cached)
                resolve(db);
            }
        };
        
        request.onupgradeneeded = (event) => {
            // ... (keep detailed logging inside onupgradeneeded from previous step) ...
            console.log(`DEBUG: onupgradeneeded triggered for DB version ${event.newVersion} (from ${event.oldVersion})`); 
            const db = event.target.result;
            const tx = event.target.transaction; 
            console.log(`DEBUG: Stores existing before upgrade: [${[...db.objectStoreNames].join(', ')}]`);

            // Create settings store if it doesn't exist
            if (!db.objectStoreNames.contains(XFORM_SETTINGS_STORE)) {
                try {
                    console.log(`DEBUG: Attempting to create object store '${XFORM_SETTINGS_STORE}'`);
                    db.createObjectStore(XFORM_SETTINGS_STORE);
                    console.log(`DEBUG: SUCCESS - Object store '${XFORM_SETTINGS_STORE}' created.`);
                } catch (e) {
                     console.error(`DEBUG: FAILURE - Error creating settings store: ${e}`);
                     if (tx) tx.abort(); 
                     return;
                }
            } else {
                 console.log(`DEBUG: Object store '${XFORM_SETTINGS_STORE}' already exists.`);
            }

            // Create xforms store with 'id' as key path
            if (!db.objectStoreNames.contains(XFORMS_STORE)) {
                 try {
                    console.log(`DEBUG: Attempting to create object store '${XFORMS_STORE}' with keyPath 'id'.`);
                    const xformsStore = db.createObjectStore(XFORMS_STORE, { keyPath: 'id' });
                    console.log(`DEBUG: SUCCESS - Object store '${XFORMS_STORE}' created.`);
                    
                    console.log(`DEBUG: Attempting to create indexes for '${XFORMS_STORE}'...`);
                    xformsStore.createIndex('name', 'name', { unique: false });
                    console.log(`DEBUG: SUCCESS - Index 'name' created.`);
                    xformsStore.createIndex('lastModified', 'lastModified', { unique: false });
                    console.log(`DEBUG: SUCCESS - Index 'lastModified' created.`);
                 } catch (e) {
                     console.error(`DEBUG: FAILURE - Error creating xforms store or indexes: ${e}`);
                     if (tx) tx.abort(); 
                     return;
                 }
            } else {
                 console.log(`DEBUG: Object store '${XFORMS_STORE}' already exists.`);
            }
            console.log("DEBUG: onupgradeneeded logic finished.");
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
    
    // Ensure lastModified is set 
    xformData.lastModified = Date.now();
    xformData.lastModifiedOnDateTime = new Date().toISOString();

    console.log("--- Data being saved to IndexedDB ---");
    console.log(JSON.stringify(xformData, null, 2)); 
    
    let tx; // Declare tx outside the try block
    try {
        const db = await openDB();
        tx = db.transaction(XFORMS_STORE, 'readwrite');
        const store = tx.objectStore(XFORMS_STORE);
        
        // Use put (handles both insert and update)
        store.put(xformData);
        
        // Wait for transaction completion
        await tx.done;
        
        console.log(`IndexedDB transaction committed successfully for ID: ${xformData.id}`);
        return true;
    } catch (error) {
        console.error(`Error saving xform ID ${xformData.id} to IndexedDB:`, error);
        if (tx && tx.error) {
            console.error("Transaction error details:", tx.error);
        } else if (error.name === 'TransactionInactiveError') {
             console.error("Transaction became inactive before completing. This might indicate an issue with the database connection or schema.");
        } else if (error.name === 'ConstraintError') {
             console.error("Constraint error - likely a key path issue or unique constraint violation.");
        } else {
             console.error("Unknown error during save transaction.");
        }
        return false;
    }
}

// Load an xform from IndexedDB by ID
async function loadXFormById(id) {
    console.log(`[loadXFormById] Received request for ID: ${id}`);
    try {
        const db = await openDB();
        const tx = db.transaction(XFORMS_STORE, 'readonly');
        const store = tx.objectStore(XFORMS_STORE);
        
        // Use a promise to wrap the IDBRequest
        const xformData = await new Promise((resolve, reject) => {
            const request = store.get(id);
            
            request.onsuccess = (event) => {
                const result = event.target.result;
                console.log(`[loadXFormById] DB request successful for ID ${id}. Result:`, result ? JSON.parse(JSON.stringify(result)) : result);
                resolve(result); // Resolve with the result (could be undefined if not found)
            };
            
            request.onerror = (event) => {
                console.error(`[loadXFormById] DB request error for ID ${id}:`, event.target.error);
                reject(event.target.error); // Reject the promise on error
            };
        });

        // No need for tx.done here for readonly transactions, 
        // but ensure we handle the result properly
        if (!xformData) {
            console.log(`[loadXFormById] No xform found in DB for ID: ${id}`);
            return null;
        } else {
            const displayName = xformData.name || '[unnamed]';
            console.log(`[loadXFormById] Successfully retrieved data for "${displayName}" (ID: ${id}).`);
            return xformData;
        }
        
    } catch (error) {
        console.error(`[loadXFormById] Error loading xform ID ${id} from IndexedDB:`, error);
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
    console.log(`DEBUG: listXForms called (Sort: ${sortBy} ${sortDirection})`); // Log entry
    try {
        const db = await openDB();
        // --- ADDED LOGS --- 
        if (!db) {
            console.error("DEBUG: listXForms - Failed to get DB object from openDB!");
            return []; // Cannot proceed
        }
        console.log(`DEBUG: listXForms - Got DB object: Name=${db.name}, Version=${db.version}, Stores=[${[...db.objectStoreNames].join(', ')}]`);
        console.log(`DEBUG: listXForms - Attempting to start transaction on store: '${XFORMS_STORE}'`);
        // --- END ADDED LOGS ---
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([XFORMS_STORE], 'readonly'); // Use constant
            const store = transaction.objectStore(XFORMS_STORE); // Use constant
            const xforms = [];
            
            const request = store.openCursor();
            
            request.onsuccess = function(event) {
                const cursor = event.target.result;
                if (cursor) {
                    xforms.push(cursor.value);
                    cursor.continue();
                } else {
                    // Sort the results based on the provided criteria
                    xforms.sort((a, b) => {
                        // Handle missing values gracefully
                        const aValue = a[sortBy] !== undefined ? a[sortBy] : '';
                        const bValue = b[sortBy] !== undefined ? b[sortBy] : '';
                        
                        if (typeof aValue === 'string' && typeof bValue === 'string') {
                            return sortDirection === 'asc' ? 
                                aValue.localeCompare(bValue) : 
                                bValue.localeCompare(aValue);
        } else {
                            return sortDirection === 'asc' ? 
                                (aValue < bValue ? -1 : aValue > bValue ? 1 : 0) :
                                (bValue < aValue ? -1 : bValue > aValue ? 1 : 0);
                        }
                    });
                    
                    console.log(`[DEBUG] listXForms: Found ${xforms.length} XForms, sorted by ${sortBy} ${sortDirection}`);
                    if (xforms.length > 0) {
                        console.log(`[DEBUG] First item: ${JSON.stringify({
                            id: xforms[0].id,
                            name: xforms[0].name,
                            lastModified: xforms[0].lastModified
                        })}`);
                    }
                    
                    resolve(xforms);
                }
            };
            
            request.onerror = function(event) {
                console.error('Error listing xforms:', event.target.error);
                reject(event.target.error);
            };
        });
    } catch (error) {
        console.error('Error in listXForms:', error);
        return [];
    }
}

// --- Import/Export Functions ---

// Export a single xform to a JSON file
async function exportXFormToFile(xformData) {
    try {
        const filename = sanitizeFilenameForSystem(xformData.name);
        
        // Compute integrity hash and attach if missing / refresh
        const hash = await _computeHashKey(xformData);
        const xformToWrite = { ...xformData, exportHashKey: hash };
        
        // Use compact JSON (single line)
        const json = JSON.stringify(xformToWrite);
        
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
        const formattedXforms = xformsToExport.map(async xform => {
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
            const hash = await _computeHashKey(cleanXform);
            cleanXform.exportHashKey = hash;
            return cleanXform;
        });
        
        // need await Promise.all
        const resolvedXforms = await Promise.all(formattedXforms);
        const jsonlContent = resolvedXforms.map(x => JSON.stringify(x)).join('\n');
        
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
                    if (file.name.toLowerCase().endsWith('.jsonl')) {
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
                            // inside importXFormsFromFile processing each xform before save
                            // Verify hash if present
                            if (xform.exportHashKey) {
                                const expected = xform.exportHashKey;
                                delete xform.exportHashKey;
                                const actual = await _computeHashKey(xform);
                                if (expected !== actual) {
                                    console.warn(`Hash mismatch for xform "${xform.name}". Skipping import.`);
                                    return false;
                                }
                            }
                            
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

// Render the xform list in the UI - simplified and fixed version
async function renderXFormList(sortBy = 'lastModified', sortDirection = 'desc') {
    console.log(`Starting renderXFormList with sort: ${sortBy} ${sortDirection}`);
    
    const fileListUl = document.getElementById('savedList');
    if (!fileListUl) {
        console.error("savedList element not found - document state:", {
            body: document.body ? "exists" : "missing",
            readyState: document.readyState,
            savedListParent: document.querySelector('.file-list-container') ? "exists" : "missing"
        });
        return;
    }
    
    // Clear the list and show loading indicator
    fileListUl.innerHTML = '<li>Loading xforms...</li>';
    
    // Store current selection state before rendering
    const currentSelections = window.selectedXforms || [];
    const selectedIds = currentSelections.map(x => x && x.id ? x.id.toString() : '');
    
    try {
        // Get all XForms directly from the database
        const db = await openDB();
        
        try {
            const transaction = db.transaction([XFORMS_STORE], 'readonly');
            const store = transaction.objectStore(XFORMS_STORE);
            
            // Get total count first
            const countRequest = store.count();
            const count = await new Promise((resolve, reject) => {
                countRequest.onsuccess = () => resolve(countRequest.result);
                countRequest.onerror = (event) => reject(event.target.error);
            });
            
            console.log(`Found ${count} XForms in database to render in list`);
            
            if (count === 0) {
            fileListUl.innerHTML = '<li>No saved xforms found</li>';
            return;
        }
        
            // Fetch all XForms
            const getAllRequest = store.getAll();
            const xforms = await new Promise((resolve, reject) => {
                getAllRequest.onsuccess = () => resolve(getAllRequest.result || []);
                getAllRequest.onerror = (event) => reject(event.target.error);
            });
            
            console.log(`Successfully fetched ${xforms.length} XForms`);
            
            // Save sort preferences
            localStorage.setItem('xformMaker_sortBy', sortBy);
            localStorage.setItem('xformMaker_sortDirection', sortDirection);
            
            // Sort the xforms
            xforms.sort((a, b) => {
                const aValue = a[sortBy] !== undefined ? a[sortBy] : '';
                const bValue = b[sortBy] !== undefined ? b[sortBy] : '';
                
                if (typeof aValue === 'string' && typeof bValue === 'string') {
                    return sortDirection === 'asc' ? 
                        aValue.localeCompare(bValue) : 
                        bValue.localeCompare(aValue);
                } else {
                    return sortDirection === 'asc' ? 
                        (aValue < bValue ? -1 : aValue > bValue ? 1 : 0) :
                        (bValue < aValue ? -1 : bValue > aValue ? 1 : 0);
                }
            });
            
            // Clear the list to add sorted items
        fileListUl.innerHTML = '';
            
            // Track selected items
            window.selectedXforms = window.selectedXforms || [];
        
        // Last clicked item for shift+click
        let lastClickedIndex = -1;
        
            // Build list items
        xforms.forEach((xform, index) => {
            const li = document.createElement('li');
            li.className = 'file-list-item';
            li.dataset.xformId = xform.id;
            li.dataset.lastModified = xform.lastModified;
                li.dataset.index = index;
            
            // Create name column
            const nameSpan = document.createElement('span');
            nameSpan.className = 'file-name-column';
                nameSpan.textContent = xform.name || '[unnamed]';
                nameSpan.title = xform.name || '[unnamed]';
            
            // Create date column
            const dateSpan = document.createElement('span');
            dateSpan.className = 'file-date-column';
                let dateText = 'Unknown date';
                
                if (xform.lastModified) {
                    try {
            const dateObj = new Date(parseInt(xform.lastModified, 10));
                        dateText = dateObj.toLocaleDateString() + ' ' + 
                                  dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    } catch (e) {
                        console.warn(`Invalid date for XForm ${xform.name}:`, e);
                    }
                }
                
                dateSpan.textContent = dateText;
                dateSpan.title = `Last modified: ${dateText}`;
                
                // Add columns in correct order
                li.appendChild(nameSpan);
                li.appendChild(dateSpan);
            
                // Add delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-file-btn';
            deleteBtn.innerHTML = '×';
                deleteBtn.title = `Delete "${xform.name || '[unnamed]'}"`;
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteXForm(xform.id, xform.name);
            });
            li.appendChild(deleteBtn);
            
            // Double-click handler for loading XForms
            li.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // ** DEBUG: Log the ID being passed **
                console.log(`[dblclick] Attempting to load XForm with ID: ${xform.id}`);
                
                // Clear all selections
                clearAllSelections();
                
                // *** CORRECTED: Call loadXFormFromDB which handles mode switching ***
                loadXFormFromDB(xform.id); 
                
                // Apply single-selected style to this item
                li.classList.add('single-selected');
                window.selectedXforms = [xform]; // Update selection state
                if (typeof updateUIForSelectionCount === 'function') updateUIForSelectionCount(); // Update UI
                
                console.log(`Double-clicked to load XForm: "${xform.name}" (ID: ${xform.id})`);
            });
            
                // Single-click handler for selection (NEW Multi-select Logic)
            li.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering other listeners if nested
                const clickedIndex = parseInt(li.dataset.index, 10);
                const xformId = li.dataset.xformId;
                const isSelected = li.classList.contains('selected');

                // Find the actual xform data object (important!)
                const clickedXFormObject = xforms.find(x => x.id.toString() === xformId);
                if (!clickedXFormObject) {
                    console.error(`Could not find xform data for ID ${xformId} during click`);
                    return;
                }

                const allItems = Array.from(fileListUl.querySelectorAll('li.file-list-item'));
                const ctrlOrMeta = e.metaKey || e.ctrlKey;
                const shift = e.shiftKey;

                if (shift && window.lastClickedListItemIndex >= 0 && window.lastClickedListItemIndex < allItems.length) {
                    // --- Shift + Click --- 
                    console.log(`Shift+Click detected. From index ${window.lastClickedListItemIndex} to ${clickedIndex}`);
                    const start = Math.min(window.lastClickedListItemIndex, clickedIndex);
                    const end = Math.max(window.lastClickedListItemIndex, clickedIndex);
                    
                    // Clear existing selection data array
                    window.selectedXforms = [];
                    
                    // Iterate ALL items to set selection state
                    allItems.forEach((item, index) => {
                        const itemId = item.dataset.xformId;
                        const itemXFormObject = xforms.find(x => x.id.toString() === itemId);

                        if (index >= start && index <= end) {
                            item.classList.add('selected');
                            if (itemXFormObject) {
                                window.selectedXforms.push(itemXFormObject);
                            }
                        } else {
                            item.classList.remove('selected');
                        }
                    });
                     // Don't update lastClickedListItemIndex on shift-click 

                } else if (ctrlOrMeta) {
                    // --- Cmd/Ctrl + Click --- 
                    console.log("Cmd/Ctrl+Click detected.");
                    li.classList.toggle('selected');
                    if (li.classList.contains('selected')) {
                        // Add to selection if not already present
                        if (!window.selectedXforms.some(x => x.id === clickedXFormObject.id)) {
                            window.selectedXforms.push(clickedXFormObject);
                        }
                    } else {
                        // Remove from selection
                        window.selectedXforms = window.selectedXforms.filter(x => x.id !== clickedXFormObject.id);
                    }
                    // Update anchor index
                    window.lastClickedListItemIndex = clickedIndex;

                } else {
                    // --- Normal Click --- 
                    console.log("Normal click detected.");
                    // If already selected AND it's the ONLY one selected, deselect it
                    if (isSelected && window.selectedXforms.length === 1 && window.selectedXforms[0].id === clickedXFormObject.id) {
                        console.log("   Deselecting the only selected item.");
                        li.classList.remove('selected');
                        window.selectedXforms = [];
                        window.lastClickedListItemIndex = -1; // Reset anchor
                    } else {
                        // Otherwise, select only this item
                        console.log("   Selecting only this item.");
                        allItems.forEach(item => item.classList.remove('selected'));
                        li.classList.add('selected');
                        window.selectedXforms = [clickedXFormObject];
                         // Update anchor index
                        window.lastClickedListItemIndex = clickedIndex;
                    }
                }

                // Update UI based on new selection count
                updateUIForSelectionCount();
                console.log("Selected IDs:", window.selectedXforms.map(x=>x.id));
            }); // End single-click listener
                
            fileListUl.appendChild(li);
        });
            
            console.log(`Rendered ${xforms.length} XForms in the list`);
            
        } catch (txError) {
            console.error('Transaction error in renderXFormList:', txError);
            
            // Check if this is a critical error that requires user intervention
            if (txError.name === 'NotFoundError' && txError.message.includes('object stores was not found')) {
                console.error('Critical database error: Missing object store');
                
                // Show the reset prompt if available
                if (typeof window.showDbResetPrompt === 'function') {
                    setTimeout(() => window.showDbResetPrompt(), 100); // Slight delay to ensure UI is ready
                }
            }
            
            throw txError; // Rethrow to be caught by the outer try/catch
        }
        
        // Restore selections after resorting
        if (selectedIds.length > 0) {
            // Get all items in new order
            const items = document.querySelectorAll('#savedList li.file-list-item');
            
            // Re-select previously selected items
            let newSelections = [];
            items.forEach(item => {
                const id = item.dataset.xformId;
                // Skip empty IDs 
                if (id && selectedIds.includes(id)) {
                    // Apply the appropriate selection class
                    if (selectedIds.length === 1) {
                        item.classList.add('single-selected');
                    } else {
                        item.classList.add('multi-selected');
                    }
                    
                    // Find the xform object for this id
                    const xform = currentSelections.find(x => x && x.id && x.id.toString() === id);
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
    } catch (error) {
        console.error('Error rendering XForm list:', error);
        fileListUl.innerHTML = '<li>Error loading saved xforms</li>';
    }
}

// Load an xform from IndexedDB and apply it to the UI
async function loadXForm(id) {
    try {
        console.group(`Loading XForm ID: ${id}`);
        
        // 1. Fetch XForm Data
        const xformData = await loadXFormById(id);
        
        // ** DEBUG: Log the data received right after fetching **
        console.log('[loadXForm] Data received from loadXFormById:', xformData ? JSON.parse(JSON.stringify(xformData)) : xformData);
        
        if (!xformData) {
            console.error(`Failed to load xform with ID ${id}`);
            await showInfoDialog('Failed to load the selected xform.');
            console.groupEnd();
            return false;
        }
        
        console.log(`Successfully loaded XForm from database: "${xformData.name}"`);
        console.log('Full XForm data:', xformData);
        
        // 2. Set Global State (including Filename Mode)
        window.currentXFormName = xformData.name || "Untitled XForm";
        window.currentXFormId = xformData.id;
        window.isFilenameModeATM = false; // Force MEM mode
        window.currentXFormHasRun = true; // Mark as loaded
        console.log("Set global state (name, id, MEM mode)");
        
        // 3. Update Filename Input Field & Mode UI
        const filenameInput = document.getElementById('filenameInput');
        if (filenameInput) {
            filenameInput.value = window.currentXFormName;
            filenameInput.readOnly = false;
            filenameInput.classList.remove('time-based-filename');
            console.log(`Updated filename input to: ${filenameInput.value}`);
        }
        
        // Update UI indicators for MEM mode
        const atmModeBtn = document.getElementById('filenameModeATM');
        const memModeBtn = document.getElementById('filenameModeManual');
        if (atmModeBtn && memModeBtn) {
            atmModeBtn.classList.remove('active');
            memModeBtn.classList.add('active');
        }
        
        // Stop ATM timer if running
        if (typeof window.stopFilenameTimer === 'function') {
            window.stopFilenameTimer();
        }
        
        // 4. Prepare Viewport & Rectangles
        // Ensure viewport exists
        if (!window.viewport) {
            window.viewport = document.getElementById('viewport');
            if (!window.viewport) {
                console.error("Viewport element not found! Cannot continue loading.");
                console.groupEnd();
                return false;
            }
        }
        
        // Remove old elements & re-initialize
        const existingStart = document.getElementById('startRect');
        const existingEnd = document.getElementById('endRect');
        if (existingStart) existingStart.remove();
        if (existingEnd) existingEnd.remove();
        window.startRect = null;
        window.endRect = null;
        document.querySelectorAll('.point-marker').forEach(marker => marker.remove());
        window.intermediatePoints = [];
        
        if (typeof window.initializeRects === 'function') {
            console.log("Initializing rectangles for loading...");
            // Pass isLoading: true to prevent forcing ATM mode
            window.initializeRects(true, true); 
        } else {
            console.error("initializeRects function not available! Cannot load properly.");
            console.groupEnd();
            return false;
        }
        
        // Reset waypoint state
        window.lastModifiedPointIndex = -1;
        window.draggingPointIndex = -1;
        window.selectedPointIndex = -1;
        
        console.log("Viewport and rectangles initialized");
        
        // 5. Apply XForm Data to UI
        if (typeof applyXFormData === 'function') {
            console.log("Applying XForm data to UI...");
            const success = applyXFormData(xformData);
            if (!success) {
                 console.error("Failed to apply XForm data.");
                 console.groupEnd();
                 return false;
            }
        } else {
            console.error('applyXFormData function not available');
            console.groupEnd();
            return false;
        }
        
        // 6. Update UI State (Highlighting, Draggability, etc.)
        // Highlight the selected item in the list
        document.querySelectorAll('#savedList li.file-list-item').forEach(el => {
            if (el.dataset.xformId === id.toString()) {
                el.classList.add('single-selected');
            } else {
                el.classList.remove('single-selected');
            }
        });
        
        // Ensure elements are draggable
        if (typeof window.makeDraggable === 'function') {
            if (window.startRect) window.makeDraggable(window.startRect);
            if (window.endRect) window.makeDraggable(window.endRect);
        }
        if (typeof window.makeDraggableWaypoint === 'function') {
            window.intermediatePoints.forEach((point, index) => {
                if (point.element) window.makeDraggableWaypoint(point.element, index);
            });
        }
        
        // Final UI updates
        if (typeof window.updateUIForSelectionCount === 'function') {
             updateUIForSelectionCount();
        }
        if (typeof window.drawPathVisualization === 'function') {
             drawPathVisualization();
        }
        
        console.log(`✅ Load complete for XForm "${xformData.name}"`);
        console.groupEnd();
        return true;

    } catch (error) {
        console.error('Error in loadXForm:', error);
        console.groupEnd();
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
    // Find the delete button - either from window object or by ID
    const deleteBtn = window.deleteLastWaypointButton || document.getElementById('deleteLastWaypointBtn');
    if (!deleteBtn) {
        console.warn("Delete waypoint button not found");
        return;
    }
    
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
    
    // Cache the button element for future use
    window.deleteLastWaypointButton = deleteBtn;
    
    console.log(`Delete waypoint button state updated: ${count > 0 ? 'enabled' : 'disabled'} (${count} waypoints)`);
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
    console.groupCollapsed("Save Process");
    try {
        // 1. Create the DTO from UI state
        const xformData = createXFormDataObject();
        
        // Validation: Ensure name is valid
        if (!xformData.name || xformData.name.trim() === '' || xformData.name === 'Untitled XForm') {
            await showInfoDialog('Please enter a valid name for the XForm before saving.');
            const filenameInput = document.getElementById('filenameInput');
            if (filenameInput) { filenameInput.focus(); filenameInput.select(); }
            console.warn('Save cancelled: XForm name missing or invalid.');
            console.groupEnd();
            return null;
        }
        
        // Ensure ID exists
        if (!xformData.id) {
            xformData.id = Date.now();
            console.log(`Assigned new ID: ${xformData.id}`);
        }

        // 2. Compute Hash A (before adding it to the object)
        const hashA = await computeXFormHash(xformData);
        if (!hashA) {
            console.error("Failed to compute Hash A. Aborting save.");
            await showInfoDialog('Error generating data hash. Save aborted.');
            console.groupEnd();
            return null;
        }
        console.log("Computed Hash A (Pre-Save):", hashA);

        // 3. Add Hash A to the object to be saved
        xformData.integrityHash = hashA;

        // Handle potential name conflicts (existing logic)
        const existingXForms = await listXForms();
        const nameExists = existingXForms.some(x => 
            x.name === xformData.name && x.id.toString() !== xformData.id.toString()
        );
        if (nameExists) {
            const result = await showModalDialog({ /* ... existing conflict dialog ... */ });
            if (result === 'cancel') { console.groupEnd(); return null; }
            if (result === 'saveBoth') { /* ... existing rename logic ... */ 
                 // Recompute hash if name changed!
                 delete xformData.integrityHash; // Remove old hash before recomputing
                 const newHashA = await computeXFormHash(xformData);
                 if (!newHashA) { /* ... error handling ... */ console.groupEnd(); return null; }
                 xformData.integrityHash = newHashA;
                 console.log("Recomputed Hash A after rename:", newHashA);
            }
             else { /* Overwrite: Delete existing */ 
                const existingXForm = existingXForms.find(x => x.name === xformData.name);
                if (existingXForm) await deleteXFormById(existingXForm.id);
             }
        }
        
        // 4. Save the XForm data (including integrityHash) to DB
        console.log("Attempting to save XForm data with hash...");
        const success = await saveXForm(xformData); // saveXForm now logs the data being written
        
        if (success) {
            console.log("Save successful. Performing immediate verification...");
            
            // 5. Immediately Load Back the Saved Data
            const loadedData = await loadXFormById(xformData.id);
            if (!loadedData) {
                 console.error("Verification failed: Could not load back the saved data!");
                 await showInfoDialog('Save successful, but verification failed!');
                 console.groupEnd();
                 return xformData; // Return original data even if verify fails
            }
            
            // 6. Compute Hash B from the loaded data (excluding the stored hash)
            const hashB = await computeXFormHash(loadedData);
            console.log("Computed Hash B (Post-Save Load):", hashB);
            
            // 7. Compare Hashes A and B
            if (hashA === hashB) {
                console.log("✅ Hash Verification Successful! Data saved correctly.");
                await showInfoDialog(`"${xformData.name}" saved and verified successfully.`);
            } else {
                console.error("❌ Hash Verification Failed! Data mismatch after save.");
                console.log("  Hash A (Pre-Save):", hashA);
                console.log("  Hash B (Post-Save):", hashB);
                console.log("  Saved Data:", xformData);       // Data we TRIED to save
                console.log("  Loaded Data:", loadedData);    // Data we ACTUALLY read back
                await showInfoDialog(`"${xformData.name}" saved, but data verification FAILED! Check console.`);
            }
            
            // Update UI list and highlight
            window.selectedXforms = [xformData]; // Select the saved one
            await renderXFormList(); // Refresh the list
            // Highlight requires the list to be rendered first
             setTimeout(() => {
                 const items = document.querySelectorAll('#savedList li.file-list-item');
                 items.forEach(item => {
                     item.classList.remove('single-selected');
                     if (item.dataset.xformId === xformData.id.toString()) {
                         item.classList.add('single-selected');
                     }
                 });
                 if (typeof updateUIForSelectionCount === 'function') updateUIForSelectionCount();
             }, 100);
            
            console.groupEnd();
            return xformData;
        } else {
            await showInfoDialog('Failed to save the xform.');
            console.groupEnd();
            return null;
        }
    } catch (error) {
        console.error('Error in saveCurrentXForm:', error);
        await showInfoDialog(`Error saving xform: ${error.message}`);
        console.groupEnd();
        return null;
    }
}

// -- Initialize the database on page load --
// REMOVE THIS LISTENER - Initialization and initial list render are now handled centrally in script.js
/*
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the database connection
    console.log("Initializing IndexedDB connection...");
    openDB().then(db => {
        console.log("Database opened successfully, refreshing XForm list...");
        // Explicitly render the XForm list after database is ready
        setTimeout(() => {
            renderXFormList().then(() => {
                console.log("XForm list rendered from database initialization");
            }).catch(err => {
                console.error("Failed to render XForm list:", err);
            });
        }, 500); // Small delay to ensure DOM is fully ready
    }).catch(error => {
        console.error("Error initializing IndexedDB:", error);
    });
    
    // Initialize UI components that depend on the database
    // initDbResetButton(); // This should also be called centrally if needed
});
*/

// Compute a hash key for data integrity verification
async function computeXFormHash(xformData) { 
    console.log("DEBUG computeXFormHash: Input data:", JSON.parse(JSON.stringify(xformData))); // Log input
    try {
        // Create a deep copy to avoid modifying the original object
        const copyData = JSON.parse(JSON.stringify(xformData));

        // --- Explicitly remove hash AND timestamp properties BEFORE sorting/stringifying ---
        delete copyData.exportHashKey; 
        delete copyData.integrityHash; 
        delete copyData.lastModified; // Exclude timestamp
        delete copyData.lastModifiedOnDateTime; // Exclude timestamp string
        delete copyData.timestamp; // Exclude original creation timestamp
        console.log("DEBUG computeXFormHash: Data after removing hashes/timestamps:", JSON.parse(JSON.stringify(copyData)));

        // --- Create Canonical String --- 
        // Function to recursively sort keys of an object
        const sortObjectKeys = (obj) => {
            if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
                return obj; // Return non-objects/arrays as is
            }
            const sortedKeys = Object.keys(obj).sort();
            const sortedObj = {};
            for (const key of sortedKeys) {
                sortedObj[key] = sortObjectKeys(obj[key]); // Recursively sort nested objects
            }
            return sortedObj;
        };
        
        // Sort the keys of the copied data object recursively
        const canonicalObject = sortObjectKeys(copyData);
        
        // Convert the canonical object to a stable JSON string
        const jsonString = JSON.stringify(canonicalObject); 
        console.log("DEBUG computeXFormHash: Canonical JSON String:", jsonString); // Log canonical string
        // --- End Canonical String --- 

        const encoder = new TextEncoder();
        const data = encoder.encode(jsonString);
        
        // Use SubtleCrypto if available
        if (window.crypto && window.crypto.subtle) {
            const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } else {
            // Fallback to simpler hash for older browsers
            let hash = 0;
            for (let i = 0; i < jsonString.length; i++) {
                const char = jsonString.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            return hash.toString(36);
        }
    } catch (error) {
        console.error("Error computing hash:", error);
        return null;
    }
}

// Clear all selections in the file list
function clearAllSelections() {
    const items = document.querySelectorAll('#savedList li');
    items.forEach(item => {
        item.classList.remove('selected'); // Use .selected
        item.classList.remove('single-selected'); // Keep removing old class just in case
        item.classList.remove('multi-selected'); // Keep removing old class just in case
    });
    window.selectedXforms = []; // Clear the data array
    window.lastClickedListItemIndex = -1; // Reset shift-click anchor
    updateUIForSelectionCount(); // Update button states etc.
    console.log("Selections cleared.");
}

// Update UI elements based on the number of selected items
function updateUIForSelectionCount() {
    const count = window.selectedXforms ? window.selectedXforms.length : 0;
    console.log(`Selection count: ${count}`);
    
    // Update export button state
    updateExportButtonState();
    
    // Update selection counter if it exists
    const counter = document.querySelector('.selection-count');
    if (counter) {
        if (count > 0) {
            counter.textContent = `${count} selected`;
            counter.style.display = 'inline-block';
        } else {
            counter.style.display = 'none';
        }
    }
    
    // More UI updates can be added here
}

// Update export button state based on selection
function updateExportButtonState() {
    const exportBtn = document.getElementById('export-xforms-btn');
    if (!exportBtn) return;
    
    const count = window.selectedXforms ? window.selectedXforms.length : 0;
    
    if (count > 0) {
        exportBtn.disabled = false;
        exportBtn.title = `Export ${count} selected XForm${count === 1 ? '' : 's'}`;
        exportBtn.querySelector('span').textContent = count === 1 ? "Export Selected" : `Export ${count} Selected`;
        } else {
        exportBtn.disabled = false;
        exportBtn.title = "Export All XForms";
        exportBtn.querySelector('span').textContent = "Export All";
    }
}

// Initialize the selection mechanism
function initializeXFormSelection() {
    window.selectedXforms = [];
    updateUIForSelectionCount();
}

// Ensure this is called when the page loads
document.addEventListener('DOMContentLoaded', initializeXFormSelection);

// Create an xform data object from the current UI state
function createXFormDataObject() {
    console.log("DEBUG: createXFormDataObject - Starting..."); // <-- ADDED
    console.group("Creating XForm data object from UI"); // Keep existing group
    
    // Get necessary data from the UI elements
    console.log("DEBUG: createXFormDataObject - Getting UI elements..."); // <-- ADDED
    const xformNameInput = document.getElementById('filenameInput'); 
    const widthInput = document.getElementById('rectWidth');
    const heightInput = document.getElementById('rectHeight');
    const durationInput = document.getElementById('duration');
    console.log(`DEBUG: createXFormDataObject - Elements: nameInput=${!!xformNameInput}, width=${!!widthInput}, height=${!!heightInput}, duration=${!!durationInput}`); // <-- ADDED
    
    // --- Initialize the base XForm object ---
    const xformData = {
        id: window.currentXFormId || Date.now(),
        timestamp: window.currentXFormTimestamp || Date.now(), // Use existing timestamp if available
        lastModified: Date.now(), // Always update last modified
        lastModifiedOnDateTime: new Date().toISOString(), 
        name: 'Untitled XForm', // Default name
        startRect: { left: 50, top: 50, width: 100, height: 60 }, // Reasonable defaults
        endRect: { left: 150, top: 150, width: 100, height: 60 }, 
        waypoints: [], 
        rotations: { x: 1, y: 1, z: 1 }, 
        duration: 500,
        pathStyle: 'solid' // Default path style
    };
    
    // --- Update with values from UI elements if they exist ---
    console.log("DEBUG: createXFormDataObject - Populating data from UI..."); // <-- ADDED
    
    // XForm Name
    // --- ADDED DETAILED LOGGING FOR NAME --- 
    console.log(`DEBUG: createXFormDataObject - Checking input field. Exists: ${!!xformNameInput}, Value: "${xformNameInput ? xformNameInput.value : 'N/A'}", Trimmed: "${xformNameInput ? xformNameInput.value.trim() : 'N/A'}"`); // Log input value explicitly
    console.log(`DEBUG: createXFormDataObject - Checking global window.currentXFormName: "${window.currentXFormName}"`); // Log global value
    console.log(`DEBUG: createXFormDataObject - Checking FilenameController state: Mode ATM? ${window.filenameController ? window.filenameController.isInATMMode() : 'N/A'}, Controller Name: "${window.filenameController ? window.filenameController.getCurrentFilename() : 'N/A'}"`);
    // --- END ADDED LOGGING --- 

    if (xformNameInput && xformNameInput.value.trim() !== '') { // Use renamed variable
        console.log(`DEBUG: createXFormDataObject - USING name from input field: "${xformNameInput.value}"`); // Log which branch is taken
        xformData.name = xformNameInput.value;
    } else if (window.currentXFormName) {
        console.log(`DEBUG: createXFormDataObject - Input empty/missing, USING name from window.currentXFormName: "${window.currentXFormName}"`); // Log which branch is taken
        xformData.name = window.currentXFormName; // Fallback to global state if input empty
    } else {
        console.log(`DEBUG: createXFormDataObject - Input empty/missing AND window.currentXFormName missing. Using default: "${xformData.name}"`); // Log default case
    }
    console.log(`DEBUG: createXFormDataObject - Name set to: "${xformData.name}"`); // <-- ADDED
    
    // Rectangle Dimensions (from inputs first)
    let currentWidth = xformData.startRect.width; // Start with default
    let currentHeight = xformData.startRect.height;
    if (widthInput && heightInput) {
        currentWidth = parseInt(widthInput.value, 10) || currentWidth;
        currentHeight = parseInt(heightInput.value, 10) || currentHeight;
        console.log(`DEBUG: createXFormDataObject - Size set to: ${currentWidth}x${currentHeight}`); // <-- ADDED
    } else {
        console.warn("Size inputs not found, using default size");
    }
    // Assign to both rectangles
    xformData.startRect.width = currentWidth;
    xformData.startRect.height = currentHeight;
    xformData.endRect.width = currentWidth;
    xformData.endRect.height = currentHeight;
    
    // Rectangle Positions (from global window objects - THESE MUST EXIST)
    if (window.startRect && window.startRect.style.left && window.startRect.style.top) {
        xformData.startRect.left = parseFloat(window.startRect.style.left);
        xformData.startRect.top = parseFloat(window.startRect.style.top);
    } else {
        console.error("window.startRect position styles not found - saving default position");
    }
    
    if (window.endRect && window.endRect.style.left && window.endRect.style.top) {
        xformData.endRect.left = parseFloat(window.endRect.style.left);
        xformData.endRect.top = parseFloat(window.endRect.style.top);
    } else {
        console.error("window.endRect position styles not found - saving default position");
    }
    console.log(`DEBUG: createXFormDataObject - Positions: Start(${xformData.startRect.left},${xformData.startRect.top}), End(${xformData.endRect.left},${xformData.endRect.top})`); // <-- ADDED

    // Get Waypoints
    if (window.intermediatePoints && Array.isArray(window.intermediatePoints)) {
        console.log(`[Save] Found ${window.intermediatePoints.length} intermediate points to process.`);
        xformData.waypoints = window.intermediatePoints.map((point, index) => {
             console.log(`[Save] Processing point ${index}:`, point); // Log each point being processed
             if (point && typeof point.x === 'number' && typeof point.y === 'number') {
                 // Save only the coordinate data, not the DOM element
                 const waypointData = { x: point.x, y: point.y };
                 console.log(`[Save]   -> Saving waypoint data:`, waypointData);
                 return waypointData; 
             } else {
                 console.warn(`[Save] Found invalid point data at index ${index}:`, point);
                 return null; 
             }
         }).filter(p => p !== null);
        console.log(`DEBUG: createXFormDataObject - Waypoints processed (${xformData.waypoints.length} valid points).`); // <-- ADDED
    } else {
        console.warn("[Save] No waypoints found (window.intermediatePoints) - saving empty array");
        xformData.waypoints = [];
    }
    
    // Get Rotation Values (directly from global properties)
    xformData.rotations = { 
        x: typeof window.xRotationDirection !== 'undefined' ? window.xRotationDirection : 1,
        y: typeof window.yRotationDirection !== 'undefined' ? window.yRotationDirection : 1,
        z: typeof window.zRotationDirection !== 'undefined' ? window.zRotationDirection : 1
    };
    console.log(`DEBUG: createXFormDataObject - Rotations: X=${xformData.rotations.x}, Y=${xformData.rotations.y}, Z=${xformData.rotations.z}`); // <-- ADDED
    
    // Get Duration (from input)
    if (durationInput) {
        xformData.duration = parseInt(durationInput.value) || 500;
    } else {
        console.warn("Duration input not found - saving default 500ms");
        xformData.duration = 500; // Default 500ms
    }
    console.log(`DEBUG: createXFormDataObject - Duration: ${xformData.duration}ms`); // <-- ADDED
    
    // Add Path Style if available
    if (window.xformPathStyles && typeof window.xformPathStyles.getCurrentPathStyle === 'function') {
        xformData.pathStyle = window.xformPathStyles.getCurrentPathStyle();
        console.log(`DEBUG: createXFormDataObject - Path Style: ${xformData.pathStyle || 'default'}`); // <-- ADDED
    }
    
    console.log("Final XForm data object (DTO) created:", JSON.parse(JSON.stringify(xformData))); 
    console.groupEnd();
    console.log("DEBUG: createXFormDataObject - Finished successfully."); // <-- ADDED
    
    return xformData;
}

// Verify that the UI matches the XForm data
window.verifyXFormUIConsistency = function() {
    console.group('Verifying XForm UI Consistency');
    
    // Get the current UI state as an XForm object
    const currentUIState = createXFormDataObject();
    
    // Check if we have a currently selected XForm to compare against
    if (!window.selectedXforms || window.selectedXforms.length !== 1) {
        console.log('No single XForm selected for comparison');
        console.groupEnd();
        return { consistent: false, uiState: currentUIState, reason: 'No reference XForm selected' };
    }
    
    const referenceXForm = window.selectedXforms[0];
    
    // Check each important property
    const inconsistencies = [];
    
    // Check name
    if (currentUIState.name !== referenceXForm.name) {
        inconsistencies.push({
            property: 'name',
            uiValue: currentUIState.name,
            dbValue: referenceXForm.name
        });
    }
    
    // Check rectangles
    if (Math.abs(currentUIState.startRect.left - referenceXForm.startRect.left) > 1 ||
        Math.abs(currentUIState.startRect.top - referenceXForm.startRect.top) > 1) {
        inconsistencies.push({
            property: 'startRectPosition',
            uiValue: `(${currentUIState.startRect.left},${currentUIState.startRect.top})`,
            dbValue: `(${referenceXForm.startRect.left},${referenceXForm.startRect.top})`
        });
    }
    
    if (Math.abs(currentUIState.endRect.left - referenceXForm.endRect.left) > 1 ||
        Math.abs(currentUIState.endRect.top - referenceXForm.endRect.top) > 1) {
        inconsistencies.push({
            property: 'endRectPosition',
            uiValue: `(${currentUIState.endRect.left},${currentUIState.endRect.top})`,
            dbValue: `(${referenceXForm.endRect.left},${referenceXForm.endRect.top})`
        });
    }
    
    // Check size
    if (Math.abs(currentUIState.startRect.width - referenceXForm.startRect.width) > 1 ||
        Math.abs(currentUIState.startRect.height - referenceXForm.startRect.height) > 1) {
        inconsistencies.push({
            property: 'rectangleSize',
            uiValue: `${currentUIState.startRect.width}x${currentUIState.startRect.height}`,
            dbValue: `${referenceXForm.startRect.width}x${referenceXForm.startRect.height}`
        });
    }
    
    // Check waypoints
    if (currentUIState.waypoints.length !== referenceXForm.waypoints.length) {
        inconsistencies.push({
            property: 'waypointCount',
            uiValue: currentUIState.waypoints.length,
            dbValue: referenceXForm.waypoints.length
        });
    } else {
        // Check if waypoint positions match
        for (let i = 0; i < currentUIState.waypoints.length; i++) {
            const uiPoint = currentUIState.waypoints[i];
            const refPoint = referenceXForm.waypoints[i];
            
            if (Math.abs(uiPoint.x - refPoint.x) > 1 || Math.abs(uiPoint.y - refPoint.y) > 1) {
                inconsistencies.push({
                    property: `waypoint${i}`,
                    uiValue: `(${uiPoint.x},${uiPoint.y})`,
                    dbValue: `(${refPoint.x},${refPoint.y})`
                });
            }
        }
    }
    
    // Check rotation values
    for (const axis of ['x', 'y', 'z']) {
        if (currentUIState.rotations[axis] !== referenceXForm.rotations[axis]) {
            inconsistencies.push({
                property: `rotation${axis.toUpperCase()}`,
                uiValue: currentUIState.rotations[axis],
                dbValue: referenceXForm.rotations[axis]
            });
        }
    }
    
    // Check duration
    if (currentUIState.duration !== referenceXForm.duration) {
        inconsistencies.push({
            property: 'duration',
            uiValue: `${currentUIState.duration}ms`,
            dbValue: `${referenceXForm.duration}ms`
        });
    }
    
    // Output results
    if (inconsistencies.length === 0) {
        console.log('UI state matches reference XForm data: ✅ Consistent');
        console.groupEnd();
        return { consistent: true, uiState: currentUIState, referenceXForm: referenceXForm };
    } else {
        console.log('Inconsistencies found between UI and reference XForm:');
        console.table(inconsistencies);
        console.groupEnd();
        return { 
            consistent: false, 
            uiState: currentUIState, 
            referenceXForm: referenceXForm,
            inconsistencies: inconsistencies 
        };
    }
};

// Show a simple modal dialog with buttons
function showModalDialog(options) {
    return new Promise((resolve) => {
        // Ensure at least one button
        if (!options.buttons || options.buttons.length === 0) {
            options.buttons = [{ id: 'ok', label: 'OK', class: 'primary' }];
        }
        
        // Create modal container
        const modalContainer = document.createElement('div');
        modalContainer.className = 'modal-container';
        modalContainer.style.position = 'fixed';
        modalContainer.style.top = '0';
        modalContainer.style.left = '0';
        modalContainer.style.width = '100%';
        modalContainer.style.height = '100%';
        modalContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalContainer.style.display = 'flex';
        modalContainer.style.justifyContent = 'center';
        modalContainer.style.alignItems = 'center';
        modalContainer.style.zIndex = '9999';
        
        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        
        // Check if dark theme is active
        const isDarkTheme = document.documentElement.classList.contains('dark-theme');
        
        if (isDarkTheme) {
            modalContent.style.backgroundColor = '#2d333b'; // Dark theme background
            modalContent.style.color = '#cdd9e5'; // Dark theme text color
        } else {
            modalContent.style.backgroundColor = '#fff'; // Light theme background
            modalContent.style.color = '#333'; // Light theme text color
        }
        
        modalContent.style.padding = '20px';
        modalContent.style.borderRadius = '8px';
        modalContent.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
        modalContent.style.maxWidth = '80%';
        modalContent.style.minWidth = '300px';
        
        // Add message
        const message = document.createElement('p');
        message.textContent = options.message;
        message.style.marginBottom = '20px';
        modalContent.appendChild(message);
        
        // Add buttons container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '10px';
        
        // Add buttons
        options.buttons.forEach(buttonInfo => {
            const button = document.createElement('button');
            button.textContent = buttonInfo.label;
            button.className = buttonInfo.class || 'btn';
            
            // Style based on class
            if (buttonInfo.class === 'primary') {
                button.style.backgroundColor = '#007bff';
                button.style.color = 'white';
            } else if (buttonInfo.class === 'secondary') {
                button.style.backgroundColor = '#6c757d';
                button.style.color = 'white';
            } else if (buttonInfo.class === 'danger') {
                button.style.backgroundColor = '#dc3545';
                button.style.color = 'white';
            }
            
            button.style.border = 'none';
            button.style.padding = '8px 15px';
            button.style.borderRadius = '4px';
            button.style.cursor = 'pointer';
            
            button.addEventListener('click', () => {
                document.body.removeChild(modalContainer);
                resolve(buttonInfo.id);
            });
            
            buttonContainer.appendChild(button);
        });
        
        modalContent.appendChild(buttonContainer);
        modalContainer.appendChild(modalContent);
        document.body.appendChild(modalContainer);
    });
}

// Show a simple info dialog
function showInfoDialog(message) {
    return showModalDialog({
        message: message,
        buttons: [{ id: 'ok', label: 'OK', class: 'primary' }]
    });
}

// Export the functions that should be available globally
window.saveXForm = saveXForm;
window.loadXFormById = loadXFormById;
window.deleteXFormById = deleteXFormById;
window.listXForms = listXForms;
window.resetDatabase = resetDatabase;
window.saveCurrentXForm = saveCurrentXForm;
window.loadXForm = loadXForm;
window.deleteXForm = deleteXForm;
window.renderXFormList = renderXFormList;
window.importXFormsFromFile = importXFormsFromFile;
window.exportXFormToFile = exportXFormToFile;
window.exportAllXFormsToFile = exportAllXFormsToFile;
window.showInfoDialog = showInfoDialog;
window.showModalDialog = showModalDialog;

// Add this function near the bottom of the file with the other initialization functions

// Initialize the FilenameController to manage filename input and mode toggling
function initializeFilenameController() {
    // Define a self-contained controller for filename input and mode management
    class FilenameController {
        constructor() {
            // Get UI elements
            this.filenameInput = document.getElementById('filenameInput');
            this.atmButton = document.getElementById('filenameModeATM');
            this.memButton = document.getElementById('filenameModeManual');
            
            // Initial state
            this._isATMMode = true; 
            this._filename = '';
            this._updateTimer = null; 
            
            // No explicit binding needed with arrow functions
            
            // Initialize
            if (!this.filenameInput || !this.atmButton || !this.memButton) {
                console.error('FilenameController: Missing required elements.');
                return; 
            }
            this._setupEventListeners();
            this._setMode(this._isATMMode, true); // Apply initial state
            console.log('FilenameController initialized');
        }
        
        // --- Event Listener Setup (using arrow function) ---
        _setupEventListeners = () => {
            this.atmButton.addEventListener('click', () => this._setMode(true)); 
            this.memButton.addEventListener('click', () => this._setMode(false));
            
            this.filenameInput.addEventListener('click', () => {
                if (this._isATMMode) {
                    this._setMode(false); 
                    this.filenameInput.select();
                }
            });
            
            this.filenameInput.addEventListener('input', () => {
                if (!this._isATMMode) {
                    this._filename = this.filenameInput.value; 
                    localStorage.setItem('xformMaker_filenameValue', this._filename);
                    window.currentXFormName = this._filename; 
                }
            });
            
            // Replace global functions for compatibility 
            window.toggleFilenameMode = this._setMode;
            window.startFilenameTimeUpdates = this._startTimer;
            window.stopFilenameTimeUpdates = this._stopTimer;
            
            console.log('FilenameController: Event listeners set up');
        }
        
        // --- Public API Methods (using arrow functions) ---
        setNewXform = () => {
            console.log("FilenameController: Setting up for new XForm...");
            this._setMode(true); 
            this._setName(''); 
            this._startTimer(); 
        }
        
        setSavedXform = (name) => {
            console.log(`FilenameController: Setting up for saved XForm: "${name}"`);
            this._setMode(false); 
            this._setName(name || 'Untitled XForm'); 
            this._stopTimer();
        }

        getCurrentFilename = () => {
            return this._isATMMode ? this._filename : (this.filenameInput?.value || this._filename);
        }

        isInATMMode = () => {
            return this._isATMMode;
        }
        
        // --- Private Implementation Methods (using arrow functions) ---
        _setMode = (useATM, initializing = false) => {
            const newModeIsATM = !!useATM;
            // Prevent unnecessary updates if mode is already set, unless initializing
            if (!initializing && this._isATMMode === newModeIsATM) return; 

            this._isATMMode = newModeIsATM;
            window.isFilenameModeATM = this._isATMMode; // Update global state
            this._updateUI(); // Update button classes and input readonly state
            
            if (this._isATMMode) {
                this._startTimer();
                this._updateATMFilename(); // Call immediately when switching TO ATM
                localStorage.setItem('xformMaker_filenameMode', 'ATM');
            } else {
                // ADD LOG HERE
                console.log(`FilenameController: _setMode(false) - Current timer ID BEFORE stopping: ${this._updateTimer}`); 
                this._stopTimer(); // Stop clock
                // Restore last manually entered value if available, otherwise use current name
                const savedManualName = localStorage.getItem('xformMaker_filenameValue');
                this._setName(savedManualName || window.currentXFormName || 'Untitled XForm'); 
                localStorage.setItem('xformMaker_filenameMode', 'MEM');
            }
            
            if (!initializing) {
                 console.log(`FilenameController: Mode set to ${this._isATMMode ? 'ATM' : 'MEM'}`);
            }
        }
        
        _setName = (name) => {
             if (this._filename !== name) {
                 this._filename = name;
                 if (this.filenameInput) {
                    this.filenameInput.value = name;
                 }
                 window.currentXFormName = name; // Sync global
                 // Persist manual name only if in MEM mode
                 if (!this._isATMMode) {
                     localStorage.setItem('xformMaker_filenameValue', name);
                 }
                 // Notify subscribers if implemented
             }
        }
        
        _updateUI = () => {
            if (this.atmButton && this.memButton) {
                this.atmButton.classList.toggle('active', this._isATMMode);
                this.memButton.classList.toggle('active', !this._isATMMode);
            }
            if (this.filenameInput) {
                this.filenameInput.readOnly = this._isATMMode;
                this.filenameInput.classList.toggle('time-based-filename', this._isATMMode);
            }
        }
        
        _updateATMFilename = () => {
            if (!this._isATMMode) return;
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
            const timeStr = now.toTimeString().slice(0, 8); // HH:MM:SS
            // REMOVE Prepend marker
            this._setName(`${dateStr} ${timeStr}`); 
        }
        
        _startTimer = () => {
            this._stopTimer(); 
            this._updateTimer = setInterval(this._updateATMFilename, 1000);
            console.log("FilenameController: Timer STARTED with interval ID:", this._updateTimer); // <-- ADD LOG
        }
        _stopTimer = () => {
            if (this._updateTimer) {
                console.log("FilenameController: Attempting to STOP timer with interval ID:", this._updateTimer); // <-- ADD LOG
                clearInterval(this._updateTimer);
                this._updateTimer = null; // Clear the reference
                console.log("FilenameController: Timer STOPPED."); // <-- ADD LOG
            } else {
                 console.log("FilenameController: Stop timer called, but no active timer ID found."); // <-- ADD LOG
            }
        }
    }
    
    // Create and store the controller instance
    window.filenameController = new FilenameController();
}

// Add the diagnostics button to the setup function
async function setupIndexedDBPersistence() {
    try {
        console.log('Setting up IndexedDB persistence...');
        
        // *** REMOVED Call to non-existent function ***
        // await ensureDatabaseSchema(); 
        
        // openDB() handles schema checks/upgrades internally
        await openDB(); // Ensure we have a valid DB connection promise
        console.log("DB opened by setupIndexedDBPersistence."); // Add log
        
        // *** ADDED: Call renderXFormList after DB is confirmed open ***
        if (typeof renderXFormList === 'function') {
            console.log("Calling renderXFormList from setupIndexedDBPersistence...");
            await renderXFormList(); 
            console.log("renderXFormList finished.");
        } else {
            console.error("renderXFormList function not found in setupIndexedDBPersistence!");
        }
        
        // Check if there's a pending database reset from a page reload
        // ... rest of function
    } catch (error) {
        console.error('Error setting up IndexedDB persistence:', error);
        // Handle error appropriately
    }
}

// Function to load a specific X-Form by its ID from IndexedDB
async function loadXFormFromDB(xformId) {
    try {
        console.log(`%cDB LOAD: Attempting to load X-Form ID: ${xformId}`, 'color: blue; font-weight: bold;');
        const db = await openDB();
        const tx = db.transaction(XFORMS_STORE, 'readonly');
        const store = tx.objectStore(XFORMS_STORE);

        // Use a promise to handle the request
        const xformData = await new Promise((resolve, reject) => {
            const request = store.get(xformId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        await tx.done; // Wait for transaction to complete

        if (xformData) {
            console.log(`%cDB LOAD: Successfully retrieved X-Form: ${xformData.name} (ID: ${xformId})`, 'color: blue;');

            // *** ADDED: Initialize Rects BEFORE applying data ***
            if (typeof window.initializeRects === 'function') {
                console.log("DB LOAD: Initializing rectangles before applying data...");
                // Pass makeVisible=true, isLoading=true
                window.initializeRects(true, true); 
                console.log("DB LOAD: Rectangles initialized.");
            } else {
                console.error("DB LOAD: Critical error - initializeRects function not found! Cannot load properly.");
                return; // Stop if rect init function is missing
            }
            // *** END ADDED ***

            // Apply the loaded data to the UI
            if (typeof window.applyXFormData === 'function') {
                // *** NOTE: applyXFormData ALSO updates the filenameInput if not in ATM mode.
                // We might be setting the value twice, but it should be harmless. ***
                window.applyXFormData(xformData); 
                console.log('%cDB LOAD: applyXFormData completed.', 'color: blue;');
            } else {
                console.error("DB LOAD: Critical error - window.applyXFormData function not found!");
                showInfoDialog("Internal Error: Could not apply loaded X-Form data.");
                return; // Stop if apply function is missing
            }

            // --- REVISED: Use FilenameController to set mode and name ---
            if (window.filenameController && typeof window.filenameController.setSavedXform === 'function') {
                console.log(`%cDB LOAD: Calling filenameController.setSavedXform("${xformData.name}")`, 'color: blue;');
                window.filenameController.setSavedXform(xformData.name);
                console.log('%cDB LOAD: filenameController handled mode switch to MEM.', 'color: blue;');
            } else {
                console.error("DB LOAD: FilenameController or setSavedXform method not found! Cannot properly set filename mode.");
                // Fallback (less ideal - might conflict with controller later)
                const filenameInput = document.getElementById('filenameInput');
                const atmBtn = document.getElementById('filenameModeATM');
                const memBtn = document.getElementById('filenameModeManual');
                if (filenameInput && atmBtn && memBtn) {
                    filenameInput.value = xformData.name;
                    window.isFilenameModeATM = false;
                    atmBtn.classList.remove('active');
                    memBtn.classList.add('active');
                    if (typeof window.stopFilenameTimeUpdates === 'function') {
                        window.stopFilenameTimeUpdates();
                    }
                    filenameInput.removeAttribute('readonly');
                     // Assume keys are global
                    if (typeof FILENAME_MODE_KEY !== 'undefined' && typeof FILENAME_VALUE_KEY !== 'undefined') {
                         localStorage.setItem(FILENAME_MODE_KEY, 'MEM'); 
                         localStorage.setItem(FILENAME_VALUE_KEY, filenameInput.value); 
                    }
                }
            }
            // --- END REVISED ---

            // Select the loaded item in the list UI
            const fileListUl = document.getElementById('savedList'); // Or the correct ID for your list
            if (fileListUl) {
                // Clear previous selections
                fileListUl.querySelectorAll('li.single-selected').forEach(li => li.classList.remove('single-selected'));

                // Find and select the current item using the ID
                const listItem = fileListUl.querySelector(`li[data-xform-id="${xformId}"]`);
                if (listItem) {
                    listItem.classList.add('single-selected');
                    console.log(`%cDB LOAD: Highlighted list item for ID: ${xformId}`, 'color: blue;');
                    // Optional: Scroll into view
                    // listItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } else {
                    console.warn(`DB LOAD: Could not find list item for ID ${xformId} to highlight.`);
                }
            }

        } else {
            console.error(`DB LOAD: X-Form with ID ${xformId} not found in DB.`);
            showInfoDialog(`Error: X-Form not found.`);
        }
    } catch (error) {
        console.error(`%cDB LOAD: Error loading X-Form ${xformId} from DB:`, 'color: red; font-weight: bold;', error);
        showInfoDialog(`Error loading X-Form: ${error.message}`);
    }
}
window.loadXFormFromDB = loadXFormFromDB; // Ensure it's globally accessible


// === Initialization ===
// Call this function when the application starts
async function initializeDBAndUI() {
    try {
        console.log('%cDB INIT: Initializing IndexedDB and UI... ', 'color: purple; font-weight: bold;');
        
        // Check if a reset is pending from a previous blocked attempt
        if (localStorage.getItem('pendingDbReset') === 'true') {
            localStorage.removeItem('pendingDbReset');
            console.log('%cDB INIT: Pending DB reset detected, attempting reset now...', 'color: orange; font-weight: bold;');
            await resetDatabase(); // Attempt the reset again
        } else {
            // Normal DB opening process
            await openDB();
            console.log('%cDB INIT: Database opened successfully.', 'color: purple;');
        }

        // Render the list of saved X-Forms
        await renderXFormList(); // Initial render sorted by last modified desc
        console.log('%cDB INIT: Initial X-Form list rendered.', 'color: purple;');

        // Initialize selection logic
        initializeXFormSelection();
        console.log('%cDB INIT: X-Form selection initialized.', 'color: purple;');

        // Setup the DB reset button listener
        initDbResetButton();

    } catch (error) {
        console.error('%cDB INIT: FATAL - Failed to initialize database or UI:', 'color: red; font-weight: bold;', error);
        // Display a user-friendly error message
        const errorArea = document.getElementById('app-error-display'); // Assuming an element exists for this
        if (errorArea) {
            errorArea.textContent = "Critical Error: Could not initialize the application database. Please try refreshing the page or clearing application data.";
            errorArea.style.display = 'block';
        } else {
            alert("Critical Error: Could not initialize the application database. Please try refreshing the page.");
        }
    }
}