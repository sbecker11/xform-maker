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
let isWaypointDragging = false; // NEW flag for specific waypoint drag
let dragJustHappened = false; // Flag to prevent click *during* and immediately after drag
let lastMouseUpTime = 0; // Timestamp of the last mouseup event

// *** NEW: Global Drag State ***
window.draggedElement = null; // Track the element being dragged
window.dragStartX = 0;      // Initial element style.left
window.dragStartY = 0;      // Initial element style.top
window.dragInitialMouseX = 0; // Mouse X on mousedown
window.dragInitialMouseY = 0; // Mouse Y on mousedown
window.mouseDownStartTime = 0;  // Timestamp of mousedown event

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
  if (!points || points.length < 2) return Array.from(points);
  const path = [points[0]];
  const n = points.length;
  if (n === 2) {
    path.push(points[1]);
    return path;
  }
  const mode = window.pathInterpolationMode || 'passthrough';
  const segments = n - 1;
  for (let i = 0; i < segments; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = i;
    const i2 = i + 1;
    const i3 = Math.min(n - 1, i + 2);
    const p0 = points[i0], p1 = points[i1], p2 = points[i2], p3 = points[i3];
    if (mode === 'gravity' && n === 3) {
      for (let t = 1; t <= samplesPerSegment; t++) {
        path.push(getPointOnQuadraticBezier(p0, p1, p2, t / samplesPerSegment));
      }
      break;
    } else if (mode === 'gravity') {
      const [cp1, cp2] = getControlPoints(p0, p1, p2, p3);
      for (let s = 1; s <= samplesPerSegment; s++) {
        path.push(getBezierPoint(p1, cp1, cp2, p2, s / samplesPerSegment));
      }
    } else {
      for (let s = 1; s <= samplesPerSegment; s++) {
        path.push(getPointOnCatmullRom(p0, p1, p2, p3, s / samplesPerSegment));
      }
    }
  }
  path.push(points[n - 1]);
  return path;
}

// Expose spline function to window
window.generateSplinePath = generateSplinePath;

// *** NEW: Expose quadratic helper globally ***
window.getPointOnQuadraticBezier = getPointOnQuadraticBezier;

// Helper function for Binomial Coefficient (n choose k)
function binomialCoefficient(n, k) {
    if (k < 0 || k > n) {
        return 0;
    }
    if (k === 0 || k === n) {
        return 1;
    }
    if (k > n / 2) {
        k = n - k; // Take advantage of symmetry
    }
    let res = 1;
    for (let i = 1; i <= k; ++i) {
        res = res * (n - i + 1) / i;
    }
    return Math.round(res); // Should be an integer
}

// JavaScript equivalent of the Python bezier_curve function
// Generates points along a single generalized Bezier curve defined by all controlPoints.
function generateGeneralizedBezierCurve(controlPoints, numSamples = 100) {
    const n = controlPoints.length - 1; // Degree of the Bezier curve
    if (n < 0) return []; // No points if no control points
    if (n === 0) return [controlPoints[0]]; // Single point if only one control point

    const curvePoints = [];
    for (let i = 0; i < numSamples; i++) {
        const t = i / (numSamples - 1); // t from 0 to 1
        if (numSamples === 1) t = 0; // Handle single sample case

        let x = 0;
        let y = 0;

        for (let j = 0; j <= n; j++) {
            const bernsteinPolynomial = binomialCoefficient(n, j) * Math.pow(1 - t, n - j) * Math.pow(t, j);
            x += controlPoints[j].x * bernsteinPolynomial;
            y += controlPoints[j].y * bernsteinPolynomial;
        }
        curvePoints.push({ x: x, y: y });
    }
    return curvePoints;
}

// *** NEW: Global Mouse Move Handler (Simplified) ***
function globalMouseMoveHandler(e) {
    if (!window.draggedElement) return;

    // Calculate new position
    const dx = e.clientX - window.dragInitialMouseX;
    const dy = e.clientY - window.dragInitialMouseY;
    let rawNewX = window.dragStartX + dx;
    let rawNewY = window.dragStartY + dy;

    // Apply the RAW (unclamped) new position - NO deletion marking
    window.draggedElement.style.left = `${rawNewX}px`;
    window.draggedElement.style.top = `${rawNewY}px`;
    // console.log(`%c globalMouseMoveHandler: Applying raw style (${rawNewX.toFixed(1)}px, ${rawNewY.toFixed(1)}px)`, 'color: #888');

    // Live update path visualization
    const pathVis = document.getElementById('path-visualization');
    if (pathVis && typeof drawPathVisualization === 'function') {
        drawPathVisualization();
    }
}

// *** Reusable Drag State Cleanup Function (Simplified) ***
function cleanupDragState(eventSource) {
    const element = window.draggedElement; // Grab reference before clearing
    console.log(`cleanupDragState: Called from ${eventSource}. Cleaning up drag state for ${element ? (element.id || 'waypoint') : 'nothing'}.`);

    if (element && document.body.contains(element)) { // Check if element is still in DOM
        element.style.cursor = 'grab';
        element.style.transition = '';
    }

    // Remove listeners FIRST
    window.removeEventListener('mousemove', globalMouseMoveHandler);
    window.removeEventListener('mouseup', globalMouseUpHandler);

    // Reset global state flags
    window.isRectangleDragging = false;
    window.isWaypointDragging = false;
    window.draggedElement = null;
    window.draggingPointIndex = -1; 
    window.dragJustHappened = false; 
    console.log(`cleanupDragState: Listeners removed from WINDOW and flags reset.`);
}

