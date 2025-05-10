// Function for complete reset that combines all steps
function completeReset() {
    if (confirm('⚠️ WARNING: This will delete ALL your data and reload the application.\n\nThis action CANNOT be undone! Are you sure?')) {
        console.log("🧹 Performing complete application reset...");
        
        // Define database name (ensure consistency)
        const DB_NAME = 'xformMakerDB';
        
        // Step 1: Delete the database
        const deleteRequest = window.indexedDB.deleteDatabase(DB_NAME);
        
        deleteRequest.onsuccess = () => {
            console.log("Database deleted successfully");
            
            // Step 2: Clear localStorage
            localStorage.clear();
            console.log("LocalStorage cleared");
            
            // Step 3: Reload the page
            console.log("Reloading page...");
            setTimeout(() => location.reload(), 500);
        };
        
        deleteRequest.onerror = (event) => {
            console.error("Error deleting database:", event.target.error);
            console.log("Attempting to continue with localStorage clear and reload anyway...");
            localStorage.clear();
            setTimeout(() => location.reload(), 500);
        };
        
        deleteRequest.onblocked = () => {
            console.warn("Database deletion blocked - please close any other tabs with this app open");
            console.log("Attempting to continue with localStorage clear and reload anyway...");
            localStorage.clear();
            setTimeout(() => location.reload(), 500);
        };
    } else {
        console.log('❌ Reset canceled by user.');
    }
}

// Attach to window object immediately
window.completeReset = completeReset;

// --- Add other essential console utilities here ---

// Function to dump database information without resetting
async function dumpDatabaseInfo() {
    console.log("=========== DATABASE DUMP ===========");
    try {
        if (!window.indexedDB) { console.error("IndexedDB not supported"); return; }
        console.log("IndexedDB API available");
        if (window.indexedDB.databases) {
            try { console.log("All IndexedDB databases:", await window.indexedDB.databases()); } 
            catch (e) { console.log("Cannot list all databases:", e); }
        }
        const openRequest = indexedDB.open('xformMakerDB'); // Use DB_NAME constant
        openRequest.onerror = (event) => console.error("Error opening DB for inspection:", event.target.error);
        openRequest.onsuccess = (event) => {
            const db = event.target.result;
            console.log(`DB opened for inspection: ${db.name}, v${db.version}`);
            const stores = Array.from(db.objectStoreNames);
            console.log(`Object stores: ${stores.join(', ')}`);
            if (stores.length > 0) {
                stores.forEach(storeName => {
                    console.log(`\n--- Examining store: ${storeName} ---`);
                    try {
                        const tx = db.transaction(storeName, 'readonly');
                        const store = tx.objectStore(storeName);
                        console.log(` Store: ${store.name}, KeyPath: ${store.keyPath}, AutoInc: ${store.autoIncrement}, Indexes: ${Array.from(store.indexNames).join(', ')}`);
                        const getAllRequest = store.getAll();
                        getAllRequest.onsuccess = () => {
                            const items = getAllRequest.result || [];
                            console.log(` Content (${items.length} items):`);
                            items.forEach((item, index) => console.log(`  Item ${index + 1}:`, item)); // Log each item
                        };
                        getAllRequest.onerror = (event) => console.error(` Error getting data from ${storeName}:`, event.target.error);
                    } catch (storeError) { console.error(` Error examining store ${storeName}:`, storeError); }
                });
            } else { console.log("DB has no object stores."); }
            db.close();
            console.log("=========== END DATABASE DUMP ===========");
        };
    } catch (error) { console.error("Error during DB inspection:", error); }
}
window.dumpDatabaseInfo = dumpDatabaseInfo;

// Function to diagnose and repair database
async function diagnoseAndRepairDatabase() {
    if (!window.appInitializationComplete) {
        console.warn("⚠️ App not fully initialized. Diagnostics might be incomplete, but proceeding...");
    }
    console.group('🔧 Database Repair');
    try {
        const db = await window.openDB(); // Assumes openDB is defined globally or in this scope
        console.log(`✅ Connected to database: ${db.name} (version ${db.version})`);
        const storeNames = Array.from(db.objectStoreNames);
        const XFORMS_STORE_NAME = 'xforms'; // Ensure consistency
        if (!storeNames.includes(XFORMS_STORE_NAME)) {
            console.warn(`⚠️ Required store '${XFORMS_STORE_NAME}' not found. Attempting reset...`);
            db.close(); // Close connection before reset
            await window.resetDatabase(); // Assumes resetDatabase is defined
            console.log('✅ Database reset completed. Please reload if issues persist.');
        } else {
            console.log(`✅ Required store '${XFORMS_STORE_NAME}' exists.`);
            // Add index check/repair if needed here
        }
    } catch (error) { console.error('❌ Error during database repair:', error); }
    console.groupEnd();
}
window.diagnoseAndRepairDatabase = diagnoseAndRepairDatabase;

