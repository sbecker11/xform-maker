// --- Global Constants & Variables (Declared in main script.js) ---
// const STORAGE_KEY = 'xformMaker_savedForms'; 
// const STATE_STORAGE_KEY = 'xformMaker_currentState';
// const FILENAME_MODE_KEY = 'xformMaker_filenameMode';
// const FILENAME_VALUE_KEY = 'xformMaker_filenameValue';
window.lastUsedDirHandle = null; // Keep track of the last directory
// window.isFilenameModeATM = true; // Managed within setupFilenameMode
let filenameUpdateInterval = null;
// References to DOM elements needed by persistence (set in main script)
// window.savedListUl, window.selectedControlsDiv, window.renameInput, etc.

// --- LocalStorage Helper Functions (Previously Global) ---
window.getSavedXForms = function() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
};

window.saveXForms = function(xforms) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(xforms));
};

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
    
    if (saveButton) {
        saveButton.addEventListener('click', async () => {
             // No need to update currentXFormName here, getCurrentFilename handles it
            const success = await saveXFormToFile();
            if (success) {
                console.log("File saved successfully with filename:", filenameInput.value);
                // Potentially refresh file list UI here
            }
        });
    }
    
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

async function saveXFormToFile() {
    try {
        const xformData = createXFormDataObject(); // Assumes createXFormDataObject is available
        const currentFilename = getCurrentFilename(); // Get name based on mode
        xformData.name = currentFilename; // Ensure object name matches filename
        
        const filename = `${currentFilename.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_')}.json`;
        
        const options = {
            suggestedName: filename,
            types: [{
                description: 'X-Form JSON',
                accept: {'application/json': ['.json']}
            }]
        };
        
        if (window.lastUsedDirHandle) {
            try { options.startIn = window.lastUsedDirHandle; } catch (e) { console.warn("Couldn't use last directory handle:", e); }
        }
        
        const fileHandle = await window.showSaveFilePicker(options);
        try { window.lastUsedDirHandle = await fileHandle.getParent(); } catch (e) { console.warn("Couldn't save directory handle:", e); }
        
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(xformData, null, 2));
        await writable.close();
        
        console.log(`X-Form exported to file: ${filename}`);
        alert(`X-Form exported successfully!`); // Simplified alert
        return true;
    } catch (error) {
        console.error('Error saving X-Form to file:', error);
        if (error.name !== 'AbortError') {
            alert(`Error exporting X-Form: ${error.message || 'Operation failed'}`);
        }
        return false;
    }
}

