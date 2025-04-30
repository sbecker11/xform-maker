// --- Global Constants & Variables (Declared in main script.js) ---
// const STORAGE_KEY = 'xformMaker_savedForms'; 
// const STATE_STORAGE_KEY = 'xformMaker_currentState';
const FILENAME_MODE_KEY = 'xformMaker_filenameMode';
const FILENAME_VALUE_KEY = 'xformMaker_filenameValue';
window.lastUsedDirHandle = null; // Keep track of the selected 'storage' directory handle
// window.isFilenameModeATM = true; // Managed within setupFilenameMode
let filenameUpdateInterval = null;
let selectedFileListItem = null; // Keep track of selected file LI element
let selectedFilename = null; // Keep track of selected filename
// References to DOM elements needed by persistence (set in main script)
// window.savedListUl, window.selectedControlsDiv, window.renameInput, etc.

// --- IndexedDB Helpers for Directory Handle Persistence ---
const DB_NAME = 'xformMakerDB';
const DB_VERSION = 1;
const STORE_NAME = 'settingsStore';
const DIR_HANDLE_KEY = 'lastDirectoryHandle';

let dbPromise = null;

function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
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
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
                console.log(`Object store '${STORE_NAME}' created.`);
            }
        };
    });
    return dbPromise;
}

async function saveDirectoryHandle(handle) {
    if (!handle) {
        console.error('📂 SAVE HANDLE: Cannot save null directory handle');
        return false;
    }
    
    if (handle.name !== 'storage') {
        console.warn(`📂 SAVE HANDLE: Expected directory named "storage", got "${handle.name}"`);
        // Continue anyway since we're more interested in persistence than the exact name
    }
    
    console.log(`📂 SAVE HANDLE: Saving directory handle for "${handle.name}" to IndexedDB`);
    
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
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        await store.put(handle, DIR_HANDLE_KEY);
        await tx.done;
        
        console.log('📂 SAVE HANDLE: Successfully saved directory handle to IndexedDB');
        return true;
    } catch (error) {
        console.error('📂 SAVE HANDLE: Error saving directory handle to IndexedDB:', error);
        return false;
    }
}

async function loadDirectoryHandle() {
    try {
        console.log('📂 LOAD HANDLE: Attempting to load directory handle from IndexedDB...');
        const db = await openDB();
        
        // Use proper transaction pattern instead of direct db.get
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const handle = await store.get(DIR_HANDLE_KEY);
        await tx.done;
        
        if (!handle) {
            console.log('📂 LOAD HANDLE: No directory handle found in IndexedDB');
            return null;
        }
        
        console.log(`📂 LOAD HANDLE: Retrieved handle for "${handle.name}" directory`);
        
        // Check permission status
        try {
            console.log('📂 LOAD HANDLE: Checking permission status...');
            const permissionStatus = await handle.queryPermission({ mode: 'readwrite' });
            console.log(`📂 LOAD HANDLE: Current permission status: ${permissionStatus}`);
            
            // Display detailed handle info for debugging
            console.log('📂 LOAD HANDLE: Handle details:', {
                name: handle.name,
                kind: handle.kind,
                isDirectory: handle.isDirectory === true ? 'yes' : 'no',
                isFile: handle.isFile === true ? 'yes' : 'no'
            });
            
            if (permissionStatus !== 'granted') {
                console.warn('📂 LOAD HANDLE: Permission not currently granted, will request when needed');
                // We don't request permission here to avoid unwanted prompts,
                // but we inform the app about the current status
                window.directoryPermissionStatus = 'needs-request';
        } else {
                window.directoryPermissionStatus = 'granted';
            }
            
            return handle;
        } catch (permErr) {
            console.error('📂 LOAD HANDLE: Error checking permission:', permErr);
            // The handle might be corrupted or invalid, so delete it
            await deleteDirectoryHandle();
            return null;
        }
    } catch (error) {
        console.error('📂 LOAD HANDLE: Error loading directory handle:', error);
        // The database might be corrupted, try to delete the handle
        try {
            await deleteDirectoryHandle();
        } catch (deleteErr) {
            console.error('📂 LOAD HANDLE: Also failed to delete corrupted handle:', deleteErr);
        }
        return null;
    }
}

