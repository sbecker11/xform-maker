// Theme handling functions for XForm Maker

// Function to apply a specific theme
function applyTheme(theme) {
    const htmlElement = document.documentElement;
    if (theme === 'dark') {
        htmlElement.classList.add('dark-theme');
    } else {
        htmlElement.classList.remove('dark-theme');
    }
    localStorage.setItem('xformMakerTheme', theme);
    
    // Update icons if the function exists
    if (typeof updateIconsForTheme === 'function') {
        updateIconsForTheme();
    }
}

// Function to update icons based on current theme
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
    
    // Special handling for rotation icons which use background-image
    const rotationIcons = document.querySelectorAll('.rot-icon');
    if (rotationIcons.length > 0) {
        console.log(`Updating ${rotationIcons.length} rotation icons for theme`);
    }
}

// Function to apply theme from localStorage
function applyThemeFromLocalStorage() {
    const savedTheme = localStorage.getItem('xformMakerTheme') || 'light';
    applyTheme(savedTheme);
}

// Expose functions globally
window.applyTheme = applyTheme;
window.updateIconsForTheme = updateIconsForTheme;
window.applyThemeFromLocalStorage = applyThemeFromLocalStorage;

// Apply theme immediately when script loads
document.addEventListener('DOMContentLoaded', () => {
    applyThemeFromLocalStorage();
}); 