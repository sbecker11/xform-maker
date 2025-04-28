// --- Global State Variables & Constants ---
// LocalStorage Keys (Declared in inline script in HTML)
// const STORAGE_KEY = 'xformMaker_savedForms';
// const STATE_STORAGE_KEY = 'xformMaker_currentState';
// Filename Mode Keys (Declared in xform-persistence.js)
// const FILENAME_MODE_KEY = 'xformMaker_filenameMode';
// const FILENAME_VALUE_KEY = 'xformMaker_filenameValue';

// DOM Element References (to be populated in DOMContentLoaded)
window.savedListUl = null;
window.selectedControlsDiv = null;
window.renameInput = null;
window.addWaypointButton = null;
window.deleteLastWaypointButton = null;
window.waypointCounter = null;
window.widthInput = null;
window.heightInput = null;
window.durationInput = null;
window.themeToggleButton = null;
window.viewport = null;

// Mutable State (managed by controls/persistence modules, initialized here)
window.startRect = null; 
window.endRect = null;
window.xRotationDirection = 1;
window.yRotationDirection = 1;
window.zRotationDirection = 1;
window.intermediatePoints = [];
window.selectedPointIndex = -1; 
window.draggingPointIndex = -1; 
window.lastModifiedPointIndex = -1;
window.dragOffsetX = 0; 
window.dragOffsetY = 0;
window.selectedSavedXFormId = null;
window.wasDraggingPoint = false; 
window.isRectangleDragging = false;
window.currentXFormName = "New X-Form";
window.currentXFormId = null;
window.currentXFormHasRun = false;
window.isFilenameModeATM = true; // Default
window.lastUsedDirHandle = null;


// --- Initial Setup on DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Loaded. Initializing XForm Maker...');

    // --- Populate Global DOM Element References ---
    window.viewport = document.getElementById('viewport');
    window.addWaypointButton = document.getElementById('addWaypointBtn');
    window.waypointCounter = document.getElementById('waypointCounter');
    window.deleteLastWaypointButton = document.getElementById('deleteLastWaypointBtn');
    // Note: savedListUl etc. might not exist if HTML was simplified, check within persistence module
    window.savedListUl = document.getElementById('savedList'); 
    window.selectedControlsDiv = document.getElementById('selectedXFormControls');
    window.renameInput = document.getElementById('renameInput');
    window.widthInput = document.getElementById('rectWidth');
    window.heightInput = document.getElementById('rectHeight');
    window.durationInput = document.getElementById('duration');
    window.themeToggleButton = document.getElementById('themeToggle');
    
    // --- Call Module Setup Functions --- 
    // Ensure functions are defined before calling
    if (typeof setupIndexedDBPersistence === 'function') {
        // Check if we need to reset the database
        if (typeof resetDatabase === 'function' && localStorage.getItem('xformdb_initialized') !== 'true') {
            console.log('First time setup detected - resetting database to ensure proper initialization');
            resetDatabase().then(() => {
                // Mark as initialized
                localStorage.setItem('xformdb_initialized', 'true');
                // Now set up persistence
                setupIndexedDBPersistence();
            }).catch(err => {
                console.error('Error during database reset:', err);
                setupIndexedDBPersistence();
            });
        } else {
            // Normal setup
            setupIndexedDBPersistence();
        }
    } else if (typeof setupPersistence === 'function') {
        // Fall back to old file-based persistence if new one isn't available
        console.log("Using legacy file-based persistence");
        setupPersistence();
    } else {
        console.error("No persistence setup function found!");
    }

    if (typeof setupControls === 'function') {
        setupControls(); // Sets up rotation, duration, viewport actions, waypoints, resize
    } else {
        console.error("Controls setup function not found!");
    }

    // --- Final Initialization Steps ---
    // Initial applyRectangleSize might be needed if restoreState doesn't handle it fully
    // but initializeRects called within restoreState should cover initial setup.
    // applyRectangleSize(); 
    
    // Re-apply theme in case restoreState didn't catch it or for initial load
    if (typeof applyTheme === 'function') {
         const savedTheme = localStorage.getItem('xformMakerTheme') || 'light';
         applyTheme(savedTheme);
    } else {
         console.error("applyTheme function not found!");
    }
    
    // Ensure waypoint counter and rotation buttons are correct after all setup
    if (typeof window.updateWaypointCounter === 'function') window.updateWaypointCounter();
    if (typeof updateRotationButtonsUI === 'function') updateRotationButtonsUI();
    
    // Ensure icons are set correctly for initial theme
    if (typeof updateIconsForTheme === 'function') updateIconsForTheme();

    console.log("Application initialization sequence complete.");

    // --- Global Helper Functions (Minimal set remaining) ---
    // Theme toggle listener might remain here if not moved
    if (window.themeToggleButton && typeof applyTheme === 'function') {
        window.themeToggleButton.addEventListener('click', () => {
             console.log("Theme toggle clicked!");
             const currentTheme = document.documentElement.classList.contains('dark-theme') ? 'dark' : 'light';
             const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
             applyTheme(newTheme); 
             // saveCurrentState() is now called by the setupStatePersistence listener in the persistence module
        });
    }

});

// Functions previously defined outside DOMContentLoaded and now potentially shared
// like updateRotationButtonsUI, applyTheme, updateWaypointCounter are now expected
// to be defined in the respective modules (controls or persistence) or attached to window.
// We keep the DOMContentLoaded wrapper for the initial setup orchestration.