async function deleteStoredDirectoryHandle() {
    try {
        console.log('📂 DELETE STORED HANDLE: Attempting to delete directory handle from IndexedDB...');
        const db = await openDB();
        
        // Use proper transaction pattern
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        await store.delete(DIR_HANDLE_KEY);
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
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        await store.delete(DIR_HANDLE_KEY);
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

// --- Filename mode functions (Phase 1 & 2) ---
function setupFilenameMode() {
    const filenameInput = document.getElementById('filenameInput');
    const atmButton = document.getElementById('filenameModeATM');
    const memButton = document.getElementById('filenameModeManual');
    const saveButton = document.getElementById('saveFileBtn');
    
    if (!filenameInput || !atmButton || !memButton) {
        console.error("Filename mode elements not found");
        return;
    }
    
    // If filename input is currently disabled (controls not available), keep it blank
    if(filenameInput.disabled){
        filenameInput.value='';
        return;
    }
    
    console.log("Setting up filename mode...");
    
    // Ensure ATM button is always enabled and clickable
    if (atmButton.disabled) {
        atmButton.disabled = false;
    }
    // Remove is-disableable class that might prevent clicking
    if (atmButton.classList.contains('is-disableable')) {
        // Keep the class but make sure it doesn't affect functionality
        atmButton.classList.remove('disabled');
    }
    
    const savedMode = localStorage.getItem(FILENAME_MODE_KEY);
    const savedFilename = localStorage.getItem(FILENAME_VALUE_KEY);
    window.isFilenameModeATM = savedMode !== 'MEM';
    
    if (window.isFilenameModeATM) {
        atmButton.classList.add('active');
        memButton.classList.remove('active');
        filenameInput.setAttribute('readonly', true);
        updateFilenameWithTime(); // Initial update
        startFilenameTimeUpdates();
    } else {
        memButton.classList.add('active');
        atmButton.classList.remove('active');
        filenameInput.removeAttribute('readonly');
        filenameInput.value = savedFilename || updateFilenameWithTime(false); // Set saved or generate once
    }
    
    atmButton.addEventListener('click', () => {
        console.log("ATM button clicked, current mode:", window.isFilenameModeATM);
        if (!window.isFilenameModeATM) {
            window.isFilenameModeATM = true;
            atmButton.classList.add('active');
            memButton.classList.remove('active');
            filenameInput.setAttribute('readonly', true);
            localStorage.setItem(FILENAME_MODE_KEY, 'ATM');
            updateFilenameWithTime();
            startFilenameTimeUpdates();
            console.log("Switched to Automated Time Mode");
        }
    });
    
    memButton.addEventListener('click', () => {
        if (window.isFilenameModeATM) {
            window.isFilenameModeATM = false;
            memButton.classList.add('active');
            atmButton.classList.remove('active');
            filenameInput.removeAttribute('readonly');
            localStorage.setItem(FILENAME_MODE_KEY, 'MEM');
            stopFilenameTimeUpdates();
            filenameInput.focus();
            console.log("Switched to Manual Edit Mode");
        }
    });
    
    filenameInput.addEventListener('dblclick', () => {
        if (window.isFilenameModeATM) {
            memButton.click(); // Simulate click
        }
    });
    
    filenameInput.addEventListener('change', () => {
        if (!window.isFilenameModeATM) {
            localStorage.setItem(FILENAME_VALUE_KEY, filenameInput.value);
            console.log("Saved manually edited filename");
        }
    });
}

function startFilenameTimeUpdates() {
    stopFilenameTimeUpdates(); // Clear existing interval
    console.log("Starting automated time updates");
    updateFilenameWithTime(); // Update immediately
    filenameUpdateInterval = setInterval(updateFilenameWithTime, 1000);
}
window.startFilenameTimeUpdates = startFilenameTimeUpdates; // Expose if needed externally

function stopFilenameTimeUpdates() {
    if (filenameUpdateInterval) {
        clearInterval(filenameUpdateInterval);
        filenameUpdateInterval = null;
        console.log("Stopped automated time updates");
    }
}
window.stopFilenameTimeUpdates = stopFilenameTimeUpdates; // Expose if needed externally

function updateFilenameWithTime(doUpdate = true) {
    const filenameInput = document.getElementById('filenameInput');
    if (!filenameInput) {
        console.error("Filename input element not found");
        return "";
    }
    
    const now = new Date();
    const formattedDate = now.toISOString().slice(0, 10).replace(/-/g, '-');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}:${seconds}`;
    const newFilename = `${formattedDate} ${timeStr}`;

    if (doUpdate) { 
        if (!window.isFilenameModeATM) {
           // console.log("Not updating time - currently in manual edit mode"); // Reduce console noise
            return filenameInput.value; // Return current value if in MEM
        }
        filenameInput.value = newFilename;
        // Update the global currentXFormName directly
        window.currentXFormName = newFilename; 
        localStorage.setItem(FILENAME_VALUE_KEY, newFilename);
        // console.log("Updated filename with current time:", newFilename); // Reduce console noise
    } 
    return newFilename; // Return generated name even if not updating UI
}
window.updateFilenameWithTime = updateFilenameWithTime; // Expose if needed externally

// Initialize the filename mode and display
function initializeFilenameDisplay() {
    const filenameInput = document.getElementById('filenameInput');
    if (!filenameInput) {
        console.error("Cannot initialize filename display - element not found");
        return;
    }
    console.log("Initializing filename display");
    // Use the setup function to handle initial state and updates
    setupFilenameMode(); 
}

// --- X-Form Naming Functions ---
function generateXFormName() {
    const now = new Date();
    const formattedDate = now.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' });
    const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    return `X-Form ${formattedDate} ${formattedTime}`;
}

function sanitizeXFormName(name) {
    if (!name || typeof name !== 'string') return generateXFormName();
    let sanitized = name.trim()
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
function getCurrentFilename() {
    const filenameInput = document.getElementById('filenameInput');
    // If ATM, generate current time name, otherwise use input value
    if (window.isFilenameModeATM) {
        return updateFilenameWithTime(false); // Generate current time name without forcing update
    } else if (filenameInput) {
         return filenameInput.value || generateXFormName(); // Use manual input or default
    }
    return generateXFormName(); // Fallback
}

// --- State Management Functions ---
function createXFormDataObject() {
    // Assumes global state variables like startRect, endRect, intermediatePoints, etc. are accessible via window
    return {
        name: window.currentXFormName || generateXFormName(),
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
    window.currentXFormName = data.name || generateXFormName();
    window.currentXFormId = data.id || Date.now();
    window.currentXFormHasRun = true; 

    if (window.widthInput && data.startRect) window.widthInput.value = data.startRect.width;
    if (window.heightInput && data.startRect) window.heightInput.value = data.startRect.height;
    if (typeof applyRectangleSize === 'function') applyRectangleSize(); // Assumes function exists
    else console.warn('applyRectangleSize function not found during applyXFormData');

    if (window.startRect && data.startRect) {
        window.startRect.style.left = `${data.startRect.left}px`;
        window.startRect.style.top = `${data.startRect.top}px`;
    }
    if (window.endRect && data.endRect) {
        window.endRect.style.left = `${data.endRect.left}px`;
        window.endRect.style.top = `${data.endRect.top}px`;
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
    
    // Update filename display
     const filenameInput = document.getElementById('filenameInput');
        if (filenameInput) {
             if (!window.isFilenameModeATM) {
                 filenameInput.value = window.currentXFormName; 
             } 
        }

    console.log("Applied X-Form data:", window.currentXFormName);
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
                name: window.currentXFormName,
                id: window.currentXFormId,
                hasRun: window.currentXFormHasRun
            },
            lastModifiedPointIndex: window.lastModifiedPointIndex,
            theme: document.documentElement.classList.contains('dark-theme') ? 'dark' : 'light'
            // filenameMode: window.isFilenameModeATM ? 'ATM' : 'MEM', // Save filename mode
            // filenameValue: document.getElementById('filenameInput')?.value // Save manual filename if MEM
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
            window.currentXFormName = state.currentXForm.name;
            window.currentXFormId = state.currentXForm.id;
            window.currentXFormHasRun = state.currentXForm.hasRun;
        }

        // Restore dimensions first
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

        // Restore rectangle positions and waypoints *after* initializeRects creates the elements
        if (typeof initializeRects === 'function') {
             initializeRects(); // Creates rects, clears points

             // Now apply saved positions
             if (window.startRect && state.startRect) {
                 window.startRect.style.left = `${state.startRect.left}px`;
                 window.startRect.style.top = `${state.startRect.top}px`;
             }
             if (window.endRect && state.endRect) {
                 window.endRect.style.left = `${state.endRect.left}px`;
                 window.endRect.style.top = `${state.endRect.top}px`;
             }
              // Apply restored size again (initializeRects might have reset it)
             if (typeof applyRectangleSize === 'function') applyRectangleSize(); 

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

        // Restore filename mode and value (handled by setupFilenameMode called in main script)
        // if (state.filenameMode) window.isFilenameModeATM = state.filenameMode === 'ATM';
        // if (state.filenameValue && !window.isFilenameModeATM) {
        //     const filenameInput = document.getElementById('filenameInput');
        //     if(filenameInput) filenameInput.value = state.filenameValue;
        // }
        // SetupFilenameMode will handle this based on localStorage
        
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
window.updateWaypointCounter = function() { // Define on window
    // Get the counter element - either from window object or by ID
    console.log("Welcome to the UpdateWaypointCounter function");
    const waypointCounter = window.waypointCounter || document.getElementById('waypointCounter');
    const deleteLastWaypointButton = window.deleteLastWaypointButton || document.getElementById('deleteLastWaypointBtn');
    const addWaypointButton = window.addWaypointButton || document.getElementById('addWaypointButton');
    
    // Exit if we don't have the required elements or intermediatePoints array
    if (!window.intermediatePoints || !waypointCounter || !deleteLastWaypointButton) {
        console.warn("Required elements not found for updateWaypointCounter");
        return;
    } else {
        console.log("Required elements found for updateWaypointCounter");
    }
    
    const count = window.intermediatePoints.length;
    console.log(`**** Udating waypoint counter to ${count} ****`);

    
    // Update counter display
    waypointCounter.textContent = count;
    console.log("!!!! Waypoint counter count:", count, '!!!!');
    console.log("!!!! waypointCounter.textContent:", waypointCounter.textContent, '!!!!');

    
    // Update delete button state
    const isDisabled = count === 0;
    deleteLastWaypointButton.disabled = isDisabled;
    console.log("deleteLastWaypointButton.disabled:", deleteLastWaypointButton.disabled);

    if (isDisabled) {
        deleteLastWaypointButton.style.pointerEvents = 'none';
        deleteLastWaypointButton.style.opacity = '0.5';
        deleteLastWaypointButton.style.cursor = 'not-allowed';
    } else {
        deleteLastWaypointButton.style.pointerEvents = 'auto';
        deleteLastWaypointButton.style.opacity = '1';
        deleteLastWaypointButton.style.cursor = 'pointer';
    }
    
    // Also update the add waypoint button if it exists
    if (addWaypointButton) {
        addWaypointButton.disabled = count >= 99;
    }
    console.log("addWaypointButton.disabled:", addWaypointButton.disabled);

    // Cache references to DOM elements for future use
    window.waypointCounter = waypointCounter;
    window.deleteLastWaypointButton = deleteLastWaypointButton;
    if (addWaypointButton) window.addWaypointButton = addWaypointButton;
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
    // Use current filename from input/ATM mode
    window.currentXFormName = getCurrentFilename(); 

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
async function _writeDataToHandle(fileHandle, xformData) { // fileHandle has the potentially numbered name
    try {
        if (!fileHandle) {
            throw new Error("Invalid file handle received for writing.");
        }

        // Update the lastModified timestamp before saving
        xformData.lastModified = Date.now();

        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(xformData, null, 2)); // xformData still has original name
        await writable.close();

        console.log(`X-Form data (name: ${xformData.name}) saved to file: ${fileHandle.name}`);
        await showInfoDialog(`X-Form exported successfully as ${fileHandle.name}!`);

        // *** UPDATE global name state AFTER successful save ***
        // Use the actual filename used for saving (potentially numbered)
        window.currentXFormName = fileHandle.name.replace(/_xform\.json$/, ''); 
        // Update the main input display if in manual mode
        const filenameInput = document.getElementById('filenameInput');
        if (filenameInput && !window.isFilenameModeATM) {
             filenameInput.value = window.currentXFormName; 
             localStorage.setItem(FILENAME_VALUE_KEY, filenameInput.value); // Persist manual name change
        } else if (filenameInput && window.isFilenameModeATM) {
             // If ATM, we might just want to update the display with the time again?
             // Or leave it showing the saved file name? For now, leave it.
        }

        // Refresh file list (assuming lastUsedDirHandle is still valid)
        if (window.lastUsedDirHandle) { 
            await listJsonFiles(window.lastUsedDirHandle); 
        }
        return true;

    } catch (error) {
        console.error('Error during file write:', error);
        if (error.name !== 'AbortError') {
            await showInfoDialog(`Error writing file: ${error.message || 'Operation failed'}`);
        }
        return false;
    }
}

// NEW Helper function to find the next available numbered filename
async function _findAvailableFilename(folderHandle, baseName) {
    // NEW: normalize baseName by stripping an existing _(<num>) suffix if present so we don't create filename_(1)_(1)_xform.json
    const baseMatch = baseName.match(/^(.*?)(?:_\((\d+)\))?$/);
    const rootName = baseMatch ? baseMatch[1] : baseName;

    let counter = 1;
    let checkName = `${rootName}_(${counter})_xform.json`;
    while (true) {
        try {
            await folderHandle.getFileHandle(checkName); // exists -> bump counter
            counter++;
            checkName = `${rootName}_(${counter})_xform.json`;
        } catch (error) {
            if (error.name === 'NotFoundError') {
                // available filename found
                console.log(`Found available filename: ${checkName}`);
                return checkName;
            }
            // propagate unexpected errors
            console.error(`Error checking filename ${checkName}:`, error);
            throw error;
        }
        if (counter > 999) {
            throw new Error("Could not find an available filename after 999 attempts.");
        }
    }
}

// Utility to enable/disable filename mode controls
function toggleFilenameControls(enable){
    const fieldset=document.querySelector('.persistence-fieldset');
    if(!fieldset) return;
    fieldset.querySelectorAll('.is-disableable').forEach(el=>{
        // Don't disable the ATM button
        if (el.id === 'filenameModeATM') {
            // Ensure the ATM button is always enabled
            el.disabled = false;
            return;
        }
        
        el.disabled=!enable;
        if(el.tagName==='INPUT' && el.type==='text'){
            if(!enable){ el.value=''; }
            el.readOnly=!enable;
        }
        if(!enable) el.classList.remove('active');
    });
    fieldset.querySelectorAll('.is-hideable').forEach(el=>{el.hidden=!enable});
    if(!enable){
        stopFilenameTimeUpdates && stopFilenameTimeUpdates();
    } else {
        if(window.isFilenameModeATM && window.lastUsedDirHandle){
            startFilenameTimeUpdates && startFilenameTimeUpdates();
        }
    }
}

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
            console.log(`📂 SETUP PERSISTENCE: Found saved directory handle for: ${savedDirHandle.name}`);
            window.lastUsedDirHandle = savedDirHandle;
            
            // Check current permission status without prompting
            const permissionStatus = await savedDirHandle.queryPermission({ mode: 'readwrite' });
            console.log(`📂 SETUP PERSISTENCE: Current permission status: ${permissionStatus}`);
            
            if (permissionStatus === 'granted') {
                console.log('📂 SETUP PERSISTENCE: ✅ Permission already granted for storage directory');
                if (folderTextElement) {
                    folderTextElement.textContent = `Currently using: ${savedDirHandle.name}`;
                    folderTextElement.title = `Click to change from ${savedDirHandle.name}`;
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
                    await listJsonFiles(null);
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
                await listJsonFiles(null);
                
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
                                    folderTextElement.textContent = `Currently using: ${savedDirHandle.name}`;
                                    folderTextElement.title = `Click to change from ${savedDirHandle.name}`;
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
                                await listJsonFiles(null);
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
                            await listJsonFiles(null);
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
            await listJsonFiles(null);
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
        await listJsonFiles(null);
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
        console.log(`User selected directory: "${dirHandle.name}"`);
        
        if (dirHandle.name !== 'storage') {
            console.warn(`⚠️ Selected directory name "${dirHandle.name}" does not match required "storage"`);
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
            folderDisplay.textContent = dirHandle.name;
            folderDisplay.title = dirHandle.name;
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
            folderTextElement.textContent = `Currently using: ${dirHandle.name}`;
            folderTextElement.title = `Click to change from ${dirHandle.name}`;
        }
        
        console.log("Listing files in selected directory...");
        await listJsonFiles(dirHandle); 
        
        // Enable filename controls now that we have a directory
        toggleFilenameControls(true);
        
        // Restore state to ATM mode if it was disabled
        if (window.isFilenameModeATM) {
            startFilenameTimeUpdates();
        }
        
        return true; // Indicate success
    } catch (err) {
        if (err.name === 'AbortError') {
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
        await listJsonFiles(null);
        
        return false;
    }
}

async function listJsonFiles(dirHandle) {
    const fileListUl = document.getElementById('savedList'); // Use correct ID
    const sortButton = document.getElementById('sortFilesBtn'); // capture once
    const saveBtn = document.getElementById('saveFileBtn');

    selectedFileListItem = null; 
    selectedFilename = null;

    const atmButton = document.getElementById('filenameModeATM');
    const memButton = document.getElementById('filenameModeManual');

    // Always start with a "Change Folder" option at the top
    fileListUl.innerHTML = `<li id="changeFolderLineItem" class="folder-prompt">
        <span class="folder-prompt-text">${dirHandle ? 'Change storage folder:' : 'Select the \'storage\' folder first:'}</span> 
        <select-folder-icon-btn>📁</select-folder-icon-btn>
    </li>`;
    
    // Attach click listener for the change folder option
        const changeLi = document.getElementById('changeFolderLineItem');
        if (changeLi) {
            changeLi.addEventListener('click', () => selectDirectoryAndListFiles(true));
        }

    if (!dirHandle) {
        if (saveBtn) saveBtn.disabled = true; // Disable save when no folder
        toggleFilenameControls(false);
        return;
    }

    if (saveBtn) saveBtn.disabled = false; // Enable once folder selected
    // re-enable filename mode buttons
    toggleFilenameControls(true);
    
    // Add "Loading" message after the change folder option
    fileListUl.innerHTML += '<li>Loading files...</li>';
    
    // Show sort button by default while loading (will be adjusted later)
    if (sortButton) sortButton.style.display = 'none';

    try {
        const fileEntries = [];
        
        // First, collect all file entries
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file' && entry.name.endsWith('_xform.json')) {
                try {
                    // Get file information
                    const fileHandle = await dirHandle.getFileHandle(entry.name);
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
                        console.warn(`Could not parse JSON from ${entry.name}:`, jsonError);
                        // Continue using the file system lastModified
                    }
                    
                    fileEntries.push({
                        name: entry.name,
                        lastModified: lastModified
                    });
                } catch (fileError) {
                    console.warn(`Error processing file ${entry.name}:`, fileError);
                    // Add file with unknown lastModified
                    fileEntries.push({
                        name: entry.name,
                        lastModified: 0
                    });
                }
            }
        }
        
        // Clear all items except the first "Change Folder" option
        fileListUl.innerHTML = fileListUl.firstElementChild.outerHTML;
        
        if (fileEntries.length === 0) {
            fileListUl.innerHTML += '<li>No X-Forms found in storage folder.</li>';
            if (sortButton) sortButton.style.display = 'none';
            if (saveBtn) saveBtn.disabled = false; // still allow saving new files even if none exist
            return;
        }

        // Update sort button visibility based on count
        if (sortButton) sortButton.style.display = fileEntries.length < 2 ? 'none' : 'flex';

        // Apply initial alphabetical sort
        fileEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}));

        fileEntries.forEach(fileEntry => {
            const li = document.createElement('li');
            li.className = 'file-list-item';
            li.dataset.filename = fileEntry.name;
            li.dataset.lastModified = fileEntry.lastModified; // Store lastModified as data attribute
            
            // Create filename column
            const nameSpan = document.createElement('span');
            nameSpan.className = 'file-name-column';
            nameSpan.textContent = fileEntry.name.replace(/_xform\.json$/, ''); // Show base name
            nameSpan.title = fileEntry.name;
            
            // Create date column
            const dateSpan = document.createElement('span');
            dateSpan.className = 'file-date-column';
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
                // Name first in name sort mode
                li.appendChild(nameSpan);
                li.appendChild(dateSpan);
            }

            // Add delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-file-btn';
            deleteBtn.innerHTML = '&times;'; 
            deleteBtn.title = `Delete ${fileEntry.name}`;
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                deleteFile(fileEntry.name); // Call delete function
            });
            li.appendChild(deleteBtn);

            // Simplified click handler: only one item can be selected at any time.
            li.addEventListener('click', () => {
                const alreadySelected = li.classList.contains('single-selected');

                // Clear selection classes from all items first
                document.querySelectorAll('#savedList li.file-list-item').forEach(el => {
                    el.classList.remove('single-selected');
                });

                if (alreadySelected) {
                    // If the user clicked the same selected item again → load it
                    loadFile(fileEntry.name);
                } else {
                    // Otherwise, simply select this one (blue)
                    li.classList.add('single-selected');
                }

                // Maintain a single-element list of selected filenames for any other code
                selectedFileListItem = li.classList.contains('single-selected') ? li : null;
            });
            fileListUl.appendChild(li);
        });

    } catch (err) {
        console.error("Error listing files:", err);
        // Keep the change folder option but add an error message
        fileListUl.innerHTML = fileListUl.firstElementChild.outerHTML + 
                              '<li>Error reading directory contents.</li>';
        
        if (err.name === 'NotAllowedError') {
             window.lastUsedDirHandle = null;
             await deleteStoredDirectoryHandle(); // Remove bad handle from DB
             await showInfoDialog("Permission denied for storage folder. Please re-select it.");
             // Don't call listJsonFiles(null) to avoid infinite recursion - already showing the change folder option
             if (saveBtn) saveBtn.disabled = true;
        }
        if (sortButton) sortButton.style.display = 'none';
    }
}

async function loadFile(filename) {
     if (!window.lastUsedDirHandle) {
        await showInfoDialog("Please select the storage folder first.");
        return;
    }
    console.log(`Attempting to load: ${filename}`);
    let fileHandle = null;
    let contents = null;  
    try {
        fileHandle = await window.lastUsedDirHandle.getFileHandle(filename);
        const file = await fileHandle.getFile();
        contents = await file.text();
        const xformData = JSON.parse(contents);
       
        applyXFormData(xformData); // Apply the data first
        console.log(`X-Form loaded successfully from file: ${filename}`);
       
        // --- UPDATE Name Logic --- 
        // Set current name state based on the ACTUAL filename loaded, including _(N) suffix
        window.currentXFormName = filename.replace(/_xform\.json$/, ''); 
        window.currentXFormId = xformData.id || Date.now(); 
        window.currentXFormHasRun = true; 
       
        // Always Update main filename input display to reflect loaded file
        const filenameInput = document.getElementById('filenameInput');
        if (filenameInput) {
            filenameInput.value = window.currentXFormName; 
             // Switch to Manual mode automatically upon file selection
             const atmBtn = document.getElementById('filenameModeATM');
             const memBtn = document.getElementById('filenameModeManual');
             window.isFilenameModeATM = false;
             
             // Make sure the ATM button is not disabled
             if (atmBtn) {
                 atmBtn.classList.remove('active');
                 atmBtn.disabled = false; // Ensure it's not disabled
                 atmBtn.classList.remove('disabled'); // Also remove disabled class if present
             }
             if (memBtn) {
                 memBtn.classList.add('active');
             }
             
             stopFilenameTimeUpdates();
             filenameInput.removeAttribute('readonly');
             localStorage.setItem(FILENAME_MODE_KEY, 'MEM');
             localStorage.setItem(FILENAME_VALUE_KEY, filenameInput.value);
        }
        
        // Update visual selection in the list
        // First clear all selections
        document.querySelectorAll('#savedList li.file-list-item').forEach(el => {
            el.classList.remove('single-selected');
        });
        
        // Then find and highlight the loaded file
        const fileElement = document.querySelector(`#savedList li[data-filename="${filename}"]`);
        if (fileElement) {
            fileElement.classList.add('single-selected');
            // Update the global selected item reference
            selectedFileListItem = fileElement;
        }
        
        // Call setupFilenameMode to reinitialize the button event handlers if needed
        setupFilenameMode();

    } catch (err) {
        console.error(`Error processing file ${filename}:`, err); 
        await showInfoDialog(`Could not load or process file: ${filename}\nReason: ${err.name} - ${err.message}\nIt might be corrupted, moved, or permissions may have changed.`);

        // Attempt to move the file to an 'errors' folder IF we had a handle 
        // ... rest of catch block
    }
}

