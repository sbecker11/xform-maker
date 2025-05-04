// --- Global Constants & Variables (Declared in main script.js) ---
// const STORAGE_KEY = 'xformMaker_savedForms'; 
// const STATE_STORAGE_KEY = 'xformMaker_currentState';
// const XFORM_NAMING_MODE_KEY = 'xformMaker_xformNamingMode'; // Defined in xform-naming-mode.js
// const XFORM_NAMING_VALUE_KEY = 'xformMaker_xformNamingValue'; // Defined in xform-naming-mode.js
window.lastUsedDirHandle = null; // Keep track of the selected 'storage' directory handle
// window.isXformNamingModeATM = true; // Managed within setupNamingMode
let xformNamUpdateInterval = null;
let selectedXformListItem = null; // Keep track of selected file LI element
let selectedXformName = null; // Keep track of selected xformName
// References to DOM elements needed by persistence (set in main script)
// window.savedListUl, window.selectedControlsDiv, window.renameInput, etc.

// --- IndexedDB Helpers for Directory Handle Persistence --- 
// --- NOTE: These are commented out as the main DB logic is in xform-indexeddb.js ---
/*
const DB_NAME_PERSISTENCE = 'xformMakerDB'; // Use a distinct xformName if needed, or ensure it matches the main DB
const DB_VERSION_PERSISTENCE = 1;
const STORE_NAME_PERSISTENCE = 'settingsStore';
const DIR_HANDLE_KEY_PERSISTENCE = 'lastDirectoryHandle';

// REMOVE or comment out this duplicate declaration
// let dbPromise = null; 

function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME_PERSISTENCE, DB_VERSION_PERSISTENCE);
        request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.error);
            reject("IndexedDB error");
        };
        request.onsuccess = (event) => {
            console.log("IndexedDB opened successfully.");
            resolve(event.target.result);
        };
        request.onupgradeneeded = (event) => {
            console.log("IndexedDB upgrade needed.");
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME_PERSISTENCE)) {
                db.createObjectStore(STORE_NAME_PERSISTENCE);
                console.log(`Object store '${STORE_NAME_PERSISTENCE}' created.`);
            }
        };
    });
    return dbPromise;
}
*/
// --- Use the global openDB from xform-indexeddb.js instead ---
const STORE_NAME_PERSISTENCE = 'settingsStore'; // Still need store xformName
const DIR_HANDLE_KEY_PERSISTENCE = 'lastDirectoryHandle'; // Still need key xformName


async function saveDirectoryHandle(handle) {
    if (!handle) {
        console.error('📂 SAVE HANDLE: Cannot save null directory handle');
        return false;
    }
    
    if (handle.xformName !== 'storage') {
        console.warn(`📂 SAVE HANDLE: Expected directory named "storage", got "${handle.xformName}"`);
        // Continue anyway since we're more interested in persistence than the exact xformName
    }
    
    console.log(`📂 SAVE HANDLE: Saving directory handle for "${handle.xformName}" to IndexedDB`);
    
    // First, try to request persistent access permission
    try {
        console.log('📂 SAVE HANDLE: Requesting persistent permission...');
        const permissionStatus = await handle.queryPermission({ mode: 'readwrite' });
        
        if (permissionStatus !== 'granted') {
            console.log('📂 SAVE HANDLE: Permission not granted, requesting explicitly...');
            const requestResult = await handle.requestPermission({ mode: 'readwrite' });
            console.log(`📂 SAVE HANDLE: Permission request result: ${requestResult}`);
        } else {
            console.log('📂 SAVE HANDLE: Permission already granted');
        }
    } catch (permErr) {
        // Log but don't stop - we'll still save the handle
        console.warn('📂 SAVE HANDLE: Error requesting permission:', permErr);
    }
    
    // Now save the handle regardless of permission status
    try {
        console.log("📂 SAVE HANDLE (DEBUG): Attempting to open DB for writing...");
        const db = await openDB();
        console.log("📂 SAVE HANDLE (DEBUG): DB opened. Starting transaction...");
        const tx = db.transaction(STORE_NAME_PERSISTENCE, 'readwrite');
        const store = tx.objectStore(STORE_NAME_PERSISTENCE);
        
        console.log(`📂 SAVE HANDLE (DEBUG): Attempting to store handle for '${handle.xformName}' (kind: ${handle.kind}) with key '${DIR_HANDLE_KEY_PERSISTENCE}'`);
        console.log("📂 SAVE HANDLE (DEBUG): Handle object:", handle); // Log the handle itself

        // *** Make sure we are putting the HANDLE, not a request object ***
        const putRequest = store.put(handle, DIR_HANDLE_KEY_PERSISTENCE);

        // --- ADDED DEBUG LOGS FOR REQUEST --- 
        putRequest.onsuccess = (event) => {
            console.log("📂 SAVE HANDLE (DEBUG): store.put() request successful.", event);
        };
        putRequest.onerror = (event) => {
            console.error("📂 SAVE HANDLE (DEBUG): store.put() request FAILED:", event.target.error);
        };
        // --- END ADDED DEBUG LOGS ---
        
        console.log("📂 SAVE HANDLE (DEBUG): Waiting for transaction completion (tx.done)...");
        // Use tx.done to wait for completion
        await tx.done;
        
        console.log('📂 SAVE HANDLE: Successfully saved directory handle to IndexedDB');
        return true;
    } catch (error) {
        console.error('📂 SAVE HANDLE: Error saving directory handle to IndexedDB:', error);
        // --- ADDED DEBUG LOG FOR ERROR DETAILS ---
        if (error.xformName) {
            console.error(`📂 SAVE HANDLE (DEBUG): Error details - Name: ${error.xformName}, Message: ${error.message}`);
        }
        // --- END ADDED DEBUG LOG ---
        return false;
    }
}

async function loadDirectoryHandle() {
    try {
        console.log('📂 LOAD HANDLE: Attempting to load directory handle from IndexedDB...');
        const db = await openDB();
        const tx = db.transaction(STORE_NAME_PERSISTENCE, 'readonly');
        const store = tx.objectStore(STORE_NAME_PERSISTENCE);
        
        // Use a promise to wrap the get request correctly
        const handle = await new Promise((resolve, reject) => {
            const request = store.get(DIR_HANDLE_KEY_PERSISTENCE);
            request.onsuccess = () => resolve(request.result); // Resolve with the actual handle
            request.onerror = () => reject(request.error);
        });

        // *** VALIDATION: Check if handle is a valid directory handle ***
        if (!handle || typeof handle.queryPermission !== 'function' || handle.kind !== 'directory') {
            console.warn('📂 LOAD HANDLE: Invalid or corrupted handle found in IndexedDB. Deleting it.');
            if (handle) { 
                 console.log('   (Invalid handle data retrieved:', handle);
            }
            await deleteStoredDirectoryHandle(); 
            return null;
        }
        
        console.log(`📂 LOAD HANDLE: Retrieved valid handle for "${handle.xformName}" directory`);
        
        // Check permission status (now we know handle is valid)
        try {
            console.log('📂 LOAD HANDLE: Checking permission status...');
            const permissionStatus = await handle.queryPermission({ mode: 'readwrite' });
            console.log(`📂 LOAD HANDLE: Current permission status: ${permissionStatus}`);
            
            // Display detailed handle info for debugging
            console.log('📂 LOAD HANDLE: Handle details:', {
                xformName: handle.xformName,
                kind: handle.kind
            });
            
            if (permissionStatus !== 'granted') {
                console.warn('📂 LOAD HANDLE: Permission not currently granted, will request when needed');
                window.directoryPermissionStatus = 'needs-request';
            } else {
                window.directoryPermissionStatus = 'granted';
            }
            
            return handle;
        } catch (permErr) {
            console.error('📂 LOAD HANDLE: Error checking permission on valid handle:', permErr);
            // Don't delete the handle here, just return null as permission failed
            return null;
        }
    } catch (error) {
        // Catch errors from openDB or the transaction itself
        console.error('📂 LOAD HANDLE: Error loading directory handle:', error);
        return null;
    }
}

async function deleteStoredDirectoryHandle() {
    try {
        console.log('📂 DELETE STORED HANDLE: Attempting to delete directory handle from IndexedDB...');
        const db = await openDB();
        
        // Use proper transaction pattern
        const tx = db.transaction(STORE_NAME_PERSISTENCE, 'readwrite');
        const store = tx.objectStore(STORE_NAME_PERSISTENCE);
        await store.delete(DIR_HANDLE_KEY_PERSISTENCE);
        await tx.done;
        
        console.log('📂 DELETE STORED HANDLE: Successfully deleted directory handle');
        // Do not clear window.lastUsedDirHandle here as this function might be called in different contexts
    } catch (error) {
        console.error('📂 DELETE STORED HANDLE: Error deleting directory handle:', error);
    }
}