async function loadXFormFromFile() {
    try {
        const options = {
            types: [{
                description: 'X-Form JSON',
                accept: {'application/json': ['.json']}
            }],
            multiple: false
        };
        if (window.lastUsedDirHandle) {
             try { options.startIn = window.lastUsedDirHandle; } catch (e) { console.warn("Couldn't use last directory handle:", e); }
        }

        const [fileHandle] = await window.showOpenFilePicker(options);
        try { window.lastUsedDirHandle = await fileHandle.getParent(); } catch (e) { console.warn("Couldn't save directory handle:", e); }
        
        const file = await fileHandle.getFile();
        const contents = await file.text();
        const xformData = JSON.parse(contents);
        
        applyXFormData(xformData); // Assumes applyXFormData is available
        console.log(`X-Form imported from file: ${file.name}`);
        
        // Update current form name based on loaded data/filename
        let loadedName = xformData.name;
        if (!loadedName) {
             loadedName = file.name.replace(/\.json$/, '').replace(/_/g, ' ');
        }
        window.currentXFormName = sanitizeXFormName(loadedName);
        window.currentXFormId = xformData.id || Date.now(); // Ensure ID exists
        window.currentXFormHasRun = true; // Mark as loaded/modified

        // Update filename input based on mode
        const filenameInput = document.getElementById('filenameInput');
        if (filenameInput) {
             if (!window.isFilenameModeATM) {
                 filenameInput.value = window.currentXFormName; // Update manual input
                 localStorage.setItem(FILENAME_VALUE_KEY, filenameInput.value); // Save manual value
             } else {
                 updateFilenameWithTime(); // Reset ATM display
             }
        }

        // saveCurrentXFormToStorage(); // Optionally save imported to local storage immediately
        if (typeof window.renderSavedList === 'function') window.renderSavedList(); // Refresh UI
        
        return true;
    } catch (error) {
        console.error('Error loading X-Form from file:', error);
        if (error.name !== 'AbortError') {
            alert(`Error importing X-Form: ${error.message || 'Operation failed'}`);
        }
        return false;
    }
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
    // Update icons (icon update logic might need to be centralized or passed)
    if (typeof updateIconsForTheme === 'function') {
         setTimeout(updateIconsForTheme, 50); // Ensure it runs after potential DOM changes
    }
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
        window.lastModifiedPointIndex = index;
        window.wasDraggingPoint = false; // Reset flag
        
        const vpRect = window.viewport.getBoundingClientRect();
        // Ensure point exists before accessing coords
        if(window.intermediatePoints[index]) {
           window.dragOffsetX = e.clientX - (vpRect.left + window.intermediatePoints[index].x);
           window.dragOffsetY = e.clientY - (vpRect.top + window.intermediatePoints[index].y);
        } else {
             window.dragOffsetX = e.clientX - vpRect.left - parseFloat(element.style.left || 0);
             window.dragOffsetY = e.clientY - vpRect.top - parseFloat(element.style.top || 0);
        }
        
        // Select this point visually
        document.querySelectorAll('.point-marker.selected').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        
        window.selectedPointIndex = index;
        e.stopPropagation();
        e.preventDefault();
    });
    // Note: mousemove and mouseup listeners are handled globally (in controls module?)
};

// --- Render Saved List UI --- 
// Needs access to window.savedListUl, window.selectedControlsDiv, window.renameInput 
window.renderSavedList = function() { // Define on window
    if (!window.savedListUl || !window.selectedControlsDiv || !window.renameInput) {
        // console.log("Skipping render of saved list - required elements not found");
        return;
    }
    
    const xforms = window.getSavedXForms(); // Uses global helper
    window.savedListUl.innerHTML = ''; 
    window.selectedSavedXFormId = null;
    window.selectedControlsDiv.style.display = 'none';

    if (xforms.length === 0) {
        window.savedListUl.innerHTML = '<li>No X-Forms saved yet.</li>';
        return;
    }

    xforms.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // Sort by timestamp descending

xforms.forEach(t => {
    const li = document.createElement('li');
    li.dataset.id = t.id;
    li.className = 'xform-list-item'; // Add a class for easier styling/selection

    const nameSpan = document.createElement('span');
    nameSpan.className = 'xform-name';
    // Use sanitized name, fallback to ID if necessary
    nameSpan.textContent = sanitizeXFormName(t.name || 'Unnamed') || `X-Form ID ${t.id ? String(t.id).substring(0, 6) : '??'}`;
    nameSpan.title = nameSpan.textContent; // Add title for overflow
    li.appendChild(nameSpan);

    const detailsSpan = document.createElement('span');
    detailsSpan.className = 'xform-details';
    detailsSpan.textContent = ` (${t.waypoints ? t.waypoints.length : 0} pts)`;
    li.appendChild(detailsSpan);
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'xform-actions';
    
    // Load button
    const loadBtn = document.createElement('button');
    loadBtn.className = 'list-icon-btn';
    loadBtn.title = 'Load this X-Form';
    // Use consistent icon names if possible
    loadBtn.innerHTML = '<img src="icons/edit-white.png" alt="Load" class="btn-icon-small" data-dark-src="icons/edit-black.png">'; 
    loadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const selected = window.getSavedXForms().find(x => x.id === t.id);
        if (selected) {
            applyXFormData(selected); // Assumes applyXFormData is available
            // Update main filename input if in MEM
             const filenameInput = document.getElementById('filenameInput');
             if(filenameInput && !window.isFilenameModeATM) {
                 filenameInput.value = selected.name;
                 localStorage.setItem(FILENAME_VALUE_KEY, filenameInput.value); 
             }
            console.log(`Quick-loaded X-Form: ${selected.name}`);
            window.selectedSavedXFormId = t.id; // Mark as selected
            Array.from(window.savedListUl.querySelectorAll('li.selected')).forEach(el => el.classList.remove('selected'));
            li.classList.add('selected');
            window.selectedControlsDiv.style.display = 'block'; // Show controls
            window.renameInput.value = t.name; // Pre-fill rename
        } else {
             console.error("Could not find selected X-Form to load:", t.id);
        }
    });
    actionsDiv.appendChild(loadBtn);
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'list-icon-btn danger'; // Add danger class
    deleteBtn.title = 'Delete this X-Form';
    deleteBtn.innerHTML = '<img src="icons/trash-white.png" alt="Delete" class="btn-icon-small" data-dark-src="icons/trash-black.png">'; 
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nameToDelete = nameSpan.textContent;
        if (confirm(`Are you sure you want to delete "${nameToDelete}"? This cannot be undone.`)) {
            const currentForms = window.getSavedXForms();
            const filtered = currentForms.filter(x => x.id !== t.id);
            window.saveXForms(filtered); // Save updated list
            window.renderSavedList(); // Re-render
            console.log("Deleted X-Form:", nameToDelete);
        }
    });
    actionsDiv.appendChild(deleteBtn);
    li.appendChild(actionsDiv);

    // Main list item click (for selection only, not loading)
    li.addEventListener('click', () => {
        const currentlySelected = window.savedListUl.querySelector('li.selected');
        if (currentlySelected === li) {
            // Deselect if clicking the same one again
            li.classList.remove('selected');
            window.selectedSavedXFormId = null;
            window.selectedControlsDiv.style.display = 'none';
        } else {
            // Select the new item
            if(currentlySelected) currentlySelected.classList.remove('selected');
            li.classList.add('selected');
            window.selectedSavedXFormId = t.id;
            window.renameInput.value = t.name; // Pre-fill rename input
            window.selectedControlsDiv.style.display = 'block'; // Show controls
            console.log('Selected saved X-Form:', t.id);
        }
    });
    window.savedListUl.appendChild(li);
});

    // Update icons for theme (needs access to applyTheme or similar)
    if (typeof applyTheme === 'function') {
        applyTheme(localStorage.getItem('xformMakerTheme') || 'light'); // Re-apply theme to fix icons
    }
}

