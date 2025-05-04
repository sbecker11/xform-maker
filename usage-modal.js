// Usage modal functionality for XForm Maker

// Show usage information in a modal dialog
window.showUsageModal = async function() {
    console.log("Opening usage modal...");
    let backdrop = document.getElementById('usageModalBackdrop');
    
    if (!backdrop) {
        console.log("Creating new usage modal elements");
        backdrop = document.createElement('div');
        backdrop.id = 'usageModalBackdrop';
        // Combine classes for styling reuse
        backdrop.className = 'modal-backdrop usage-modal-backdrop'; 
        backdrop.innerHTML = `
            <div class="custom-confirm-modal usage-modal">
                <h3 class="usage-title">X-Form Maker - Usage Information</h3>
                <div class="usage-content"></div>
                <div class="custom-confirm-buttons usage-buttons">
                    <button id="usageCloseBtn" class="modal-btn secondary">Close</button>
                </div>
            </div>`;
        document.body.appendChild(backdrop);

        // Add listener for the close button *once*
        backdrop.querySelector('#usageCloseBtn').addEventListener('click', () => {
            backdrop.style.display = 'none';
            // Remove ESC listener when closed
            document.removeEventListener('keydown', backdrop._escHandler); 
        });
        
        // Add backdrop click dismiss listener *once*
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                backdrop.style.display = 'none';
                document.removeEventListener('keydown', backdrop._escHandler); 
            }
        });
    }

    // Populate content
    const contentDiv = backdrop.querySelector('.usage-content');
    
    // Use <embed> tag to display the content
    try {
        console.log("Setting up embed for usage.txt content...");
        
        // Clear previous content
        contentDiv.innerHTML = '';
        
        // Create embed element
        const embedElement = document.createElement('embed');
        embedElement.type = 'text/plain';
        embedElement.src = './usage.txt';
        embedElement.style.width = '700px';
        embedElement.style.height = '400px';
        embedElement.style.border = 'none';
        
        // Add embed to the container
        contentDiv.appendChild(embedElement);
        
        // Set a fallback in case embed doesn't work
        embedElement.onerror = function() {
            console.warn('Failed to load usage.txt with embed tag');
            createFallbackUsageContent(contentDiv);
        };
        
        // If embed is empty after a short delay, use fallback
        setTimeout(() => {
            if (embedElement.clientHeight < 50) {
                console.warn('Embed appears empty, using fallback content');
                createFallbackUsageContent(contentDiv);
            }
        }, 500);
    } catch (e) {
        console.error('Error setting up usage content embed:', e);
        // Use embedded content as fallback
        createFallbackUsageContent(contentDiv);
    }
    
    // Ensure scroll position is reset
    contentDiv.scrollTop = 0;

    // Define ESC handler specific to this modal instance
    backdrop._escHandler = (ev) => {
        if (ev.key === 'Escape') {
            backdrop.style.display = 'none';
            document.removeEventListener('keydown', backdrop._escHandler); // Remove this specific listener
        }
    };
    
    // Remove potentially stale listener before adding
    document.removeEventListener('keydown', backdrop._escHandler);
    // Add listener when showing
    document.addEventListener('keydown', backdrop._escHandler);
   
    // Show modal
    backdrop.style.display = 'flex';
    console.log("Usage modal displayed");
};

// Function to create fallback content using proper styling
function createFallbackUsageContent(container) {
    const usageContent = `
    <div class="usage-fallback">
        <h4>XForm Maker Usage</h4>
        <p>This tool allows you to define and visualize 2D transformations.</p>
        
        <h4>Main Areas:</h4>
        <ul>
            <li>Left Panel: Manage saved transformations (XForms). Select, sort, import, export, delete.</li>
            <li>Center Panel: Visual viewport showing the Start (green) and End (red) states. Click background to add waypoints. Drag rectangles or waypoints to adjust.</li>
            <li>Right Panel: Controls for transformation parameters (Rotation, Size, Duration, Waypoints).</li>
        </ul>
        
        <h4>Workflow:</h4>
        <ul>
            <li>Adjust Rectangles: Drag the Start and End rectangles to desired positions.</li>
            <li>Set Size/Duration: Use controls in the right panel.</li>
            <li>Add Waypoints (Optional): Click in the viewport to add intermediate points. Drag waypoints to refine the path.</li>
            <li>Set Rotation: Use the X/Y/Z controls.</li>
            <li>Name XForm: Use the input field at the top-left. Switch between time-based (ATM) and manual (MEM) naming using the clock/T icons.</li>
            <li>Save XForm: Click the "Save" button (disk icon) next to the xformName field.</li>
            <li>Load XForm: Double-click an item in the Saved X-Forms list.</li>
            <li>Animate: Click "Play" below the viewport.</li>
        </ul>
        
        <h4>Path Visualization:</h4>
        <ul>
            <li>Use the "Path: ..." button below the viewport to cycle through visual styles (dotted, dashed, solid, circles, boxes, none).</li>
            <li>Use console commands like <code>set_path_thickness(n)</code> to change line thickness.</li>
        </ul>
        
        <h4>Path Interpolation Mode (Console Only):</h4>
        <ul>
            <li>Passthrough (Default): Curve passes smoothly through all waypoints. Use <code>pass_thru()</code> or <code>xf("curve passthrough")</code>.</li>
            <li>Influencer/Gravity: Waypoints act as Bezier control points (1 waypoint = Quadratic, 2 = Cubic). Curve doesn't necessarily pass through waypoints. Use <code>gravity()</code> or <code>xf("curve gravity")</code>.</li>
            <li>Linear: Straight lines connect points. Use <code>linear()</code> or <code>xf("curve linear")</code>.</li>
        </ul>
        
        <h4>File Management:</h4>
        <ul>
            <li>Save: Saves the current state to the browser's IndexedDB.</li>
            <li>Import/Export: Use buttons in the Saved X-Forms header to import/export <code>*.jsonl</code> files containing one or more XForms.</li>
        </ul>
        
        <h4>Console Utilities:</h4>
        <ul>
            <li>Type <code>help()</code> in the console for a list of debug commands.</li>
            <li><code>delsel()</code> - Delete all currently selected XForms via confirmation dialog</li>
            <li><code>previewEditorState()</code> - Preview current editor state (rectangles, rotations, duration, waypoints)</li>
            <li><code>previewSelectedXForms()</code> - Preview data of currently selected XForms in the listing</li>
        </ul>
        
        <h4>System Administration:</h4>
        <ul>
            <li><code>dumpDatabaseInfo()</code> - Inspects and displays the current state of the IndexedDB database without making changes</li>
            <li><code>diagnoseAndRepairDatabase()</code> - Diagnoses database issues and attempts to repair them while preserving data</li>
            <li><code>completeReset()</code> - Performs a full system reset by deleting the database, clearing localStorage, and reloading the page</li>
            <li>Use these functions from the browser console if you encounter issues with XForms not being saved or displayed</li>
        </ul>
    </div>`;
    
    container.innerHTML = usageContent;
    console.log("Fallback usage content displayed");
}

// REMOVE the DOMContentLoaded listener from here.
// Event listener attachment should be centralized in script.js
// document.addEventListener('DOMContentLoaded', () => {
//     const helpBtn = document.getElementById('helpBtn');
//     if (helpBtn) {
//         helpBtn.addEventListener('click', window.showUsageModal);
//         console.log("Help button connected to usage modal");
//     } else {
//         console.warn("Help button not found");
//     }
// }); 