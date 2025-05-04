// UI Helper functions for XForm Maker

// Apply XForm data (DTO) to the UI elements
function applyXFormData(data) {
    // ** Input: data is expected to be a PURE data object, no DOM elements **
    console.groupCollapsed(`Applying XForm DTO: "${data?.xformName || 'Untitled'}"`);
    console.log("Received Data:", JSON.parse(JSON.stringify(data)));
    
    // Make sure we have valid data
    if (!data || typeof data !== 'object') {
        console.error("applyXFormData: Received invalid or empty data");
        console.groupEnd();
        return false;
    }
    
    // Ensure viewport exists
    if (!window.viewport) {
        window.viewport = document.getElementById('viewport');
        if (!window.viewport) {
            console.error("applyXFormData: Cannot apply data - viewport element not found");
            console.groupEnd();
            return false;
        }
    }

    // Ensure rectangles exist in the DOM and window object
    // loadXForm should call initializeRects(true) BEFORE this function
    if (!window.startRect || !document.getElementById('startRect') || !window.endRect || !document.getElementById('endRect')) {
        console.error("applyXFormData: Rectangles not properly initialized before applying data!");
        // Attempting recovery here is risky, the caller (loadXForm) should handle this.
        console.groupEnd();
        return false;
    }

    // 1. Update Global State (already partially done by loadXForm)
    window.currentXFormName = data.xformName || 'Untitled XForm';
    window.currentXFormId = data.id; // Use the ID from the loaded data
    window.currentXFormHasRun = true; 

    // 2. Update Input Fields (Size, Duration) - NOT NAME, xformName is handled by loadXForm
    const defaultWidth = 100;
    const defaultHeight = 60;
    const rectWidth = (data.startRect && data.startRect.width !== undefined) ? data.startRect.width : defaultWidth;
    const rectHeight = (data.startRect && data.startRect.height !== undefined) ? data.startRect.height : defaultHeight;
    const duration = data.duration || 500;
    
    if (window.widthInput) window.widthInput.value = rectWidth;
    if (window.heightInput) window.heightInput.value = rectHeight;
    if (window.durationInput) window.durationInput.value = duration;
    console.log(`Set Inputs: Size=${rectWidth}x${rectHeight}, Duration=${duration}ms`);

    // 3. Apply Rectangle Styles (Size & Position)
    // Size (use applyRectangleSize if available, otherwise direct style)
    if (typeof window.applyRectangleSize === 'function') {
        window.applyRectangleSize(); 
    } else { 
        if (window.startRect) {
            window.startRect.style.width = `${rectWidth}px`;
            window.startRect.style.height = `${rectHeight}px`;
        }
        if (window.endRect) {
            window.endRect.style.width = `${rectWidth}px`;
            window.endRect.style.height = `${rectHeight}px`;
        }
    }
    
    // Position (apply directly to the elements, ensuring data exists)
    const startLeft = (data.startRect && data.startRect.left !== undefined) ? data.startRect.left : 50; // Default fallback
    const startTop = (data.startRect && data.startRect.top !== undefined) ? data.startRect.top : 50;
    const endLeft = (data.endRect && data.endRect.left !== undefined) ? data.endRect.left : 150;
    const endTop = (data.endRect && data.endRect.top !== undefined) ? data.endRect.top : 150;
    
    if (window.startRect) {
        window.startRect.style.left = `${startLeft}px`;
        window.startRect.style.top = `${startTop}px`;
    } else {
        console.warn("Missing startRect DOM element when setting position");
    }
    if (window.endRect) {
        window.endRect.style.left = `${endLeft}px`;
        window.endRect.style.top = `${endTop}px`;
    } else {
        console.warn("Missing endRect DOM element when setting position");
    }
    console.log(`Set Positions: Start=(${startLeft}px, ${startTop}px), End=(${endLeft}px, ${endTop}px)`);

    // 4. Clear and Recreate Waypoints
    // Clear existing DOM markers and runtime array
    console.log("[Load] Clearing existing waypoints (DOM & array)...");
    document.querySelectorAll('.point-marker').forEach(marker => marker.remove());
    window.intermediatePoints = [];
    console.log("[Load] Existing waypoints cleared.");
    
    // Create new DOM elements based on DTO waypoint data
    if (data.waypoints && Array.isArray(data.waypoints) && data.waypoints.length > 0) {
        console.log(`[Load] Recreating ${data.waypoints.length} waypoints from DTO...`);
        data.waypoints.forEach((pointData, index) => {
            console.log(`[Load] Processing waypoint DTO ${index}:`, pointData);
            // Ensure pointData has x and y
            if (pointData && typeof pointData.x === 'number' && typeof pointData.y === 'number') {
                try {
                    const marker = document.createElement('div');
                    marker.className = 'point-marker';
                    marker.style.left = `${pointData.x}px`;
                    marker.style.top = `${pointData.y}px`;
                    
                    if (!window.viewport) { // Double check viewport just in case
                         console.error("[Load] Cannot append marker, viewport missing!");
                         return; 
                    }
                    window.viewport.appendChild(marker);
                    console.log(`[Load]   Appended marker ${index} to viewport`);
                    
                    // Add to runtime array with the element reference
                    const runtimePoint = { x: pointData.x, y: pointData.y, element: marker };
                    window.intermediatePoints.push(runtimePoint);
                    console.log(`[Load]   Pushed waypoint ${index} to window.intermediatePoints`);
                    
                    // Make draggable
                    if (typeof window.makeDraggableWaypoint === 'function') {
                        window.makeDraggableWaypoint(marker, index);
                    }
                } catch (err) {
                    console.error(`[Load] Error recreating waypoint ${index}:`, err);
                }
            } else {
                console.warn(`[Load] Invalid waypoint data at index ${index}:`, pointData);
            }
        });
        console.log(`[Load] Finished recreating ${window.intermediatePoints.length} waypoints`);
    } else {
        console.log("[Load] No waypoints found in DTO to recreate.");
    }

    // 5. Set Rotations
    const rotX = (data.rotations && data.rotations.x !== undefined) ? data.rotations.x : 1;
    const rotY = (data.rotations && data.rotations.y !== undefined) ? data.rotations.y : 1;
    const rotZ = (data.rotations && data.rotations.z !== undefined) ? data.rotations.z : 1;
    
    window.xRotationDirection = rotX;
    window.yRotationDirection = rotY;
    window.zRotationDirection = rotZ;
    
    if (typeof window.updateRotationButtonsUI === 'function') {
        window.updateRotationButtonsUI(); // Update UI buttons
    } else {
        console.warn('updateRotationButtonsUI function not found');
    }
    console.log(`Set Rotations: X=${window.xRotationDirection}, Y=${window.yRotationDirection}, Z=${window.zRotationDirection}`);

    // 6. Update UI Counters and State
    if (typeof window.updateWaypointCounter === 'function') {
        window.updateWaypointCounter();
    } else if (typeof window.updateWaypointCounterFallback === 'function') {
        window.updateWaypointCounterFallback(); // Use fallback if needed
    }
    window.lastModifiedPointIndex = window.intermediatePoints.length - 1;

    // 7. Redraw Path Visualization
    if (typeof window.drawPathVisualization === 'function') {
        console.log("Redrawing path visualization...");
        window.drawPathVisualization();
    }

    console.log(`✅ Successfully applied XForm DTO data for: "${window.currentXFormName}"`);
    console.groupEnd();
    return true;
}

// Apply rectangle size from input fields
function applyRectangleSize() {
    if (!window.widthInput || !window.heightInput) {
        console.warn('Width or height input elements not found');
        return;
    }
    
    const width = parseInt(window.widthInput.value) || 100;
    const height = parseInt(window.heightInput.value) || 60;
    
    // Apply to both rectangles
    if (window.startRect) {
        window.startRect.style.width = `${width}px`;
        window.startRect.style.height = `${height}px`;
    }
    
    if (window.endRect) {
        window.endRect.style.width = `${width}px`;
        window.endRect.style.height = `${height}px`;
    }
    
    console.log(`Applied rectangle size: ${width}x${height}px`);
}

// Export functions to global namespace
window.applyXFormData = applyXFormData;
window.applyRectangleSize = applyRectangleSize; 