// Function to list all XForms concisely
async function listAllXForms() {
    if (!window.appInitializationComplete) { console.warn("⚠️ App not fully initialized."); return; }
    console.group('📋 ALL XFORMS IN DATABASE');
    try {
        const xforms = await window.listXForms(); // Assumes listXForms is global
        console.table(xforms.map(x => ({ ID: x.id, Name: x.name, Waypoints: x.waypoints?.length || 0, LastModified: new Date(x.lastModified).toLocaleString() })));
    } catch (e) { console.error("Error listing XForms:", e); }
    console.groupEnd();
}
window.listAllXForms = listAllXForms;

// Function to list XForms as JSONL
async function listXFormsAsJsonl() {
    if (!window.appInitializationComplete) { console.warn("⚠️ App not fully initialized."); return; }
    console.group('📋 XForms as JSONL');
    try {
        const xforms = await window.listXForms();
        if (xforms.length === 0) { console.log('No XForms found'); } 
        else { 
            console.log('--- JSONL Format ---');
            console.log(xforms.map(JSON.stringify).join('\n'));
            console.log('--- End JSONL --- ');
        }
    } catch (e) { console.error("Error listing JSONL:", e); }
    console.groupEnd();
}
window.listXFormsAsJsonl = listXFormsAsJsonl;

// Function to show XForm details
async function xform_details(id) {
    if (!window.appInitializationComplete) { console.warn("⚠️ App not fully initialized."); return; }
    // ... (Implementation from console-utils.js) ...
}
window.xform_details = xform_details;

// Function to inspect UI elements
function inspectXFormElements() {
    if (!window.appInitializationComplete) { console.warn("⚠️ App not fully initialized."); return; }
    // ... (Implementation from console-utils.js) ...
}
window.inspectXFormElements = inspectXFormElements;

// Function to get current XForm values
function getXFormValues() {
    if (!window.appInitializationComplete) { console.warn("⚠️ App not fully initialized."); return; }
    // ... (Implementation from console-utils.js) ...
}
window.getXFormValues = getXFormValues;

// Function to verify UI consistency
function verifyXFormUIConsistency() {
    if (!window.appInitializationComplete) { console.warn("⚠️ App not fully initialized."); return; }
    // ... (Implementation from console-utils.js) ...
}
window.verifyXFormUIConsistency = verifyXFormUIConsistency;

// Function to preview editor state
function previewEditorState() {
    if (!window.appInitializationComplete) { console.warn("⚠️ App not fully initialized."); return; }
    console.group('📊 Current Editor State');
    
    // Get current UI values
    const state = {
        // Rectangles
        startRect: window.startRect ? {
            left: parseInt(window.startRect.style.left) || 0,
            top: parseInt(window.startRect.style.top) || 0,
            width: parseInt(window.startRect.style.width) || 0,
            height: parseInt(window.startRect.style.height) || 0
        } : 'Not found',
        
        endRect: window.endRect ? {
            left: parseInt(window.endRect.style.left) || 0,
            top: parseInt(window.endRect.style.top) || 0,
            width: parseInt(window.endRect.style.width) || 0,
            height: parseInt(window.endRect.style.height) || 0
        } : 'Not found',
        
        // Input values
        inputValues: {
            name: document.getElementById('xformNameInput')?.value || 'Not found',
            width: document.getElementById('rectWidth')?.value || 'Not found',
            height: document.getElementById('rectHeight')?.value || 'Not found',
            duration: document.getElementById('duration')?.value || 'Not found'
        },
        
        // Waypoints
        waypoints: {
            count: window.intermediatePoints?.length || 0,
            points: window.intermediatePoints || []
        },
        
        // Rotations
        rotations: {
            x: window.xRotationDirection || 0,
            y: window.yRotationDirection || 0,
            z: window.zRotationDirection || 0
        },
        
        // Current XForm info
        currentXForm: {
            name: window.currentXFormName || 'Not set',
            id: window.currentXFormId || 'Not set',
            hasRun: !!window.currentXFormHasRun,
            xformNamingModeATM: !!window.isNamingModeATM
        }
    };
    
    console.log(state);
    
    // Display friendly summary
    console.log('\n--- Editor State Summary ---');
    console.log(`XformName: ${state.inputValues.name}`);
    console.log(`Rectangle Size: ${state.inputValues.width}x${state.inputValues.height}px`);
    console.log(`Start Rectangle: (${state.startRect.left}, ${state.startRect.top})`);
    console.log(`End Rectangle: (${state.endRect.left}, ${state.endRect.top})`);
    console.log(`Waypoints: ${state.waypoints.count}`);
    console.log(`Rotations: X=${state.rotations.x}, Y=${state.rotations.y}, Z=${state.rotations.z}`);
    console.log(`Duration: ${state.inputValues.duration}ms`);
    console.log(`Current XForm: "${state.currentXForm.name}" (ID: ${state.currentXForm.id})`);
    console.log(`ATM Mode: ${state.currentXForm.xformNamingModeATM ? 'ON' : 'OFF'}`);
    
    console.groupEnd();
    return state;
}
window.previewEditorState = previewEditorState;

