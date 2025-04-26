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
    if (!handle || handle.name !== 'storage') { // Only save if it's the correct folder
        console.warn("Attempted to save handle for folder other than 'storage'. Aborting save.");
        return;
    }
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        await store.put(handle, DIR_HANDLE_KEY);
        await tx.done;
        console.log('Directory handle saved to IndexedDB.');
    } catch (error) {
        console.error('Error saving directory handle:', error);
    }
}

async function loadDirectoryHandle() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const handle = await store.get(DIR_HANDLE_KEY);
        await tx.done;
        if (handle && handle.name === 'storage') { // Verify it's the storage handle
            console.log('Directory handle loaded from IndexedDB.');
            return handle; 
        } else {
            if (handle) console.warn('Loaded handle is not for storage folder.');
            else console.log('No directory handle found in IndexedDB.');
            await deleteStoredDirectoryHandle(); // Clear invalid/missing handle
            return null;
        }
    } catch (error) {
        console.error('Error loading directory handle:', error);
        return null;
    }
}

async function deleteStoredDirectoryHandle() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        await store.delete(DIR_HANDLE_KEY);
        await tx.done;
        console.log('Stored directory handle deleted from IndexedDB.');
    } catch (error) {
        console.error('Error deleting directory handle:', error);
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
    
    console.log("Setting up filename mode...");
    
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
    if (!window.intermediatePoints || !window.waypointCounter || !window.deleteLastWaypointButton || !window.addWaypointButton) {
        // console.error("Required elements not defined for updateWaypointCounter"); // Reduce noise
        return;
    }
    const count = window.intermediatePoints.length;
    window.waypointCounter.textContent = count;
    const isDisabled = count === 0;
    window.deleteLastWaypointButton.disabled = isDisabled;
    
    if (isDisabled) {
        window.deleteLastWaypointButton.style.pointerEvents = 'none';
        window.deleteLastWaypointButton.style.opacity = '0.5';
        window.deleteLastWaypointButton.style.cursor = 'not-allowed';
    } else {
        window.deleteLastWaypointButton.style.pointerEvents = 'auto';
        window.deleteLastWaypointButton.style.opacity = '1';
        window.deleteLastWaypointButton.style.cursor = 'pointer';
    }
    window.addWaypointButton.disabled = count >= 99;
    // console.log(`Waypoint counter updated: ${count} points`); // Reduce noise
}

