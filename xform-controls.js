// --- DOM Element References (Assumed to be set globally or passed) ---
// let startRect = null; // Declared in main script
// let endRect = null;
// const viewport = document.getElementById('viewport'); // Declared in main script
// window.widthInput, window.heightInput, window.durationInput, startButton, resetButton, etc.

// --- State Variables (Potentially shared or managed globally) ---
// let xRotationDirection = 1; // Declared in main script
// let yRotationDirection = 1;
// let zRotationDirection = 1;
// window.intermediatePoints = []; // Declared globally
// let selectedPointIndex = -1; // Declared in main script
// window.draggingPointIndex = -1; // Declared globally
// let lastModifiedPointIndex = -1; // Declared in main script
// let dragOffsetX = 0; // Declared in main script
// let dragOffsetY = 0;
// let wasDraggingPoint = false; // Declared in main script
let isRectangleDragging = false; // Declared in main script

// *** NEW: Global Drag State ***
window.draggedElement = null; // Track the element being dragged
window.dragStartX = 0;      // Initial element style.left
window.dragStartY = 0;      // Initial element style.top
window.dragInitialMouseX = 0; // Mouse X on mousedown
window.dragInitialMouseY = 0; // Mouse Y on mousedown

// --- Fallback Implementations for Potentially Missing Functions ---
// These prevent console errors when the functions are not defined elsewhere

// Fallback for updateWaypointCounter
if (typeof window.updateWaypointCounter !== 'function') {
    window.updateWaypointCounter = function() {
        const counter = document.getElementById('waypointCounter');
        if (counter) {
            const count = window.intermediatePoints?.length || 0;
            counter.textContent = count.toString();
            console.log(`Waypoint counter updated (fallback): ${count}`);
        }
    };
}

// Fallback for saveCurrentState
if (typeof window.saveCurrentState !== 'function') {
    window.saveCurrentState = function() {
        // Simple fallback that just logs the action
        console.log('State save requested (fallback implementation)');
        // In a real implementation, this would save to localStorage or indexedDB
    };
}

// Fallback for updateDeleteWaypointButton
if (typeof window.updateDeleteWaypointButton !== 'function') {
    window.updateDeleteWaypointButton = function() {
        const deleteBtn = document.getElementById('deleteLastWaypointBtn');
        if (!deleteBtn) return;
        
        const count = window.intermediatePoints?.length || 0;
        
        if (count > 0) {
            deleteBtn.disabled = false;
            deleteBtn.style.opacity = '1';
            deleteBtn.style.pointerEvents = 'auto';
            deleteBtn.style.cursor = 'pointer';
        } else {
            deleteBtn.disabled = true;
            deleteBtn.style.opacity = '0.5';
            deleteBtn.style.pointerEvents = 'none';
            deleteBtn.style.cursor = 'not-allowed';
        }
        
        console.log(`Delete waypoint button state updated (fallback): ${count > 0 ? 'enabled' : 'disabled'} (${count} waypoints)`);
    };
}

// Fallback for applyPathStyle
if (typeof window.applyPathStyle !== 'function') {
    window.applyPathStyle = function(style) {
        // Only draw path if required elements exist
        if (window.startRect && window.endRect && window.viewport) {
            drawPathVisualization();
        } else {
            console.log('Cannot apply path style: required elements not initialized yet');
        }
    };
}

// --- Simple Bezier Helper Functions ---
function getBezierPoint(p0, p1, p2, p3, t) {
    // Cubic Bezier formula
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;
    
    return {
        x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
        y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
    };
}

// *** NEW: Quadratic Bezier Helper ***
function getPointOnQuadraticBezier(p0, p1, p2, t) {
    // Calculates a point on a quadratic Bezier curve defined by p0, p1, p2 at parameter t [0, 1]
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    return {
        x: mt2 * p0.x + 2 * mt * t * p1.x + t2 * p2.x,
        y: mt2 * p0.y + 2 * mt * t * p1.y + t2 * p2.y
    };
}

// *** NEW: Helper function for Catmull-Rom interpolation ***
function getPointOnCatmullRom(p0, p1, p2, p3, t) {
    // Calculates a point on a Catmull-Rom spline segment between p1 and p2 at parameter t [0, 1]
    const t2 = t * t;
    const t3 = t2 * t;
    return {
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    };
}

// *** NEW: Helper function for Bezier control point calculation from Catmull-Rom points ***
function getControlPoints(p0, p1, p2, p3, tension = 0.5) {
    // Catmull-Rom to Cubic Bezier conversion formula
    const d1x = (p2.x - p0.x) * tension;
    const d1y = (p2.y - p0.y) * tension;
    const d2x = (p3.x - p1.x) * tension;
    const d2y = (p3.y - p1.y) * tension;

    const cp1 = { x: p1.x + d1x / 3, y: p1.y + d1y / 3 };
    const cp2 = { x: p2.x - d2x / 3, y: p2.y - d2y / 3 };
    return [cp1, cp2];
}