// Function to preview selected XForms
function previewSelectedXForms() {
    if (!window.appInitializationComplete) { console.warn("⚠️ App not fully initialized."); return; }
    console.group('📋 Selected XForms');
    
    if (!window.selectedXforms || window.selectedXforms.length === 0) {
        console.log('No XForms are currently selected');
        console.groupEnd();
        return [];
    }
    
    console.log(`${window.selectedXforms.length} XForm(s) selected:`);
    
    // Display each selected XForm
    window.selectedXforms.forEach((xform, index) => {
        console.group(`XForm ${index + 1}: "${xform.name}" (ID: ${xform.id})`);
        
        // Basic info
        console.log(`Name: ${xform.name}`);
        console.log(`ID: ${xform.id}`);
        console.log(`Last Modified: ${new Date(xform.lastModified).toLocaleString()}`);
        
        // Rectangle info
        if (xform.startRect) {
            console.log(`Start Rectangle: (${xform.startRect.left}, ${xform.startRect.top}) - ${xform.startRect.width}x${xform.startRect.height}px`);
        }
        
        if (xform.endRect) {
            console.log(`End Rectangle: (${xform.endRect.left}, ${xform.endRect.top}) - ${xform.endRect.width}x${xform.endRect.height}px`);
        }
        
        // Waypoints
        if (xform.waypoints && Array.isArray(xform.waypoints)) {
            console.log(`Waypoints: ${xform.waypoints.length}`);
            if (xform.waypoints.length > 0) {
                console.table(xform.waypoints);
            }
        }
        
        // Rotations
        if (xform.rotations) {
            console.log(`Rotations: X=${xform.rotations.x}, Y=${xform.rotations.y}, Z=${xform.rotations.z}`);
        }
        
        // Duration
        console.log(`Duration: ${xform.duration}ms`);
        
        console.groupEnd();
    });
    
    console.groupEnd();
    return window.selectedXforms;
}
window.previewSelectedXForms = previewSelectedXForms;

// Function to delete selected XForms
function delsel() {
    if (!window.appInitializationComplete) { console.warn("⚠️ App not fully initialized."); return; }
    // ... (Implementation from console-utils.js) ...
}
window.delsel = delsel;

// Function to fix XForm list rendering
async function fixXFormList() {
    if (!window.appInitializationComplete) { console.warn("⚠️ App not fully initialized."); return; }
    // ... (Implementation from console-utils.js) ...
}
window.fixXFormList = fixXFormList;

// Function to debug XForm loading
function debugXFormLoading(id) {
    if (!window.appInitializationComplete) { console.warn("⚠️ App not fully initialized."); return; }
    // ... (Implementation from console-utils.js) ...
}
window.debugXFormLoading = debugXFormLoading;

// Function to compare XForms
async function compareXForms(id1, id2) {
    if (!window.appInitializationComplete) { console.warn("⚠️ App not fully initialized."); return; }
    // ... (Implementation from debug-xforms.js - Note: needs compareProperty helper too)
}
window.compareXForms = compareXForms;

