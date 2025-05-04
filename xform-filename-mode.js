window.xformFilenameModeLoaded = true; // <-- TESTING: Set global flag
// console.log("DEBUG: xform-filename-mode.js script started execution."); // <-- Keep commented for now

// Filename mode handling for XForm Maker

// Constants
const FILENAME_MODE_KEY = 'xformMaker_filenameMode';
const FILENAME_VALUE_KEY = 'xformMaker_filenameValue';

// Initialize filename mode when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOMContentLoaded listener fired in xform-filename-mode.js");
    console.log("DEBUG: ===> About to call setupFilenameMode...");
    try {
        setupFilenameMode();
    } catch (e) {
        console.error("DEBUG: !!! ERROR calling setupFilenameMode !!!", e);
    }
    console.log("DEBUG: ===> Finished calling setupFilenameMode (or caught error).");
});

// Function to update save button state
function updateSaveButtonState() {
    const saveFileBtn = document.getElementById('saveFileBtn');
    
    if (!saveFileBtn) return;
    
    // Always ensure the save button is enabled
    saveFileBtn.disabled = false;
    saveFileBtn.classList.remove('disabled-state'); // Ensure any disabled styling is removed
}

// Make it globally accessible
window.updateSaveButtonState = updateSaveButtonState;

// Setup the filename mode switching and input field behavior
function setupFilenameMode() {
    console.log("DEBUG: setupFilenameMode function called.");

    const atmButton = document.getElementById('filenameModeATM');
    const memButton = document.getElementById('filenameModeManual');
    const filenameInput = document.getElementById('filenameInput');
    const saveFileBtn = document.getElementById('saveFileBtn');
    
    let missingElement = false;
    if (!atmButton) {
        console.error("DEBUG: !!! filenameModeATM element NOT FOUND !!!");
        missingElement = true;
    }
    if (!memButton) {
        console.error("DEBUG: !!! filenameModeManual element NOT FOUND !!!");
        missingElement = true;
    }
    if (!filenameInput) {
        console.error("DEBUG: !!! filenameInput element NOT FOUND !!!");
        missingElement = true;
    }
    if (!saveFileBtn) {
        console.error("DEBUG: !!! saveFileBtn element NOT FOUND !!!");
        missingElement = true;
    }

    if (missingElement) {
        console.error('Filename mode elements not found in DOM. Cannot initialize mode controls.');
        return;
    }
    
    console.log('DEBUG: All elements found. Proceeding with handler setup...');
    
    console.log('Setting up filename mode handlers...');

    // Function to UPDATE UI based on current mode (ATM or MEM)
    function updateModeUI(isATM) {
        console.log(`DEBUG: updateModeUI called with isATM = ${isATM}`);
        atmButton.classList.toggle('active', isATM);
        memButton.classList.toggle('active', !isATM);
        
        filenameInput.readOnly = isATM;
        filenameInput.classList.toggle('time-based-filename', isATM);
        
        // Enable/disable buttons based on mode
        atmButton.disabled = false; // Always clickable
        memButton.disabled = false; // Always clickable
        
        updateSaveButtonState(); // Update save button state whenever mode changes
        console.log(`DEBUG: updateModeUI finished.`);
    }

    // --- Event Listeners ---
    
    // ATM Button Click
    atmButton.addEventListener('click', () => {
        if (!window.isFilenameModeATM) {
            console.log('Switching to ATM');
            window.isFilenameModeATM = true;
            localStorage.setItem(FILENAME_MODE_KEY, 'ATM');
            updateModeUI(true);
            // Timer is handled by controller
            // updateTimeBasedFilename(); // REMOVED
            // startFilenameTimer();      // REMOVED
        }
    });
    
    // MEM Button Click
    memButton.addEventListener('click', () => {
        if (window.isFilenameModeATM) {
            console.log('Switching to MEM');
            window.isFilenameModeATM = false;
            localStorage.setItem(FILENAME_MODE_KEY, 'MEM');
            // Timer is handled by controller
            // stopFilenameTimer(); // REMOVED
            updateModeUI(false);
            localStorage.setItem(FILENAME_VALUE_KEY, filenameInput.value);
            filenameInput.focus();
            filenameInput.select();
        }
    });
    
    // Input Field Click (Switch to MEM if in ATM)
    filenameInput.addEventListener('click', () => {
        if (window.isFilenameModeATM) {
            console.log('Input clicked while in ATM, switching to MEM');
            memButton.click(); // Simulate clicking the MEM button
        }
    });
    
    // Input Field Typing (Update save state and persist value in MEM)
    filenameInput.addEventListener('input', () => {
        if (!window.isFilenameModeATM) {
            localStorage.setItem(FILENAME_VALUE_KEY, filenameInput.value);
            updateSaveButtonState(); // Enable/disable save based on content
        }
    });
    
    // Save Button Click
    saveFileBtn.addEventListener('click', () => {
        // Restore first part
        console.log("DEBUG: Save button event listener fired!"); 
        console.log("Save button clicked!"); 
        const name = filenameInput.value || 'Untitled XForm'; 
        console.log(`DEBUG: Got name: ${name}`); 

        // Restore the save call block
        if (typeof window.saveCurrentXForm === 'function') { 
            console.log("DEBUG: Calling window.saveCurrentXForm..."); 
            window.saveCurrentXForm().then(savedForm => {
                if (savedForm) {
                    console.log(`DEBUG: saveCurrentXForm() promise resolved successfully for "${name}".`);
                    console.log(`Saved X-Form: "${name}"`);
                } else {
                    console.warn(`DEBUG: saveCurrentXForm() promise resolved but returned null/falsy for "${name}".`);
                }
            }).catch(err => {
                // Add logging for promise rejection
                console.error(`DEBUG: Error occurred within saveCurrentXForm() promise for "${name}":`, err);
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
        savedMode = localStorage.getItem(FILENAME_MODE_KEY) || 'ATM';
        console.log(`DEBUG: localStorage got FILENAME_MODE_KEY: ${savedMode}`);
    } catch (e) {
        console.error("DEBUG: Error reading FILENAME_MODE_KEY from localStorage!", e);
        savedMode = 'ATM'; // Default on error
    }

    window.isFilenameModeATM = (savedMode === 'ATM');
    console.log(`DEBUG: Initial mode set to: ${window.isFilenameModeATM ? 'ATM' : 'MEM'}`);

    if (!window.isFilenameModeATM) {
        console.log("DEBUG: Setting initial MEM mode filename...");
        let savedFilename = 'New X-Form'; // Default
        try {
            savedFilename = localStorage.getItem(FILENAME_VALUE_KEY) || savedFilename;
            console.log(`DEBUG: localStorage got FILENAME_VALUE_KEY: ${savedFilename}`);
            filenameInput.value = savedFilename;
        } catch (e) {
            console.error("DEBUG: Error reading FILENAME_VALUE_KEY from localStorage!", e);
            filenameInput.value = savedFilename; // Use default on error
        }
        console.log("DEBUG: Initial MEM filename set.");
    }
    
    console.log("DEBUG: Calling updateModeUI for initial setup...");
    updateModeUI(window.isFilenameModeATM);
    console.log("DEBUG: updateModeUI call finished.");

    console.log("DEBUG: Calling updateSaveButtonState...");
    updateSaveButtonState(); // Ensure button state is correct initially

    console.log('Filename mode setup complete.');

    // --- Attach Listeners AFTER setup --- 
    // NOTE: We keep the listener attachment here, even though the controller might also attach
    // similar listeners. This ensures the core mode switching UI works even if the controller
    // fails to initialize for some reason. The controller's internal state management should 
    // override if it loads successfully.
    console.log("DEBUG: Attaching event listeners in setupFilenameMode..."); 

    // ATM Button Click Listener (Remains)
    atmButton.addEventListener('click', () => {
        if (!window.isFilenameModeATM) {
            console.log('Switching to ATM (via setupFilenameMode listener)');
            window.isFilenameModeATM = true;
            localStorage.setItem(FILENAME_MODE_KEY, 'ATM');
            updateModeUI(true);
            // Timer is handled by controller
            // updateTimeBasedFilename(); // REMOVED
            // startFilenameTimer();      // REMOVED
        }
    });
    
    // MEM Button Click Listener (Remains)
    memButton.addEventListener('click', () => {
        if (window.isFilenameModeATM) {
            console.log('Switching to MEM (via setupFilenameMode listener)');
            window.isFilenameModeATM = false;
            localStorage.setItem(FILENAME_MODE_KEY, 'MEM');
            // Timer is handled by controller
            // stopFilenameTimer(); // REMOVED
            updateModeUI(false);
            localStorage.setItem(FILENAME_VALUE_KEY, filenameInput.value);
            filenameInput.focus();
            filenameInput.select();
        }
    });
    
    // Input Field Click Listener (Remains)
    filenameInput.addEventListener('click', () => {
        if (window.isFilenameModeATM) {
            console.log('Input clicked while in ATM, switching to MEM (via setupFilenameMode listener)');
            memButton.click(); 
        }
    });
    
    // Input Field Typing Listener (Remains)
    filenameInput.addEventListener('input', () => {
        if (!window.isFilenameModeATM) {
            localStorage.setItem(FILENAME_VALUE_KEY, filenameInput.value);
            updateSaveButtonState();
        }
    });
    
    // Save Button Click Listener (Remains)
    saveFileBtn.addEventListener('click', () => {
        // Restore first part
        console.log("DEBUG: Save button event listener fired! (from setupFilenameMode)"); 
        console.log("Save button clicked! (from setupFilenameMode)"); 
        const name = filenameInput.value || 'Untitled XForm'; 
        console.log(`DEBUG: Got name: ${name} (from setupFilenameMode)`); 

        // Restore the save call block
        if (typeof window.saveCurrentXForm === 'function') { 
            console.log("DEBUG: Calling window.saveCurrentXForm... (from setupFilenameMode)"); 
            window.saveCurrentXForm().then(savedForm => {
                if (savedForm) {
                    console.log(`DEBUG: saveCurrentXForm() promise resolved successfully for "${name}". (from setupFilenameMode)`);
                    console.log(`Saved X-Form: "${name}" (from setupFilenameMode)`);
                } else {
                    console.warn(`DEBUG: saveCurrentXForm() promise resolved but returned null/falsy for "${name}". (from setupFilenameMode)`);
                }
            }).catch(err => {
                console.error(`DEBUG: Error occurred within saveCurrentXForm() promise for "${name}":`, err);
            });
        } else {
            console.error('saveCurrentXForm function not available (from setupFilenameMode)');
        }
    });
    console.log("DEBUG: Event listeners attached in setupFilenameMode.");
}

// Ensure the core setup function is still exported
window.setupFilenameMode = setupFilenameMode; 