// *** NEW: Spline Path Generation Function (Mode Aware) ***
function generateSplinePath(points, samplesPerSegment = 20) {
    if (!points || points.length < 2) return []; 

    const path = [points[0]]; 
    const n = points.length;
    const mode = window.pathInterpolationMode || 'passthrough'; // Default to passthrough

    if (n === 2) {
        // Straight line (same for both modes)
        path.push(points[1]);
        return path;
    }

    // --- Influencer Mode Logic --- 
    if (mode === 'influencer') {
        if (n === 3) {
            // Quadratic Bezier (Start-P0, Waypoint1-P1, End-P2)
            const [P0, P1, P2] = points;
            for (let t = 1; t <= samplesPerSegment; t++) {
                path.push(getPointOnQuadraticBezier(P0, P1, P2, t / samplesPerSegment));
            }
        } else if (n === 4) {
            // Cubic Bezier (Start-P0, Waypoint1-P1, Waypoint2-P2, End-P3)
            const [P0, P1, P2, P3] = points;
            for (let t = 1; t <= samplesPerSegment; t++) {
                path.push(getBezierPoint(P0, P1, P2, P3, t / samplesPerSegment));
            }
        } else { // n >= 5
            console.warn(`generateSplinePath (influencer mode): 3+ waypoints not directly supported, falling back to 'passthrough' Bezier spline.`);
            // Fallback to passthrough logic for 3+ waypoints
            const numSegments = n - 1;
            for (let i = 0; i < numSegments; i++) {
                const p0 = points[Math.max(0, i - 1)]; 
                const p1 = points[i];                    
                const p2 = points[i + 1];                 
                const p3 = points[Math.min(numSegments, i + 2)]; 
                const [cp1, cp2] = getControlPoints(p0, p1, p2, p3);
                for (let t = 1; t <= samplesPerSegment; t++) {
                    path.push(getBezierPoint(p1, cp1, cp2, p2, t / samplesPerSegment));
                }
            }
            if (path[path.length - 1].x !== points[n - 1].x || path[path.length - 1].y !== points[n - 1].y) {
                 path.push(points[n - 1]);
            }
        }
    }
    // --- Passthrough Mode Logic --- 
    else { // mode === 'passthrough'
        if (n === 3) {
            // Catmull-Rom for 1 waypoint
            const p0 = points[0]; 
            const p1 = points[0];
            const p2 = points[1];
            const p3 = points[2];
            for (let t = 1; t <= samplesPerSegment; t++) {
                path.push(getPointOnCatmullRom(p0, p1, p2, p3, t / samplesPerSegment));
            }
            const p0_seg2 = points[0];
            const p1_seg2 = points[1];
            const p2_seg2 = points[2];
            const p3_seg2 = points[2]; 
            for (let t = 1; t <= samplesPerSegment; t++) {
                path.push(getPointOnCatmullRom(p0_seg2, p1_seg2, p2_seg2, p3_seg2, t / samplesPerSegment));
            }
            if (path[path.length - 1].x !== points[n - 1].x || path[path.length - 1].y !== points[n - 1].y) {
                 path.push(points[n - 1]);
            }
        } else { // n >= 4: Bezier spline using Catmull-Rom derived control points
            const numSegments = n - 1;
            for (let i = 0; i < numSegments; i++) {
                const p0 = points[Math.max(0, i - 1)]; 
                const p1 = points[i];                    
                const p2 = points[i + 1];                 
                const p3 = points[Math.min(numSegments, i + 2)]; 
                const [cp1, cp2] = getControlPoints(p0, p1, p2, p3);
                for (let t = 1; t <= samplesPerSegment; t++) {
                    path.push(getBezierPoint(p1, cp1, cp2, p2, t / samplesPerSegment));
                }
            }
            if (path[path.length - 1].x !== points[n - 1].x || path[path.length - 1].y !== points[n - 1].y) {
                 path.push(points[n - 1]);
            }
        }
    }
    
    return path;
}

// *** NEW: Expose quadratic helper globally ***
window.getPointOnQuadraticBezier = getPointOnQuadraticBezier;

// *** NEW: Global Mouse Move Handler ***
function globalMouseMoveHandler(e) {
    if (!window.draggedElement) return;

    // Calculate new position based on stored initial values and mouse delta
    const dx = e.clientX - window.dragInitialMouseX;
    const dy = e.clientY - window.dragInitialMouseY;
    let newX = window.dragStartX + dx;
    let newY = window.dragStartY + dy;

    // Boundary checks
    const vpRect = window.viewport.getBoundingClientRect();
    const elRect = window.draggedElement.getBoundingClientRect(); 
    newX = Math.max(0, Math.min(newX, vpRect.width - elRect.width));
    newY = Math.max(0, Math.min(newY, vpRect.height - elRect.height));

    // Apply new position
    window.draggedElement.style.left = `${newX}px`;
    window.draggedElement.style.top = `${newY}px`;

    // Live update path while dragging, if path is visible
    const pathVis = document.getElementById('path-visualization');
    if (pathVis && typeof drawPathVisualization === 'function') {
        drawPathVisualization(); 
    }
}

// *** NEW: Global Mouse Up Handler ***
function globalMouseUpHandler(e) {
    if (!window.draggedElement) return;

    console.log(`globalMouseUpHandler: mouseup for ${window.draggedElement.id}`);

    // Final updates for the dragged element
    window.draggedElement.style.cursor = 'grab';
    window.draggedElement.style.transition = ''; // Restore transitions if any
    console.log(`${window.draggedElement.id} Dropped at:`, window.draggedElement.style.left, window.draggedElement.style.top);

    // Update path visualization if it exists
    const pathVis = document.getElementById('path-visualization');
    if (pathVis && typeof drawPathVisualization === 'function') {
        drawPathVisualization();
    }

    // Save state
    if (typeof window.saveCurrentState === 'function') {
        window.saveCurrentState();
        // console.log("Rectangle positions saved after drag:", ...); // Keep console less noisy
    }

    // Clean up global state and listeners
    window.isRectangleDragging = false; // Reset flag for viewport click check
    window.draggedElement = null;
    document.removeEventListener('mousemove', globalMouseMoveHandler);
    document.removeEventListener('mouseup', globalMouseUpHandler);
    console.log(`globalMouseUpHandler: cleaned up listeners and flags`);
}