// Function to compare with last saved
async function compareWithLastSaved(id) {
    if (!window.appInitializationComplete) { console.warn("⚠️ App not fully initialized."); return; }
    // ... (Implementation from debug-xforms.js) ...
}
window.compareWithLastSaved = compareWithLastSaved;

// Helper for compareXForms (needs to be moved too)
function compareProperty(name, value1, value2) {
    // ... (Implementation from debug-xforms.js) ...
}
// Note: compareProperty doesn't strictly need to be global, but moving it with dependents is easiest.
window.compareProperty = compareProperty; 

// --- Global Initialization Flag ---
window.appInitializationComplete = false;

// --- Global State Variables & Constants ---
// LocalStorage Keys (Declared in inline script in HTML)
// const STORAGE_KEY = 'xformMaker_savedForms';
// const STATE_STORAGE_KEY = 'xformMaker_currentState';
// XformName Mode Keys (Declared in xform-persistence.js)
// const XFORM_NAMING_MODE_KEY = 'xformMaker_xformNamingMode';
// const XFORM_NAMING_VALUE_KEY = 'xformMaker_xformNamingModeValue';

// DOM Element References (to be populated in DOMContentLoaded)
window.savedListUl = null;
window.selectedControlsDiv = null;
window.renameInput = null;
window.deleteLastWaypointButton = null;
window.waypointCounter = null;
window.widthInput = null;
window.heightInput = null;
window.durationInput = null;
window.themeToggleButton = null;
window.viewport = null;
window.xformNameInput = null;

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
window.lastClickedListItemIndex = -1;
window.currentXFormName = "New X-Form";
window.currentXFormId = null;
window.currentXFormHasRun = false;
window.isNamingModeATM = true; // Default
window.lastUsedDirHandle = null;

// *** NEW: Path Interpolation Mode ***
window.pathInterpolationMode = 'passthrough'; // Options: 'passthrough', 'gravity'


// --- Initial Setup on DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM fully loaded and parsed. Initializing application...');

    // Initialize viewport reference
    window.viewport = document.getElementById('viewport');
    if (!window.viewport) {
        console.error('Viewport element not found!');
        return;
    }

    // Initialize input references
    window.widthInput = document.getElementById('rectWidth');
    window.heightInput = document.getElementById('rectHeight');
    window.durationInput = document.getElementById('duration');
    window.deleteLastWaypointButton = document.getElementById('deleteLastWaypointButton');

    // Initialize XformNameController first
    if (typeof window.initializeXformNameController === 'function') {
        window.initializeXformNameController();
        console.log('XformNameController initialized');
    } else {
        console.warn('XformNameController not found');
    }

    // Check for animation manager
    if (typeof window.animationManager === 'undefined') {
        console.warn('Animation manager not found, animations will not be available');
    } else {
        console.log('Animation manager found, initializing animations...');
        // Initialize flapping animation
        if (typeof window.FlappingAnimation === 'function') {
            const flappingAnimation = new window.FlappingAnimation();
            flappingAnimation.initialize();
            console.log('Flapping animation initialized');
        }
    }

    // Initialize rectangles as hidden by default
    if (typeof window.initializeRects === 'function') {
        window.initializeRects(false);
        console.log('Rectangles initialized (hidden)');
    } else {
        console.warn('initializeRects function not found');
    }

    // Create SVG element for path
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'path-visualization';
    svg.style.display = 'none';
    window.viewport.appendChild(svg);

    // Create preview rectangle
    const previewRect = document.createElement('div');
    previewRect.id = 'previewRect';
    previewRect.style.display = 'none';
    window.viewport.appendChild(previewRect);

    // Initialize path control buttons
    if (typeof window.setupPathStyleButton === 'function') {
        window.setupPathStyleButton();
    }
    if (typeof window.setupPathWidthButton === 'function') {
        window.setupPathWidthButton();
    }
    if (typeof window.setupPathShapeButton === 'function') {
        window.setupPathShapeButton();
    }

    // Setup viewport actions (including the "New" button)
    if (typeof window.setupViewportActions === 'function') {
        window.setupViewportActions();
        console.log('Viewport actions initialized');
    } else {
        console.warn('setupViewportActions function not found');
    }

    // Setup waypoint controls
    if (typeof window.setupWaypointControls === 'function') {
        window.setupWaypointControls();
        console.log('Waypoint controls initialized');
    } else {
        console.warn('setupWaypointControls function not found');
    }

    // Setup rectangle controls
    if (typeof window.setupRectangleControls === 'function') {
        window.setupRectangleControls();
        console.log('Rectangle controls initialized');
    } else {
        console.warn('setupRectangleControls function not found');
    }

    // Setup rotation controls
    if (typeof window.setupRotationControls === 'function') {
        window.setupRotationControls();
        console.log('Rotation controls initialized');
    } else {
        console.warn('setupRotationControls function not found');
    }

    // Add event listener for reset button
    const resetButton = document.getElementById('resetAllFieldsBtn');
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset all X-Form fields and clear selections?')) {
                if (typeof window.resetXFormFields === 'function') {
                    window.resetXFormFields();
                }
            }
        });
    }

    console.log('Application initialization complete');
    window.appInitializationComplete = true;
});