async function deleteDirectoryHandle() {
    try {
        console.log('📂 DELETE HANDLE: Attempting to delete directory handle from IndexedDB...');
        const db = await openDB();
        
        // Use proper transaction pattern instead of direct db.delete
        const tx = db.transaction(STORE_NAME_PERSISTENCE, 'readwrite');
        const store = tx.objectStore(STORE_NAME_PERSISTENCE);
        await store.delete(DIR_HANDLE_KEY_PERSISTENCE);
        await tx.done;
        
        console.log('📂 DELETE HANDLE: Successfully deleted directory handle');
        // Clear any in-memory references to the handle
        window.lastUsedDirHandle = null;
        window.directoryPermissionStatus = null;
    } catch (error) {
        console.error('📂 DELETE HANDLE: Error deleting directory handle:', error);
        throw error; // Re-throw to allow caller to handle it
    }
}

// --- XformName mode functions (Phase 1 & 2) ---
function setupNamingMode_PersistenceVersion_UNUSED() {
    const xformNameInput = document.getElementById('xformNameInput');
    const atmButton = document.getElementById('xformNamingModeATM');
    const memButton = document.getElementById('xformNamingModeMEM');
    
    if (!xformNameInput || !atmButton || !memButton) {
        console.error("XformName mode elements not found");
        return;
    }
    
    // If xformName input is currently disabled (controls not available), keep it blank
    if(xformNameInput.disabled){
        xformNameInput.value='';
        return;
    }
    
    console.log("Setting up xformName mode...");
    
    // Ensure ATM button is always enabled and clickable
    if (atmButton.disabled) {
        atmButton.disabled = false;
    }
    // Remove is-disableable class that might prevent clicking
    if (atmButton.classList.contains('is-disableable')) {
        // Keep the class but make sure it doesn't affect functionality
        atmButton.classList.remove('disabled');
    }
    
    const savedMode = localStorage.getItem(XFORM_NAMING_MODE_KEY);
    const savedXformName = localStorage.getItem(XFORM_NAMING_VALUE_KEY);
    window.isXformNamingModeATM = savedMode !== 'MEM';
    
    if (window.isXformNamingModeATM) {
        atmButton.classList.add('active');
        memButton.classList.remove('active');
        xformNameInput.setAttribute('readonly', true);
        updateXformNameWithTime(); // Initial update
        startXformNameTimeUpdates();
    } else {
        memButton.classList.add('active');
        atmButton.classList.remove('active');
        xformNameInput.removeAttribute('readonly');
        xformNameInput.value = savedXformName || updateXformNameWithTime(false); // Set saved or generate once
    }
    
    atmButton.addEventListener('click', () => {
        console.log("ATM button clicked, current mode:", window.isXformNamingModeATM);
        if (!window.isXformNamingModeATM) {
            window.isXformNamingModeATM = true;
            atmButton.classList.add('active');
            memButton.classList.remove('active');
            xformNameInput.setAttribute('readonly', true);
            localStorage.setItem(XFORM_NAMING_MODE_KEY, 'ATM');
            updateXformNameWithTime();
            startXformNameTimeUpdates();
            console.log("Switched to Automated Time Mode");
        }
    });
    
    memButton.addEventListener('click', () => {
        if (window.isXformNamingModeATM) {
            window.isXformNamingModeATM = false;
            memButton.classList.add('active');
            atmButton.classList.remove('active');
            xformNameInput.removeAttribute('readonly');
            localStorage.setItem(XFORM_NAMING_MODE_KEY, 'MEM');
            stopXformNameTimeUpdates();
            xformNameInput.focus();
            console.log("Switched to Manual Edit Mode");
        }
    });
    
    xformNameInput.addEventListener('dblclick', () => {
        if (window.isXformNamingModeATM) {
            memButton.click(); // Simulate click
        }
    });
    
    xformNameInput.addEventListener('change', () => {
        if (!window.isXformNamingModeATM) {
            localStorage.setItem(XFORM_NAMING_VALUE_KEY, xformNameInput.value);
            console.log("Saved manually edited xformName");
        }
    });
}

function startXformNameTimeUpdates() {
    stopXformNameTimeUpdates(); // Clear existing interval
    console.log("Starting automated time updates");
    updateXformNameWithTime(); // Update immediately
    xformNamUpdateInterval = setInterval(updateXformNameWithTime, 1000);
}
window.startXformNameTimeUpdates = startXformNameTimeUpdates; // Expose if needed externally

function stopXformNameTimeUpdates() {
    if (xformNamUpdateInterval) {
        clearInterval(xformNamUpdateInterval);
        xformNamUpdateInterval = null;
        console.log("Stopped automated time updates");
    }
}
window.stopXformNameTimeUpdates = stopXformNameTimeUpdates; // Expose if needed externally

