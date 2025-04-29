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
// let isRectangleDragging = false; // Declared in main script

// --- Bezier/Spline Calculation Helpers ---
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

function getPointOnCubicBezier(p0, p1, p2, p3, t) {
    // Calculates a point on a cubic Bezier curve defined by p0, p1, p2, p3 at parameter t [0, 1]
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

// NEW: Helper function for Catmull-Rom interpolation
function getPointOnCatmullRom(p0, p1, p2, p3, t) {
    // Calculates a point on a Catmull-Rom spline segment between p1 and p2 at parameter t [0, 1]
    const t2 = t * t;
    const t3 = t2 * t;
    return {
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    };
}

function generateSplinePath(points, samplesPerSegment = 20) { // Reduced default samples
    if (!points || points.length < 2) return []; // Return empty array if not enough points

    const path = [points[0]]; // Start with the first point
    const n = points.length;

    if (n === 2) {
        // Straight line: just return start and end
        path.push(points[1]);
        return path;
    } else if (n === 3) {
        // Catmull-Rom for 1 waypoint (3 total points: start, wp1, end)
        const p0 = points[0]; // Duplicate start point for boundary condition
        const p1 = points[0];
        const p2 = points[1];
        const p3 = points[2];
        
        // First segment (Start -> Waypoint 1)
        for (let t = 1; t <= samplesPerSegment; t++) {
            path.push(getPointOnCatmullRom(p0, p1, p2, p3, t / samplesPerSegment));
        }

        // Second segment (Waypoint 1 -> End) - Note: reusing p0, p3 from above
        const p0_seg2 = points[0];
        const p1_seg2 = points[1];
        const p2_seg2 = points[2];
        const p3_seg2 = points[2]; // Duplicate end point for boundary condition
        for (let t = 1; t <= samplesPerSegment; t++) {
             // Skip t=0 as it's the same as the end of the previous segment
            path.push(getPointOnCatmullRom(p0_seg2, p1_seg2, p2_seg2, p3_seg2, t / samplesPerSegment));
        }
        // Ensure the very last point is exactly the end point
        if (path[path.length - 1].x !== points[n - 1].x || path[path.length - 1].y !== points[n - 1].y) {
             path.push(points[n - 1]);
        }

    } else { // n >= 4: Bezier spline using Catmull-Rom derived control points
        const numSegments = n - 1;
        for (let i = 0; i < numSegments; i++) {
            // Use Catmull-Rom to Bezier conversion to get control points
            const p0 = points[Math.max(0, i - 1)]; // Previous point (or p0 if i=0)
            const p1 = points[i];                     // Start of segment
            const p2 = points[i + 1];                 // End of segment
            const p3 = points[Math.min(numSegments, i + 2)]; // Next point (or pN if i=N-1)

            const [cp1, cp2] = getControlPoints(p0, p1, p2, p3);

            // Sample points along this cubic Bezier segment
            for (let t = 1; t <= samplesPerSegment; t++) {
                 // Skip t=0 for segments > 0 as it repeats the end of the previous segment
                path.push(getPointOnCubicBezier(p1, cp1, cp2, p2, t / samplesPerSegment));
            }
        }
         // Ensure the very last point is exactly the end point
         if (path[path.length - 1].x !== points[n - 1].x || path[path.length - 1].y !== points[n - 1].y) {
              path.push(points[n - 1]);
         }
    }

    return path;
}

// *** NEW: Expose spline functions globally ***
window.generateSplinePath = generateSplinePath;
window.getControlPoints = getControlPoints;
window.getPointOnCubicBezier = getPointOnCubicBezier;
window.getPointOnCatmullRom = getPointOnCatmullRom;

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

    if (startRect) makeDraggable(startRect);
    if (endRect) makeDraggable(endRect);

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

// --- Dragging Logic for Rectangles ---
function makeDraggable(element) {
    let isDragging = false;
    let startX, startY, initialMouseX, initialMouseY;
    if (!window.viewport) return;

    element.addEventListener('mousedown', (e) => {
        if (!element) return;
        isDragging = true;
        window.isRectangleDragging = true; // Use global flag
        element.style.cursor = 'grabbing';
        element.style.transition = 'none';

        const rect = element.getBoundingClientRect();
        const viewportRect = window.viewport.getBoundingClientRect();
        startX = rect.left - viewportRect.left;
        startY = rect.top - viewportRect.top;
        initialMouseX = e.clientX;
        initialMouseY = e.clientY;
        e.preventDefault();
        e.stopPropagation(); // *** ADDED: Prevent viewport click listener ***
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging || !element) return;

        const dx = e.clientX - initialMouseX;
        const dy = e.clientY - initialMouseY;
        let newX = startX + dx;
        let newY = startY + dy;

        const vpRect = window.viewport.getBoundingClientRect();
        const elRect = element.getBoundingClientRect(); // Re-get bounds in case size changed
        newX = Math.max(0, Math.min(newX, vpRect.width - elRect.width));
        newY = Math.max(0, Math.min(newY, vpRect.height - elRect.height));

        element.style.left = `${newX}px`;
        element.style.top = `${newY}px`;
        
        // Live update path while dragging, if path is visible
        const pathVis = document.getElementById('path-visualization');
        if (pathVis) {
            drawPathVisualization();
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging && element) {
            isDragging = false;
            window.isRectangleDragging = false; // Reset global flag
            element.style.cursor = 'grab';
            element.style.transition = '';
            console.log(`${element.id} Dropped at:`, element.style.left, element.style.top);
            
            // Update path visualization if it exists
            const pathVis = document.getElementById('path-visualization');
            if (pathVis) {
                drawPathVisualization();
            }
            
            if (typeof window.saveCurrentState === 'function') { // Check if save function exists
                window.saveCurrentState();
                console.log("Rectangle positions saved to localStorage:", 
                    JSON.parse(localStorage.getItem(window.STATE_STORAGE_KEY || 'xformMaker_currentState')));
            }
        }
    });

    element.addEventListener('dragstart', (e) => {
        e.preventDefault();
    });
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

// --- Animation Logic ---
function applyXFormAnimation() {
    console.log("Starting X-Form animation...");
    const startButton = document.getElementById('startAnimation');

    if (!window.startRect || !window.endRect) {
        console.error("Start/End rectangle elements not found!");
        return;
    }

    if (!window.currentXFormHasRun) {
        if (window.currentXFormName === "New X-Form" || !window.currentXFormId) {
            window.currentXFormId = Date.now();
            window.currentXFormName = `X-Form ${new Date(window.currentXFormId).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
        }
        window.currentXFormHasRun = true;
        // Potentially update display if needed (handled by persistence module?)
    }

    if(startButton) startButton.textContent = 'Play';
    
    const duration = parseInt(window.durationInput.value, 10);
    const durationSeconds = Math.max(0.1, duration / 1000);
    
    window.startRect.style.animation = '';
    window.startRect.style.transform = '';
    window.startRect.style.transition = ''; // Ensure transition is cleared
    
    setTimeout(() => {
        const vpRect = window.viewport.getBoundingClientRect();
        const startRectBounds = window.startRect.getBoundingClientRect();
        const endRectBounds = window.endRect.getBoundingClientRect();

        const startLeft = startRectBounds.left - vpRect.left;
        const startTop = startRectBounds.top - vpRect.top;
        const endLeft = endRectBounds.left - vpRect.left;
        const endTop = endRectBounds.top - vpRect.top;

        const translateX = endLeft - startLeft;
        const translateY = endTop - startTop;

        // Get the rectangle dimensions for waypoint adjustment
        const rectWidth = startRectBounds.width;
        const rectHeight = startRectBounds.height;

        const controlPoints = [
            { x: startLeft + (startRectBounds.width / 2), y: startTop + (startRectBounds.height / 2) },
            ...window.intermediatePoints.map(p => ({ 
                x: p.x + (rectWidth / 2), // Add half width to get center
                y: p.y + (rectHeight / 2) // Add half height to get center
            })),
            { x: endLeft + (endRectBounds.width / 2), y: endTop + (endRectBounds.height / 2) }
        ];

        const smoothPath = generateSplinePath(controlPoints);

        if (smoothPath.length > 1) {
            const keyframesName = `pathAnimation_${Date.now()}`;
            let keyframesRule = `@keyframes ${keyframesName} {\n`;
            const numPathPoints = smoothPath.length - 1;

            smoothPath.forEach((point, index) => {
                const percentage = numPathPoints === 0 ? 100 : (index / numPathPoints) * 100;
                // Adjust for center point of rectangle
                const pointTranslateX = point.x - (startLeft + startRectBounds.width / 2);
                const pointTranslateY = point.y - (startTop + startRectBounds.height / 2);
                const progress = percentage / 100;
                const rotateXValue = window.xRotationDirection * 360 * progress;
                const rotateYValue = window.yRotationDirection * 360 * progress;
                const rotateZValue = window.zRotationDirection * 360 * progress;

                const transformValue = `translateX(${pointTranslateX}px) translateY(${pointTranslateY}px) rotateX(${rotateXValue}deg) rotateY(${rotateYValue}deg) rotateZ(${rotateZValue}deg)`;
                keyframesRule += `  ${percentage}% { transform: ${transformValue}; }\n`;
            });
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
                // Don't reset transform here if using 'forwards'
                window.startRect.style.animation = ''; 
                if (styleSheet) styleSheet.remove();
            }, duration + 100);
        } else {
            const transformValue = `translateX(${translateX}px) translateY(${translateY}px) rotateX(${window.xRotationDirection*360}deg) rotateY(${window.yRotationDirection*360}deg) rotateZ(${window.zRotationDirection*360}deg)`;
            window.startRect.style.transition = `transform ${durationSeconds}s ease-in-out`;
            window.startRect.style.transform = transformValue;
            
            setTimeout(() => {
                 window.startRect.style.transform = '';
                 window.startRect.style.transition = '';
            }, duration + 100);
        }
    }, 50);
}

// --- Path Visualization Logic ---
function drawPathVisualization() {
    // DELEGATE to applyPathStyle to handle drawing based on current mode
    if (typeof window.applyPathStyle === 'function' && window.pathStyleModes && window.currentPathStyleIndex !== undefined) {
        const currentStyleMode = window.pathStyleModes[window.currentPathStyleIndex];
        if (currentStyleMode) {
            applyPathStyle(currentStyleMode.style);
        } else {
             console.warn('Current path style mode not found, cannot draw path.');
             // Optionally remove existing path if style is invalid
             const existingPath = document.getElementById('path-visualization');
             if (existingPath) existingPath.remove();
        }
    } else {
        console.warn('Cannot draw path: applyPathStyle function or path styles not available.');
        // Optionally remove existing path if functions are missing
        const existingPath = document.getElementById('path-visualization');
        if (existingPath) existingPath.remove();
    }

    // Remove the old drawing logic from here
    /*
    // Remove any existing path visualization
    const existingPath = document.getElementById('path-visualization');
    // ... (rest of the old SVG drawing code was here) ...
    window.viewport.appendChild(svg);
    */
}

function togglePathVisualization() {
    const pathVis = document.getElementById('path-visualization');
    if (pathVis) {
        pathVis.remove();
    } else {
        drawPathVisualization();
    }
    
    // Update button state
    const showPathButton = document.getElementById('showPathBtn');
    if (showPathButton) {
        if (pathVis) {
            showPathButton.textContent = 'Show Path';
        } else {
            showPathButton.textContent = 'Hide Path';
        }
    }
}

// --- Modified Viewport Action Buttons Setup ---
function setupViewportActions() {
    const startButton = document.getElementById('startAnimation');
    const resetButton = document.getElementById('resetPositions');
    const themeToggle = document.getElementById('themeToggle');
    
    // Create and insert the Show Path button
    const showPathButton = document.createElement('button');
    showPathButton.id = 'showPathBtn';
    showPathButton.textContent = 'Show Path';
    showPathButton.title = 'Toggle path visualization';
    
    if (startButton && resetButton) {
        const actionsDiv = startButton.parentElement;
        if (actionsDiv && actionsDiv.classList.contains('viewport-actions')) {
            actionsDiv.insertBefore(showPathButton, themeToggle);
        }
    }
    
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
            
            // Reset the show path button text
            if (showPathButton) {
                showPathButton.textContent = 'Show Path';
            }
            
            initializeRects(); // Reset rectangles and waypoints
            console.log("Viewport reset complete");
            if (typeof window.saveCurrentState === 'function') window.saveCurrentState(); // Save reset state
        });
    }
    
    if (showPathButton) {
        showPathButton.addEventListener('click', togglePathVisualization);
    }
    
    console.log("Viewport action buttons set up with path visualization option");
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
        window.lastModifiedPointIndex = window.intermediatePoints.length - 1;
        
        if (typeof window.makeDraggableWaypoint === 'function') {
             window.makeDraggableWaypoint(marker, window.intermediatePoints.length - 1);
        }
        
        if (typeof window.updateWaypointCounter === 'function') {
            window.updateWaypointCounter();
        }
        if (typeof window.saveCurrentState === 'function') {
             window.saveCurrentState(); // Save after adding
        }
        
        // Update path visualization if it's visible
        const pathVis = document.getElementById('path-visualization');
        if (pathVis) {
            drawPathVisualization();
        }
        
        console.log(`Added waypoint at (${x.toFixed(1)}, ${y.toFixed(1)})`);
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
        
        // Always update path visualization if it exists
        const pathVis = document.getElementById('path-visualization');
        if (pathVis) {
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
            
            // Always update path visualization if it exists
            const pathVis = document.getElementById('path-visualization');
            if (pathVis) {
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
            
            // Update path visualization if it's visible
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
                 window.wasDraggingPoint = false; 
                 console.log('Waypoint deleted by dragging outside viewport');
                 
                 // Update path visualization if it exists
                 const pathVis = document.getElementById('path-visualization');
                 if (pathVis) {
                     drawPathVisualization();
                 }
                 
                 if (typeof window.saveCurrentState === 'function') window.saveCurrentState();
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
                  if (typeof window.saveCurrentState === 'function') window.saveCurrentState(); // Save final position
             }
            
             window.draggingPointIndex = -1;
             window.selectedPointIndex = -1;
        }
        // Reset wasDraggingPoint slightly later to allow click event to check it
        setTimeout(() => { window.wasDraggingPoint = false; }, 50); 
    });

    // Event: Viewport click to add waypoint
    window.viewport.addEventListener('click', (e) => {
        if (window.wasDraggingPoint || window.isRectangleDragging) {
            return;
        }
        if (e.target.classList.contains('point-marker') || e.target === window.startRect || e.target === window.endRect) {
            return;
        }
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
} 