// --- Path Visualization Logic with Bezier Curves ---
function drawPathVisualization() {
    // DELEGATE to applyPathStyle to handle drawing based on current mode
    if (typeof window.applyPathStyle === 'function' && window.pathStyleModes && window.currentPathStyleIndex !== undefined) {
        const currentStyleMode = window.pathStyleModes[window.currentPathStyleIndex];
        if (currentStyleMode) {
            // Check if required elements exist before calling applyPathStyle
            if (!window.startRect || !window.endRect || !window.viewport) {
                 console.warn('drawPathVisualization: Cannot delegate - missing required elements (startRect, endRect, or viewport).');
                 // Optionally remove existing path if elements are missing
                 const existingPath = document.getElementById('path-visualization');
                 if (existingPath) existingPath.remove();
                 return; 
            }
            // Proceed with delegation
            applyPathStyle(currentStyleMode.style);
        } else {
             console.warn('drawPathVisualization: Current path style mode not found, cannot draw path.');
             // Optionally remove existing path if style is invalid
             const existingPath = document.getElementById('path-visualization');
             if (existingPath) existingPath.remove();
        }
    } else {
        console.warn('drawPathVisualization: Cannot delegate - applyPathStyle function or path styles not available.');
        // Optionally remove existing path if functions are missing
        const existingPath = document.getElementById('path-visualization');
        if (existingPath) existingPath.remove();
    }
    // Ensure NO old drawing logic remains below this point in this function.
}