function updateXformNameWithTime(doUpdate = true) {
    const xformNameInput = document.getElementById('xformNameInput');
    if (!xformNameInput) {
        console.error("XformName input element not found");
        return "";
    }
    
    const now = new Date();
    const formattedDate = now.toISOString().slice(0, 10).replace(/-/g, '-');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}:${seconds}`;
    const newXformName = `${formattedDate} ${timeStr}`;

    if (doUpdate) { 
        if (!window.isXformNamingModeATM) {
           // console.log("Not updating time - currently in manual edit mode"); // Reduce console noise
            return xformNameInput.value; // Return current value if in MEM
        }
        xformNameInput.value = newXformName;
        // Update the global currentXFormName directly
        window.currentXFormName = newXformName; 
        localStorage.setItem(XFORM_NAMING_VALUE_KEY, newXformName);
        // console.log("Updated xformName with current time:", newXformName); // Reduce console noise
    } 
    return newXformName; // Return generated xformName even if not updating UI
}
window.updateXformNameWithTime = updateXformNameWithTime; // Expose if needed externally

// Initialize the xformName mode and display
function initializeFilenameDisplay() {
    const xformNameInput = document.getElementById('xformNameInput');
    if (!xformNameInput) {
        console.error("Cannot initialize xformName display - element not found");
        return;
    }
    console.log("Initializing xformName display");
    // Use the setup function to handle initial state and updates
    setupNamingMode(); 
}

// --- X-Form Naming Functions ---
function generateXFormName() {
    const now = new Date();
    const formattedDate = now.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' });
    const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    return `X-Form ${formattedDate} ${formattedTime}`;
}

function sanitizeXFormName(xformName) {
    if (!xformName || typeof xformName !== 'string') return generateXFormName();
    let sanitized = xformName.trim()
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, ' ');
    if (sanitized.length === 0) return generateXFormName();
    // Ensure it starts with X-Form (case-insensitive check, preserve original case if possible)
    if (!/^x-form\s/i.test(sanitized)) {
         sanitized = `X-Form ${sanitized}`;
    }
    return sanitized;
}

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

// --- X-Form File Operations ---
function getCurrentXformName() {
    const xformNameInput = document.getElementById('xformNameInput');
    // If ATM, generate current time xformName, otherwise use input value
    if (window.isXformNamingModeATM) {
        return updateXformNameWithTime(false); // Generate current time xformName without forcing update
    } else if (xformNameInput) {
         return xformNameInput.value || generateXFormName(); // Use manual input or default
    }
    return generateXFormName(); // Fallback
}

// --- State Management Functions ---
function createXFormDataObject() {
    // Assumes global state variables like startRect, endRect, intermediatePoints, etc. are accessible via window
    return {
        xformName: window.currentXFormName || generateXFormName(),
        id: window.currentXFormId || Date.now(),
        timestamp: Date.now(),
        lastModified: Date.now(), // Add lastModified timestamp
        startRect: {
            left: window.startRect ? parseFloat(window.startRect.style.left) || 0 : 78.5, // Provide defaults
            top: window.startRect ? parseFloat(window.startRect.style.top) || 0 : 49.5,
            width: window.widthInput ? parseInt(window.widthInput.value, 10) : 100,
            height: window.heightInput ? parseInt(window.heightInput.value, 10) : 60
        },
        endRect: {
            left: window.endRect ? parseFloat(window.endRect.style.left) || 0 : 250.5,
            top: window.endRect ? parseFloat(window.endRect.style.top) || 0 : 217.5,
            width: window.widthInput ? parseInt(window.widthInput.value, 10) : 100,
            height: window.heightInput ? parseInt(window.heightInput.value, 10) : 60
        },
        waypoints: window.intermediatePoints.map(point => ({ x: point.x, y: point.y })),
        rotations: {
            x: window.xRotationDirection,
            y: window.yRotationDirection,
            z: window.zRotationDirection
        },
        duration: window.durationInput ? parseInt(window.durationInput.value, 10) : 500
    };
}

function applyXFormData(data) {
    if (!data || !window.viewport) return;

    // Update global state
    window.currentXFormName = data.xformName || generateXFormName();
    window.currentXFormId = data.id || Date.now();
    window.currentXFormHasRun = true; 

    if (window.widthInput && data.startRect) window.widthInput.value = data.startRect.width;
    if (window.heightInput && data.startRect) window.heightInput.value = data.startRect.height;
    if (typeof applyRectangleSize === 'function') applyRectangleSize(); // Assumes function exists
    else console.warn('applyRectangleSize function not found during applyXFormData');

    // *** ADDED: Check if rect elements exist before styling ***
    console.log(`applyXFormData: Checking rects before styling. window.startRect: ${window.startRect ? window.startRect.id : 'MISSING'}, window.endRect: ${window.endRect ? window.endRect.id : 'MISSING'}`);
    // *** ADDED: Log the actual elements ***
    console.log("applyXFormData: window.startRect element:", window.startRect);
    console.log("applyXFormData: window.endRect element:", window.endRect);

    // Apply styles DIRECTLY from loaded data
    if (window.startRect && data.startRect) {
        console.log(`applyXFormData: Styling startRect with: L=${data.startRect.left}, T=${data.startRect.top}, W=${data.startRect.width}, H=${data.startRect.height}`); // ADD LOG
        window.startRect.style.left = `${data.startRect.left}px`;
        window.startRect.style.top = `${data.startRect.top}px`;
        // *** ADDED: Set width/height directly from loaded data ***
        window.startRect.style.width = `${data.startRect.width}px`;
        window.startRect.style.height = `${data.startRect.height}px`;
        window.startRect.style.display = 'flex'; // Ensure visible
    }
    if (window.endRect && data.endRect) {
        console.log(`applyXFormData: Styling endRect with: L=${data.endRect.left}, T=${data.endRect.top}, W=${data.startRect.width}, H=${data.startRect.height}`); // ADD LOG (Using startRect W/H)
        window.endRect.style.left = `${data.endRect.left}px`;
        window.endRect.style.top = `${data.endRect.top}px`;
         // *** ADDED: Set width/height directly from loaded data ***
         // Assuming width/height are consistent, use startRect data as canonical
        window.endRect.style.width = `${data.startRect.width}px`; 
        window.endRect.style.height = `${data.startRect.height}px`;
        window.endRect.style.display = 'flex'; // Ensure visible
    }

    // Clear existing visual waypoints
    window.intermediatePoints.forEach(p => p.element && p.element.remove());
    window.intermediatePoints = [];
    
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
                 window.makeDraggableWaypoint(marker, index); // Pass index
            }
        });
    }

    if (data.rotations) {
        window.xRotationDirection = data.rotations.x;
        window.yRotationDirection = data.rotations.y;
        window.zRotationDirection = data.rotations.z;
        if (typeof updateRotationButtonsUI === 'function') updateRotationButtonsUI();
        else console.warn('updateRotationButtonsUI function not found during applyXFormData');
    }

    if (window.durationInput && data.duration) {
        window.durationInput.value = data.duration;
        // Trigger update feedback if setupDurationControl is available
         const durationFeedback = document.getElementById('durationFeedback');
         if(durationFeedback) {
              const seconds = (data.duration / 1000).toFixed(1);
              durationFeedback.textContent = `(${seconds}s)`;
              durationFeedback.style.display = 'inline';
         }
    }

    if (typeof window.updateWaypointCounter === 'function') window.updateWaypointCounter();
    window.lastModifiedPointIndex = window.intermediatePoints.length - 1; // Reset last modified
    
    // Update xformName display
     const xformNameInput = document.getElementById('xformNameInput');
        if (xformNameInput) {
             if (!window.isXformNamingModeATM) {
                 xformNameInput.value = window.currentXFormName; 
             } 
        }

    console.log("Applied X-Form data:", window.currentXFormName);
    return true; // <-- ADDED: Explicitly return true on success
}

// Save current application state to localStorage
window.saveCurrentState = function() {
    try {
        const state = {
            startRect: {
                left: window.startRect ? parseFloat(window.startRect.style.left) || 0 : 78.5,
                top: window.startRect ? parseFloat(window.startRect.style.top) || 0 : 49.5,
                width: window.widthInput ? parseInt(window.widthInput.value, 10) : 100,
                height: window.heightInput ? parseInt(window.heightInput.value, 10) : 60
            },
            endRect: {
                left: window.endRect ? parseFloat(window.endRect.style.left) || 0 : 250.5,
                top: window.endRect ? parseFloat(window.endRect.style.top) || 0 : 217.5,
                width: window.widthInput ? parseInt(window.widthInput.value, 10) : 100,
                height: window.heightInput ? parseInt(window.heightInput.value, 10) : 60
            },
            waypoints: window.intermediatePoints.map(point => ({ x: point.x, y: point.y })),
            rotations: {
                x: window.xRotationDirection,
                y: window.yRotationDirection,
                z: window.zRotationDirection
            },
            duration: window.durationInput ? parseInt(window.durationInput.value, 10) : 500,
            currentXForm: {
                xformName: window.currentXFormName,
                id: window.currentXFormId,
                hasRun: window.currentXFormHasRun
            },
            lastModifiedPointIndex: window.lastModifiedPointIndex,
            theme: document.documentElement.classList.contains('dark-theme') ? 'dark' : 'light'
            // xform-naming-mode: window.isXformNamingModeATM ? 'ATM' : 'MEM', // Save xformName mode
            // xformNameValue: document.getElementById('xformNameInput')?.value // Save manual xformName if MEM
        };
        localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
        // console.log('Current state saved to localStorage'); // Reduce noise
    } catch (error) {
         console.error("Error saving state:", error);
    }
}

// Restore application state from localStorage
function restoreState() {
    const savedState = localStorage.getItem(STATE_STORAGE_KEY);
    if (!savedState) {
        console.log('No saved state found, starting with defaults.');
        // Apply default sizes etc. if needed, potentially call initializeRects? No, that clears waypoints.
        if(window.widthInput) window.widthInput.value = 100;
        if(window.heightInput) window.heightInput.value = 60;
        if(window.durationInput) window.durationInput.value = 500;
        applyRectangleSize(); // Apply default size
        updateRotationButtonsUI(); // Apply default rotations UI
        updateWaypointCounter(); // Set counter to 0
        applyTheme('light'); // Default theme
        return false;
    }
    
    try {
        const state = JSON.parse(savedState);
        console.log('Restoring saved state...');
        
        // Restore theme first to prevent flicker
        if (state.theme) {
            applyTheme(state.theme);
        }
        
        // Restore current X-Form info (before applying positions/waypoints)
        if (state.currentXForm) {
            window.currentXFormName = state.currentXForm.xformName;
            window.currentXFormId = state.currentXForm.id;
            window.currentXFormHasRun = state.currentXForm.hasRun;
        }

        // Restore dimensions FIRST
        if (window.widthInput && state.startRect) window.widthInput.value = state.startRect.width;
        if (window.heightInput && state.startRect) window.heightInput.value = state.startRect.height;
       
        // Restore duration
        if (window.durationInput && state.duration) window.durationInput.value = state.duration;
        // Manually update duration feedback text after restoring value
        const durationFeedback = document.getElementById('durationFeedback');
         if(durationFeedback && window.durationInput) {
              const seconds = (parseInt(window.durationInput.value, 10) / 1000).toFixed(1);
              durationFeedback.textContent = `(${seconds}s)`;
              durationFeedback.style.display = 'inline';
         }

        // Restore rotations
        if (state.rotations) {
            window.xRotationDirection = state.rotations.x;
            window.yRotationDirection = state.rotations.y;
            window.zRotationDirection = state.rotations.z;
            if (typeof updateRotationButtonsUI === 'function') updateRotationButtonsUI();
        }
        
         // Restore last modified point index
         window.lastModifiedPointIndex = state.lastModifiedPointIndex !== undefined ? state.lastModifiedPointIndex : -1;

        // Initialize Rectangles USING restored dimensions, make VISIBLE and mark as LOADING
        if (typeof initializeRects === 'function') {
             initializeRects(true, true); // Creates rects, makes visible, sets isLoading=true

             // Now apply saved POSITIONS to the existing rects
             if (window.startRect && state.startRect) {
                 window.startRect.style.left = `${state.startRect.left}px`;
                 window.startRect.style.top = `${state.startRect.top}px`;
             }
             if (window.endRect && state.endRect) {
                 window.endRect.style.left = `${state.endRect.left}px`;
                 window.endRect.style.top = `${state.endRect.top}px`;
             }
              // REMOVED redundant applyRectangleSize() call

             // Restore waypoints (visuals and data)
             window.intermediatePoints = []; // Ensure it's clear before restoring
             if (window.viewport && state.waypoints && Array.isArray(state.waypoints)) {
                 state.waypoints.forEach((point, index) => {
                     const marker = document.createElement('div');
                     marker.className = 'point-marker';
                     marker.style.left = `${point.x}px`;
                     marker.style.top = `${point.y}px`;
                     window.viewport.appendChild(marker);
                     const pointData = { x: point.x, y: point.y, element: marker };
                     window.intermediatePoints.push(pointData);
                     if (typeof window.makeDraggableWaypoint === 'function') {
                          window.makeDraggableWaypoint(marker, index);
                     }
                 });
             }
        } else {
             console.error("initializeRects function not found during state restore");
        }
        
        // Update waypoint counter after restoring points
        if (typeof window.updateWaypointCounter === 'function') window.updateWaypointCounter();

        // Restore xformName mode and value (handled by setupNamingMode called in main script)
        // if (state.xform-naming-mode) window.isXformNamingModeATM = state.xform-naming-mode === 'ATM';
        // if (state.xformNameValue && !window.isXformNamingModeATM) {
        //     const xformNameInput = document.getElementById('xformNameInput');
        //     if(xformNameInput) xformNameInput.value = state.xformNameValue;
        // }
        // SetupXformNamingMode will handle this based on localStorage
        
        console.log('State successfully restored from localStorage');
        return true;
    } catch (error) {
        console.error('Error restoring state:', error);
        // Attempt to reset to defaults on error?
        if (typeof initializeRects === 'function') initializeRects();
        applyTheme('light');
        return false;
    }
}


// --- Function to apply saved theme ---
function applyTheme(theme) {
    const htmlElement = document.documentElement;
    if (theme === 'dark') {
        htmlElement.classList.add('dark-theme');
    } else {
        htmlElement.classList.remove('dark-theme');
    }
    localStorage.setItem('xformMakerTheme', theme);
    // Update icons 
    updateIconsForTheme(); // Call the update function
}

// NEW or UPDATED function to handle icon source switching
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
    
     // Special handling for icons NOT using data-dark-src (like rotation icons)
     // This logic might need adjustment based on how those are handled.
     // Example for rotation icons (assuming they are background images):
     // document.querySelectorAll('.rot-icon').forEach(icon => {
     //     // Logic to potentially swap background-image url
     // });
}

// --- Update Waypoint Counter UI ---
window.updateWaypointCounter = function() { 
    console.log(`UPDATE_WAYPOINT_COUNTER: Entered.`); // Removed variable log
    console.log("Welcome to the UpdateWaypointCounter function");
    const waypointCounter = window.waypointCounter || document.getElementById('waypointCounter');
    const deleteLastWaypointButton = window.deleteLastWaypointButton || document.getElementById('deleteLastWaypointBtn');
    // const addWaypointButton = // REMOVED
    
    // Exit if we don't have the required elements or intermediatePoints array
    if (!window.intermediatePoints || !waypointCounter || !deleteLastWaypointButton) {
        console.warn("Required elements not found for updateWaypointCounter (waypointCounter, deleteLastWaypointButton)");
        return;
    }
    
    const count = window.intermediatePoints.length;
    console.log(`**** Udating waypoint counter to ${count} ****`);

    // Update counter display
    waypointCounter.textContent = count;
    
    // Update delete button state
    const deleteIsDisabled = count === 0;
    deleteLastWaypointButton.disabled = deleteIsDisabled;
    console.log("deleteLastWaypointButton.disabled:", deleteLastWaypointButton.disabled);

    if (deleteIsDisabled) {
        deleteLastWaypointButton.style.pointerEvents = 'none';
        deleteLastWaypointButton.style.opacity = '0.5';
        deleteLastWaypointButton.style.cursor = 'not-allowed';
    } else {
        deleteLastWaypointButton.style.pointerEvents = 'auto';
        deleteLastWaypointButton.style.opacity = '1';
        deleteLastWaypointButton.style.cursor = 'pointer';
    }
    
    // REMOVED Add button logic
    /*
    const addButton = window.addWaypointButton || document.getElementById('addWaypointBtn'); 
    if (addButton) { ... }
    */
    
    console.log('---- Leaving updateWaypointCounter ----');
}

// --- Make Waypoint Draggable (Needed by restoreState/applyXFormData) ---
window.makeDraggableWaypoint = function(element) { // index inferred at mousedown
    let isDragging = false;
    if(!window.viewport) return;

    element.addEventListener('mousedown', (e) => {
        console.log(`%cmakeDraggableWaypoint: MOUSE DOWN on marker element`, 'color: purple; font-weight: bold;');
        // Determine current index of this element in the points array
        const idx = window.intermediatePoints.findIndex(p => p.element === element);
        console.log(`makeDraggableWaypoint: Found index: ${idx}`); // Log index
        if (idx === -1) {
            console.warn('Waypoint element not found in intermediatePoints');
            return;
        }
        isDragging = true; // This variable seems unused as mousemove/up are global now?
        window.draggingPointIndex = idx;
        window.lastModifiedPointIndex = idx; // Use window scope
        window.wasDraggingPoint = false; // Use window scope & Reset flag
        console.log(`makeDraggableWaypoint: Set draggingPointIndex=${idx}, wasDraggingPoint=false`);

        const vpRect = window.viewport.getBoundingClientRect();
        // Assign to global offset vars based on current point coords
        if(window.intermediatePoints[idx]) {
           window.dragOffsetX = e.clientX - (vpRect.left + window.intermediatePoints[idx].x); 
           window.dragOffsetY = e.clientY - (vpRect.top + window.intermediatePoints[idx].y);
        } else {
            // Fallback if point data isn't ready?
             window.dragOffsetX = e.clientX - vpRect.left - parseFloat(element.style.left || 0);
             window.dragOffsetY = e.clientY - vpRect.top - parseFloat(element.style.top || 0);
        }

        // Select this point visually
        document.querySelectorAll('.point-marker.selected').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');

        window.selectedPointIndex = idx; // Use window scope
        e.stopPropagation();
        e.preventDefault();
    });
    // Note: mousemove and mouseup listeners are handled globally (in controls module?)
};

// --- Setup State Persistence Listeners ---
function setupStatePersistence() {
    // ... (Keep existing listeners for theme, rename if needed) ...
    console.log('State persistence hooks set up.');
}

// Helper function to save the current X-Form state to LocalStorage
// (Used by the Save button)
function saveCurrentXFormToStorage() {
    if (!window.currentXFormId) { 
        window.currentXFormId = Date.now(); // Assign ID if new
    }
    // Use current xformName from input/ATM mode
    window.currentXFormName = getCurrentXformName(); 

    const xformData = createXFormDataObject(); // Get current state

    const xforms = window.getSavedXForms();
    const existingIndex = xforms.findIndex(t => t.id === window.currentXFormId);

    if (existingIndex >= 0) {
        console.log("Updating existing X-Form in LocalStorage:", window.currentXFormId);
        xforms[existingIndex] = xformData;
    } else {
        console.log("Adding new X-Form to LocalStorage:", window.currentXFormId);
        xforms.push(xformData);
    }
    
    window.saveXForms(xforms); // Save the updated array
    window.renderSavedList(); // Refresh the list
    showInfoDialog("X-Form saved to LocalStorage.");
    return xformData; // Return data just in case
}

// === Generic Modal Dialog Helper ===
// usage: const choice = await showModalDialog({ message:"…", buttons:[{id:'yes', label:'Yes', class:'primary'}] });
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

// NEW function containing the core file writing logic
// Renamed and modified to accept fileHandle from picker
async function _writeDataToHandle(fileHandle, xformData) { // fileHandle has the potentially numbered xformName
    try {
        if (!fileHandle) {
            throw new Error("Invalid file handle received for writing.");
        }

        // Update the lastModified timestamp before saving
        xformData.lastModified = Date.now();

        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(xformData, null, 2)); // xformData still has original xformName
        await writable.close();

        console.log(`X-Form data (xformName: ${xformData.xformName}) saved to file: ${fileHandle.xformName}`);
        await showInfoDialog(`X-Form exported successfully as ${fileHandle.xformName}!`);

        // *** UPDATE global xformName state AFTER successful save ***
        // Use the actual xformName used for saving (potentially numbered)
        window.currentXFormName = fileHandle.xformName.replace(/_xform\.json$/, ''); 
        // Update the main input display if in manual mode
        const xformNameInput = document.getElementById('xformNameInput');
        if (xformNameInput && !window.isXformNamingModeATM) {
             xformNameInput.value = window.currentXFormName; 
             localStorage.setItem(XFORM_NAMING_VALUE_KEY, xformNameInput.value); // Persist manual xformName change
        } else if (xformNameInput && window.isXformNamingModeATM) {
             // If ATM, we might just want to update the display with the time again?
             // Or leave it showing the saved file xformName? For now, leave it.
        }

        // Refresh file list (assuming lastUsedDirHandle is still valid)
        if (window.lastUsedDirHandle) { 
            await listFiles(window.lastUsedDirHandle); 
        }
        return true;

    } catch (error) {
        console.error('Error during file write:', error);
        if (error.xformName !== 'AbortError') {
            await showInfoDialog(`Error writing file: ${error.message || 'Operation failed'}`);
        }
        return false;
    }
}

// Utility to enable/disable xformName mode controls
function toggleFilenameControls(enable){
    const fieldset = document.querySelector('.persistence-fieldset');
    if(!fieldset) return;
    
    console.log(`Toggling XformName Controls: ${enable ? 'Enable' : 'Disable'}`);
    
    // Select ALL elements that can be disabled/hidden within this fieldset
    const disableableElements = fieldset.querySelectorAll('.is-disableable');
    const hideableElements = fieldset.querySelectorAll('.is-hideable');
    
    disableableElements.forEach(el => {
        // ALWAYS KEEP ATM/MEM buttons clickable unless explicitly disabled elsewhere
        if (el.id === 'xformNamingModeATM' || el.id === 'xformNamingModeMEM') {
            // el.disabled = false; // Keep them enabled by default
        } else if (el.id === 'xformNameInput') {
            // Handle input field specifically
            el.disabled = !enable;
            el.readOnly = !enable; // Typically enable editing when controls are enabled
            if (!enable) el.value = ''; // Clear value when disabled
        } else if (el.id === 'saveXformButton') {
            // Save button is handled by updateSaveButtonState, don't disable here
            // el.disabled = !enable;
        } else {
            // Disable other generic disableable elements if needed
             el.disabled = !enable;
        }
        
        // Remove active class if disabling
        if(!enable) el.classList.remove('active');
    });
    
    // Toggle visibility for hideable elements
    hideableElements.forEach(el => {
        el.hidden = !enable;
    });
    
    // Stop timer if disabling controls
    if(!enable && typeof stopXformNameTimeUpdates === 'function'){
        stopXformNameTimeUpdates();
    } 
    // We don't automatically restart the timer here - setupNamingMode handles that
}

// Expose the utility function if needed elsewhere (optional)
window.toggleFilenameControls = toggleFilenameControls;

// --- Initial Setup Function (called from main script) ---
async function setupPersistence() { 
    console.log('📂 SETUP PERSISTENCE: Starting setup process');
    
    // Global variable to track if we have a permission request in progress
    window.pendingPermissionRequest = false;

    const folderTextElement = document.getElementById('selected-folder-text');
    const folderButton = document.getElementById('folder-button');
    
    // Always make the folder button visible and clickable
    if (folderButton) {
        folderButton.style.display = 'flex';
        folderButton.disabled = false;
    }
    
    try {
        // Try to load the saved directory handle
        const savedDirHandle = await loadDirectoryHandle();
        
        if (savedDirHandle) {
            console.log(`📂 SETUP PERSISTENCE: Found saved directory handle for: ${savedDirHandle.xformName}`);
            window.lastUsedDirHandle = savedDirHandle;
            
            // Check current permission status without prompting
            const permissionStatus = await savedDirHandle.queryPermission({ mode: 'readwrite' });
            console.log(`📂 SETUP PERSISTENCE: Current permission status: ${permissionStatus}`);
            
            if (permissionStatus === 'granted') {
                console.log('📂 SETUP PERSISTENCE: ✅ Permission already granted for storage directory');
                if (folderTextElement) {
                    folderTextElement.textContent = `Currently using: ${savedDirHandle.xformName}`;
                    folderTextElement.title = `Click to change from ${savedDirHandle.xformName}`;
                }
                
                // Try to list files to verify the handle is working
                try {
                    await listAvailableFiles();
                    console.log('📂 SETUP PERSISTENCE: ✅ Successfully listed files from saved directory');
        } catch (listError) {
                    console.error('📂 SETUP PERSISTENCE: ❌ Error listing files from saved directory:', listError);
                    if (folderTextElement) {
                        folderTextElement.textContent = 'Error accessing storage folder. Click to select.';
                    }
                    if (folderButton) {
                        folderButton.classList.add('error-state');
                    }
                    // Still show the list with the change folder option
                    await listFiles(null);
        }
    } else {
                console.log('📂 SETUP PERSISTENCE: Permission not granted, updating UI and preparing to request');
                if (folderTextElement) {
                    folderTextElement.textContent = 'Click to grant access to storage folder';
                }
                
                // Update UI to indicate permission is needed
                if (folderButton) {
                    folderButton.classList.add('needs-permission');
                }
                
                // Show the file list with the change folder option
                await listFiles(null);
                
                // Wait a moment and then request permission to ensure the user sees the notification
                setTimeout(async () => {
                    if (!window.pendingPermissionRequest) {
                        window.pendingPermissionRequest = true;
                        
                        try {
                            console.log('📂 SETUP PERSISTENCE: Requesting permission explicitly...');
                            if (folderTextElement) {
                                folderTextElement.textContent = 'Permission popup shown - please allow access';
                            }
                            
                            // Request with both 'readwrite' mode and persist: true flag for maximum persistence
                            const newPermission = await savedDirHandle.requestPermission({ 
                                mode: 'readwrite'
                            });
                            console.log(`📂 SETUP PERSISTENCE: New permission status after request: ${newPermission}`);
                            
                            // If permission granted, try to make it persistent through browser API if available
                            if (newPermission === 'granted' && 'permissions' in navigator) {
                                try {
                                    console.log('📂 SETUP PERSISTENCE: Attempting to make permission persistent...');
                                    // Re-save the handle to ensure the permission change is captured
                                    await saveDirectoryHandle(savedDirHandle);
                                } catch (persistError) {
                                    console.warn('📂 SETUP PERSISTENCE: Error making permission persistent:', persistError);
                                    // Continue anyway since we at least have temporary permission
                                }
                            }
                            
                            if (newPermission === 'granted') {
                                console.log('📂 SETUP PERSISTENCE: ✅ Permission explicitly granted');
                                if (folderTextElement) {
                                    folderTextElement.textContent = `Currently using: ${savedDirHandle.xformName}`;
                                    folderTextElement.title = `Click to change from ${savedDirHandle.xformName}`;
                                }
                                if (folderButton) {
                                    folderButton.classList.remove('needs-permission');
                                }
                                
                                // Try to list files now that we have permission
                                await listAvailableFiles();
            } else {
                                console.warn('📂 SETUP PERSISTENCE: ⚠️ Permission denied or dismissed');
                                if (folderTextElement) {
                                    folderTextElement.textContent = 'Permission denied. Click to select folder.';
                                }
                                if (folderButton) {
                                    folderButton.classList.add('error-state');
                                }
                                // Make sure the file list is still showing the change folder option
                                await listFiles(null);
                            }
                        } catch (permError) {
                            console.error('📂 SETUP PERSISTENCE: Error requesting permission:', permError);
                            if (folderTextElement) {
                                folderTextElement.textContent = 'Error requesting permission. Click to select folder.';
                            }
                            if (folderButton) {
                                folderButton.classList.add('error-state');
                            }
                            // Make sure the file list is still showing the change folder option
                            await listFiles(null);
                        } finally {
                            window.pendingPermissionRequest = false;
                            if (folderButton) {
                                folderButton.classList.remove('needs-permission');
                            }
                        }
                    }
                }, 1000); // Give user a chance to see the UI update before permission popup
            }
        } else {
            console.log('📂 SETUP PERSISTENCE: No saved directory handle, waiting for user selection');
            if (folderTextElement) {
                folderTextElement.textContent = 'Click to select storage folder';
            }
            // Make sure the file list is available for selection
            await listFiles(null);
        }
    } catch (error) {
        console.error('📂 SETUP PERSISTENCE: Error in setupPersistence:', error);
        
        // If there's an unrecoverable error, reset the directory handle
        window.lastUsedDirHandle = null;
        await deleteStoredDirectoryHandle();
        
        if (folderTextElement) {
            folderTextElement.textContent = 'Error with storage access. Click to select folder.';
        }
        if (folderButton) {
            folderButton.classList.add('error-state');
        }
        
        // Make sure the file list is still showing the change folder option
        await listFiles(null);
    }
}

// --- NEW File System Functions ---
async function selectDirectoryAndListFiles(isLineItem=false) {
    try {
        if (isLineItem) {
            console.log("selectDirectoryAndListFiles called from line item");
        }
        
        console.log("Opening directory picker dialog...");
        const options = {
            id: 'xformMakerStorageFolder', // Use a consistent ID for the picker
            mode: 'readwrite',
            startIn: 'documents' // Start in documents folder to make it easier to find
        };
        
        const dirHandle = await window.showDirectoryPicker(options);
        console.log(`User selected directory: "${dirHandle.xformName}"`);
        
        if (dirHandle.xformName !== 'storage') {
            console.warn(`⚠️ Selected directory xformName "${dirHandle.xformName}" does not match required "storage"`);
            await showInfoDialog(`Please select a folder named exactly "storage" for consistent storage.`);
            return false;
        }
        
        // Verify we can actually read from this directory
        try {
            console.log("Testing access to selected directory...");
            // Try to list the directory to confirm we have access
            let fileCount = 0;
            for await (const entry of dirHandle.values()) {
                fileCount++;
                if (fileCount >= 5) break; // Just check a few files
            }
            console.log(`✅ Successfully accessed directory, found ${fileCount} entries`);
        } catch (accessErr) {
            console.error("❌ Error accessing directory contents:", accessErr);
            await showInfoDialog(`Error accessing the selected directory: ${accessErr.message}`);
            return false;
        }
        
        // Save the handle only after confirming access
        window.lastUsedDirHandle = dirHandle; 
        console.log("Saving directory handle to IndexedDB...");
        await saveDirectoryHandle(dirHandle); 
        
        // Update folder display UI
        const folderDisplay = document.getElementById('currentFolderDisplay');
        if (folderDisplay) {
            folderDisplay.textContent = dirHandle.xformName;
            folderDisplay.title = dirHandle.xformName;
            folderDisplay.classList.add('folder-selected');
            folderDisplay.classList.remove('folder-needs-permission');
            folderDisplay.style.cursor = 'default';
        }
        
        // Update the folder button state
        const folderButton = document.getElementById('folder-button');
        if (folderButton) {
            folderButton.classList.remove('needs-permission');
            folderButton.classList.remove('error-state');
        }
        
        // Update the selected-folder-text element as well
        const folderTextElement = document.getElementById('selected-folder-text');
        if (folderTextElement) {
            folderTextElement.textContent = `Currently using: ${dirHandle.xformName}`;
            folderTextElement.title = `Click to change from ${dirHandle.xformName}`;
        }
        
        console.log("Listing files in selected directory...");
        await listFiles(dirHandle); 
        
        // Enable xformName controls now that we have a directory
        toggleFilenameControls(true);
        
        // Restore state to ATM mode if it was disabled
        if (window.isXformNamingModeATM) {
            startXformNameTimeUpdates();
        }
        
        return true; // Indicate success
    } catch (err) {
        if (err.xformName === 'AbortError') {
            console.log("User canceled directory selection");
        } else {
            console.error("Error selecting directory:", err);
            await showInfoDialog(`Error selecting directory: ${err.message}`);
        }
        
        // Make sure the UI shows the error state
        const folderButton = document.getElementById('folder-button');
        if (folderButton) {
            folderButton.classList.add('error-state');
        }
        
        // Ensure file list shows the change folder option
        await listFiles(null);
        
        return false;
    }
}

async function listFiles(dirHandle) {
    const xformsListUl = document.getElementById('savedXformsList'); // Use correct ID
    const sortXformsBtn = document.getElementById('sortXformsBtn'); // capture once
    const saveBtn = document.getElementById('saveXformButton');

    selectedXformListItem = null;
    selectedXformName = null;

    if (!xformsListUl) {
        console.error("File list UL element ('savedXformsList') not found.");
        return;
    }

    if (!dirHandle) {
        console.log("listFiles: No directory handle provided. Showing 'Select Folder' prompt.");
        // Clear the entire list first
        xformsListUl.innerHTML = '';

        // Add only the change folder prompt
        const promptLi = document.createElement('li');
        promptLi.id = 'changeFolderLineItem';
        promptLi.className = 'folder-prompt';
        promptLi.innerHTML = `
            <span class="folder-prompt-text">Select the 'storage' folder first:</span>
            <button class="change-folder-icon-btn">📁</button>
        `;
        xformsListUl.appendChild(promptLi);

        // Attach click listener to the button within the prompt
        const promptButton = promptLi.querySelector('.change-folder-icon-btn');
        if (promptButton) {
            promptButton.addEventListener('click', () => selectDirectoryAndListFiles(true));
        } else {
             // Fallback: attach to LI if button selector fails unexpectedly
             promptLi.addEventListener('click', () => selectDirectoryAndListFiles(true));
        }

        if (saveBtn) saveBtn.disabled = true; // Disable save when no folder
        toggleFilenameControls(false); // Disable xformName input/buttons
        if (sortXformsBtn) sortXformsBtn.style.display = 'none'; // Hide sort button
        return; // Stop further processing
    }

    console.log(`listFiles: Valid directory handle provided (${dirHandle.xformName}). Listing files.`);
    if (saveBtn) saveBtn.disabled = false; // Enable save button
    toggleFilenameControls(true); // Enable xformName input/buttons

    // Clear the list (removes any previous prompt or loading message)
    xformsListUl.innerHTML = '';

    // Add "Loading" message
    const loadingLi = document.createElement('li');
    loadingLi.textContent = 'Loading files...';
    xformsListUl.appendChild(loadingLi);

    // Show sort button initially (will be hidden if < 2 files)
    if (sortXformsBtn) sortXformsBtn.style.display = 'flex'; // Show sort button by default when listing

    try {
        const fileEntries = [];
        
        // First, collect all file entries
        for await (const entry of dirHandle.values()) {
            if ((entry != null) && 
                (entry.file != null) && 
                (entry.kind === 'file') && 
                entry.file.endsWith('_xform.json')) {
                try {
                    // Get file information
                    const fileHandle = await dirHandle.getFileHandle(entry.xformName);
                    const fileObj = await fileHandle.getFile();
                    
                    // Try to read the file content to get lastModified from our JSON
                    let xformData = null;
                    let lastModified = fileObj.lastModified; // Default to file system lastModified
                    
                    try {
                        const content = await fileObj.text();
                        xformData = JSON.parse(content);
                        
                        // Use our stored lastModified if available, otherwise use file system timestamp
                        if (xformData && xformData.lastModified) {
                            lastModified = xformData.lastModified;
                        }
                    } catch (jsonError) {
                        console.warn(`Could not parse JSON from ${entry.xformName}:`, jsonError);
                        // Continue using the file system lastModified
                    }
                    
                    fileEntries.push({
                        xformName: entry.xformName,
                        lastModified: lastModified
                    });
                } catch (fileError) {
                    console.warn(`Error processing file ${entry.xformName}:`, fileError);
                    // Add file with unknown lastModified
                    fileEntries.push({
                        xformName: entry.xformName,
                        lastModified: 0
                    });
                }
            }
        }
        
        // Clear all items except the first "Change Folder" option
        xformsListUl.innerHTML = xformsListUl.firstElementChild.outerHTML;
        
        if (fileEntries.length === 0) {
            xformsListUl.innerHTML += '<li>No X-Forms found in storage folder.</li>';
            if (sortXformsBtn) sortXformsBtn.style.display = 'none';
            if (saveBtn) saveBtn.disabled = false; // still allow saving new files even if none exist
            return;
        }

        // Update sort button visibility based on count
        if (sortXformsBtn) {
            sortXformsBtn.style.display = fileEntries.length < 2 ? 'none' : 'flex';
             // Ensure sort button is properly hideable/disableable if needed
             sortXformsBtn.classList.add('is-hideable'); 
        }

        // Apply initial alphabetical sort
        fileEntries.sort((a, b) => a.xformName.localeCompare(b.xformName, undefined, {numeric: true, sensitivity: 'base'}));

        fileEntries.forEach(fileEntry => {
            const li = document.createElement('li');
            li.className = 'xform-list-item';
            li.dataset.xformName = fileEntry.xformName;
            li.dataset.lastModified = fileEntry.lastModified; // Store lastModified as data attribute
            
            // Create xformName column
            const nameSpan = document.createElement('span');
            nameSpan.className = 'xform-name-column';
            nameSpan.textContent = fileEntry.xformName.replace(/_xform\.json$/, ''); // Show base xformName
            nameSpan.title = fileEntry.xformName;
            
            // Create date column
            const dateSpan = document.createElement('span');
            dateSpan.className = 'xform-date-column';
            const dateObj = new Date(parseInt(fileEntry.lastModified, 10));
            const dateFormatted = dateObj.toLocaleDateString() + ' ' + 
                                  dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            dateSpan.textContent = dateFormatted;
            dateSpan.title = `Last modified: ${dateObj.toLocaleString()}`;
            
            // Add columns in the correct order based on current sort mode
            const isDateSortMode = window.fileListSortMode >= 2;
            if (isDateSortMode) {
                // Date first in date sort mode
                li.appendChild(dateSpan);
            li.appendChild(nameSpan);
            } else {
                // Name first in xformName sort mode
                li.appendChild(nameSpan);
                li.appendChild(dateSpan);
            }

            // Add delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-xform-btn';
            deleteBtn.innerHTML = '&times;'; 
            deleteBtn.title = `Delete ${fileEntry.xformName}`;
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                deleteFile(fileEntry.xformName); // Call delete function
            });
            li.appendChild(deleteBtn);

            // Simplified click handler: only one item can be selected at any time.
            li.addEventListener('click', () => {
                const alreadySelected = li.classList.contains('selected');
                const xformId = li.dataset.xformName; // *** GET THE ID FROM THE CORRECT DATA ATTRIBUTE ***
                // Assuming the ID is stored in 'data-xform-id' based on renderXFormList
                const correctXFormId = li.dataset.xformId; 

                // --- Debugging log ---
                console.log(`List item clicked. Already selected: ${alreadySelected}, XformName (from data-xformName): ${xformId}, Correct ID (from data-xform-id): ${correctXFormId}`);
                
                if (!correctXFormId) {
                    console.error("Could not find xformId on clicked list item!", li);
                    return; // Don't proceed without an ID
                }

                // Clear selection classes from all items first
                document.querySelectorAll('#savedXformsList li.xform-list-item').forEach(el => {
                    el.classList.remove('selected');
                });

                if (alreadySelected) {
                    // If the user clicked the same selected item again → load it FROM DB
                    console.log(`Attempting to load XForm from DB with ID: ${correctXFormId}`);
                    if (typeof window.loadXFormFromDB === 'function') {
                        window.loadXFormFromDB(correctXFormId); // *** CALL DB LOAD FUNCTION ***
                    } else {
                        console.error("loadXFormFromDB function not found!");
                        showInfoDialog("Internal Error: Cannot load selected X-Form.");
                    }
                } else {
                    // Otherwise, simply select this one (blue)
                    console.log(`Selecting item with ID: ${correctXFormId}`);
                    li.classList.add('selected');
                }

                // Maintain a single-element list of selected xforms for any other code
                // ** NOTE: This logic might need adjustment if selection is handled elsewhere (e.g., window.selectedXforms) **
                selectedXformListItem = li.classList.contains('selected') ? li : null;
            });
            xformsListUl.appendChild(li);
        });

    } catch (err) {
        console.error("Error listing files:", err);
        // Clear list and show error message
        xformsListUl.innerHTML = '<li>Error reading directory contents.</li>';

        if (err.xformName === 'NotAllowedError') {
             window.lastUsedDirHandle = null;
             await deleteStoredDirectoryHandle(); // Remove bad handle from DB
             await showInfoDialog("Permission denied for storage folder. Please re-select it.");
             // Show the select prompt again
             await listFiles(null); // Call itself with null handle to show prompt
             if (saveBtn) saveBtn.disabled = true;
        } else {
            // For other errors, still show the select prompt
             await listFiles(null); // Call itself with null handle to show prompt
        }
        if (sortXformsBtn) sortXformsBtn.style.display = 'none';
    }
}

async function loadFile(xformName) {
     if (!window.lastUsedDirHandle) {
        await showInfoDialog("Please select the storage folder first.");
        return;
    }
    console.log(`Attempting to load: ${xformName}`);
    let fileHandle = null;
    let contents = null;  
    try {
        fileHandle = await window.lastUsedDirHandle.getFileHandle(xformName);
        const file = await fileHandle.getFile();
        contents = await file.text();
        const xformData = JSON.parse(contents);
       
        applyXFormData(xformData); // Apply the data first
        console.log(`X-Form loaded successfully from file: ${xformName}`);
       
        // --- UPDATE Name Logic --- 
        // Set current xformName state based on the ACTUAL xformName loaded, including _(N) suffix
        window.currentXFormName = xformName.replace(/_xform\.json$/, ''); 
        window.currentXFormId = xformData.id || Date.now(); 
        window.currentXFormHasRun = true; 
       
        // Always Update main xformName input display to reflect loaded file
        const xformNameInput = document.getElementById('xformNameInput');
        if (xformNameInput) {
            xformNameInput.value = window.currentXFormName; 
             // Switch to Manual mode automatically upon file selection
             const atmBtn = document.getElementById('xformNamingModeATM');
             const memBtn = document.getElementById('xformNamingModeMEM');
             window.isXformNamingModeATM = false;
             
             // Make sure the ATM button is not disabled
             if (atmBtn) {
                 atmBtn.classList.remove('active');
                 atmBtn.disabled = false; // Ensure it's not disabled
                 atmBtn.classList.remove('disabled'); // Also remove disabled class if present
             }
             if (memBtn) {
                 memBtn.classList.add('active');
             }
             
             stopXformNameTimeUpdates();
             xformNameInput.removeAttribute('readonly');
             localStorage.setItem(XFORM_NAMING_MODE_KEY, 'MEM');
             localStorage.setItem(XFORM_NAMING_VALUE_KEY, xformNameInput.value);
        }
        
        // Update visual selection in the list
        // First clear all selections
        document.querySelectorAll('#savedXformsList li.xform-list-item').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Then find and highlight the loaded file
        const fileElement = document.querySelector(`#savedXformsList li[data-xformName="${xformName}"]`);
        if (fileElement) {
            fileElement.classList.add('selected');
            // Update the global selected item reference
            selectedXformListItem = fileElement;
        }
        
        // Call setupNamingMode to reinitialize the button event handlers if needed
        // Comment out redundant call
        // setupNamingMode();

    } catch (err) {
        console.error(`Error processing file ${xformName}:`, err); 
        await showInfoDialog(`Could not load or process file: ${xformName}\nReason: ${err.xformName} - ${err.message}\nIt might be corrupted, moved, or permissions may have changed.`);

        // Attempt to move the file to an 'errors' folder IF we had a handle 
        // ... rest of catch block
    }
}

