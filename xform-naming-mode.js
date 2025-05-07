window.xformNameModeLoaded = true; // <-- TESTING: Set global flag
// console.log("DEBUG: xform-naming-mode.js script started execution."); // <-- Keep commented for now

// XformName mode handling for XForm Maker

// Constants
const XFORM_NAMING_MODE_KEY = 'xformMaker_xformNamingMode';
const XFORM_NAMING_VALUE_KEY = 'xformMaker_xformNamingValue';

// Initialize name mode when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOMContentLoaded listener fired in xform-naming-mode.js");
    console.log("DEBUG: ===> About to call setupNamingMode...");
    try {
        setupNamingMode();
    } catch (e) {
        console.error("DEBUG: !!! ERROR calling setupNamingMode !!!", e);
    }
    console.log("DEBUG: ===> Finished calling setupNamingMode (or caught error).");
});

// Function to update save button state
function updateSaveButtonState() {
    const saveXformButton = document.getElementById('saveXformButton');
    
    if (!saveXformButton) return;
    
    // Always ensure the save button is enabled
    saveXformButton.disabled = false;
    saveXformButton.classList.remove('disabled-state'); // Ensure any disabled styling is removed
}

// Make it globally accessible
window.updateSaveButtonState = updateSaveButtonState;

// Setup the name mode switching and input field behavior
function setupNamingMode() {
    console.log("DEBUG: setupNamingMode function called.");

    const atmButton = document.getElementById('xformNamingModeATM');
    const memButton = document.getElementById('xformNamingModeMEM');
    const xformNameInput = document.getElementById('xformNameInput');
    const saveXformButton = document.getElementById('saveXformButton');
    
    let missingElement = false;
    if (!atmButton) {
        console.error("DEBUG: !!! xformNamingModeATM element NOT FOUND !!!");
        missingElement = true;
    }
    if (!memButton) {
        console.error("DEBUG: !!! xformNamingModeMEM element NOT FOUND !!!");
        missingElement = true;
    }
    if (!xformNameInput) {
        console.error("DEBUG: !!! xformNameInput element NOT FOUND !!!");
        missingElement = true;
    }
    if (!saveXformButton) {
        console.error("DEBUG: !!! saveXformButton element NOT FOUND !!!");
        missingElement = true;
    }

    if (missingElement) {
        console.error('XformName mode elements not found in DOM. Cannot initialize mode controls.');
        return;
    }
    
    console.log('DEBUG: All elements found. Proceeding with handler setup...');
    
    console.log('Setting up name mode handlers...');

    // Function to UPDATE UI based on current mode (ATM or MEM)
    // function updateNamingModeUI(isATM) { // <-- COMMENTED OUT
    //     console.log(`DEBUG: updateNamingModeUI called with isATM = ${isATM}`);
    //     atmButton.classList.toggle('active', isATM);
    //     memButton.classList.toggle('active', !isATM);
        
    //     xformNameInput.readOnly = isATM; // <-- Key conflict point
    //     xformNameInput.classList.toggle('time-based-name', isATM);
        
    //     atmButton.disabled = false; 
    //     memButton.disabled = false; 
        
    //     updateSaveButtonState(); 
    //     console.log(`DEBUG: updateNamingModeUI finished.`);
    // }

    // --- Event Listeners (COMMENTED OUT as controller should handle them) ---
    
    // // ATM Button Click
    // atmButton.addEventListener('click', () => {
    //     if (!window.isNamingModeATM) {
    //         console.log('Switching to ATM');
    //         window.isNamingModeATM = true;
    //         localStorage.setItem(XFORM_NAMING_MODE_KEY, 'ATM');
    //         // updateNamingModeUI(true); // UI update handled by controller
    //     }
    // });
    
    // // MEM Button Click
    // memButton.addEventListener('click', () => {
    //     if (window.isNamingModeATM) {
    //         console.log('Switching to MEM');
    //         window.isNamingModeATM = false;
    //         localStorage.setItem(XFORM_NAMING_MODE_KEY, 'MEM');
    //         // updateNamingModeUI(false); // UI update handled by controller
    //         localStorage.setItem(XFORM_NAMING_VALUE_KEY, xformNameInput.value);
    //         xformNameInput.focus();
    //         xformNameInput.select();
    //     }
    // });
    
    // // Input Field Click (Switch to MEM if in ATM)
    // xformNameInput.addEventListener('click', () => {
    //     if (window.isNamingModeATM) {
    //         console.log('Input clicked while in ATM, switching to MEM');
    //         // memButton.click(); // Controller should handle this logic
    //     }
    // });
    
    // // Input Field Typing (Update save state and persist value in MEM)
    // xformNameInput.addEventListener('input', () => {
    //     if (!window.isNamingModeATM) {
    //         localStorage.setItem(XFORM_NAMING_VALUE_KEY, xformNameInput.value);
    //         updateSaveButtonState(); 
    //     }
    // });
    
    // Save Button Click (This might be okay to keep if it only calls window.saveCurrentXForm)
    saveXformButton.addEventListener('click', () => {
        console.log("DEBUG: Save button event listener fired! (from xform-naming-mode.js)"); 
        const name = xformNameInput.value || 'Untitled XForm'; 

        if (typeof window.saveCurrentXForm === 'function') { 
            console.log("DEBUG: Calling window.saveCurrentXForm... (from xform-naming-mode.js)"); 
            window.saveCurrentXForm().then(savedForm => {
                if (savedForm) {
                    console.log(`DEBUG: saveCurrentXForm() promise resolved successfully for \"${name}\".`);
                } else {
                    console.warn(`DEBUG: saveCurrentXForm() promise resolved but returned null/falsy for \"${name}\".`);
                }
            }).catch(err => {
                console.error(`DEBUG: Error occurred within saveCurrentXForm() promise for \"${name}\":`, err);
            });
        } else {
            console.error('saveCurrentXForm function not available (called from xform-naming-mode.js)');
        }
    });
    
    // --- Initial State Setup ---
    // This part might still be useful if the controller doesn't load early enough,
    // or it could be fully managed by the controller. For now, let it set the initial global flag.
    console.log("DEBUG: Starting initial state setup... (in xform-naming-mode.js)");
    let savedMode = null;
    try {
        savedMode = localStorage.getItem(XFORM_NAMING_MODE_KEY) || 'ATM';
    } catch (e) {
        console.error("DEBUG: Error reading XFORM_NAMING_MODE_KEY from localStorage!", e);
        savedMode = 'ATM';
    }

    window.isNamingModeATM = (savedMode === 'ATM');
    console.log(`DEBUG: Initial mode (from localStorage in xform-naming-mode.js) set to: ${window.isNamingModeATM ? 'ATM' : 'MEM'}`);

    // The controller should handle setting the input value and UI on init.
    // if (!window.isNamingModeATM) {
    //     console.log("DEBUG: Setting initial MEM mode name... (in xform-naming-mode.js)");
    //     let savedXformName = 'New X-Form'; 
    //     try {
    //         savedXformName = localStorage.getItem(XFORM_NAMING_VALUE_KEY) || savedXformName;
    //         xformNameInput.value = savedXformName;
    //     } catch (e) {
    //         xformNameInput.value = savedXformName; 
    //     }
    // }
    
    // updateNamingModeUI(window.isNamingModeATM); // Controller handles UI
    
    updateSaveButtonState();

    console.log('XformName mode setup (partially NOPed) complete in xform-naming-mode.js.');
    
    // Event listeners below were duplicates and are fully commented out.
    // The XformNameController in xform-indexeddb.js should be the sole manager
    // for these button clicks and input field interactions related to mode switching.

    // console.log("DEBUG: Attaching event listeners in setupNamingMode (now NOPed)..."); 

    // // ATM Button Click Listener (COMMENTED OUT)
    // // memButton.addEventListener('click', () => { ... });
    
    // // MEM Button Click Listener (COMMENTED OUT)
    // // xformNameInput.addEventListener('click', () => { ... });
    
    // // Input Field Click Listener (COMMENTED OUT)
    // // xformNameInput.addEventListener('click', () => { ... });
    
    // // Input Field Typing Listener (COMMENTED OUT)
    // // xformNameInput.addEventListener('input', () => { ... });
}

// Ensure the core setup function is still exported
window.setupNamingMode = setupNamingMode; 