// --- Make Waypoint Draggable (Needed by restoreState/applyXFormData) ---
window.makeDraggableWaypoint = function(element, index) { // Define on window
    let isDragging = false;
    if(!window.viewport) return;

    element.addEventListener('mousedown', (e) => {
        isDragging = true;
        window.draggingPointIndex = index;
        window.lastModifiedPointIndex = index; // Use window scope
        window.wasDraggingPoint = false; // Use window scope & Reset flag
        
        const vpRect = window.viewport.getBoundingClientRect();
        // Ensure point exists before accessing coords
        if(window.intermediatePoints[index]) {
           // Assign to global offset vars
           window.dragOffsetX = e.clientX - (vpRect.left + window.intermediatePoints[index].x); 
           window.dragOffsetY = e.clientY - (vpRect.top + window.intermediatePoints[index].y);
        } else {
            // Fallback if point data isn't ready?
             window.dragOffsetX = e.clientX - vpRect.left - parseFloat(element.style.left || 0);
             window.dragOffsetY = e.clientY - vpRect.top - parseFloat(element.style.top || 0);
        }
        
        // Select this point visually
        document.querySelectorAll('.point-marker.selected').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        
        window.selectedPointIndex = index; // Use window scope
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
    alert("X-Form saved to LocalStorage.");
    return xformData; // Return data just in case
}

// NEW function containing the core file writing logic
// Renamed and modified to accept fileHandle from picker
async function _writeDataToHandle(fileHandle, xformData) { // fileHandle has the potentially numbered name
    try {
        if (!fileHandle) {
            throw new Error("Invalid file handle received for writing.");
        }

        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(xformData, null, 2)); // xformData still has original name
        await writable.close();

        console.log(`X-Form data (name: ${xformData.name}) saved to file: ${fileHandle.name}`);
        alert(`X-Form exported successfully as ${fileHandle.name}!`);

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
            alert(`Error writing file: ${error.message || 'Operation failed'}`);
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

// --- Initial Setup Function (called from main script) ---
async function setupPersistence() { 
    const folderDisplay = document.getElementById('currentFolderDisplay');

    // Try loading directory handle first
    window.lastUsedDirHandle = await loadDirectoryHandle(); 
    
    if (window.lastUsedDirHandle) {
        console.log("Attempting to list files from loaded directory handle...");
        try {
            await listJsonFiles(window.lastUsedDirHandle);
            console.log("Successfully listed files from loaded handle.");
            if (folderDisplay) { 
                folderDisplay.textContent = window.lastUsedDirHandle.name;
                folderDisplay.title = window.lastUsedDirHandle.name;
            }
        } catch (listError) {
            // ... (Error handling) ...
            if (listError.name === 'NotAllowedError') {
                window.lastUsedDirHandle = null;
                await deleteStoredDirectoryHandle(); 
                listJsonFiles(null);
                if (folderDisplay) folderDisplay.textContent = "Select 'storage' folder -->";
            } else {
                window.lastUsedDirHandle = null; 
                listJsonFiles(null);
                if (folderDisplay) folderDisplay.textContent = "Error reading folder";
            }
        }
    } else {
         // No handle loaded 
         listJsonFiles(null); 
         if (folderDisplay) folderDisplay.textContent = "Select 'storage' folder -->";
    }

    initializeFilenameDisplay(); 
    restoreState(); 
    setupStatePersistence(); 

    // Setup Main Save button 
    const saveFileButton = document.getElementById('saveFileBtn');
    if (saveFileButton) {
        saveFileButton.addEventListener('click', async () => { 
            if (!window.lastUsedDirHandle) {
                alert("Please select the 'storage' folder first.");
                return; 
            }
            
            const originalName = getCurrentFilename();
            // Sanitize but *without* the final suffix initially
            const sanitizedBase = sanitizeFilenameForSystem(originalName).replace(/_xform\.json$/, '');
            let finalSanitizedFilename = `${sanitizedBase}_xform.json`; // Initial target
                
            let fileExists = false;
            let existingFileHandle = null;
            let fileHandleToSave = null; 

            try {
                // 1. Check if the default sanitized file exists
                existingFileHandle = await window.lastUsedDirHandle.getFileHandle(finalSanitizedFilename); 
                fileExists = true;
            } catch (error) {
                if (error.name !== 'NotFoundError') {
                    console.error("Error checking file existence:", finalSanitizedFilename, error); 
                    alert(`Error checking file status: ${error.message}`);
                    return; 
                }
                // NotFoundError means it's safe to create directly
                fileExists = false;
            }

            // 2. Handle based on existence
            let proceedWithSave = false;

            if (fileExists) {
                // File exists - Ask user to overwrite or keep both
                if (confirm(`File "${finalSanitizedFilename}" already exists. Overwrite? (Click Cancel to potentially keep both)`)) {
                     proceedWithSave = true;
                     fileHandleToSave = existingFileHandle; // Use the existing handle for overwrite
                } else {
                     // User cancelled overwrite, ask about keeping both
                     if (confirm(`Keep both files? (Save new file with a number suffix like \"${sanitizedBase}_(N)_xform.json\")`)) {
                          try {
                              // Find the next available numbered filename
                              finalSanitizedFilename = await _findAvailableFilename(window.lastUsedDirHandle, sanitizedBase);
                              // Get a new handle for the numbered file
                              fileHandleToSave = await window.lastUsedDirHandle.getFileHandle(finalSanitizedFilename, { create: true });
                              proceedWithSave = true;
                          } catch (findError) {
                              console.error("Error finding available filename or getting handle:", findError);
                              alert(`Could not prepare numbered filename: ${findError.message}`);
                              proceedWithSave = false; // Abort
                          }
                     } else {
                          // User cancelled keeping both as well
                          console.log("Save operation cancelled by user.");
                          proceedWithSave = false;
                     }
                }
            } else {
                // File does not exist - Proceed to create
                try {
                     fileHandleToSave = await window.lastUsedDirHandle.getFileHandle(finalSanitizedFilename, { create: true });
                     proceedWithSave = true;
                 } catch (handleError) {
                      console.error("Error getting file handle for creation:", finalSanitizedFilename, handleError); 
                      alert(`Failed to prepare file \"${finalSanitizedFilename}\": ${handleError.message}`);
                      proceedWithSave = false; // Abort
                 }
            }

            // 3. Perform Save if confirmed/allowed
            if (proceedWithSave && fileHandleToSave) {
                 const xformData = createXFormDataObject(); 
                 xformData.name = originalName; // Store the original name used in the input
                 await _writeDataToHandle(fileHandleToSave, xformData);
            } else {
                 console.log("Save did not proceed.");
            }
        });
    }

    // Setup sort button 
    const sortButton = document.getElementById('sortFilesBtn');
    if (sortButton) {
        // NEW: implement toggling sort order instead of placeholder alert
        window.fileListSortAsc = true; // default sort order tracker
        sortButton.addEventListener('click', () => {
            window.fileListSortAsc = !window.fileListSortAsc;
            const ul = document.getElementById('savedList');
            if (!ul) return;
            const items = Array.from(ul.querySelectorAll('li.file-list-item'));
            items.sort((a, b) => {
                const nameA = a.dataset.filename || '';
                const nameB = b.dataset.filename || '';
                return window.fileListSortAsc
                    ? nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' })
                    : nameB.localeCompare(nameA, undefined, { numeric: true, sensitivity: 'base' });
            });
            // Append in new order
            items.forEach(li => ul.appendChild(li));
            // Optionally update button label/icon to indicate order
            sortButton.textContent = window.fileListSortAsc ? '↓' : '↑';
        });
    }
}

// --- NEW File System Functions ---
async function selectDirectoryAndListFiles(isLineItem=false) {
    try {
        if (isLineItem) {
            console.log("selectDirectoryAndListFiles called from line item");
        }
        const options = {}; // No startIn needed if we always require selecting 'storage'
        const dirHandle = await window.showDirectoryPicker(options);
        if (dirHandle.name !== 'storage') { /* ... validation ... */ return false; }
        
        window.lastUsedDirHandle = dirHandle; 
        await saveDirectoryHandle(dirHandle); 
        
        const folderDisplay = document.getElementById('currentFolderDisplay');
        if (folderDisplay) { /* ... update text ... */ }
        await listJsonFiles(dirHandle); 
        return true; // Indicate success
    } catch (err) { /* ... error handling ... */ return false; }
}

async function listJsonFiles(dirHandle) {
    const fileListUl = document.getElementById('savedList'); // Use correct ID
    const sortButton = document.getElementById('sortFilesBtn'); // capture once
    if (!fileListUl) { console.error("#savedList element not found."); return; }

    selectedFileListItem = null; 
    selectedFilename = null;

    if (!dirHandle) {
        fileListUl.innerHTML = `<li id="changeFolderLineItem" class="folder-prompt"><span class="folder-prompt-text">Select the 'storage' folder first.</span> <select-folder-icon-btn>📁</select-folder-icon-btn></li>`;
        // Hide sort button when no folder selected
        if (sortButton) sortButton.style.display = 'none';
        // NEW: attach click listener directly on the list item so user can click it immediately
        const changeLi = document.getElementById('changeFolderLineItem');
        if (changeLi) {
            changeLi.addEventListener('click', () => selectDirectoryAndListFiles(true));
        }
        window.lastUsedDirHandle = null;
        return;
    }

    fileListUl.innerHTML = '<li>Loading files...</li>';
    // Show sort button by default while loading (will be adjusted later)
    if (sortButton) sortButton.style.display = 'none';

    try {
        const files = [];
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file' && entry.name.endsWith('_xform.json')) { // Match suffix
                files.push(entry.name);
            }
        }
        fileListUl.innerHTML = ''; 
        if (files.length === 0) {
            fileListUl.innerHTML = '<li>No X-Forms found in storage folder.</li>';
            if (sortButton) sortButton.style.display = 'none';
            return;
        }

        // Update sort button visibility based on count
        if (sortButton) sortButton.style.display = files.length < 2 ? 'none' : 'inline-block';

        files.sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));

        files.forEach(filename => {
            const li = document.createElement('li');
            li.className = 'file-list-item';
            li.dataset.filename = filename;
            const nameSpan = document.createElement('span');
            nameSpan.textContent = filename.replace(/_xform\.json$/, ''); // Show base name
            nameSpan.title = filename; 
            li.appendChild(nameSpan);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-file-btn';
            deleteBtn.innerHTML = '&times;'; 
            deleteBtn.title = `Delete ${filename}`;
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                deleteFile(filename); // Call delete function
            });
            li.appendChild(deleteBtn);

            li.addEventListener('click', () => {
                if (selectedFileListItem === li) {
                    console.log("Second click detected, loading file:", filename);
                    // *** TODO: Add check for unsaved changes ***
                    loadFile(filename);
                } else {
                    if (selectedFileListItem) {
                        selectedFileListItem.classList.remove('selected');
                    }
                    li.classList.add('selected');
                    selectedFileListItem = li;
                    selectedFilename = filename;
                    console.log("Selected file:", selectedFilename);
                }
            });
            fileListUl.appendChild(li);
        });

    } catch (err) {
        console.error("Error listing files:", err);
        fileListUl.innerHTML = '<li>Error reading directory contents.</li>';
        if (err.name === 'NotAllowedError') {
             window.lastUsedDirHandle = null;
             await deleteStoredDirectoryHandle(); // Remove bad handle from DB
             alert("Permission denied for storage folder. Please re-select it.");
             listJsonFiles(null); // Update list display
        }
        if (sortButton) sortButton.style.display = 'none';
    }
}

async function loadFile(filename) {
     if (!window.lastUsedDirHandle) {
        alert("Please select the storage folder first.");
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
             // If in manual mode, save this name to local storage so it persists if user switches modes
             if (!window.isFilenameModeATM) {
                 localStorage.setItem(FILENAME_VALUE_KEY, filenameInput.value);
             }
             // If in ATM mode, stop the timer and maybe switch to MEM?
             // else {
             //    stopFilenameTimeUpdates(); 
             // }
        }
        // --- END Name Logic Update ---

    } catch (err) {
        console.error(`Error processing file ${filename}:`, err); 
        alert(`Could not load or process file: ${filename}\nReason: ${err.name} - ${err.message}\nIt might be corrupted, moved, or permissions may have changed.`); // Ensure backtick is here

        // Attempt to move the file to an 'errors' folder IF we had a handle 
        // ... rest of catch block
    }
}