// Functions previously defined outside DOMContentLoaded and now potentially shared
// like updateRotationButtonsUI, applyTheme, updateWaypointCounter are now expected
// to be defined in the respective modules (controls or persistence) or attached to window.
// We keep the DOMContentLoaded wrapper for the initial setup orchestration.

// --- UI Control Functions ---
function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) {
        console.warn("Theme toggle button not found");
        return;
    }

    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.classList.contains('dark-theme');
        const newTheme = isDark ? 'light' : 'dark';
        applyTheme(newTheme);
    });
}

function setupHelpButton() {
    const helpBtn = document.getElementById('helpBtn');
    if (!helpBtn) {
        console.warn("Help button not found");
        return;
    }

    helpBtn.addEventListener('click', () => {
        if (typeof showUsageModal === 'function') {
            showUsageModal();
        } else {
            console.warn("showUsageModal function not found");
        }
    });
}

function setupFileOperations() {
    const importBtn = document.getElementById('importBtn');
    const exportBtn = document.getElementById('exportBtn');
    
    if (importBtn) {
        importBtn.addEventListener('click', async () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,.jsonl';
            
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    if (typeof importXFormsFromFile === 'function') {
                        await importXFormsFromFile(file);
                    } else {
                        console.warn("importXFormsFromFile function not found");
                    }
                }
            };
            
            input.click();
        });
    } else {
        console.warn("Import button not found");
    }
    
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            if (typeof exportAllXFormsToFile === 'function') {
                await exportAllXFormsToFile();
            } else {
                console.warn("exportAllXFormsToFile function not found");
            }
        });
    } else {
        console.warn("Export button not found");
    }
}

function setupSortButton() {
    const sortBtn = document.getElementById('sortXformsBtn');
    if (!sortBtn) {
        console.warn("Sort button not found");
        return;
    }

    sortBtn.addEventListener('click', () => {
        if (typeof renderXFormList === 'function') {
            // Toggle between name and date sort
            const currentMode = window.fileListSortMode || 0;
            const newMode = (currentMode + 1) % 4; // 0: name asc, 1: name desc, 2: date asc, 3: date desc
            window.fileListSortMode = newMode;
            
            const sortBy = newMode < 2 ? 'name' : 'lastModified';
            const sortDirection = newMode % 2 === 0 ? 'asc' : 'desc';
            
            renderXFormList(sortBy, sortDirection);
        } else {
            console.warn("renderXFormList function not found");
        }
    });
}

function setupResetButton() {
    const resetBtn = document.getElementById('reset-db-btn');
    if (!resetBtn) {
        console.warn("Reset button not found");
        return;
    }

    resetBtn.addEventListener('click', async () => {
        if (typeof showModalDialog === 'function') {
            const choice = await showModalDialog({
                message: "Are you sure you want to reset the database? This will delete all saved XForms.",
                buttons: [
                    { id: 'reset', label: 'Reset', class: 'danger' },
                    { id: 'cancel', label: 'Cancel', class: 'secondary' }
                ]
            });

            if (choice === 'reset' && typeof resetDatabase === 'function') {
                try {
                    await resetDatabase();
                    if (typeof refreshListWithEmptyState === 'function') {
                        refreshListWithEmptyState();
                    }
                    await showInfoDialog("Database has been reset successfully.");
                } catch (error) {
                    console.error("Database reset error:", error);
                    await showInfoDialog("Error resetting database: " + error.message);
                }
            }
        } else {
            console.warn("showModalDialog function not found");
        }
    });
}