// Lightweight convenience wrapper for simple OK dialogs
function showInfoDialog(message, btnLabel = 'OK') {
    return showModalDialog({ message, buttons: [{ id: 'ok', label: btnLabel, class: 'primary' }] });
}

// === Delete file helper ===
async function deleteFile(xformName) {
    if (!window.lastUsedDirHandle) {
        await showInfoDialog('Please select the storage folder first.');
        return;
    }
    const choice = await showModalDialog({
        message: `Delete "${xformName}"? This cannot be undone.`,
        buttons: [
            { id: 'delete', label: 'Delete', class: 'danger' },
            { id: 'cancel', label: 'Cancel', class: 'secondary' }
        ]
    });
    if (choice !== 'delete') return;
    
    try {
        // Find the current file element in the list
        const xformsListUl = document.getElementById('savedXformsList');
        const currentFileElement = document.querySelector(`#savedXformsList li[data-xformName="${xformName}"]`);
        let nextFileToSelect = null;
        
        // Determine the next file to select before deleting this one
        if (currentFileElement) {
            // Get all file items to check position and count
            const allFileItems = xformsListUl.querySelectorAll('li.xform-list-item');
            const isLastItem = currentFileElement === allFileItems[allFileItems.length - 1];
            
            if (isLastItem && allFileItems.length > 1) {
                // If this is the last item in the list and there are other items,
                // select the first item in the list
                nextFileToSelect = allFileItems[0];
            } else {
                // Otherwise try to get the next sibling first, if not available, try the previous sibling
                nextFileToSelect = currentFileElement.nextElementSibling;
                if (!nextFileToSelect || !nextFileToSelect.classList.contains('xform-list-item')) {
                    nextFileToSelect = currentFileElement.previousElementSibling;
                    if (!nextFileToSelect || !nextFileToSelect.classList.contains('xform-list-item')) {
                        nextFileToSelect = null;
                    }
                }
            }
        }

        // Delete the file
        await window.lastUsedDirHandle.removeEntry(xformName);
        console.log('Deleted file:', xformName);
        
        // Refresh the file list
        await listFiles(window.lastUsedDirHandle);
        
        // If we found a next file to select, select and load it
        if (nextFileToSelect && nextFileToSelect.dataset.xformName) {
            // Find the same file in the refreshed list
            const newFileElement = document.querySelector(`#savedXformsList li[data-xformName="${nextFileToSelect.dataset.xformName}"]`);
            if (newFileElement) {
                // Simulate a click on the new file element to select it
                newFileElement.click();
                // Load the file
                loadFile(nextFileToSelect.dataset.xformName);
                
                // Scroll the newly selected item into view
                setTimeout(() => {
                    newFileElement.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'nearest' 
                    });
                }, 100); // Small delay to ensure DOM is updated
            }
        }
        
        await showInfoDialog('File deleted.');
    } catch (err) {
        console.error('Failed to delete file:', err);
        await showInfoDialog(`Could not delete file: ${err.message}`);
    }
}