// *** Global Mouse Up Handler (Simplified & Click Detection Added) ***
function globalMouseUpHandler(e) {
    // Only proceed if a drag was actually initiated
    if (!window.draggedElement) {
        console.log("globalMouseUpHandler: Exiting, no element was being dragged.");
        return; 
    }

    const releasedElement = window.draggedElement; // Capture element before potential deletion/reset
    const endTime = Date.now();
    const startTime = window.mouseDownStartTime || endTime; // Use endTime if startTime wasn't set
    const duration = endTime - startTime;
    window.lastMouseUpTime = endTime; 
    
    // Calculate distance mouse moved during the potential drag
    const dx = e.clientX - window.dragInitialMouseX;
    const dy = e.clientY - window.dragInitialMouseY;
    const distanceMoved = Math.sqrt(dx*dx + dy*dy);

    // Define thresholds for differentiating a click from a drag
    const CLICK_DURATION_THRESHOLD = 200; // milliseconds
    const CLICK_DISTANCE_THRESHOLD = 5;   // pixels

    let isConsideredClick = false;
    let wasWaypointInteraction = releasedElement.classList.contains('point-marker');

    console.log(`globalMouseUpHandler: mouseup for ${releasedElement.id || 'waypoint'}. Duration: ${duration}ms, Distance: ${distanceMoved.toFixed(1)}px`);

    // --- Check if it was a click on startRect ---    
    if (releasedElement.id === 'startRect' && 
        duration < CLICK_DURATION_THRESHOLD && 
        distanceMoved < CLICK_DISTANCE_THRESHOLD) 
    {
        console.log("🖱️ Click detected on startRect!");
        isConsideredClick = true;
        // Trigger the animation
        if (typeof applyXFormAnimation === 'function') {
            applyXFormAnimation();
        } else {
            console.error("Cannot start animation - applyXFormAnimation function not found.");
        }
        // We *don't* update position data or save state for a simple click

    } else if (wasWaypointInteraction) {
        // --- Handle waypoint drop/delete --- (existing logic)
        const index = window.draggingPointIndex;
        if (index >= 0 && index < window.intermediatePoints.length) {
            // ... (logic for checking if outside viewport, deleting or updating position) ...
            const finalX = parseFloat(releasedElement.style.left || '0');
            const finalY = parseFloat(releasedElement.style.top || '0');
            const vpRect = window.viewport.getBoundingClientRect();
            const elStyleWidth = parseFloat(releasedElement.style.width) || 8; // Use waypoint size default
            const elStyleHeight = parseFloat(releasedElement.style.height) || 8;
            const elCenterX = finalX + elStyleWidth / 2;
            const elCenterY = finalY + elStyleHeight / 2;
            const isElementCenterOutside = elCenterX < 0 || elCenterX > vpRect.width || elCenterY < 0 || elCenterY > vpRect.height;

            if (isElementCenterOutside) {
                console.log(`Deleting waypoint index ${index}. Reason: Element center ended outside viewport (${elCenterX.toFixed(1)}, ${elCenterY.toFixed(1)}).`);
                window.deleteWaypoint(index); // Use global delete function
                window.selectedPointIndex = -1;
            } else {
                const clampedX = Math.max(0, Math.min(finalX, vpRect.width - elStyleWidth));
                const clampedY = Math.max(0, Math.min(finalY, vpRect.height - elStyleHeight));
                window.intermediatePoints[index].x = clampedX;
                window.intermediatePoints[index].y = clampedY;
                console.log(`Updated intermediatePoints[${index}] data to clamped: (${clampedX.toFixed(1)}, ${clampedY.toFixed(1)})`);
                window.selectedPointIndex = index;
                releasedElement.style.left = `${clampedX}px`; // Snap element
                releasedElement.style.top = `${clampedY}px`;
            }
        } else {
            console.warn('Could not update or delete waypoint data - invalid index:', index);
        }

    } else if (releasedElement.id === 'startRect' || releasedElement.id === 'endRect') {
        // --- Handle rectangle drag completion --- (Position already updated by globalMouseMoveHandler)
        console.log(`Drag finished for ${releasedElement.id}. Final position applied by mousemove.`);
        // Optionally clamp position here if needed, though mousemove might not do it.
        // Update path visualization and save state (only if it wasn't a click)
        const pathVis = document.getElementById('path-visualization');
        if (pathVis && typeof drawPathVisualization === 'function') {
            drawPathVisualization();
        }
        if (typeof window.saveCurrentState === 'function') {
            window.saveCurrentState();
            console.log("Current state saved after rectangle drag operation.");
        }
    }

    // Call the cleanup function regardless of click or drag
    // Pass the source for better debugging
    cleanupDragState(`globalMouseUpHandler (${isConsideredClick ? 'click' : 'drag'})`);

    // Stop propagation if it was a waypoint interaction to prevent potential viewport clicks
    if (wasWaypointInteraction) {
        e.stopPropagation();
        console.log("globalMouseUpHandler: Stopped propagation after waypoint interaction mouseup.");
    }
}

