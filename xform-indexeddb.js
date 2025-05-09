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
    const xformListUl = document.getElementById('savedXformsList');
    if (xformListUl) {
        xformListUl.innerHTML = '<li>No saved xforms found. Import or create new xforms.</li>';
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
    console.log('%cOPENDB (xform-indexeddb.js): Entered openDB function.', 'color: green; font-weight: bold;');
    if (dbPromise) {
        console.log('%cOPENDB: Returning existing dbPromise.', 'color: green;');
        return dbPromise;
    }
    
    console.log('%cOPENDB: No existing dbPromise, creating new one.', 'color: green;');
    dbPromise = new Promise((resolve, reject) => {
        console.log(`%cOPENDB: Attempting indexedDB.open("${XFORM_DB_NAME}", ${XFORM_DB_VERSION})`, 'color: green;');
        const request = indexedDB.open(XFORM_DB_NAME, XFORM_DB_VERSION);
        
        request.onerror = (event) => {
            console.error("%cOPENDB: request.onerror - IndexedDB error:", 'color: red; font-weight: bold;', event.target.error);
            dbPromise = null; 
            reject("IndexedDB error: " + (event.target.error ? event.target.error.message : "Unknown error"));
        };
        
        request.onsuccess = (event) => {
            console.log("%cOPENDB: request.onsuccess - IndexedDB opened successfully.", 'color: green;');
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
        console.log(`DEBUG: listXForms - Got DB object: name=${db.name}, Version=${db.version}, Stores=[${[...db.objectStoreNames].join(', ')}]`);
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
async function exportXformNameToFileName(xformData) {
    try {
        const name = sanitizeFilenameForSystem(xformData.name);
        
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
        a.download = name;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
        
        console.log(`XForm "${xformData.name}" exported as ${name}`);
        return true;
    } catch (error) {
        console.error('Error exporting xform to file:', error);
        return false;
    }
}

// Export all xforms to a single JSONL file (JSON Lines format)
async function exportAllXFormsToFile() {
    console.log('%c[Export All] exportAllXFormsToFile function started!', 'color: green; font-weight: bold;'); // <-- ADDED LOG
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
            // Corrected function call
            const hash = await computeXFormHash(cleanXform);
            cleanXform.exportHashKey = hash;
            return cleanXform;
        });
        
        // need await Promise.all
        const resolvedXforms = await Promise.all(formattedXforms);
        const jsonlContent = resolvedXforms.map(x => JSON.stringify(x)).join('\n');
        
        // Create a Blob with the JSONL data
        const blob = new Blob([jsonlContent], { type: 'application/x-jsonlines' });
        
        // Determine name
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
        // Format time as HH-MM-SS with leading zeros
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const timeStr = `${hours}-${minutes}-${seconds}`;
        const dateTimeStr = `${dateStr}_${timeStr}`;

        let suggestedName = '';
        if (isSelectedOnly) {
            const count = xformsToExport.length === 1 ? "1-xform" : `${xformsToExport.length}-xforms`;
            suggestedName = `xforms-selected-${count}-${dateTimeStr}.jsonl`;
        } else {
            suggestedName = `xforms-all-${dateTimeStr}.jsonl`;
        }
        
        // Check if the File System Access API is available
        if ('showSaveFilePicker' in window) {
            try {
                // *** ADDED: Prepare options object with startIn ***
                const pickerOptions = {
                    suggestedName: suggestedName,
                    types: [{
                        description: 'JSON Lines File',
                        accept: {'application/x-jsonlines': ['.jsonl']}
                    }],
                };
                // Add startIn only if we have a valid handle stored
                if (window.lastUsedDirHandle) {
                    // Basic check if it looks like a handle (can be improved)
                    if (typeof window.lastUsedDirHandle.queryPermission === 'function') { 
                        pickerOptions.startIn = window.lastUsedDirHandle;
                        console.log("Attempting to start file picker in last used directory.");
                    } else {
                        console.warn("window.lastUsedDirHandle exists but doesn't look like a valid directory handle. Using default starting directory.");
                    }
                } else {
                     console.log("No last used directory handle found. Using default starting directory.");
                }
                // *** END ADDED ***

                // Use the File System Access API with the prepared options
                const handle = await window.showSaveFilePicker(pickerOptions);
                
                // Create a writable stream and write the blob data
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                const exportDesc = isSelectedOnly ? 
                    `${xformsToExport.length} selected xform${xformsToExport.length === 1 ? "" : "s"}` : 
                    "all xforms";
                
                console.log(`Exported ${exportDesc} to chosen file: ${handle.name}`);
                // Clarify the success message
                await showInfoDialog(`Successfully exported ${exportDesc} as the file named: "${handle.name}".`);
                
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
async function fallbackExport(blob, name, isSelectedOnly, xformsToExport) {
    try {
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
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

// Import xform(s) from a JSON or JSONL file (Simpler version expecting File object)
async function importXFormsFromFile(file) {
    // Basic check if a file object was passed
    if (!file || !(file instanceof File)) {
        console.error("IMPORT_OLD: Invalid file object received.", file);
        await showInfoDialog("Import failed: No valid file provided.");
        return { success: false, imported: 0, errors: ["Invalid file input"] };
    }

    console.log(`IMPORT_OLD: Starting import of file: ${file.name}, size: ${file.size} bytes`);

    // Use Promise to handle FileReader
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (event) => {
            let importedCount = 0;
            let errors = [];
            let totalInFile = 0;

            try {
                const content = event.target.result;
                console.log(`IMPORT_OLD: File content length: ${content.length} chars`);

                let xformsToImport = [];
                let parseMethod = "unknown";

                // Parsing logic (similar to previous versions, adapted for single file)
                if (file.name.toLowerCase().endsWith('.jsonl')) {
                     parseMethod = "JSONL";
                     const lines = content.split('\\n').filter(line => line.trim());
                     console.log(`IMPORT_OLD: Parsing as JSONL (${lines.length} lines)`);
                     lines.forEach((line, i) => {
                         try {
                             const xform = JSON.parse(line);
                             // Use looser validation for old format - generate ID later if missing?
                             if (xform && xform.name) {
                                 xformsToImport.push(xform);
                             } else {
                                 console.warn(`IMPORT_OLD: Skipping line ${i+1} (missing name): ${line.substring(0, 50)}...`);
                                 errors.push(`Skipped line ${i+1}: Missing Name`);
                             }
                         } catch (lineError) {
                             console.warn(`IMPORT_OLD: Error parsing line ${i+1}:`, lineError);
                             errors.push(`Error parsing line ${i+1}: ${lineError.message}`);
                         }
                     });

                } else { // Assume JSON
                    parseMethod = "JSON";
                    console.log(`IMPORT_OLD: Parsing as JSON`);
                    try {
                        const parsed = JSON.parse(content);
                         if (Array.isArray(parsed)) {
                             xformsToImport = parsed.filter(x => x && x.name);
                         } else if (parsed && parsed.name) {
                             xformsToImport = [parsed];
                         } else if (parsed && Array.isArray(parsed.xforms)) { // Old nested format
                              xformsToImport = parsed.xforms.filter(x => x && x.name);
                         }
                         else {
                            console.error('IMPORT_OLD: Invalid JSON format');
                            throw new Error('Invalid file format: No valid xform data found');
                         }
                     } catch (jsonError) {
                         console.error('IMPORT_OLD: Error parsing JSON:', jsonError);
                         throw new Error(`Invalid JSON format: ${jsonError.message}`);
                     }
                 }

                totalInFile = xformsToImport.length;
                if (totalInFile === 0) {
                    console.warn('IMPORT_OLD: No valid xforms found in the file');
                    throw new Error('No valid xforms found in the file');
                }

                console.log(`IMPORT_OLD: Found ${totalInFile} xforms to import via ${parseMethod}`);

                // Process each xform - simplified: generate new ID, save
                const importPromises = xformsToImport.map(async (xform, idx) => {
                    try {
                        // Generate new unique ID
                        const originalId = xform.id; // Keep for logging if needed
                        xform.id = Date.now() + idx; // Simple unique ID generation

                        // Update timestamps
                        xform.lastModified = xform.id; // Use new ID as timestamp
                        if (!xform.timestamp) {
                            xform.timestamp = xform.id;
                        }

                         // Remove potentially problematic fields before saving
                         delete xform.exportHashKey;
                         delete xform.integrityHash;
                         if (xform.waypoints) {
                             xform.waypoints = xform.waypoints.map(wp => ({ x: wp.x, y: wp.y }));
                         }


                        console.log(`IMPORT_OLD: Saving "${xform.name}" with NEW ID ${xform.id}`);
                        const success = await saveXForm(xform);

                        if (success) {
                            return true;
                        } else {
                            errors.push(`Failed to save "${xform.name}"`);
                            return false;
                        }
                    } catch (err) {
                        console.error(`IMPORT_OLD: Error processing xform "${xform.name}":`, err);
                        errors.push(`Error with "${xform.name}": ${err.message}`);
                        return false;
                    }
                });

                const results = await Promise.all(importPromises);
                importedCount = results.filter(Boolean).length;

                if (errors.length > 0) {
                    console.warn(`IMPORT_OLD: Completed with ${errors.length} errors:`, errors);
                }
                console.log(`IMPORT_OLD: Successfully imported ${importedCount} of ${totalInFile} xforms from ${file.name}`);

                // Resolve the promise for this file
                resolve({
                    success: importedCount > 0,
                    imported: importedCount,
                    total: totalInFile,
                    errors: errors
                });

            } catch (error) {
                console.error(`IMPORT_OLD: Error processing import file ${file.name}:`, error);
                reject(error); // Reject the promise for this file
            }
        }; // end reader.onload

        reader.onerror = (error) => {
            console.error('IMPORT_OLD: Error reading file:', error);
            reject(error); // Reject the promise
        };

        reader.readAsText(file); // Start reading the file
    }); // end return new Promise
}
window.importXFormsFromFile = importXFormsFromFile; // Ensure global access


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
    
    const xformListUl = document.getElementById('savedXformsList');
    if (!xformListUl) {
        console.error("savedXformsList element not found - document state:", {
            body: document.body ? "exists" : "missing",
            readyState: document.readyState,
            savedListParent: document.querySelector('.file-list-container') ? "exists" : "missing"
        });
        return;
    }
    
    // Clear the list and show loading indicator
    xformListUl.innerHTML = '<li>Loading xforms...</li>';
    
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
            xformListUl.innerHTML = '<li>No saved xforms found</li>';
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
        xformListUl.innerHTML = '';
            
            // Track selected items
            window.selectedXforms = window.selectedXforms || [];
        
        // Last clicked item for shift+click
        let lastClickedIndex = -1;
        
            // Build list items
        xforms.forEach((xform, index) => {
            const li = document.createElement('li');
            li.className = 'xform-list-item';
            li.dataset.xformId = xform.id;
            li.dataset.lastModified = xform.lastModified;
                li.dataset.index = index;
            
            // Create name column
            const nameSpan = document.createElement('span');
            nameSpan.className = 'xform-name-column';
                nameSpan.textContent = xform.name || '[unnamed]';
                nameSpan.title = xform.name || '[unnamed]';
            
            // Create date column
            const dateSpan = document.createElement('span');
            dateSpan.className = 'xform-date-column';
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
            deleteBtn.className = 'delete-xform-column';
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
                
                // Apply selected style to this item
                li.classList.add('selected');
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

                const allItems = Array.from(xformListUl.querySelectorAll('li.xform-list-item'));
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
                
            xformListUl.appendChild(li);
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
            const items = document.querySelectorAll('#savedXformsList li.xform-list-item');
            
            // Re-select previously selected items
            let newSelections = [];
            items.forEach(item => {
                const id = item.dataset.xformId;
                // Skip empty IDs 
                if (id && selectedIds.includes(id)) {
                    // Apply the appropriate selection class
                    if (selectedIds.length === 1) {
                        item.classList.add('selected');
                    } else {
                        item.classList.add('selected');
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
        xformListUl.innerHTML = '<li>Error loading saved xforms</li>';
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
        
        // 2. Set Global State (including xform naming Mode)
        window.currentXFormName = xformData.name || "Untitled XForm";
        window.currentXFormId = xformData.id;
        window.isXformNamingModeATM = false; // Force MEM mode
        window.currentXFormHasRun = true; // Mark as loaded
        console.log("Set global state (name, id, MEM mode)");
        
        // 3. Update name Input Field & Mode UI
        const xformNameInput = document.getElementById('xformNameInput');
        if (xformNameInput) {
            xformNameInput.value = window.currentXFormName;
            xformNameInput.readOnly = false;
            xformNameInput.classList.remove('time-based-name');
            console.log(`Updated name input to: ${xformNameInput.value}`);
        }
        
        // Update UI indicators for MEM mode
        const atmModeBtn = document.getElementById('xformNamingModeATM');
        const memModeBtn = document.getElementById('xformNamingModeManual');
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
        document.querySelectorAll('#savedXformsList li.xform-list-item').forEach(el => {
            if (el.dataset.xformId === id.toString()) {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
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
        console.log("Calling createXFormDataObject..."); // <-- ADDED LOG
        const xformData = createXFormDataObject();
        console.log("Returned from createXFormDataObject."); // <-- ADDED LOG
        // *** ADD IMMEDIATE LOGGING OF THE RECEIVED OBJECT ***
        try {
            console.log("DEBUG: saveCurrentXForm - Raw xformData object received:", xformData);
            console.log("DEBUG: saveCurrentXForm - Stringified xformData received:", JSON.stringify(xformData)); // Add stringify for better inspection
        } catch (e) {
            console.error("DEBUG: saveCurrentXForm - Error logging xformData:", e);
        }
        // *** END ADDED LOGGING ***

        // Validation: Ensure name is valid
        const name = xformData.name; // Assign name
        console.log(`DEBUG: saveCurrentXForm - Value assigned to 'name' variable: "${name}" (type: ${typeof name})`); // <-- ADDED LOG

        if (!name || name.trim() === '' || name === 'Untitled XForm') {
            console.warn(`Validation FAILED: name is "${name}"`); // <-- ADDED LOG
            await showInfoDialog(`[${name}] is not a valid name. Please enter a valid name for the XForm before saving.`);
            const xformNameInput = document.getElementById('xformNameInput');
            if (xformNameInput) { xformNameInput.focus(); xformNameInput.select(); }
            console.warn('Save cancelled: XForm name missing or invalid.');
            console.groupEnd();
            return null;
        }
        console.log(`Validation PASSED: name is "${name}"`); // <-- ADDED LOG

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
                 const items = document.querySelectorAll('#savedXformsList li.xform-list-item');
                 items.forEach(item => {
                     item.classList.remove('selected');
                     if (item.dataset.xformId === xformData.id.toString()) {
                         item.classList.add('selected');
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
    const items = document.querySelectorAll('#savedXformsList li');
    items.forEach(item => {
        item.classList.remove('selected'); // Use .selected
    });
    window.selectedXforms = []; // Clear the data array
    window.lastClickedListItemIndex = -1; // Reset shift-click anchor
    updateUIForSelectionCount(); // Update button states etc.
    console.log("Selections cleared.");
}

// Update UI elements based on the number of selected items
function updateUIForSelectionCount() {
    const count = window.selectedXforms ? window.selectedXforms.length : 0;
    // console.log(`Selection count: ${count}`); // This console.log is problematic, let's use logToPage if needed or remove

    // Update export button state
    updateExportButtonState();

    // Update selection counter if it exists
    const counter = document.querySelector('.selection-count');
    if (counter) { // <-- ADD THIS GUARD
        if (count > 0) {
            counter.textContent = `${count} selected`;
            counter.style.display = 'inline-block';
        } else {
            counter.style.display = 'none';
        }
    } else {
        // Optionally log that the element wasn't found, but do it safely
        // console.warn("Element with class .selection-count not found. Cannot update selection count display.");
    }

    // More UI updates can be added here
}

// Update export button state based on selection
function updateExportButtonState() {
    // console.log("DEBUG: updateExportButtonState - Starting..."); // Let's use logToPage for consistency if debugging here
    const exportBtn = document.getElementById('export-all-btn'); 
    if (!exportBtn) {
        // console.error("ERROR:updateExportButtonState: Could not find button with ID 'export-all-btn'");
        return;
    }
    
    const count = window.selectedXforms ? window.selectedXforms.length : 0;
    // console.log("DEBUG: updateExportButtonState: count=", count);
    
    const spanInButton = exportBtn.querySelector('span');

    if (count > 0) {
        exportBtn.disabled = false;
        exportBtn.title = `Export ${count} selected XForm${count === 1 ? '' : 's'}`;
        if (spanInButton) { // <-- ADD GUARD
            spanInButton.textContent = count === 1 ? "Export Selected" : `Export ${count} Selected`;
        }
    } else {
        exportBtn.disabled = false; 
        exportBtn.title = "Export All XForms";
        if (spanInButton) { // <-- ADD GUARD
            spanInButton.textContent = "Export All";
        }
    }
    // console.log(`DEBUG: updateExportButtonState - set disabled=${exportBtn.disabled} (selected count: ${count})`);
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
    const xformNameInput = document.getElementById('xformNameInput');
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
    
    // XForm name
    // --- REFINED DETAILED LOGGING FOR name ---
    console.group("name Assignment in createXFormDataObject"); // Group logs

    const inputElementValue = xformNameInput ? xformNameInput.value : null;
    const globalNameValue = window.currentXFormName;
    console.log(`Input Field Value: "${inputElementValue}" (type: ${typeof inputElementValue})`);
    console.log(`Global window.currentXFormName: "${globalNameValue}" (type: ${typeof globalNameValue})`);

    let nameSource = "default"; // Track where the name came from

    if (inputElementValue !== null && typeof inputElementValue === 'string' && inputElementValue.trim() !== '') {
        console.log(`Condition 1 MET: Using name from input field.`);
        xformData.name = inputElementValue;
        nameSource = "input";
    } else if (globalNameValue) { // Checks if globalNameValue is truthy
        console.log(`Condition 1 FAILED. Condition 2 MET: Using name from window.currentXFormName.`);
        xformData.name = globalNameValue;
        nameSource = "global";
    } else {
        console.log(`Condition 1 FAILED. Condition 2 FAILED: Using initial default name.`);
        // No assignment needed, uses initial value
    }

    console.log(`Final name assigned: "${xformData.name}" (type: ${typeof xformData.name}) from source: ${nameSource}`);
    console.groupEnd(); // End group
    // --- END REFINED LOGGING ---
    
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
window.exportXformNameToFileName = exportXformNameToFileName;
window.exportAllXFormsToFile = exportAllXFormsToFile;
window.showInfoDialog = showInfoDialog;
window.showModalDialog = showModalDialog;

// Add this function near the bottom of the file with the other initialization functions

// Initialize the XformNameController to manage name input and mode toggling
function initializeXformNameController() {
    // Define a self-contained controller for name input and mode management
    class XformNameController {
        constructor() {
            // Get UI elements
            this.xformNameInput = document.getElementById('xformNameInput');
            this.atmButton = document.getElementById('xformNamingModeATM');
            this.memButton = document.getElementById('xformNamingModeMEM');
            
            // Initial state
            this._isATMMode = true; 
            this._xformName = '';
            this._updateTimer = null; 
            
            console.log('XformNameController: Constructor called.'); // Added log
            
            // Initialize
            if (!this.xformNameInput) {
                console.error('XformNameController: Missing xformNameInput.');
                return; 
            }
            if (!this.atmButton) {
                console.error('XformNameController: Missing atmButton.');
                return; 
            }
            if (!this.memButton) {
                console.error('XformNameController: Missing memButton.');
                return; 
            }
            this._setupEventListeners();
            this._setMode(this._isATMMode, true); // Apply initial state
            console.log('XformNameController initialized');
        }
        
        // --- Event Listener Setup (using arrow function) ---
        _setupEventListeners = () => {
            console.log('XformNameController: _setupEventListeners called.'); // Added log
            this.atmButton.addEventListener('click', () => {
                console.log('XformNameController: ATM button clicked.'); // Added log
                this._setMode(true);
            }); 
            this.memButton.addEventListener('click', () => {
                console.log('XformNameController: MEM button clicked.'); // Added log
                this._setMode(false);
            });
            
            this.xformNameInput.addEventListener('click', () => {
                console.log('XformNameController: xformNameInput clicked.'); // Added log
                if (this._isATMMode) {
                    console.log('XformNameController: Switching to MEM mode from input click.'); // Added log
                    this._setMode(false); 
                    this.xformNameInput.select();
                }
            });
            
            this.xformNameInput.addEventListener('input', () => {
                // Added log for input event
                console.log(`XformNameController: xformNameInput 'input' event. Current mode ATM: ${this._isATMMode}, New value: "${this.xformNameInput.value}"`);
                if (!this._isATMMode) {
                    this._xformName = this.xformNameInput.value; 
                    localStorage.setItem('xformMaker_filenameValue', this._xformName);
                    window.currentXFormName = this._xformName; 
                    console.log(`XformNameController: MEM mode name updated to "${this._xformName}" and saved to localStorage/window.`); // Added log
                }
            });
            
            // Replace global functions for compatibility 
            window.toggleXformNamingMode = this._setMode;
            window.startFilenameTimeUpdates = this._startTimer;
            window.stopFilenameTimeUpdates = this._stopTimer;
            
            console.log('XformNameController: Event listeners set up');
        }
        
        // --- Public API Methods (using arrow functions) ---
        setNewXform = () => {
            console.log("XformNameController: Setting up for new XForm...");
            this._setMode(true); 
            this._setName(''); 
            this._startTimer(); 
        }
        
        setSavedXform = (name) => {
            console.log(`XformNameController: Setting up for saved XForm: "${name}"`);
            this._setMode(false); 
            this._setName(name || 'Untitled XForm'); 
            this._stopTimer();
        }

        getCurrentFilename = () => {
            return this._isATMMode ? this._xformName : (this.xformNameInput?.value || this._xformName);
        }

        isInATMMode = () => {
            return this._isATMMode;
        }
        
        // --- Private Implementation Methods (using arrow functions) ---
        _setMode = (useATM, initializing = false) => {
            // Added detailed log for _setMode
            console.log(`XformNameController: _setMode called. Requested ATM: ${useATM}, Initializing: ${initializing}, Current ATM: ${this._isATMMode}`);
            const newModeIsATM = !!useATM;
            if (!initializing && this._isATMMode === newModeIsATM) {
                console.log('XformNameController: _setMode - Mode already set, no change.'); // Added log
                return; 
            }

            this._isATMMode = newModeIsATM;
            window.isXformNamingModeATM = this._isATMMode; 
            this._updateUI();
            
            if (this._isATMMode) {
                this._startTimer();
                this._updateATMFilename(); 
                localStorage.setItem('xformMaker_xformNamingMode', 'ATM');
                console.log('XformNameController: Switched to ATM mode.'); // Added log
            } else {
                console.log(`XformNameController: Switching to MEM mode. Current timer ID BEFORE stopping: ${this._updateTimer}`); 
                this._stopTimer(); 
                const savedManualName = localStorage.getItem('xformMaker_filenameValue');
                const nameToSet = savedManualName || window.currentXFormName || 'Untitled XForm';
                console.log(`XformNameController: MEM mode - name to set: "${nameToSet}" (from saved: "${savedManualName}", from window: "${window.currentXFormName}")`); // Added log
                this._setName(nameToSet); 
                localStorage.setItem('xformMaker_xformNamingMode', 'MEM');
                console.log('XformNameController: Switched to MEM mode.'); // Added log
            }
            
            if (!initializing) {
                 console.log(`XformNameController: Mode set to ${this._isATMMode ? 'ATM' : 'MEM'} (final confirmation).`);
            }
        }
        
        _setName = (name) => {
             // Added log for _setName
             //console.log(`XformNameController: _setName called with "${name}". Current _xformName: "${this._xformName}"`);
             if (this._xformName !== name) {
                 this._xformName = name;
                 if (this.xformNameInput) {
                    this.xformNameInput.value = name;
                    //console.log(`XformNameController: _setName - Updated input field value to "${name}"`); // Added log
                 }
                 window.currentXFormName = name; 
                 if (!this._isATMMode) {
                     localStorage.setItem('xformMaker_filenameValue', name);
                    //  console.log(`XformNameController: _setName - In MEM mode, saved "${name}" to localStorage.`); // Added log
                 }
             }
        }
        
        _updateUI = () => {
            // Added log for _updateUI
            console.log(`XformNameController: _updateUI called. Current ATM: ${this._isATMMode}`);
            if (this.atmButton && this.memButton) {
                this.atmButton.classList.toggle('active', this._isATMMode);
                this.memButton.classList.toggle('active', !this._isATMMode);
                console.log(`XformNameController: _updateUI - ATM button active: ${this._isATMMode}, MEM button active: ${!this._isATMMode}`); // Added log
            }
            if (this.xformNameInput) {
                this.xformNameInput.readOnly = this._isATMMode;
                this.xformNameInput.classList.toggle('time-based-name', this._isATMMode);
                console.log(`XformNameController: _updateUI - Input field readOnly: ${this._isATMMode}, has class 'time-based-name': ${this._isATMMode}`); // Added log
            }
        }
        
        _updateATMFilename = () => {
            if (!this._isATMMode) return;
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10); 
            const timeStr = now.toTimeString().slice(0, 8); 
            this._setName(`${dateStr} ${timeStr}`); 
        }
        
        _startTimer = () => {
            this._stopTimer(); 
            this._updateTimer = setInterval(this._updateATMFilename, 1000);
            console.log("XformNameController: Timer STARTED with interval ID:", this._updateTimer);
        }
        _stopTimer = () => {
            if (this._updateTimer) {
                console.log("XformNameController: Attempting to STOP timer with interval ID:", this._updateTimer);
                clearInterval(this._updateTimer);
                this._updateTimer = null; 
                console.log("XformNameController: Timer STOPPED.");
            } else {
                 console.log("XformNameController: Stop timer called, but no active timer ID found.");
            }
        }
    }
    
    // Create and store the controller instance
    window.xformNameController = new XformNameController();
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
                // *** NOTE: applyXFormData ALSO updates the xformNameInput if not in ATM mode.
                // We might be setting the value twice, but it should be harmless. ***
                window.applyXFormData(xformData); 
                console.log('%cDB LOAD: applyXFormData completed.', 'color: blue;');
            } else {
                console.error("DB LOAD: Critical error - window.applyXFormData function not found!");
                showInfoDialog("Internal Error: Could not apply loaded X-Form data.");
                return; // Stop if apply function is missing
            }

            // --- REVISED: Use XformNameController to set mode and name ---
            if (window.xformNameController && typeof window.xformNameController.setSavedXform === 'function') {
                console.log(`%cDB LOAD: Calling xformNameController.setSavedXform("${xformData.name}")`, 'color: blue;');
                window.xformNameController.setSavedXform(xformData.name);
                console.log('%cDB LOAD: xformNameController handled mode switch to MEM.', 'color: blue;');
            } else {
                console.error("DB LOAD: XformNameController or setSavedXform method not found! Cannot properly set name mode.");
                // Fallback (less ideal - might conflict with controller later)
                const xformNameInput = document.getElementById('xformNameInput');
                const atmBtn = document.getElementById('xformNamingModeATM');
                const memBtn = document.getElementById('xformNamingModeManual');
                if (xformNameInput && atmBtn && memBtn) {
                    xformNameInput.value = xformData.name;
                    window.isXformNamingModeATM = false;
                    atmBtn.classList.remove('active');
                    memBtn.classList.add('active');
                    if (typeof window.stopFilenameTimeUpdates === 'function') {
                        window.stopFilenameTimeUpdates();
                    }
                    xformNameInput.removeAttribute('readonly');
                     // Assume keys are global
                    if (typeof XFORM_NAMING_MODE_KEY !== 'undefined' && typeof XFORM_NAMING_VALUE_KEY !== 'undefined') {
                         localStorage.setItem(XFORM_NAMING_MODE_KEY, 'MEM'); 
                         localStorage.setItem(XFORM_NAMING_VALUE_KEY, xformNameInput.value); 
                    }
                }
            }
            // --- END REVISED ---

            // Select the loaded item in the list UI
            const xformListUl = document.getElementById('savedXformsList'); // Or the correct ID for your list
            if (xformListUl) {
                // Clear previous selections
                xformListUl.querySelectorAll('li.selected').forEach(li => li.classList.remove('selected'));

                // Find and select the current item using the ID
                const listItem = xformListUl.querySelector(`li[data-xform-id="${xformId}"]`);
                if (listItem) {
                    listItem.classList.add('selected');
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
    // const debugOutputDiv = document.getElementById('init-debug-output'); // REMOVE
    // const logToPage = (message) => { ... }; // REMOVE

    try {
        console.log('%cDB INIT (xform-indexeddb.js): Entered initializeDBAndUI function.', 'color: purple; font-weight: bold;');

        if (localStorage.getItem('pendingDbReset') === 'true') {
            localStorage.removeItem('pendingDbReset');
            console.log('%cDB INIT: Pending DB reset detected, attempting reset now...', 'color: orange; font-weight: bold;');
            await resetDatabase();
        } else {
            console.log('%cDB INIT: Calling openDB()...', 'color: purple;');
            await openDB();
            console.log('%cDB INIT: openDB() call completed.', 'color: purple;');
        }

        console.log('%cDB INIT: Calling renderXFormList()...', 'color: purple;');
        await renderXFormList();
        console.log('%cDB INIT: Initial X-Form list rendered.', 'color: purple;');

        console.log('%cDB INIT: Calling initializeXFormSelection()...', 'color: purple;');
        initializeXFormSelection();
        console.log('%cDB INIT: X-Form selection initialized.', 'color: purple;');

        console.log('%cDB INIT: Calling initDbResetButton()...', 'color: purple;');
        initDbResetButton();
        console.log('%cDB INIT: initDbResetButton() completed.', 'color: purple;');

    } catch (error) {
        // Restore console.error for the actual error
        console.error('%cDB INIT (xform-indexeddb.js): FATAL - Failed to initialize database or UI:', 'color: red; font-weight: bold;', error);
        
        const errorArea = document.getElementById('app-error-display');
        if (errorArea) {
            errorArea.textContent = "Critical Error: Could not initialize DB. (Code: E04)"; // New ID for final version
            errorArea.style.display = 'block';
        } else {
            alert("Critical Error: Could not initialize DB. (Code: A04)"); // New ID for final version
        }
        throw error; // Re-throw the error so script.js's catch handler can also see it.
    }
}

function handleViewportClick(event) {
    // --- DETAILED LOGGING FOR UNWANTED WAYPOINT DEBUG ---
    console.log("handleViewportClick: Fired.");
    console.log("handleViewportClick: event.target: ", event.target);
    console.log("handleViewportClick: event.target.id: ", event.target.id);
    console.log("handleViewportClick: event.target.classList: ", event.target.classList);
    // --- END DETAILED LOGGING ---

    // Check if a drag operation just ended. If so, ignore this click.
    if (dragOperationJustEnded) {
        console.log("handleViewportClick: Ignoring click because a drag operation just finished.");
        return;
    }

    // If the click originated on a draggable rectangle or a waypoint marker, don't add a new waypoint.
    const targetId = event.target.id;
    const targetClasses = event.target.classList;
    if (targetId === 'startRect' || targetId === 'endRect' || targetClasses.contains('point-marker')) {
        console.log("handleViewportClick: Click originated on a draggable element (rect or marker), not adding new waypoint.");
        return;
    }

    console.log("Viewport clicked! (This log means the event listener is firing)");

    // --- Waypoint adding logic ---
    // 1. Calculate waypoint coordinates from 'event' relative to the viewport
    const viewportElement = event.target; // The viewport div IS the event target
    const rect = viewportElement.getBoundingClientRect();
    const newWaypointX = event.clientX - rect.left;
    const newWaypointY = event.clientY - rect.top;

    console.log(`Calculated waypoint coords: X=${newWaypointX.toFixed(2)}, Y=${newWaypointY.toFixed(2)}`);

    // Create the visual marker first
    const marker = document.createElement('div');
    marker.className = 'point-marker';
    marker.style.position = 'absolute';
    marker.style.left = newWaypointX + 'px'; 
    marker.style.top = newWaypointY + 'px';
    // Add data-waypoint-index for drag identification BEFORE adding to array
    // The index will be the current length of the array, as it's about to be added.
    marker.dataset.waypointIndex = window.intermediatePoints ? window.intermediatePoints.length : 0;
    marker.addEventListener('mousedown', onWaypointMouseDown); // From xform-indexeddb.js
    viewportElement.appendChild(marker);
    console.log("Visual marker element added to viewport with mousedown listener.");

    // Now create the data object, including a reference to its DOM element
    const newWaypoint = { x: newWaypointX, y: newWaypointY, element: marker };

    // 2. Add the new waypoint to your global array
    if (!window.intermediatePoints) { // Initialize if it doesn't exist
        window.intermediatePoints = [];
    }
    window.intermediatePoints.push(newWaypoint);
    console.log(`Waypoint added. Total waypoints: ${window.intermediatePoints.length}`);
    // For more detailed inspection of the array contents:
    // console.log("Current waypoints array:", JSON.stringify(window.intermediatePoints));

    // 3. AFTER adding the waypoint, update the counter and delete button state
    if (typeof updateWaypointCounterFallback === 'function') {
        updateWaypointCounterFallback();
    } else {
        console.error("updateWaypointCounterFallback function is not defined!");
    }

    // After adding the waypoint and updating UI, redraw the path visualization
    if (typeof window.drawPathVisualization === 'function') {
        window.drawPathVisualization();
        console.log("handleViewportClick: Called drawPathVisualization() after adding new waypoint.");
    } else {
        console.warn("handleViewportClick: window.drawPathVisualization function not found, path won't update after adding new waypoint.");
    }
}

// --- Example: How you might set up a delete button ---
function setupDeleteWaypointButton() {
    const deleteBtn = document.getElementById('deleteLastWaypointBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            console.log("Delete Last Waypoint button clicked (event from xform-indexeddb.js).");
            
            // Call the primary delete function from xform-controls.js if it exists
            if (typeof window.deleteLastWaypoint === 'function') {
                window.deleteLastWaypoint(); // This function should handle data, visuals, and counter updates
            } else {
                console.error("window.deleteLastWaypoint function (expected in xform-controls.js) not found.");
                // Fallback or old logic as a last resort, though ideally the main one works:
                /*
                if (window.intermediatePoints && window.intermediatePoints.length > 0) {
                    const removedPointData = window.intermediatePoints.pop(); 
                    console.log("DELETE MARKER DEBUG (indexeddb fallback): Waypoint data popped. Remaining:", window.intermediatePoints.length);
                    if (removedPointData && removedPointData.element) {
                        removedPointData.element.remove();
                        console.log("DELETE MARKER DEBUG (indexeddb fallback): Visual marker removed.");
                    }
                    if (typeof updateWaypointCounterFallback === 'function') {
                        updateWaypointCounterFallback();
                    }
                    reindexWaypointMarkers(document.getElementById('viewport'));
                } else {
                    console.log("DELETE MARKER DEBUG (indexeddb fallback): No waypoints to delete.");
                }
                */
            }
        });
        console.log("Event listener for 'click' (from xform-indexeddb.js) attached to deleteLastWaypointBtn.");
    } else {
        console.warn("Could not find the deleteLastWaypointBtn element to attach listener (from xform-indexeddb.js).");
    }
}

// Call this setup function when your page loads, after the button is in the DOM
// ... existing code ...

// === Main Initialization ===
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM fully loaded and parsed. Initializing application...");

    // 1. Initialize Database and UI elements like the XForm list
    try {
        await initializeDBAndUI(); // This already exists in your file
        console.log("initializeDBAndUI completed.");
    } catch (error) {
        console.error("Error during initializeDBAndUI:", error);
        // Optionally display a critical error message to the user
        const errorDisplay = document.getElementById('app-error-display'); // Ensure you have this element
        if (errorDisplay) {
            errorDisplay.textContent = "Critical error during application startup. Please try refreshing.";
            errorDisplay.style.display = 'block';
        }
        return; // Stop further initialization if core setup fails
    }

    // 2. Setup Viewport Click Listener
    const viewportElement = document.getElementById('viewport'); // <<< REVERTED ID TO 'viewport'
    if (viewportElement) {
        if (typeof handleViewportClick === 'function') {
            viewportElement.addEventListener('click', handleViewportClick);
            console.log("Event listener for 'click' on viewport attached.");
        } else {
            console.error("handleViewportClick function is NOT defined. Check script loading order and function definition.");
        }
    } else {
        console.error("Viewport element with ID 'viewport' NOT found. Waypoint adding will not work.");
    }

    // 3. Setup Delete Waypoint Button
    if (typeof setupDeleteWaypointButton === 'function') {
        setupDeleteWaypointButton();
        console.log("setupDeleteWaypointButton called.");
    } else {
        console.error("setupDeleteWaypointButton function is NOT defined.");
    }

    // 4. Initial Update for Waypoint Counter (and delete button state)
    if (typeof updateWaypointCounterFallback === 'function') {
        updateWaypointCounterFallback();
        console.log("Initial call to updateWaypointCounterFallback completed.");
    } else {
        console.error("updateWaypointCounterFallback function is NOT defined.");
    }

    console.log("Application initialization sequence finished.");
});

let draggedWaypointIndex = -1; // Index of the waypoint currently being dragged, -1 if none
let dragOffsetX = 0; // Mouse offset X within the dragged element
let dragOffsetY = 0; // Mouse offset Y within the dragged element
let dragOperationJustEnded = false; // Flag to ignore click immediately after drag
let isWaypointOverDeleteZone = false; // Flag if waypoint is dragged out of viewport

function onWaypointMouseDown(event) {
    // 'this' inside this function refers to the marker element that was clicked
    const markerElement = event.currentTarget; // More robust than 'this' in some complex scenarios
    draggedWaypointIndex = parseInt(markerElement.dataset.waypointIndex, 10);

    if (isNaN(draggedWaypointIndex) || draggedWaypointIndex < 0 || draggedWaypointIndex >= window.intermediatePoints.length) {
        console.error("Invalid waypoint index on mousedown:", markerElement.dataset.waypointIndex);
        draggedWaypointIndex = -1;
        return;
    }

    console.log(`Mousedown on waypoint marker. Index: ${draggedWaypointIndex}`);
    event.preventDefault(); // Prevent default browser drag behavior or text selection
    event.stopPropagation(); // Prevent this mousedown from bubbling up and potentially triggering viewport click later

    // Calculate initial mouse offset. Since CSS transform centers the marker around its
    // style.left/top, we want the drag to position the marker's center at the cursor.
    // So, the offset is effectively half the marker's dimensions.
    dragOffsetX = markerElement.offsetWidth / 2;
    dragOffsetY = markerElement.offsetHeight / 2;

    // Add mousemove and mouseup listeners to the document to handle the drag
    document.addEventListener('mousemove', onDocumentMouseMove);
    document.addEventListener('mouseup', onDocumentMouseUp);

    // Optional: Add a class to the marker to indicate it's being dragged
    markerElement.classList.add('dragging');
}

function onDocumentMouseMove(event) {
    if (draggedWaypointIndex === -1) {
        return; // Not dragging anything
    }

    const viewportElement = document.getElementById('viewport'); // Or your actual viewport ID
    if (!viewportElement) {
        console.error("Viewport element not found during mousemove.");
        // Attempt to clean up if viewport is gone mid-drag
        document.removeEventListener('mousemove', onDocumentMouseMove);
        document.removeEventListener('mouseup', onDocumentMouseUp);
        draggedWaypointIndex = -1;
        isWaypointOverDeleteZone = false;
        return;
    }
    const viewportRect = viewportElement.getBoundingClientRect();
    const markerElement = viewportElement.querySelector(`.point-marker[data-waypoint-index="${draggedWaypointIndex}"]`);

    if (!markerElement) {
        console.warn(`Could not find marker element for index ${draggedWaypointIndex} during mousemove.`);
        // Attempt to clean up if marker is gone mid-drag
        document.removeEventListener('mousemove', onDocumentMouseMove);
        document.removeEventListener('mouseup', onDocumentMouseUp);
        draggedWaypointIndex = -1;
        isWaypointOverDeleteZone = false;
        return;
    }

    // Calculate new position for the marker's center, relative to the viewport
    // Assumes dragOffsetX/Y were set to half marker width/height to keep cursor at center
    let newMarkerCenterX = event.clientX - viewportRect.left - dragOffsetX;
    let newMarkerCenterY = event.clientY - viewportRect.top - dragOffsetY;

    markerElement.style.left = newMarkerCenterX + 'px';
    markerElement.style.top = newMarkerCenterY + 'px';

    // Update the data in the window.intermediatePoints array
    // (This assumes your data model stores the center coordinates, matching style.left/top due to CSS transform)
    if (window.intermediatePoints[draggedWaypointIndex]) {
        window.intermediatePoints[draggedWaypointIndex].x = newMarkerCenterX;
        window.intermediatePoints[draggedWaypointIndex].y = newMarkerCenterY;
    } else {
        console.warn(`Data for waypoint index ${draggedWaypointIndex} not found in window.intermediatePoints during mousemove.`);
    }


    // Check if the waypoint (its center) is outside the viewport
    // A small buffer can be added if needed (e.g., -10 or +10 to viewportRect dimensions)
    if (newMarkerCenterX < 0 || newMarkerCenterX > viewportRect.width || 
        newMarkerCenterY < 0 || newMarkerCenterY > viewportRect.height) {
        isWaypointOverDeleteZone = true;
        markerElement.classList.add('marker-deletable'); // For visual feedback
    } else {
        isWaypointOverDeleteZone = false;
        markerElement.classList.remove('marker-deletable');
    }
    
    // console.log(`Dragging waypoint ${draggedWaypointIndex} to X:${newMarkerCenterX.toFixed(1)}, Y:${newMarkerCenterY.toFixed(1)}`);

    // After updating waypoint position, redraw the path visualization
    if (typeof window.drawPathVisualization === 'function') {
        window.drawPathVisualization();
    } else {
        console.warn("onDocumentMouseMove: drawPathVisualization function not found, path won't update live during waypoint drag.");
    }
}

function onDocumentMouseUp(event) {
    if (draggedWaypointIndex === -1) {
        return; // Not dragging anything
    }

    const viewportElement = document.getElementById('viewport'); // Or your actual viewport ID
    // Query for marker only if viewportElement exists to prevent error
    const markerElement = viewportElement ? viewportElement.querySelector(`.point-marker[data-waypoint-index="${draggedWaypointIndex}"]`) : null;

    if (isWaypointOverDeleteZone && markerElement) {
        console.log(`Deleting waypoint index: ${draggedWaypointIndex} by dragging out.`);
        markerElement.remove(); // Remove the visual marker
        if (window.intermediatePoints && window.intermediatePoints[draggedWaypointIndex]) {
            window.intermediatePoints.splice(draggedWaypointIndex, 1); // Remove data from array
        } else {
            console.warn(`Attempted to delete data for waypoint index ${draggedWaypointIndex}, but it was not found in array.`);
        }
        
        // IMPORTANT: After splicing, data-waypoint-index attributes on subsequent visual markers
        // are now "stale". Consider re-indexing markers if further complex interaction is needed.
        console.log("Waypoint deleted. Subsequent marker indices may need updating.");

        if (typeof updateWaypointCounterFallback === 'function') {
            updateWaypointCounterFallback(); // Update counter
        }
        reindexWaypointMarkers(viewportElement); // Re-index remaining markers

        // After deleting and re-indexing, redraw the path one last time
        if (typeof window.drawPathVisualization === 'function') {
            window.drawPathVisualization();
            console.log("onDocumentMouseUp: Called drawPathVisualization() after waypoint deletion.");
        } else {
            console.warn("onDocumentMouseUp: window.drawPathVisualization function not found, path may not update after deletion.");
        }

    } else if (markerElement) {
        // Waypoint was not deleted, finalize its position
        console.log(`Mouseup, finished dragging waypoint index: ${draggedWaypointIndex}`);
        markerElement.classList.remove('dragging'); // Ensure dragging class is removed
        markerElement.classList.remove('marker-deletable'); // Ensure deletable class is removed

        // Data was already updated in onDocumentMouseMove.
        // No need to update window.intermediatePoints[draggedWaypointIndex].x/y here again
        // unless the calculation was different or needed finalization.
        if (window.intermediatePoints[draggedWaypointIndex]) {
             console.log("Finalized waypoint data:", JSON.stringify(window.intermediatePoints[draggedWaypointIndex]));
        }

    } else if (isWaypointOverDeleteZone && !markerElement) {
        // Edge case: marker was somehow removed while being dragged out
        console.warn(`Marker for index ${draggedWaypointIndex} not found but was in delete zone. Attempting to splice data.`);
        if (window.intermediatePoints && window.intermediatePoints[draggedWaypointIndex]) {
             window.intermediatePoints.splice(draggedWaypointIndex, 1);
             if (typeof updateWaypointCounterFallback === 'function') {
                updateWaypointCounterFallback();
             }
        }
    } else {
         console.warn(`Mouseup: Marker for index ${draggedWaypointIndex} not found. Cannot finalize.`);
    }

    // Reset all drag-related states
    if(markerElement) markerElement.classList.remove('dragging', 'marker-deletable'); // Clean up classes
    draggedWaypointIndex = -1;
    isWaypointOverDeleteZone = false; // Reset this flag too
    document.removeEventListener('mousemove', onDocumentMouseMove);
    document.removeEventListener('mouseup', onDocumentMouseUp);

    // Flag to prevent immediate click after drag
    dragOperationJustEnded = true;
    setTimeout(() => {
        dragOperationJustEnded = false;
    }, 0);
}

function reindexWaypointMarkers(viewportElem) {
    if (!viewportElem) {
        console.warn("reindexWaypointMarkers: viewportElement is null, cannot re-index.");
        return;
    }
    const existingMarkers = viewportElem.querySelectorAll('.point-marker');
    console.log(`reindexWaypointMarkers: Found ${existingMarkers.length} markers to re-index.`);
    existingMarkers.forEach((marker, newIndex) => {
        marker.dataset.waypointIndex = newIndex;
        // console.log(`Marker re-indexed: old index was ${marker.dataset.waypointIndex} (potentially), new is ${newIndex}`);
    });
    console.log("reindexWaypointMarkers: Finished re-indexing visible markers.");
}