// Add the verifyPermission function
async function verifyPermission(fileHandle, readWrite) {
    const options = {};
    if (readWrite) {
        options.mode = 'readwrite';
    }
    // Check if permission was already granted
    if ((await fileHandle.queryPermission(options)) === 'granted') {
        return true;
    }
    // Request permission if it wasn't granted yet
    if ((await fileHandle.requestPermission(options)) === 'granted') {
        return true;
    }
    // Permission denied
    return false;
}

// Add setupUI function
function setupUI() {
    console.log('Setting up UI components...');
    // Set up folder selection button
    const folderButton = document.getElementById('folder-button');
    if (folderButton) {
        folderButton.addEventListener('click', () => {
            selectDirectoryAndListFiles();
        });
    }
    
    // Other UI initialization can go here
    console.log('UI setup complete');
}

// Make it available globally
window.setupUI = setupUI;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM fully loaded, initializing X-Form Maker...');
    
    // Initialize UI elements
    setupUI();
    
    // Setup persistence immediately
    setupPersistence();
    
    // Set up a permission check 2 seconds after page load
    // This helps catch permission issues that might happen after initial setup
    setTimeout(async () => {
        console.log('📂 PERMISSION CHECK: Running delayed permission verification');
        if (window.lastUsedDirHandle) {
            try {
                const permissionStatus = await window.lastUsedDirHandle.queryPermission({ mode: 'readwrite' });
                console.log(`📂 PERMISSION CHECK: Status after 2 seconds: ${permissionStatus}`);
                
                // If permission is not granted, update UI to reflect this
                if (permissionStatus !== 'granted') {
                    console.warn('📂 PERMISSION CHECK: Permission lost or not granted after initial setup');
                    const folderTextElement = document.getElementById('selected-folder-text');
                    if (folderTextElement) {
                        folderTextElement.textContent = 'Click to re-grant access to storage folder';
                        
                        // Add visual indicator that permission is needed
                        const folderButton = document.getElementById('folder-button');
                        if (folderButton) {
                            folderButton.classList.add('needs-permission');
                        }
                    }
                }
            } catch (err) {
                console.error('📂 PERMISSION CHECK: Error verifying permissions after delay:', err);
            }
        } else {
            console.log('📂 PERMISSION CHECK: No directory handle available for delayed check');
        }
    }, 2000);
    
    // Additional setup for the rest of the application
    // setupNamingMode();
    applyThemeFromLocalStorage();
    setupCreateXFormListener();
});

