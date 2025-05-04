window.xformNameModeLoaded = true; // <-- TESTING: Set global flag
// console.log("DEBUG: xform-naming-mode.js script started execution."); // <-- Keep commented for now

// XformName mode handling for XForm Maker

// Constants
const XFORM_NAMING_MODE_KEY = 'xformMaker_xformNamingMode';
const XFORM_NAMING_VALUE_KEY = 'xformMaker_xformNamingValue';

// Initialize xformName mode when DOM is loaded
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

// Setup the xformName mode switching and input field behavior
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
    
    console.log('Setting up xformName mode handlers...');

    // Function to UPDATE UI based on current mode (ATM or MEM)
    function updateNamingModeUI(isATM) {
        console.log(`DEBUG: updateNamingModeUI called with isATM = ${isATM}`);
        atmButton.classList.toggle('active', isATM);
        memButton.classList.toggle('active', !isATM);
        
        xformNameInput.readOnly = isATM;
        xformNameInput.classList.toggle('time-based-xformName', isATM);
        
        // Enable/disable buttons based on mode
        atmButton.disabled = false; // Always clickable
        memButton.disabled = false; // Always clickable
        
        updateSaveButtonState(); // Update save button state whenever mode changes
        console.log(`DEBUG: updateNamingModeUI finished.`);
    }

    // --- Event Listeners ---
    
    // ATM Button Click
    atmButton.addEventListener('click', () => {
        if (!window.isNamingModeATM) {
            console.log('Switching to ATM');
            window.isNamingModeATM = true;
            localStorage.setItem(XFORM_NAMING_MODE_KEY, 'ATM');
            updateNamingModeUI(true);
            // Timer is handled by controller
            // updateTimeBasedXformName(); // REMOVED
            // startXformNameTimer();      // REMOVED
        }
    });
    
    // MEM Button Click
    memButton.addEventListener('click', () => {
        if (window.isNamingModeATM) {
            console.log('Switching to MEM');
            window.isNamingModeATM = false;
            localStorage.setItem(XFORM_NAMING_MODE_KEY, 'MEM');
            // Timer is handled by controller
            // stopXformNameTimer(); // REMOVED
            updateNamingModeUI(false);
            localStorage.setItem(XFORM_NAMING_VALUE_KEY, xformNameInput.value);
            xformNameInput.focus();
            xformNameInput.select();
        }
    });
    
    // Input Field Click (Switch to MEM if in ATM)
    xformNameInput.addEventListener('click', () => {
        if (window.isNamingModeATM) {
            console.log('Input clicked while in ATM, switching to MEM');
            memButton.click(); // Simulate clicking the MEM button
        }
    });
    
    // Input Field Typing (Update save state and persist value in MEM)
    xformNameInput.addEventListener('input', () => {
        if (!window.isNamingModeATM) {
            localStorage.setItem(XFORM_NAMING_VALUE_KEY, xformNameInput.value);
            updateSaveButtonState(); // Enable/disable save based on content
        }
    });
    
    // Save Button Click
    saveXformButton.addEventListener('click', () => {
        // Restore first part
        console.log("DEBUG: Save button event listener fired!"); 
        console.log("Save button clicked!"); 
        const xformName = xformNameInput.value || 'Untitled XForm'; 
        console.log(`DEBUG: Got xformName: ${xformName}`); 

        // Restore the save call block
        if (typeof window.saveCurrentXForm === 'function') { 
            console.log("DEBUG: Calling window.saveCurrentXForm..."); 
            window.saveCurrentXForm().then(savedForm => {
                if (savedForm) {
                    console.log(`DEBUG: saveCurrentXForm() promise resolved successfully for "${xformName}".`);
                    console.log(`Saved X-Form: "${xformName}"`);
                } else {
                    console.warn(`DEBUG: saveCurrentXForm() promise resolved but returned null/falsy for "${xformName}".`);
                }
            }).catch(err => {
                // Add logging for promise rejection
                console.error(`DEBUG: Error occurred within saveCurrentXForm() promise for "${xformName}":`, err);
            });
        } else {
            console.error('saveCurrentXForm function not available');
        }
        
        // --- TEMPORARILY SIMPLIFIED --- 
        // console.log("DEBUG: Save button event listener fired! (Simplified Check)"); 
        // -----------------------------
    });
    
    // --- Initial State Setup ---
    console.log("DEBUG: Starting initial state setup...");
    let savedMode = null;
    try {
        savedMode = localStorage.getItem(XFORM_NAMING_MODE_KEY) || 'ATM';
        console.log(`DEBUG: localStorage got XFORM_NAMING_MODE_KEY: ${savedMode}`);
    } catch (e) {
        console.error("DEBUG: Error reading XFORM_NAMING_MODE_KEY from localStorage!", e);
        savedMode = 'ATM'; // Default on error
    }

    window.isNamingModeATM = (savedMode === 'ATM');
    console.log(`DEBUG: Initial mode set to: ${window.isNamingModeATM ? 'ATM' : 'MEM'}`);

    if (!window.isNamingModeATM) {
        console.log("DEBUG: Setting initial MEM mode xformName...");
        let savedXformName = 'New X-Form'; // Default
        try {
            savedXformName = localStorage.getItem(XFORM_NAMING_VALUE_KEY) || savedXformName;
            console.log(`DEBUG: localStorage got XFORM_NAMING_VALUE_KEY: ${savedXformName}`);
            xformNameInput.value = savedXformName;
        } catch (e) {
            console.error("DEBUG: Error reading XFORM_NAMING_VALUE_KEY from localStorage!", e);
            xformNameInput.value = savedXformName; // Use default on error
        }
        console.log("DEBUG: Initial MEM xformName set.");
    }
    
    console.log("DEBUG: Calling updateNamingModeUI for initial setup...");
    updateNamingModeUI(window.isNamingModeATM);
    console.log("DEBUG: updateNamingModeUI call finished.");

    console.log("DEBUG: Calling updateSaveButtonState...");
    updateSaveButtonState(); // Ensure button state is correct initially

    console.log('XformName mode setup complete.');

    // --- Attach Listeners AFTER setup --- 
    // NOTE: We keep the listener attachment here, even though the controller might also attach
    // similar listeners. This ensures the core mode switching UI works even if the controller
    // fails to initialize for some reason. The controller's internal state management should 
    // override if it loads successfully.
    console.log("DEBUG: Attaching event listeners in setupNamingMode..."); 

    // ATM Button Click Listener (Remains)
    atmButton.addEventListener('click', () => {
        if (!window.isNamingModeATM) {
            console.log('Switching to ATM (via setupNamingMode listener)');
            window.isNamingModeATM = true;
            localStorage.setItem(XFORM_NAMING_MODE_KEY, 'ATM');
            updateNamingModeUI(true);
            // Timer is handled by controller
            // updateTimeBasedXformName(); // REMOVED
            // startXformNameTimer();      // REMOVED
        }
    });
    
    // MEM Button Click Listener (Remains)
    memButton.addEventListener('click', () => {
        if (window.isNamingModeATM) {
            console.log('Switching to MEM (via setupNamingMode listener)');
            window.isNamingModeATM = false;
            localStorage.setItem(XFORM_NAMING_MODE_KEY, 'MEM');
            // Timer is handled by controller
            // stopXformNameTimer(); // REMOVED
            updateNamingModeUI(false);
            localStorage.setItem(XFORM_NAMING_VALUE_KEY, xformNameInput.value);
            xformNameInput.focus();
            xformNameInput.select();
        }
    });
    
    // Input Field Click Listener (Remains)
    xformNameInput.addEventListener('click', () => {
        if (window.isNamingModeATM) {
            console.log('Input clicked while in ATM, switching to MEM (via setupNamingMode listener)');
            memButton.click(); 
        }
    });
    
    // Input Field Typing Listener (Remains)
    xformNameInput.addEventListener('input', () => {
        if (!window.isNamingModeATM) {
            localStorage.setItem(XFORM_NAMING_VALUE_KEY, xformNameInput.value);
            updateSaveButtonState();
        }
    });
    
    // Save Button Click Listener (Remains)
    saveXformButton.addEventListener('click', () => {
        // Restore first part
        console.log("DEBUG: Save button event listener fired! (from setupNamingMode)"); 
        console.log("Save button clicked! (from setupNamingMode)"); 
        const xformName = xformNameInput.value || 'Untitled XForm'; 
        console.log(`DEBUG: Got xformName: ${xformName} (from setupNamingMode)`); 

        // Restore the save call block
        if (typeof window.saveCurrentXForm === 'function') { 
            console.log("DEBUG: Calling window.saveCurrentXForm... (from setupNamingMode)"); 
            window.saveCurrentXForm().then(savedForm => {
                if (savedForm) {
                    console.log(`DEBUG: saveCurrentXForm() promise resolved successfully for "${xformName}". (from setupNamingMode)`);
                    console.log(`Saved X-Form: "${xformName}" (from setupNamingMode)`);
                } else {
                    console.warn(`DEBUG: saveCurrentXForm() promise resolved but returned null/falsy for "${xformName}". (from setupNamingMode)`);
                }
            }).catch(err => {
                console.error(`DEBUG: Error occurred within saveCurrentXForm() promise for "${xformName}":`, err);
            });
        } else {
            console.error('saveCurrentXForm function not available (from setupNamingMode)');
        }
    });
    console.log("DEBUG: Event listeners attached in setupNamingMode.");
}

// Ensure the core setup function is still exported
window.setupNamingMode = setupNamingMode; 