// Lightweight convenience wrapper for simple OK dialogs
function showInfoDialog(message, btnLabel = 'OK') {
    return showModalDialog({ message, buttons: [{ id: 'ok', label: btnLabel, class: 'primary' }] });
}

// === Delete file helper ===
async function deleteFile(filename) {
    if (!window.lastUsedDirHandle) {
        await showInfoDialog('Please select the storage folder first.');
        return;
    }
    const choice = await showModalDialog({
        message: `Delete "${filename}"? This cannot be undone.`,
        buttons: [
            { id: 'delete', label: 'Delete', class: 'danger' },
            { id: 'cancel', label: 'Cancel', class: 'secondary' }
        ]
    });
    if (choice !== 'delete') return;
    
    try {
        // Find the current file element in the list
        const fileListUl = document.getElementById('savedList');
        const currentFileElement = document.querySelector(`#savedList li[data-filename="${filename}"]`);
        let nextFileToSelect = null;
        
        // Determine the next file to select before deleting this one
        if (currentFileElement) {
            // Get all file items to check position and count
            const allFileItems = fileListUl.querySelectorAll('li.file-list-item');
            const isLastItem = currentFileElement === allFileItems[allFileItems.length - 1];
            
            if (isLastItem && allFileItems.length > 1) {
                // If this is the last item in the list and there are other items,
                // select the first item in the list
                nextFileToSelect = allFileItems[0];
            } else {
                // Otherwise try to get the next sibling first, if not available, try the previous sibling
                nextFileToSelect = currentFileElement.nextElementSibling;
                if (!nextFileToSelect || !nextFileToSelect.classList.contains('file-list-item')) {
                    nextFileToSelect = currentFileElement.previousElementSibling;
                    if (!nextFileToSelect || !nextFileToSelect.classList.contains('file-list-item')) {
                        nextFileToSelect = null;
                    }
                }
            }
        }

        // Delete the file
        await window.lastUsedDirHandle.removeEntry(filename);
        console.log('Deleted file:', filename);
        
        // Refresh the file list
        await listJsonFiles(window.lastUsedDirHandle);
        
        // If we found a next file to select, select and load it
        if (nextFileToSelect && nextFileToSelect.dataset.filename) {
            // Find the same file in the refreshed list
            const newFileElement = document.querySelector(`#savedList li[data-filename="${nextFileToSelect.dataset.filename}"]`);
            if (newFileElement) {
                // Simulate a click on the new file element to select it
                newFileElement.click();
                // Load the file
                loadFile(nextFileToSelect.dataset.filename);
                
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
    setupFilenameMode();
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

// Add missing functions for filename and transform type persistence
function getSelectedFileName() {
    return localStorage.getItem(FILENAME_VALUE_KEY) || '';
}

function getSelectedTransformType() {
    return localStorage.getItem('xformMaker_selectedTransformType') || 'linear';
}

function saveSelectedFileName(filename) {
    localStorage.setItem(FILENAME_VALUE_KEY, filename);
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
}

// Make it available globally
window.applyThemeFromLocalStorage = applyThemeFromLocalStorage;

// Add listAvailableFiles function
async function listAvailableFiles() {
    if (window.lastUsedDirHandle) {
        return await listJsonFiles(window.lastUsedDirHandle);
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

window.filenameUpdateInterval = filenameUpdateInterval;