// Replace the export statement with window assignments for global access
window.setupPersistence = setupPersistence;
window.loadDirectoryHandle = loadDirectoryHandle;
window.saveDirectoryHandle = saveDirectoryHandle;
window.deleteDirectoryHandle = deleteDirectoryHandle;
window.verifyPermission = verifyPermission;
window.getSelectedFileName = getSelectedFileName;
window.getSelectedTransformType = getSelectedTransformType;
window.saveSelectedFileName = saveSelectedFileName;
window.saveSelectedTransformType = saveSelectedTransformType;

// Add missing functions for xformName and transform type persistence
function getSelectedFileName() {
    return localStorage.getItem(XFORM_NAMING_VALUE_KEY) || '';
}

function getSelectedTransformType() {
    return localStorage.getItem('xformMaker_selectedTransformType') || 'linear';
}

function saveSelectedFileName(xformName) {
    localStorage.setItem(XFORM_NAMING_VALUE_KEY, xformName);
}

function saveSelectedTransformType(type) {
    localStorage.setItem('xformMaker_selectedTransformType', type);
}

// Make applyTheme available globally
window.applyTheme = applyTheme;

// Add applyThemeFromLocalStorage function
function applyThemeFromLocalStorage() {
    const savedTheme = localStorage.getItem('xformMakerTheme') || 'light';
    applyTheme(savedTheme);
    // Comment out redundant call
    // setupNamingMode(); 
}