// --- Setup State Persistence Listeners ---
function setupStatePersistence() {
    // State is saved primarily *after* actions in the controls/persistence modules
    // (e.g., after dropping a rect, adding/deleting a waypoint, changing rotation/duration/size, loading/saving)
    // We still need listeners for theme toggle and rename if those controls exist.

    // Save on theme changes
    if (window.themeToggleButton) {
        window.themeToggleButton.addEventListener('click', () => setTimeout(window.saveCurrentState, 50));
    }
    
    // Save on X-Form rename (assuming rename controls might exist)
    // This rename functionality seems missing/incomplete in the original code snippets
    const renameButton = document.getElementById('renameXFormBtn'); // Example ID
    if (renameButton) {
        renameButton.addEventListener('click', () => setTimeout(window.saveCurrentState, 50));
    }
    
    console.log('State persistence hooks set up (actions trigger saves)');
}

// --- Initial Setup Function (called from main script) ---
function setupPersistence() {
    initializeFilenameDisplay(); // Sets up filename mode and initial display
    restoreState(); // Restore previous state from localStorage
    renderSavedList(); // Render the list based on localStorage
    setupStatePersistence(); // Add listeners that save state

    // Setup file operation buttons if they exist
    // const saveToFileButton = document.getElementById('saveToFileBtn'); // Moved to setupFilenameMode
    const loadFromFileButton = document.getElementById('loadFromFileBtn'); 
    // if (saveToFileButton) saveToFileButton.addEventListener('click', saveXFormToFile);
    if (loadFromFileButton) loadFromFileButton.addEventListener('click', loadXFormFromFile);

     // Setup rename/delete controls for saved list (if they exist separately)
     // This logic seems partially implemented or missing elements in the original HTML
     // setupXFormManagement(); // Call this if the specific rename/delete/load buttons for the selected item exist

} 