// Animation function with bezier paths but linear rotations
function applyXFormAnimation() {
    console.log("Starting X-Form animation...");
    const startButton = document.getElementById('startAnimation');

    // Check if elements exist, and try to initialize them if they don't
    if (!window.startRect || !window.endRect) {
        console.log("Start/End rectangle elements not found, attempting to initialize...");
        initializeRects();
        
        // If still not initialized, show error and exit
        if (!window.startRect || !window.endRect) {
            console.error("Start/End rectangle elements not found!");
            return;
        }
    }

    if (!window.currentXFormHasRun) {
        if (window.currentXFormName === "New X-Form" || !window.currentXFormId) {
            window.currentXFormId = Date.now();
            window.currentXFormName = `X-Form ${new Date(window.currentXFormId).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
        }
        window.currentXFormHasRun = true;
    }

    if(startButton) startButton.textContent = 'Play';
    
    const duration = parseInt(window.durationInput?.value || 500, 10);
    const durationSeconds = Math.max(0.1, duration / 1000);
    
    window.startRect.style.animation = '';
    window.startRect.style.transform = '';
    window.startRect.style.transition = ''; // Ensure transition is cleared
    
    setTimeout(() => {
        // Double-check that elements still exist
        if (!window.startRect || !window.endRect || !window.viewport) {
            console.error("Required elements lost during animation prep!");
            return;
        }
        
        const vpRect = window.viewport.getBoundingClientRect();
        const startRectBounds = window.startRect.getBoundingClientRect();
        const endRectBounds = window.endRect.getBoundingClientRect();

        // Calculate center points of rectangles (relative to viewport)
        const startCenterX = startRectBounds.left - vpRect.left + startRectBounds.width / 2;
        const startCenterY = startRectBounds.top - vpRect.top + startRectBounds.height / 2;
        const endCenterX = endRectBounds.left - vpRect.left + endRectBounds.width / 2;
        const endCenterY = endRectBounds.top - vpRect.top + endRectBounds.height / 2;

        // Create path points including start, waypoints, and end
        const pathPoints = [
            { x: startCenterX, y: startCenterY }, // Using center point
            ...window.intermediatePoints.map(p => ({ x: p.x, y: p.y })),
            { x: endCenterX, y: endCenterY } // Using center point
        ];

        if (pathPoints.length >= 2) {
            const keyframesName = `pathAnimation_${Date.now()}`;
            let keyframesRule = `@keyframes ${keyframesName} {\n`;
            
            // Generate keyframes with bezier path for position, linear for rotation
            const numSteps = 100;
            for (let i = 0; i <= numSteps; i++) {
                const percentage = i;
                const progress = i / numSteps;
                
                // Calculate position based on bezier curves
                let position;
                
                if (pathPoints.length === 2) {
                    // Simple linear interpolation for just 2 points
                    position = {
                        x: pathPoints[0].x + (pathPoints[1].x - pathPoints[0].x) * progress,
                        y: pathPoints[0].y + (pathPoints[1].y - pathPoints[0].y) * progress
                    };
                } else if (pathPoints.length === 3) {
                    // Special case for 3 points - use quadratic bezier
                    const midX = (pathPoints[0].x + pathPoints[2].x) / 2;
                    const midY = (pathPoints[0].y + pathPoints[2].y) / 2;
                    const ctrlX = pathPoints[1].x * 2 - midX;
                    const ctrlY = pathPoints[1].y * 2 - midY;
                    
                    const t = progress;
                    const mt = 1 - t;
                    position = {
                        x: mt * mt * pathPoints[0].x + 2 * mt * t * ctrlX + t * t * pathPoints[2].x,
                        y: mt * mt * pathPoints[0].y + 2 * mt * t * ctrlY + t * t * pathPoints[2].y
                    };
                } else {
                    // Multi-point path with cubic bezier segments
                    const totalSegments = pathPoints.length - 1;
                    const segmentProgress = progress * totalSegments;
                    const segmentIndex = Math.min(Math.floor(segmentProgress), totalSegments - 1);
                    const segmentT = segmentProgress - segmentIndex;
                    
                    // Get control points for this segment
                    const [cp1, cp2] = getControlPoints(pathPoints, segmentIndex);
                    const p0 = pathPoints[segmentIndex];
                    const p3 = pathPoints[segmentIndex + 1];
                    
                    // Calculate position using cubic bezier formula
                    position = getBezierPoint(p0, cp1, cp2, p3, segmentT);
                }
                
                // Adjust for center point of rectangle
                const pointTranslateX = position.x - startCenterX;
                const pointTranslateY = position.y - startCenterY;
                
                // Calculate rotation based on linear progress (unchanged)
                const rotateXValue = window.xRotationDirection * 360 * progress;
                const rotateYValue = window.yRotationDirection * 360 * progress;
                const rotateZValue = window.zRotationDirection * 360 * progress;
                
                const transformValue = `translateX(${pointTranslateX}px) translateY(${pointTranslateY}px) rotateX(${rotateXValue}deg) rotateY(${rotateYValue}deg) rotateZ(${rotateZValue}deg)`;
                keyframesRule += `  ${percentage}% { transform: ${transformValue}; }\n`;
            }
            
            keyframesRule += `}`;

            const styleSheetId = `animStyle_${keyframesName}`;
            let styleSheet = document.getElementById(styleSheetId);
            if (!styleSheet) {
                 styleSheet = document.createElement("style");
                 styleSheet.id = styleSheetId;
                 document.head.appendChild(styleSheet);
            }
            styleSheet.textContent = keyframesRule;

            window.startRect.style.animation = `${keyframesName} ${durationSeconds}s ease-in-out forwards`;

            setTimeout(() => {
                window.startRect.style.animation = ''; 
                if (styleSheet) styleSheet.remove();
            }, duration + 100);
        } else {
            // Simple direct animation if no waypoints
            const transformValue = `translateX(${endCenterX - startCenterX}px) translateY(${endCenterY - startCenterY}px) rotateX(${window.xRotationDirection*360}deg) rotateY(${window.yRotationDirection*360}deg) rotateZ(${window.zRotationDirection*360}deg)`;
            window.startRect.style.transition = `transform ${durationSeconds}s ease-in-out`;
            window.startRect.style.transform = transformValue;
            
            setTimeout(() => {
                 window.startRect.style.transform = '';
                 window.startRect.style.transition = '';
            }, duration + 100);
        }
    }, 50);
}

// --- Initial Setup for Rectangles ---
function initializeRects() {
    if (!window.viewport || !window.widthInput || !window.heightInput) return;

    // Clear existing rects if any (for reset)
    window.viewport.innerHTML = '';

    // Create and Style Start Rect (Green)
    window.startRect = document.createElement('div'); // Use window scope
    startRect.id = 'startRect';
    startRect.className = 'rect rect-start';
    startRect.textContent = 'Start';
    window.viewport.appendChild(startRect);
    const vpRect = window.viewport.getBoundingClientRect();
    const currentWidth = parseInt(window.widthInput.value, 10);
    const currentHeight = parseInt(window.heightInput.value, 10);
    if (!isNaN(currentWidth) && currentWidth >= 10) startRect.style.width = `${currentWidth}px`;
    if (!isNaN(currentHeight) && currentHeight >= 10) startRect.style.height = `${currentHeight}px`;
    const sRect = startRect.getBoundingClientRect();
    const initialX = (vpRect.width - sRect.width) / 2;
    const initialY = (vpRect.height - sRect.height) / 2;
    startRect.style.left = `${initialX}px`;
    startRect.style.top = `${initialY}px`;
    startRect.style.transform = '';

    // Create and Style End Rect (Red)
    window.endRect = document.createElement('div'); // Use window scope
    endRect.id = 'endRect';
    endRect.className = 'rect rect-end';
    endRect.textContent = 'End';
    if (!isNaN(currentWidth) && currentWidth >= 10) endRect.style.width = `${currentWidth}px`;
    if (!isNaN(currentHeight) && currentHeight >= 10) endRect.style.height = `${currentHeight}px`;
    window.viewport.appendChild(endRect);
    endRect.style.left = `${initialX}px`;
    endRect.style.top = `${initialY}px`;
    endRect.style.transform = '';

    console.log('Rects Initialized at:', initialX, initialY);
    window.intermediatePoints.forEach(p => p.element && p.element.remove());
    window.intermediatePoints = [];
    window.selectedPointIndex = -1;
    window.lastModifiedPointIndex = -1;
    // window.isAddingPoints = false; // WAM mode is always true now
    if (window.addWaypointButton) {
      // window.addWaypointButton.textContent = 'Add';
      // window.addWaypointButton.style.backgroundColor = '#28a745';
    }
    window.viewport.style.cursor = 'crosshair'; // Keep crosshair for WAM

    console.log(`%cinitializeRects: Before makeDraggable: startRect exists? ${!!window.startRect}, endRect exists? ${!!window.endRect}`, 'color: orange;'); // *** ADDED PRE-CHECK LOG ***
    if (startRect) makeDraggable(startRect);
    if (endRect) makeDraggable(endRect);
    console.log(`%cinitializeRects: Called makeDraggable for startRect and endRect`, 'color: green; font-weight: bold;'); // *** Existing LOG ***

    // Initialize or reset all state variables
    window.currentXFormName = "New X-Form";
    window.currentXFormId = null;
    window.currentXFormHasRun = false;
    
    // Set default rotations
    window.xRotationDirection = window.xRotationDirection || 1;
    window.yRotationDirection = window.yRotationDirection || 1;
    window.zRotationDirection = window.zRotationDirection || 1;
    
    // Set default duration
    if (window.durationInput) {
        window.durationInput.value = window.durationInput.value || 500;
    }
    
    const startButton = document.getElementById('startAnimation');
    if (startButton) startButton.textContent = 'Play';

    // Update counters/buttons after reset
    if (typeof window.updateWaypointCounter === 'function') {
        window.updateWaypointCounter();
    }
    
    // Update rotation UI if available
    if (typeof window.updateRotationButtonsUI === 'function') {
        window.updateRotationButtonsUI();
    }
    
    console.log('Rects fully initialized with all properties');
}

// --- Dragging Logic Setup for Rectangles (Revised) ---
function makeDraggable(element) {
    if (!window.viewport || !element) {
        console.error("Cannot make element draggable: missing viewport or element", element?.id);
        return;
    }

    element.addEventListener('mousedown', (e) => {
        console.log(`%cmakeDraggable: MOUSE DOWN event listener fired for ${element.id}`, 'color: blue; font-weight: bold;'); // *** ADDED VERY VISIBLE LOG ***

        // Prevent starting a new drag if already dragging something else
        // or if it wasn't a primary button click
        if (window.draggedElement || e.button !== 0) {
             console.log(`makeDraggable: mousedown exit - already dragging ${window.draggedElement?.id} or not primary button (${e.button})`);
             return;
        }

        console.log(`makeDraggable: mousedown on ${element.id}`);
        window.draggedElement = element; // Set the globally tracked element
        window.isRectangleDragging = true; // Set flag for viewport click check

        element.style.cursor = 'grabbing';
        element.style.transition = 'none'; // Disable transitions during drag

        // Store initial positions and mouse coordinates globally
        const rect = element.getBoundingClientRect();
        const viewportRect = window.viewport.getBoundingClientRect();
        // Use parseFloat for potentially non-integer initial positions
        window.dragStartX = parseFloat(element.style.left || '0'); 
        window.dragStartY = parseFloat(element.style.top || '0');
        window.dragInitialMouseX = e.clientX;
        window.dragInitialMouseY = e.clientY;

        // Add the global listeners to the document
        document.addEventListener('mousemove', globalMouseMoveHandler);
        document.addEventListener('mouseup', globalMouseUpHandler);
        console.log(`makeDraggable: Added global listeners for ${element.id}`);

        e.preventDefault();
        e.stopPropagation(); // Still important to prevent other actions like text selection
    });

    // Prevent default browser drag behavior which can interfere
    element.addEventListener('dragstart', (e) => {
        e.preventDefault();
    });

    // Ensure initial cursor is correct
    element.style.cursor = 'grab';

    console.log(`makeDraggable applied to ${element.id}`);
}

// --- Resize Logic ---
function applyRectangleSize() {
    if (!window.widthInput || !window.heightInput || !window.startRect || !window.endRect) return;
    if (!window.viewport) return;

    const newWidth = parseInt(window.widthInput.value, 10);
    const newHeight = parseInt(window.heightInput.value, 10);

    const validWidth = Math.max(50, Math.min(400, newWidth));
    const validHeight = Math.max(50, Math.min(400, newHeight));
    
    if (validWidth !== newWidth) window.widthInput.value = validWidth;
    if (validHeight !== newHeight) window.heightInput.value = validHeight;

    if (isNaN(validWidth) || isNaN(validHeight)) {
        console.warn('Invalid rectangle dimensions');
        return;
    }

    const vpRect = window.viewport.getBoundingClientRect();

    [window.startRect, window.endRect].forEach(rect => {
        if (!rect) return;
        
        const currentLeft = parseFloat(rect.style.left) || 0;
        const currentTop = parseFloat(rect.style.top) || 0;
        const currentWidth = rect.offsetWidth;
        const currentHeight = rect.offsetHeight;
        
        const centerX = currentLeft + (currentWidth / 2);
        const centerY = currentTop + (currentHeight / 2);
        
        rect.style.width = `${validWidth}px`;
        rect.style.height = `${validHeight}px`;
        
        const newLeft = centerX - (validWidth / 2);
        const newTop = centerY - (validHeight / 2);
        
        const boundedLeft = Math.max(0, Math.min(newLeft, vpRect.width - validWidth));
        const boundedTop = Math.max(0, Math.min(newTop, vpRect.height - validHeight));
        
        rect.style.left = `${boundedLeft}px`;
        rect.style.top = `${boundedTop}px`;
    });

    console.log(`Resized rectangles to ${validWidth}x${validHeight} while maintaining centers`);
     if (typeof window.saveCurrentState === 'function') { 
         window.saveCurrentState(); // Save state after resize
     }
}

// --- Rotation Controls Setup ---
function setupRotationControls() {
    const directionToggles = document.querySelectorAll('.direction-toggle');
    
    directionToggles.forEach(toggle => {
        const axis = toggle.getAttribute('data-axis');
        const buttons = toggle.querySelectorAll('.btn-dir');
        
        buttons.forEach(button => {
            button.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                const value = parseInt(button.getAttribute('data-value'), 10);
                
                if (axis === 'x') window.xRotationDirection = value;
                else if (axis === 'y') window.yRotationDirection = value;
                else if (axis === 'z') window.zRotationDirection = value;
                
                toggle.setAttribute('data-direction', value);
                console.log(`${axis.toUpperCase()} rotation direction set to: ${value}`);
                if (typeof window.saveCurrentState === 'function') window.saveCurrentState();
            });
        });
    });
    
    console.log("Rotation control event handlers set up");
    updateRotationButtonsUI(); // Initial UI update
}

// --- Duration Control Setup ---
function setupDurationControl() {
    if (!window.durationInput) return;
    const durationFeedback = document.getElementById('durationFeedback');
    if (!durationFeedback) {
        console.error("Duration feedback element not found");
        return;
    }

    const MIN_DURATION = 100;
    const MAX_DURATION = 5000;
    const DEFAULT_DURATION = 500;
    
    window.durationInput.min = MIN_DURATION;
    window.durationInput.max = MAX_DURATION;
    window.durationInput.step = 50;
    
    const initialValue = parseInt(window.durationInput.value, 10);
    if (isNaN(initialValue) || initialValue < MIN_DURATION || initialValue > MAX_DURATION) {
        window.durationInput.value = DEFAULT_DURATION;
    }
    
    function updateDurationFeedbackText() {
        const value = parseInt(window.durationInput.value, 10);
        if (!isNaN(value)) {
            const seconds = (value / 1000).toFixed(1);
            durationFeedback.textContent = `(${seconds}s)`;
            durationFeedback.style.color = 'var(--text-secondary)';
            durationFeedback.style.display = 'inline'; // Ensure it's visible
        } else {
            durationFeedback.textContent = '(invalid)';
            durationFeedback.style.color = '#dc3545';
            durationFeedback.style.display = 'inline'; // Ensure it's visible
        }
    }
    
    function validateDurationInput() {
        let value = parseInt(window.durationInput.value, 10);
        if (isNaN(value)) {
            value = DEFAULT_DURATION;
        } else {
            value = Math.max(MIN_DURATION, Math.min(MAX_DURATION, value));
        }
        if (value !== parseInt(window.durationInput.value, 10)) {
            window.durationInput.value = value;
        }
        updateDurationFeedbackText();
        if (typeof window.saveCurrentState === 'function') window.saveCurrentState();
        return value;
    }
    
    window.durationInput.addEventListener('change', validateDurationInput);
    window.durationInput.addEventListener('input', updateDurationFeedbackText);
    
    updateDurationFeedbackText(); // Initial feedback update
    console.log("Duration control set up with range:", MIN_DURATION, "-", MAX_DURATION, "ms");
}

// --- Path Visualization Logic ---
function togglePathVisualization() {
    const pathVis = document.getElementById('path-visualization');
    if (pathVis) {
        pathVis.remove();
    } else {
        // Check if required elements exist before drawing
        if (window.startRect && window.endRect && window.viewport) {
            drawPathVisualization();
        } else {
            console.log('Cannot toggle path: required elements not initialized yet');
        }
    }
}

// --- Modified Viewport Action Buttons Setup ---
function setupViewportActions() {
    const startButton = document.getElementById('startAnimation');
    const resetButton = document.getElementById('resetPositions');
    const themeToggle = document.getElementById('themeToggle');
    
    if (startButton) {
        startButton.addEventListener('click', applyXFormAnimation);
        startButton.textContent = 'Play'; // Initial text
    }
    
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            if (window.startRect) {
                window.startRect.style.animation = '';
                window.startRect.style.transform = '';
                window.startRect.style.transition = '';
            }
            
            // Remove path visualization on reset
            const pathVis = document.getElementById('path-visualization');
            if (pathVis) {
                pathVis.remove();
            }
            
            initializeRects(); // Reset rectangles and waypoints
            console.log("Viewport reset complete");
            
            if (typeof window.saveCurrentState === 'function') window.saveCurrentState(); // Save reset state
        });
    }
    
    console.log("Viewport action buttons set up");
}

// --- Waypoint Controls Setup --- //
function setupWaypointControls() {
    if (!window.viewport || !window.addWaypointButton || !window.deleteLastWaypointButton) {
        console.error("Waypoint control elements not found");
        return;
    }

    // Style Add button for permanent WAM mode
    function styleAddButton() {
        window.addWaypointButton.textContent = 'Add +';
        window.addWaypointButton.style.backgroundColor = 'var(--button-primary-bg)';
        window.addWaypointButton.style.borderColor = 'var(--button-primary-hover-bg)';
        window.viewport.style.cursor = 'crosshair';
    }
    
    function addWaypoint(clientX, clientY) {
        const vpRect = window.viewport.getBoundingClientRect();
        
        // Calculate the position in the viewport
        const x = clientX - vpRect.left;
        const y = clientY - vpRect.top;
        
        // Visualize the waypoint marker at this position
        const marker = document.createElement('div');
        marker.className = 'point-marker';
        marker.style.left = `${x}px`;
        marker.style.top = `${y}px`;
        window.viewport.appendChild(marker);
        
        // Store the waypoint position - this will be adjusted for center coordinates
        // during path calculation in drawPathVisualization and applyXFormAnimation
        const pointData = { x, y, element: marker };
        window.intermediatePoints.push(pointData);
        const numPoints = window.intermediatePoints.length;
        console.log("window.intermediatePoints.length:", numPoints);

        const lastIndex = numPoints - 1;
        console.log(`Adding waypoint at index ${lastIndex}`);

        window.lastModifiedPointIndex = lastIndex;
        
        if (typeof window.makeDraggableWaypoint === 'function') {
             window.makeDraggableWaypoint(marker, window.intermediatePoints.length - 1);
        }
        
        if (typeof window.updateWaypointCounter === 'function') {
            console.log("Calling updateWaypointCounter");
            window.updateWaypointCounter();
        } else {
            console.warn("updateWaypointCounter is not a function");
        }
        
        // Also update the delete waypoint button state
        if (typeof window.updateDeleteWaypointButton === 'function') {
            console.log("Calling updateDeleteWaypointButton");
            window.updateDeleteWaypointButton();
        } else {
            console.warn("updateDeleteWaypointButton is not a function");
        }
        
        // Update path visualization after adding waypoint - check for required elements first
        const pathVis = document.getElementById('path-visualization');
        if (pathVis && window.startRect && window.endRect && window.viewport) {
            drawPathVisualization();
        }
        
        console.log(`Added waypoint at (${x.toFixed(1)}, ${y.toFixed(1)})`);

        if (typeof window.saveCurrentState === 'function') {
            console.log("Calling saveCurrentState");
             window.saveCurrentState(); // Save after adding
        } else {
            console.warn("saveCurrentState is not a function");
        }

        return pointData;
    }
    
    function deleteLastWaypoint() {
        if (window.intermediatePoints.length === 0) return;
        
        const indexToDelete = (window.lastModifiedPointIndex >= 0 && window.lastModifiedPointIndex < window.intermediatePoints.length) 
            ? window.lastModifiedPointIndex 
            : window.intermediatePoints.length - 1;
        
        const pointToDelete = window.intermediatePoints.splice(indexToDelete, 1)[0];
        
        if (pointToDelete && pointToDelete.element) {
            pointToDelete.element.remove();
        }
        
        // Adjust lastModifiedPointIndex carefully
        if (window.lastModifiedPointIndex >= indexToDelete) {
             window.lastModifiedPointIndex = Math.min(window.lastModifiedPointIndex, window.intermediatePoints.length - 1);
             if (window.lastModifiedPointIndex < 0) window.lastModifiedPointIndex = -1; // Handle empty case
             // If we deleted the last element, the new lastModified is the one before it
             if(indexToDelete === window.intermediatePoints.length) {
                window.lastModifiedPointIndex = window.intermediatePoints.length - 1;
             }
        }
        // else lastModifiedPointIndex remains valid
         
        if (typeof window.updateWaypointCounter === 'function') {
            window.updateWaypointCounter();
        }
        
        // Also update the delete waypoint button state
        if (typeof window.updateDeleteWaypointButton === 'function') {
            window.updateDeleteWaypointButton();
        }
        
        // Update path visualization after deleting waypoint - check for required elements first
        const pathVis = document.getElementById('path-visualization');
        if (pathVis && window.startRect && window.endRect && window.viewport) {
            drawPathVisualization();
        }
        
        if (typeof window.saveCurrentState === 'function') {
            window.saveCurrentState(); // Save after deleting
        }
        
        console.log(`Deleted waypoint at index ${indexToDelete}`);
    }

    function deleteWaypoint(index) {
        if (index >= 0 && index < window.intermediatePoints.length) {
            const point = window.intermediatePoints[index];
            if (point.element) point.element.remove();
            window.intermediatePoints.splice(index, 1);
            
            if (typeof window.updateWaypointCounter === 'function') {
                window.updateWaypointCounter();
            }
            
            // Also update the delete waypoint button state
            if (typeof window.updateDeleteWaypointButton === 'function') {
                window.updateDeleteWaypointButton();
            }
            
            // Update path visualization after deleting waypoint - check for required elements first
            const pathVis = document.getElementById('path-visualization');
            if (pathVis && window.startRect && window.endRect && window.viewport) {
                drawPathVisualization();
            }
            
            if (typeof window.saveCurrentState === 'function') {
                window.saveCurrentState(); // Save after deleting
            }
            
            console.log(`Deleted waypoint at index ${index}`);
        }
    }
    
    // --- Waypoint Dragging Logic --- //
    // Note: window.makeDraggableWaypoint is now defined in the persistence module
    // We just need the global mouse listeners here
    
    document.addEventListener('mousemove', (e) => {
        if (window.draggingPointIndex >= 0 && window.draggingPointIndex < window.intermediatePoints.length) {
            window.wasDraggingPoint = true;
            const vpRect = window.viewport.getBoundingClientRect();
            const newX = e.clientX - vpRect.left - window.dragOffsetX;
            const newY = e.clientY - vpRect.top - window.dragOffsetY;
            
            window.intermediatePoints[window.draggingPointIndex].x = newX;
            window.intermediatePoints[window.draggingPointIndex].y = newY;
            
            const marker = window.intermediatePoints[window.draggingPointIndex].element;
            if (marker) {
                marker.style.left = `${newX}px`;
                marker.style.top = `${newY}px`;
            }
            
            // Update path visualization during drag
            const pathVis = document.getElementById('path-visualization');
            if (pathVis) {
                drawPathVisualization();
            }
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (window.draggingPointIndex >= 0 && window.draggingPointIndex < window.intermediatePoints.length) {
             const vpRect = window.viewport.getBoundingClientRect();
             const point = window.intermediatePoints[window.draggingPointIndex];
            
             const isOutside = 
                 point.x < -20 || point.y < -20 || 
                 point.x > vpRect.width + 20 || point.y > vpRect.height + 20;
            
             if (isOutside) {
                 const removedPoint = window.intermediatePoints.splice(window.draggingPointIndex, 1)[0];
                 if (removedPoint && removedPoint.element) {
                     removedPoint.element.remove();
                 }
                 
                 // Update last modified index carefully
                 if (window.draggingPointIndex <= window.lastModifiedPointIndex) {
                    window.lastModifiedPointIndex = Math.max(-1, window.lastModifiedPointIndex - 1); 
                 }

                 if (typeof window.updateWaypointCounter === 'function') window.updateWaypointCounter();
                 
                 // Also update the delete waypoint button state
                 if (typeof window.updateDeleteWaypointButton === 'function') {
                     window.updateDeleteWaypointButton();
                 }
                 
                 window.wasDraggingPoint = false; 
                 console.log('Waypoint deleted by dragging outside viewport');
                 
                 // Update path visualization
                 const pathVis = document.getElementById('path-visualization');
                 if (pathVis) {
                     drawPathVisualization();
                 }

                 if (typeof window.saveCurrentState === 'function') {
                     window.saveCurrentState();
                 }
             } else {
                 // Point is still within viewport - update last modified
                 window.lastModifiedPointIndex = window.draggingPointIndex;
                 if (point && point.element) {
                     point.element.classList.remove('selected');
                     // Constrain final position
                     point.x = Math.max(0, Math.min(point.x, vpRect.width));
                     point.y = Math.max(0, Math.min(point.y, vpRect.height));
                     point.element.style.left = `${point.x}px`;
                     point.element.style.top = `${point.y}px`;
                 }
                 
                 // Update path visualization
                 const pathVis = document.getElementById('path-visualization');
                 if (pathVis) {
                     drawPathVisualization();
                 }
                 
                 if (typeof window.saveCurrentState === 'function') {
                     window.saveCurrentState();
                 }
             }
            
             window.draggingPointIndex = -1;
             window.selectedPointIndex = -1;
        }
        // Reset wasDraggingPoint slightly later to allow click event to check it
        setTimeout(() => { window.wasDraggingPoint = false; }, 50); 
    });

    // Event: Viewport click to add waypoint
    window.viewport.addEventListener('click', (e) => {
        console.log(`viewport click: target=${e.target.id || e.target.className}, isRectangleDragging=${window.isRectangleDragging}, wasDraggingPoint=${window.wasDraggingPoint}`); // Log click
        
        // *** MODIFIED Check: Prevent if target is rect OR if dragging flags are set ***
        if (e.target === window.startRect || e.target === window.endRect) {
            console.log('viewport click: prevented by target being startRect or endRect.'); 
            return;
        }
        if (window.wasDraggingPoint || window.isRectangleDragging) {
            console.log('viewport click: prevented by dragging flag.'); // Log prevention
            return;
        }
        // Original target check for markers (can likely be removed if covered above, but keep for safety)
        if (e.target.classList.contains('point-marker')) {
            console.log('viewport click: prevented by target being marker.'); // Log prevention
            return;
        }

        console.log('viewport click: proceeding to addWaypoint.'); // Log proceed
        addWaypoint(e.clientX, e.clientY);
    });

    // Event: Add button click (now just informational)
    window.addWaypointButton.addEventListener('click', () => {
        console.log('Click in the viewport to add waypoints');
    });

    // Event: Delete last waypoint button
    window.deleteLastWaypointButton.addEventListener('click', () => {
        deleteLastWaypoint();
    });

    styleAddButton();
    console.log("Waypoint controls set up - permanently in WAM mode");
}

// --- Helper to update the rotation button UI ---
// Needs access to window.x/y/zRotationDirection
function updateRotationButtonsUI() {
    document.querySelectorAll('.direction-toggle').forEach(toggle => {
        const axis = toggle.getAttribute('data-axis');
        let currentValue;
        if (axis === 'x') currentValue = window.xRotationDirection;
        else if (axis === 'y') currentValue = window.yRotationDirection;
        else if (axis === 'z') currentValue = window.zRotationDirection;
        else return;

        toggle.setAttribute('data-direction', currentValue);
        const buttons = toggle.querySelectorAll('.btn-dir');
        buttons.forEach(button => {
            const value = parseInt(button.getAttribute('data-value'), 10);
            if (value === currentValue) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    });
}

// --- Initial Setup Function (called from main script) ---
function setupControls() {
     // Setup interactive controls
     setupRotationControls(); 
     setupDurationControl(); 
     setupViewportActions(); 
     setupWaypointControls(); 

     // Setup resize listeners
     if (window.widthInput) {
        window.widthInput.addEventListener('change', applyRectangleSize);
        window.widthInput.addEventListener('input', applyRectangleSize);
     }
     if (window.heightInput) {
         window.heightInput.addEventListener('change', applyRectangleSize);
         window.heightInput.addEventListener('input', applyRectangleSize);
     }
     
     // Initialize path style button if the function exists
     if (typeof window.setupPathStyleButton === 'function') {
         window.setupPathStyleButton();
         console.log("Path style button initialized");
     } else {
         console.warn("Path style button initialization function not found");
     }
} 