// This file exists for backward compatibility only
// All functionality has been moved to xform-indexeddb.js

document.addEventListener('DOMContentLoaded', function() {
    console.log('db-reset-button.js: Functionality moved to xform-indexeddb.js');
    
    // If the function exists, call it
    if (typeof window.initDbResetButton === 'function') {
        window.initDbResetButton();
    } else {
        console.error('initDbResetButton function not found in global scope');
    }
}); 