// Make it available globally
window.applyThemeFromLocalStorage = applyThemeFromLocalStorage;

// Add listAvailableFiles function
async function listAvailableFiles() {
    if (window.lastUsedDirHandle) {
        return await listFiles(window.lastUsedDirHandle);
    } else {
        console.log('No directory handle available to list files');
        return false;
    }
}

// Make it available globally
window.listAvailableFiles = listAvailableFiles;

// Add setupCreateXFormListener function
function setupCreateXFormListener() {
    // This function can be a placeholder or handle form creation events
    console.log('Form creation listener set up');
}

// Make it available globally
window.setupCreateXFormListener = setupCreateXFormListener;

window.xformNamUpdateInterval = xformNamUpdateInterval;

// === Export Functionality ===

/**
 * Main function to handle exporting ALL X-Forms to a single JSONL file.
 */
async function handleExportXForms() {
    console.log("Export All (JSONL) button clicked.");

    // Check if directory handle exists
    if (!window.lastUsedDirHandle) {
        // ... (handle missing directory unchanged) ...
        return;
    }

    // 1. Get ALL X-Form data 
    let allForms = [];
    if (typeof window.getAllXForms !== 'function') { 
        // ... (handle missing getAllXForms function unchanged) ...
        return;
    } 
    try {
        allForms = await window.getAllXForms(); 
        console.log(`Retrieved ${allForms.length} X-Forms from DB.`);
    } catch (err) {
        // ... (handle DB retrieval error unchanged) ...
        return;
    }
    
    if (!allForms || allForms.length === 0) {
        window.showModalDialog({ title: "Export", message: "No X-Forms found in the database to export." });
        return;
    }

    // 2. Prepare JSONL data string (This part simulates the loop for status reporting)
    let jsonlLines = [];
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const failedExports = []; // Store details of failed exports

    // ** Simulate Processing Each Form for Status (Actual file write happens later) **
    // This structure allows us to keep the single file write but report individually
    for (const xform of allForms) {
        try {
            // Prepare data for this specific xform (remove elements, update timestamp)
             const dataToSave = { ...xform };
             delete dataToSave.element; 
             if (dataToSave.intermediatePoints) {
                 dataToSave.intermediatePoints = dataToSave.intermediatePoints.map(p => {
                     const { element, ...rest } = p; 
                     return rest;
                 });
             }
             dataToSave.lastModified = Date.now(); 
             
             // Add the prepared JSON line to the array
             jsonlLines.push(JSON.stringify(dataToSave));
             successCount++; // Assume success at this stage (actual write failure handled later)
        } catch(prepError) {
            console.error(`Error preparing X-Form '${xform.xformName || xform.id}' for export:`, prepError);
            errorCount++;
            failedExports.push({ xformName: xform.xformName || xform.id, reason: prepError.message });
        }
    }

    // Check if any forms failed preparation before proceeding
    if (errorCount > 0) {
        console.warn(`Export aborted: ${errorCount} form(s) failed during data preparation.`);
        // Optionally show a specific error modal here
        // return; // Might want to abort if preparation fails
    }
    
    // Join lines only if there are successful ones
    const jsonlString = jsonlLines.join('\n');

    // 3. Generate default xformName
    // ... (xformName generation unchanged) ...
    const defaultFilename = `xforms_export_${new Date().toISOString().slice(0, 19).replace(/[-T:]/g, '')}.jsonl`;

    // 4. Get File Handle within the selected directory
    // ... (getFileHandle logic unchanged) ...
    let fileHandle;
    try {
        fileHandle = await window.lastUsedDirHandle.getFileHandle(defaultFilename, { create: true });
    } catch (e) {
        // ... (handle getFileHandle error unchanged) ...
        return; 
    }

    // 5. Write the JSONL file
    let writeError = null;
    try {
        const writable = await fileHandle.createWritable();
        await writable.write(jsonlString);
        await writable.close();
        console.log(`Attempted export of ${allForms.length} X-Forms to "${fileHandle.xformName}".`);
    } catch (e) {
        console.error(`Error writing file "${fileHandle.xformName}":`, e);
        writeError = e; // Store error to report
        // Don't show modal here, report in final summary
    }
    
    // 6. Show Summary Notification
    let summaryMessage = `Export Summary for ${fileHandle.xformName}:\n`;
    let consoleLogMessage = `Export Summary for ${fileHandle.xformName}: `;

    if (writeError) {
        summaryMessage += `\n⚠️ WRITE FAILED: ${writeError.message}`;
        consoleLogMessage += `WRITE FAILED: ${writeError.message}; `;
        summaryMessage += `\n(${successCount} forms prepared, ${errorCount} failed preparation).`;
        consoleLogMessage += `(${successCount} forms prepared, ${errorCount} failed preparation).`;
    } else {
        summaryMessage += `\n✅ ${successCount} X-Form(s) successfully exported.`;
        consoleLogMessage += `${successCount} successful.`;
        if (errorCount > 0) {
            summaryMessage += `\n❌ ${errorCount} X-Form(s) failed preparation (see console for details).`;
            consoleLogMessage += ` ${errorCount} failed preparation.`;
            // Log detailed failures
            console.error("Failed Export Preparations:", failedExports);
        } else {
            consoleLogMessage += ` 0 failed preparation.`;
        }
        // Note: skippedCount is no longer applicable in the JSONL approach
    }

    window.showModalDialog({ title: "Export Summary", message: summaryMessage });
    console.log(consoleLogMessage);
}

// ... existing code ...

// ... (handleExportXForms needs update next) ...