// --- Path Visualization Logic with Bezier Curves ---
function drawPathVisualization() {
    // *** ADDED Guard Clause: Exit immediately if essential elements are missing ***
    if (!window.startRect || !window.endRect || !window.viewport) {
        console.log('drawPathVisualization: Skipping draw, start/end rectangles or viewport not initialized.');
        // Optionally remove existing path if elements disappear unexpectedly
        const existingPath = document.getElementById('path-visualization');
        if (existingPath) existingPath.remove();
        return; 
    }

    // Delegate to applyPathStyle if it exists (modern approach)
    if (typeof applyPathStyle === 'function' && window.pathStyleModes) {
        const currentPathStyleIndex = window.currentPathStyleIndex !== undefined ?
            window.currentPathStyleIndex : 0;
        
        const currentStyleMode = window.pathStyleModes[currentPathStyleIndex];
        
        if (currentStyleMode) {
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
                    
                    // Determine four points for Catmull-Rom to Bezier conversion
                    const totalPoints = pathPoints.length;
                    const i0 = Math.max(0, segmentIndex - 1);
                    const i1 = segmentIndex;
                    const i2 = segmentIndex + 1;
                    const i3 = Math.min(totalPoints - 1, segmentIndex + 2);
                    const p0 = pathPoints[i0];
                    const p1 = pathPoints[i1];
                    const p2 = pathPoints[i2];
                    const p3 = pathPoints[i3];

                    // Get control points for this segment between p1 and p2
                    const [cp1, cp2] = getControlPoints(p0, p1, p2, p3);

                    // Calculate position using cubic bezier formula between p1 and p2
                    position = getBezierPoint(p1, cp1, cp2, p2, segmentT);
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
function initializeRects(makeVisible = false, isLoading = false) {
    console.log(`Initializing rectangles (visible: ${makeVisible}, isLoading: ${isLoading})...`);
    if (!window.viewport || !window.widthInput || !window.heightInput) {
        console.error("Cannot initialize rectangles - missing required elements:", {
            viewport: !!window.viewport,
            widthInput: !!window.widthInput,
            heightInput: !!window.heightInput
        });
        
        // Try to find viewport if not already set
        if (!window.viewport) {
            window.viewport = document.getElementById('viewport');
            if (!window.viewport) {
                console.error("Fatal: Viewport element not found during initialization!");
                return false;
            } else {
                console.log("Successfully retrieved viewport element");
            }
        }
        
        // Try to find other elements
        if (!window.widthInput) {
            window.widthInput = document.getElementById('rectWidth');
            if (!window.widthInput) {
                console.warn("Width input not found - using default width 100px");
            }
        }
        
        if (!window.heightInput) {
            window.heightInput = document.getElementById('rectHeight');
            if (!window.heightInput) {
                console.warn("Height input not found - using default height 60px");
            }
        }
    }

    // *** Ensure inputs have default values BEFORE reading them ***
    if (window.widthInput && !window.widthInput.value) {
        window.widthInput.value = 100; 
    }
    if (window.heightInput && !window.heightInput.value) {
        window.heightInput.value = 60;
    }
    
    // Clear existing rects if any (for reset)
    const existingStart = document.getElementById('startRect');
    const existingEnd = document.getElementById('endRect');
    if (existingStart) existingStart.remove();
    if (existingEnd) existingEnd.remove();
    
    // Reset references to ensure clean state
    window.startRect = null;
    window.endRect = null;

    // Get viewport dimensions
    const vpRect = window.viewport.getBoundingClientRect();
    const vpCenterX = vpRect.width / 2;
    const vpCenterY = vpRect.height / 2;
    
    // Get rectangle dimensions FROM the inputs (now guaranteed to have a value)
    const currentWidth = parseInt(window.widthInput.value, 10) || 100;
    const currentHeight = parseInt(window.heightInput.value, 10) || 60;

    // Create and Style Start Rect (Green)
    window.startRect = document.createElement('div'); // Use window scope
    startRect.id = 'startRect';
    startRect.className = 'rect rect-start';
    startRect.textContent = 'Start';
    if (makeVisible) {
        window.viewport.appendChild(startRect);
    }
    
    if (!isNaN(currentWidth) && currentWidth >= 10) startRect.style.width = `${currentWidth}px`;
    if (!isNaN(currentHeight) && currentHeight >= 10) startRect.style.height = `${currentHeight}px`;
    
    // Use polar coordinates for random positioning
    // Padding to keep rectangles fully within viewport
    const padding = 20;
    const maxRadius = Math.min(vpRect.width, vpRect.height) / 2 - Math.max(currentWidth, currentHeight) / 2 - padding;
    
    // Generate random position for start rectangle using polar coordinates
    const startRadius = Math.random() * maxRadius;
    const startAngle = Math.random() * 2 * Math.PI; // 0 to 2π radians (0-360 degrees)
    
    // Convert polar to Cartesian coordinates
    const startX = vpCenterX + startRadius * Math.cos(startAngle) - currentWidth / 2;
    const startY = vpCenterY + startRadius * Math.sin(startAngle) - currentHeight / 2;
    
    startRect.style.left = `${startX}px`;
    startRect.style.top = `${startY}px`;
    startRect.style.transform = '';

    // Create and Style End Rect (Red)
    window.endRect = document.createElement('div'); // Use window scope
    endRect.id = 'endRect';
    endRect.className = 'rect rect-end';
    endRect.textContent = 'End';
    if (!isNaN(currentWidth) && currentWidth >= 10) endRect.style.width = `${currentWidth}px`;
    if (!isNaN(currentHeight) && currentHeight >= 10) endRect.style.height = `${currentHeight}px`;
    if (makeVisible) {
        window.viewport.appendChild(endRect);
    }
    
    // Generate different random position for end rectangle
    // Add 90-270 degrees to start angle to place end rect on opposite side
    const endRadius = Math.random() * maxRadius;
    const endAngle = startAngle + Math.PI + (Math.random() - 0.5) * Math.PI; // ~180° ±90° from start
    
    // Convert polar to Cartesian coordinates
    const endX = vpCenterX + endRadius * Math.cos(endAngle) - currentWidth / 2;
    const endY = vpCenterY + endRadius * Math.sin(endAngle) - currentHeight / 2;
    
    endRect.style.left = `${endX}px`;
    endRect.style.top = `${endY}px`;
    endRect.style.transform = '';

    console.log('Rects Initialized at:', {
        start: { 
            x: startX, 
            y: startY,
            radius: startRadius,
            angle: Math.round(startAngle * 180 / Math.PI) + '°'
        },
        end: { 
            x: endX, 
            y: endY,
            radius: endRadius,
            angle: Math.round(endAngle * 180 / Math.PI) + '°'
        },
        randomized: 'using polar coordinates'
    });
    
    // Clear waypoints
    window.intermediatePoints.forEach(p => p.element && p.element.remove());
    window.intermediatePoints = [];
    window.selectedPointIndex = -1;
    window.lastModifiedPointIndex = -1;
    window.viewport.style.cursor = 'crosshair'; // Keep crosshair for WAM

    console.log(`%cinitializeRects: Before makeDraggable: startRect exists? ${!!window.startRect}, endRect exists? ${!!window.endRect}`, 'color: orange;'); // *** ADDED PRE-CHECK LOG ***
    if (makeVisible) {
        if (startRect) makeDraggable(startRect);
        if (endRect) makeDraggable(endRect);
        console.log(`%cinitializeRects: Called makeDraggable for startRect and endRect`, 'color: green; font-weight: bold;');
    }

    // Initialize or reset all state variables
    window.currentXFormName = null; // Set to null instead of "New X-Form" to allow ATM to take over
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
    
    console.log(`Rects fully initialized with all properties, visibility: ${makeVisible ? 'visible' : 'hidden'}`);

    // --- Conditional XformName Mode Handling --- 
    // Only force ATM mode if NOT loading from db
    console.log(`>>> CHECKING isLoading: Value = ${isLoading}, Type = ${typeof isLoading}`);
    if (!isLoading) {
        console.log("Forcing ATM mode for automatic time-based naming");
        // Set to ATM mode if controller exists
        if (window.xformNameController && typeof window.xformNameController._setMode === 'function') {
            // Clear the name input first
            const xformNameInput = document.getElementById('xformNameInput');
            if (xformNameInput) {
                xformNameInput.value = ''; // Let ATM generate it
                console.log("Cleared name input field to let ATM handle updates");
            }
            
            // Set the mode to ATM using the controller
            window.xformNameController._setMode(true); 
            console.log("Called xformNameController._setMode(true) to ensure system recognizes ATM mode");

            // Explicitly start the timer via controller
            if (typeof window.xformNameController._startTimer === 'function') {
                window.xformNameController._startTimer();
                console.log("Started automatic name time updates via controller");
            } else {
                 console.warn("xformNameController._startTimer not found");
            }
            
            // Ensure save button state reflects ATM mode (likely enabled)
            if (typeof window.updateSaveButtonState === 'function') {
                window.updateSaveButtonState();
                console.log("Ensured Save button state updated after ATM mode activation.");
            }

        } else {
            console.warn("XformName controller not found, cannot force ATM mode.");
        }
    } else {
         console.log("Skipping ATM mode force because isLoading is true.");
    }
    // --- End Conditional XformName Mode --- 
    
    return { startRect: window.startRect, endRect: window.endRect };
}

// --- Dragging Logic Setup for Rectangles (Revised) ---
function makeDraggable(element) {
    if (!window.viewport || !element) {
        console.error("Cannot make element draggable: missing viewport or element", element?.id);
        return;
    }

    element.addEventListener('mousedown', (e) => {
        console.log(`%cmakeDraggable: MOUSE DOWN event listener fired for ${element.id}`, 'color: blue; font-weight: bold;');

        if (window.draggedElement || e.button !== 0) {
             console.log(`makeDraggable: mousedown exit - already dragging ${window.draggedElement?.id} or not primary button (${e.button})`);
             return;
        }

        // Record timestamp for click vs. drag detection
        window.mouseDownStartTime = Date.now(); 
        
        dragJustHappened = true; 
        console.log(`makeDraggable: Set dragJustHappened = true`);

        console.log(`makeDraggable: mousedown on ${element.id}`);
        window.draggedElement = element;
        window.isRectangleDragging = true;

        element.style.cursor = 'grabbing';
        element.style.transition = 'none'; // Disable transitions during drag

        // Store initial positions and mouse coordinates globally
        const rect = element.getBoundingClientRect();
        const viewportRect = window.viewport.getBoundingClientRect();
        window.dragStartX = parseFloat(element.style.left || '0'); 
        window.dragStartY = parseFloat(element.style.top || '0');
        window.dragInitialMouseX = e.clientX;
        window.dragInitialMouseY = e.clientY;

        // *** Attach listeners to WINDOW ***
        window.addEventListener('mousemove', globalMouseMoveHandler);
        window.addEventListener('mouseup', globalMouseUpHandler);
        console.log(`makeDraggable: Added global listeners TO WINDOW for ${element.id}`);

        e.preventDefault();
        e.stopPropagation(); 
    });

    // Prevent default browser drag behavior which can interfere
    element.addEventListener('dragstart', (e) => {
        e.preventDefault();
    });

    // Ensure initial cursor is correct
            element.style.cursor = 'grab';

    console.log(`makeDraggable applied to ${element.id}`);
}

// --- Make Waypoint Draggable (Needed by restoreState/applyXFormData) ---
window.makeDraggableWaypoint = function(element, index) { // Index passed in
    if(!window.viewport) return;

    element.addEventListener('mousedown', (e) => {
        console.log(`%cmakeDraggableWaypoint: MOUSE DOWN on marker element (index: ${index})`, 'color: purple; font-weight: bold;');

        if (window.draggedElement || e.button !== 0) {
             console.log(`makeDraggableWaypoint: mousedown exit - already dragging ${window.draggedElement?.id} or not primary button (${e.button})`);
             return;
        }

        dragJustHappened = true; 
        // console.log(`makeDraggableWaypoint: Set dragJustHappened = true`);

        window.draggedElement = element;
        window.isWaypointDragging = true;
        window.isRectangleDragging = false;

        // Store initial positions and mouse coordinates globally
        const vpRect = window.viewport.getBoundingClientRect();
        const initialStyleLeft = parseFloat(element.style.left || '0');
        const initialStyleTop = parseFloat(element.style.top || '0');
        window.dragStartX = initialStyleLeft;
        window.dragStartY = initialStyleTop;
        window.dragInitialMouseX = e.clientX;
        window.dragInitialMouseY = e.clientY;

        // *** ADDED LOGGING for mousedown values ***
        console.log(`  makeDraggableWaypoint Details:`);
        console.log(`    Initial Style: left=${initialStyleLeft.toFixed(1)}, top=${initialStyleTop.toFixed(1)}`);
        console.log(`    Mouse Pos: clientX=${e.clientX.toFixed(1)}, clientY=${e.clientY.toFixed(1)}`);
        console.log(`    Viewport Pos: left=${vpRect.left.toFixed(1)}, top=${vpRect.top.toFixed(1)}`);
        console.log(`    Stored Drag Start: X=${window.dragStartX.toFixed(1)}, Y=${window.dragStartY.toFixed(1)}`);
        console.log(`    Stored Initial Mouse: X=${window.dragInitialMouseX.toFixed(1)}, Y=${window.dragInitialMouseY.toFixed(1)}`);

        // *** Attach listeners to WINDOW ***
        window.addEventListener('mousemove', globalMouseMoveHandler);
        window.addEventListener('mouseup', globalMouseUpHandler);
        console.log(`  makeDraggableWaypoint: Added global listeners TO WINDOW for waypoint index ${index}`);

        // Update global state for tracking
        window.draggingPointIndex = index;
        window.lastModifiedPointIndex = index;

        // Select this point visually
        document.querySelectorAll('.point-marker.selected').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        window.selectedPointIndex = index;

        e.stopPropagation();
        e.preventDefault();
    });
    // ... (initial cursor - unchanged)
};

// --- Resize Logic ---
function applyRectangleSize() {
    console.log("--- applyRectangleSize called ---");

    // Enhanced check for missing elements
    let missingElements = [];
    if (!window.widthInput) missingElements.push("window.widthInput");
    if (!window.heightInput) missingElements.push("window.heightInput");
    // Check for rectangles separately
    let missingRects = false;
    if (!window.startRect) {
        missingElements.push("window.startRect");
        missingRects = true;
    }
    if (!window.endRect) {
        missingElements.push("window.endRect");
        missingRects = true;
    }

    if (missingElements.length > 0) {
        console.warn(`applyRectangleSize: Missing required elements: ${missingElements.join(', ')}.`);
        console.log({
            widthInputExists: !!window.widthInput,
            heightInputExists: !!window.heightInput,
            startRectExists: !!window.startRect,
            endRectExists: !!window.endRect
        });

        // If the rectangles are missing, try to initialize them now.
        if (missingRects && typeof initializeRects === 'function') {
            console.log("applyRectangleSize: startRect or endRect missing, calling initializeRects(true) to create them...");
            initializeRects(true); // Pass true to make them visible
            // After initializing, re-check if they exist now
            if (!window.startRect || !window.endRect) {
                console.error("applyRectangleSize: FAILED to create startRect/endRect even after calling initializeRects. Aborting resize.");
                return; // Stop if initialization failed
            }
            console.log("applyRectangleSize: Rectangles initialized. Proceeding with resize...");
        } else if (missingRects) {
            console.error("applyRectangleSize: startRect or endRect missing, and initializeRects function not found. Aborting resize.");
            return;
        } else {
            // Inputs might be missing, but rects exist? Still likely an issue.
            console.error("applyRectangleSize: Input elements missing. Aborting resize.");
            return;
        }
    }

    if (!window.viewport) {
         console.warn("applyRectangleSize: Missing viewport element.");
        return;
    }

    const rawWidthValue = window.widthInput.value;
    const rawHeightValue = window.heightInput.value;
    console.log(`Raw input values: Width='${rawWidthValue}', Height='${rawHeightValue}'`);

    const newWidth = parseInt(rawWidthValue, 10);
    const newHeight = parseInt(rawHeightValue, 10);
    console.log(`Parsed values: newWidth=${newWidth}, newHeight=${newHeight}`);

    const validWidth = Math.max(50, Math.min(400, newWidth));
    const validHeight = Math.max(50, Math.min(400, newHeight));
    console.log(`Clamped values: validWidth=${validWidth}, validHeight=${validHeight}`);

    let widthChanged = false;
    let heightChanged = false;

    if (validWidth !== newWidth) {
        console.log(`Clamping occurred for Width: ${newWidth} -> ${validWidth}. Updating input.`);
        window.widthInput.value = validWidth;
        widthChanged = true;
    }
    if (validHeight !== newHeight) {
        console.log(`Clamping occurred for Height: ${newHeight} -> ${validHeight}. Updating input.`);
        window.heightInput.value = validHeight;
        heightChanged = true;
    }
    
    if (!widthChanged) console.log("Width value is valid, not changing input.");
    if (!heightChanged) console.log("Height value is valid, not changing input.");

    if (isNaN(validWidth) || isNaN(validHeight)) {
        console.warn('Invalid rectangle dimensions AFTER clamping (This should not happen!). Input was reset?');
        // Attempt to reset to default if invalid after clamping
        window.widthInput.value = 100;
        window.heightInput.value = 60;
        // Re-run applyRectangleSize to apply the default (prevent infinite loop)
        // Apply default size directly instead of re-running
        [window.startRect, window.endRect].forEach(rect => {
            if (rect) {
                 rect.style.width = `100px`;
                 rect.style.height = `60px`;
            }
        });
        return;
    }

    const vpRect = window.viewport.getBoundingClientRect();

    console.log(`Applying styles: W=${validWidth}, H=${validHeight}`);
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
    
    if (window.durationInput) {
        window.durationInput.addEventListener('change', validateDurationInput);
        window.durationInput.addEventListener('input', updateDurationFeedbackText);
        console.log("Event listeners successfully attached to window.durationInput.");
    } else {
        console.error("ERROR in xform-controls.js: window.durationInput is not defined or null. Cannot attach event listeners. Check element ID and script timing.");
    }
    
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
            
            // Reset rectangles and waypoints, and make them VISIBLE
            initializeRects(true); // Pass true to show rectangles
            console.log("Viewport reset complete - rectangles now visible");
            
            // *** Use xformNameController to set up for a new XForm ***
            if (window.xformNameController) {
                window.xformNameController.setNewXform();
                console.log("Initialized name state using xformNameController for new XForm");
            } else {
                // Fallback logic if controller isn't available (shouldn't happen now)
                console.error("xformNameController not found during New button click!");
                window.isXformNamingModeATM = true;
                const xformNameInput = document.getElementById('xformNameInput');
                if (xformNameInput) xformNameInput.value = ''; 
                // Manually try to start timer if possible
                if (typeof window.startXformNameTimer=== 'function') {
                    window.startXformNameTimer();
                }
            }
            
            // Save the initial state
            if (typeof window.saveCurrentState === 'function') window.saveCurrentState();
            
            // *** Explicitly update save button state AFTER setting ATM mode ***
            if (typeof updateSaveButtonState === 'function') {
                updateSaveButtonState();
                console.log("Ensured Save button state updated after ATM mode activation.");
            } else {
                 console.warn("updateSaveButtonState function not found after ATM activation.");
            }
        });
    }
    
    console.log("Viewport action buttons set up");
}

// --- Waypoint Controls Setup --- //
function setupWaypointControls() {
    if (!window.viewport || !window.deleteLastWaypointButton) {
        console.error("Waypoint control elements not found. Check IDs: viewport, deleteLastWaypointButton");
        console.error(`   Values: viewport=${!!window.viewport}, delBtn=${!!window.deleteLastWaypointButton}`);
        return;
    }

    function addWaypoint(clientX, clientY) {
        const vpRect = window.viewport.getBoundingClientRect();
        
        // Calculate the position in the viewport
        const x = clientX - vpRect.left;
        const y = clientY - vpRect.top;
        
        // *** ADDED LOGGING for initial addWaypoint coordinates ***
        console.log(`%c addWaypoint: Calculated initial coords: x=${x.toFixed(1)}, y=${y.toFixed(1)} (clientX=${clientX}, clientY=${clientY}, vpLeft=${vpRect.left}, vpTop=${vpRect.top})`, 'color: green');

        // Visualize the waypoint marker at this position
        const marker = document.createElement('div');
        marker.className = 'point-marker';
        marker.style.left = `${x}px`;
        marker.style.top = `${y}px`;
        window.viewport.appendChild(marker);
        
        // Store the waypoint position
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

        // *** SIMPLIFIED LOGIC: Always delete the last element in the array ***
        const indexToDelete = window.intermediatePoints.length - 1;

        console.log(`Attempting to delete waypoint at determined index (last element): ${indexToDelete}`);

        // No need for index < 0 check as length > 0 is already checked

        const pointToDelete = window.intermediatePoints.pop(); // Use pop() for efficiency

        if (pointToDelete && pointToDelete.element) {
            pointToDelete.element.remove();
            console.log(`Removed marker element for index ${indexToDelete}`);
        } else {
             console.warn(`No element found to remove for waypoint at index ${indexToDelete}`);
        }

        // Reset lastModifiedPointIndex to the new last point or -1 if empty
        window.lastModifiedPointIndex = window.intermediatePoints.length - 1;
        console.log(`Updated lastModifiedPointIndex to: ${window.lastModifiedPointIndex}`);

        if (typeof window.updateWaypointCounter === 'function') {
            window.updateWaypointCounter();
        }

        // Update path visualization
        if (typeof window.drawPathVisualization === 'function') {
            window.drawPathVisualization();
        }

        if (typeof window.saveCurrentState === 'function') {
            window.saveCurrentState(); // Save after deleting
        }

        console.log(`Deleted last waypoint. New count: ${window.intermediatePoints.length}`);
    }

    // --- Waypoint Deletion Function (Now Explicitly Global) ---
    window.deleteWaypoint = function(index) {
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
    
    // --- Event Listeners --- 
    /* // XXX: This listener is likely redundant if handleViewportClick in xform-indexeddb.js is active
       // and is causing an extra waypoint to be added when a drag on an existing waypoint starts.
       // Temporarily commenting out to make handleViewportClick the sole controller for new waypoints.
    window.viewport.addEventListener('click', (e) => {
        console.log('%cVIEWPORT CLICKED! (from xform-controls.js) Target:', 'color: orange; font-weight: bold;', e.target);
        const clickTime = Date.now();
        const timeSinceLastMouseUp = clickTime - (window.lastMouseUpTime || 0);
        console.log(`viewport click (xform-controls.js): target=${e.target.id || e.target.className}, timeSinceLastMouseUp=${timeSinceLastMouseUp}ms`);
        
        if (timeSinceLastMouseUp < 50) {
            console.log(`viewport click (xform-controls.js): prevented because it occurred too soon (${timeSinceLastMouseUp}ms) after last mouseup.`);
            return;
        }
        if (e.target.closest('.point-marker')) {
            console.log('viewport click (xform-controls.js): prevented by target being on or inside a marker (closest check).'); 
            return;
        }
        if (e.target === window.startRect || e.target === window.endRect) {
            console.log('viewport click (xform-controls.js): prevented by target being startRect or endRect.'); 
            return;
        }
        if (window.isRectangleDragging) {
            console.log('viewport click (xform-controls.js): prevented by rectangle dragging flag.'); 
            return;
        }
        console.log('%cviewport click (xform-controls.js): ALL CHECKS PASSED - PROCEEDING TO addWaypoint.', 'color: green; font-weight: bold;'); 
        addWaypoint(e.clientX, e.clientY);
    });
    */

    // Event: Delete last waypoint button
    window.deleteLastWaypointButton.addEventListener('click', deleteLastWaypoint);

    console.log("Waypoint controls set up.");
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

// Function to reset all UI fields to their default state
function resetXFormFields() {
    console.log("🔄 Resetting X-Form fields...");

    // 1. Reset Name/Mode using Controller
    if (window.xformNameController && typeof window.xformNameController.setNewXform === 'function') {
        window.xformNameController.setNewXform();
        console.log("   XformName controller reset to new XForm state (ATM mode).");
    } else {
        console.error("   xformNameController not available for reset!");
        // Manual fallback (less ideal)
        const xformNameInput = document.getElementById('xformNameInput');
        if(xformNameInput) xformNameInput.value = "New X-Form";
        window.currentXFormName = "New X-Form";
    }
    window.currentXFormId = null; // Explicitly clear ID

    // 2. Reset Dimensions (Inputs ONLY)
    const defaultWidth = 100;
    const defaultHeight = 60;
    if (window.widthInput) window.widthInput.value = defaultWidth;
    if (window.heightInput) window.heightInput.value = defaultHeight;
    console.log(`   Dimension inputs reset to ${defaultWidth}x${defaultHeight}`);

    // 3. Reset Rectangles (Position and Visibility)
    // This will create new rects using the reset dimension input values
    // but keep them hidden initially.
    if (typeof initializeRects === 'function') {
        initializeRects(false, false); // Make HIDDEN, not loading
        console.log("   Rectangles re-initialized (hidden) to default positions and size.");
     } else {
        console.error("   initializeRects function not found during reset!");
    }

    // 4. Reset Waypoints
    window.intermediatePoints = [];
    document.querySelectorAll('.point-marker').forEach(marker => marker.remove());
    if (typeof window.updateWaypointCounter === 'function') {
        window.updateWaypointCounter();
        console.log("   Waypoints cleared.");
    } else {
        console.warn("   updateWaypointCounter function not found during reset!");
    }

    // 5. Reset Rotations
    window.xRotationDirection = 1;
    window.yRotationDirection = 1;
    window.zRotationDirection = 1;
    if (typeof updateRotationButtonsUI === 'function') {
        updateRotationButtonsUI();
        console.log("   Rotations reset to default.");
    } else {
        console.warn("   updateRotationButtonsUI function not found during reset!");
    }

    // 6. Reset Duration
    const defaultDuration = 500;
    if (window.durationInput) {
        window.durationInput.value = defaultDuration;
        // Optionally trigger change event if needed by other logic
        // window.durationInput.dispatchEvent(new Event('change'));
        console.log(`   Duration reset to ${defaultDuration}ms.`);
    } else {
        console.warn("   Duration input not found during reset!");
    }
    
    // 7. Reset Path Style (if applicable)
    if (window.xformPathStyles && typeof window.xformPathStyles.resetPathStyle === 'function') {
        window.xformPathStyles.resetPathStyle();
        console.log("   Path style reset.");
    }

    // 8. Redraw visualization (will likely clear path if rects are hidden)
    if (typeof window.drawPathVisualization === 'function') {
        window.drawPathVisualization();
        console.log("   Path visualization updated (likely cleared).");
    }

    console.log("✅ Field reset complete.");
}

// Function to setup control listeners
function setupControls() {
    console.log("Setting up controls...");

    // --- Attempt to initialize critical global DOM references if not already set ---
    if (!window.viewport) {
        window.viewport = document.getElementById('viewport');
        if (window.viewport) {
            console.log("setupControls: Initialized window.viewport from getElementById.");
        } else {
            console.error("setupControls: FAILED to find element with ID 'viewport'. Many controls will fail.");
        }
    }

    if (!window.deleteLastWaypointButton) {
        // Note: The error log said 'deleteLastWaypointButton', common HTML might be 'deleteLastWaypointBtn'
        // Trying 'deleteLastWaypointButton' first as per error log.
        window.deleteLastWaypointButton = document.getElementById('deleteLastWaypointButton');
        if (window.deleteLastWaypointButton) {
            console.log("setupControls: Initialized window.deleteLastWaypointButton from getElementById.");
        } else {
            // Fallback attempt if specific ID from error log isn't found
            window.deleteLastWaypointButton = document.getElementById('deleteLastWaypointBtn');
            if (window.deleteLastWaypointButton) {
                console.log("setupControls: Initialized window.deleteLastWaypointButton (fallback to 'deleteLastWaypointBtn') from getElementById.");
            } else {
                 console.error("setupControls: FAILED to find delete waypoint button by ID 'deleteLastWaypointButton' or 'deleteLastWaypointBtn'.");
            }
        }
    }

    if (!window.durationInput) {
        window.durationInput = document.getElementById('duration');
        if (window.durationInput) {
            console.log("setupControls: Initialized window.durationInput from getElementById.");
        } else {
            console.error("setupControls: FAILED to find duration input by ID 'duration'.");
        }
    }

    if (!window.widthInput) {
        window.widthInput = document.getElementById('rectWidth');
        if (window.widthInput) {
            console.log("setupControls: Initialized window.widthInput from getElementById.");
        } else {
            console.error("setupControls: FAILED to find width input by ID 'rectWidth'. Size controls will fail.");
        }
    }

    if (!window.heightInput) {
        window.heightInput = document.getElementById('rectHeight');
        if (window.heightInput) {
            console.log("setupControls: Initialized window.heightInput from getElementById.");
        } else {
            console.error("setupControls: FAILED to find height input by ID 'rectHeight'. Size controls will fail.");
        }
    }
    // --- End of global DOM reference initialization attempt ---

    setupRotationControls();
    setupDurationControl();
    setupViewportActions();
    setupWaypointControls(); 

    // Setup resize listeners for width and height inputs - revert to 'change' event
    if (window.widthInput) {
        window.widthInput.addEventListener('change', applyRectangleSize);
        console.log("Event listener 'change' for window.widthInput attached to applyRectangleSize.");
    } else {
        console.error("setupControls: Cannot attach listener to window.widthInput because it is not defined.");
    }

    if (window.heightInput) {
        window.heightInput.addEventListener('change', applyRectangleSize);
        console.log("Event listener 'change' for window.heightInput attached to applyRectangleSize.");
    } else {
        console.error("setupControls: Cannot attach listener to window.heightInput because it is not defined.");
    }

    // Path Style/Width/Shape buttons (Keep)
    if (typeof window.setupPathStyleButton === 'function') { window.setupPathStyleButton(); }
    if (typeof window.setupPathWidthButton === 'function') { window.setupPathWidthButton(); }
    if(typeof window.setupPathShapeButton==='function'){ window.setupPathShapeButton(); }

    // Setup Reset Fields Button Listener
    const resetFieldsButton = document.getElementById('resetAllFieldsBtn');
    if (resetFieldsButton) {
        if (typeof resetXFormFields === 'function' && typeof window.showModalDialog === 'function') {
            resetFieldsButton.addEventListener('click', async () => { // Make listener async
                console.log("Reset button clicked, showing confirmation modal...");
                const choice = await window.showModalDialog({
                    message: "Reset all X-Form fields?",
                    buttons: [
                        { id: 'yes', label: 'Yes', class: 'primary' },
                        { id: 'cancel', label: 'Cancel', class: 'secondary' }
                    ]
                });

                if (choice === 'yes') {
                    console.log("User confirmed reset. Proceeding...");
                    resetXFormFields();
                    // Add the call to clear list selections here
                    if (typeof clearAllSelections === 'function') {
                        clearAllSelections();
                        console.log("Saved XForm list selection cleared.");
                    } else {
                        console.warn("clearAllSelections function not found during reset.");
                    }
                } else {
                    console.log("User cancelled reset.");
                }
            });
            console.log("Reset fields button listener attached with confirmation.");
        } else {
            console.error("resetXFormFields or showModalDialog function not found!");
            // Fallback: Attach direct reset if modal is missing? Or just disable?
             if(typeof resetXFormFields === 'function') {
                 console.warn("Attaching direct reset as modal function is missing.");
                 resetFieldsButton.addEventListener('click', resetXFormFields);
             } else {
                 resetFieldsButton.disabled = true; // Disable if reset function is also missing
             }
        }
    } else {
        console.warn("Reset fields button (resetAllFieldsBtn) not found.");
    }

    // Apply initial state for buttons dependent on waypoints
    console.log(`SETUP_CONTROLS: Checking deleteLastWaypointButton BEFORE calling updateWaypointCounter: ${!!window.deleteLastWaypointButton}`);
    if(typeof window.updateWaypointCounter === 'function') window.updateWaypointCounter();

    console.log("Controls setup complete.");
} 

// Export all needed functions to the global namespace
window.makeDraggable = makeDraggable;
window.applyRectangleSize = applyRectangleSize;
window.initializeRects = initializeRects; // Export initializeRects to make it accessible globally
window.setupRotationControls = setupRotationControls;
window.setupDurationControl = setupDurationControl;
window.togglePathVisualization = togglePathVisualization;
window.setupViewportActions = setupViewportActions;
window.setupWaypointControls = setupWaypointControls;
window.makeDraggableWaypoint = makeDraggableWaypoint;
window.applyXFormAnimation = applyXFormAnimation;
window.updateRotationButtonsUI = updateRotationButtonsUI;
window.setupControls = setupControls;
window.globalMouseMoveHandler = globalMouseMoveHandler;  
window.globalMouseUpHandler = globalMouseUpHandler;
window.drawPathVisualization = drawPathVisualization; 