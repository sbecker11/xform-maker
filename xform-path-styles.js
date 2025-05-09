// xform-path-styles.js

// Lightweight module that encapsulates everything related to the
// path-visualisation button and SVG drawing.  It stores only the minimal
// state (current index / mode array) on window so existing console
// helpers and other modules can keep working.

// ------------- Configuration -------------

// Public path-style options
pathStyleModes = [
  { id: 'none',    label: 'Style',    style: 'none'    },
  { id: 'dotted',  label: 'Dotted',  style: 'dotted'  },
  { id: 'dashed',  label: 'Dashed',  style: 'dashed'  },
  { id: 'solid',   label: 'Solid',   style: 'solid'   },
  { id: 'circles', label: 'Circles', style: 'circles' },
  { id: 'boxes',   label: 'Boxes',   style: 'boxes'   }
];

// Track selection globally so other modules (console utils, etc.) can poke at it
if (window.currentPathStyleIndex === undefined) {
  window.currentPathStyleIndex = 0; // default "none"
}
window.pathStyleModes = pathStyleModes;

// ------------- Public helpers -------------

function setupPathStyleButton () {
  // Use existing button if present, otherwise create one
  let btn = document.getElementById('pathStyleBtn');
        const viewportActions = document.querySelector('.viewport-actions');
        if (!viewportActions) {
    console.warn('setupPathStyleButton: .viewport-actions not found');
            return;
        }
        
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'pathStyleBtn';
    viewportActions.appendChild(btn);
  }

  // Prevent duplicate initialization / multiple click handlers
  if (!btn.dataset.pathStyleInit) {
    btn.title = 'Change Path Style';
    btn.textContent = pathStyleModes[window.currentPathStyleIndex].label;

    // If not already positioned after reset button, attempt to move it
        const resetBtn = document.getElementById('resetPositions');
    if (resetBtn && resetBtn.nextSibling !== btn) {
      viewportActions.insertBefore(btn, resetBtn.nextSibling);
    }

    addPathVisualizationStyles();
    
    btn.addEventListener('click', () => {
      window.currentPathStyleIndex = (window.currentPathStyleIndex + 1) % pathStyleModes.length;
      const mode = pathStyleModes[window.currentPathStyleIndex];
      btn.textContent = mode.label;
      console.log(`[Style] now: ${mode.id}`);
      applyPathStyle(mode.style);
    });
    
    // Mark as initialized to avoid duplicate handlers next time
    btn.dataset.pathStyleInit = 'true';
    
    // initial application (skip if none)
    const initMode = pathStyleModes[window.currentPathStyleIndex];
    if (initMode.id !== 'none') applyPathStyle(initMode.style);
  }
}

function updateSelectedPathStyle () {
  if (window.currentPathStyleIndex === undefined) return;
  const mode = pathStyleModes[window.currentPathStyleIndex];
  applyPathStyle(mode.style);
    }
    
// ------------- Drawing logic -------------

function addPathVisualizationStyles () {
  if (document.getElementById('path-visualization-styles')) return;
  const style = document.createElement('style');
  style.id = 'path-visualization-styles';
  const thickness = window.pathThickness || 2;
  style.textContent = `
    .path-visualization{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:4}
    /* REMOVED stroke-width from here - it will be set directly on the path element */
    .path-line{stroke:rgba(65,105,225,.7);fill:none;/* stroke-width removed */}
    .path-line.dotted{stroke-dasharray:2,5}
    .path-line.dashed{stroke-dasharray:10,5}
    .path-marker-circle{fill:rgba(65,105,225,.5);stroke:rgba(65,105,225,.9);stroke-width:1px}
    .path-marker-box{fill:rgba(65,105,225,.3);stroke:rgba(65,105,225,.9);stroke-width:1px}
  `;
  document.head.appendChild(style);
}

function applyPathStyle (style) {
    const viewport = document.getElementById('viewport');
    if (!viewport) return;

  // Remove the main path visualization SVG if it exists
  const existingPathVis = document.getElementById('path-visualization');
  if (existingPathVis) existingPathVis.remove();

  // ALSO REMOVE any existing path width visualization overlay to prevent leftovers
  const existingWidthVis = document.getElementById('path-width-vis');
  if (existingWidthVis) existingWidthVis.remove();

  if (style === 'none') return; // If the style is 'none', we don't draw anything further.

  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.id = 'path-visualization';
  svg.classList.add('path-visualization');
  svg.setAttribute('width','100%');
  svg.setAttribute('height','100%');
    
    const startRect = document.getElementById('startRect');
  const endRect   = document.getElementById('endRect');
  if (!startRect || !endRect) return;

  const startRectStyle = getComputedStyle(startRect);
  const endRectStyle   = getComputedStyle(endRect);
  const startX = parseFloat(startRectStyle.left) + parseFloat(startRectStyle.width)/2;
  const startY = parseFloat(startRectStyle.top)  + parseFloat(startRectStyle.height)/2;
  const endX   = parseFloat(endRectStyle.left)   + parseFloat(endRectStyle.width)/2;
  const endY   = parseFloat(endRectStyle.top)    + parseFloat(endRectStyle.height)/2;
    
  const points = [{x:startX,y:startY}];
  if (window.intermediatePoints?.length) window.intermediatePoints.forEach(p=>points.push({x:p.x,y:p.y}));
  points.push({x:endX,y:endY});
    
  // Initialize finalPoints with the raw, direct points (linear path).
  // This serves as a fallback if no specific interpolation mode is matched or if an error occurs.
  let finalPoints = points; 

  // Check the global pathInterpolationMode to determine which curve generation logic to use.
  // This mode is set by the path shape button logic in xform-path-shape.js.
  if (window.pathInterpolationMode === 'approx' && typeof window.generateGeneralizedBezierCurve === 'function') {
    // If mode is 'approx' (formerly 'n-point-approx'), use the generalized N-degree Bezier curve function.
    // This function uses all points in the 'points' array as control points for a single Bezier curve.
    try {
      // Generate the curve with a fixed number of samples (e.g., 100) for smoothness.
      const out = window.generateGeneralizedBezierCurve(points, 100);
      if (out?.length) {
        finalPoints = out; // Use the generated Bezier curve points.
      }
    } catch (e) {
      console.error("Error generating N-point Bezier curve:", e);
      // If an error occurs, finalPoints will remain the raw linear points as a fallback.
    }
  } else if (!window.forceLinearPath && typeof window.generateSplinePath === 'function') {
    // If not forcing a linear path, and another spline mode (e.g., 'passthrough' or 'bezier') is active,
    // use the generateSplinePath function. This function internally handles different spline types
    // like Catmull-Rom or Bezier splines (collections of segments).
    try {
      const out = window.generateSplinePath(points);
      if (out?.length) {
        finalPoints = out; // Use the generated spline points.
      }
    } catch (e) {
      console.error("Error generating spline path:", e);
      // If an error occurs, finalPoints will remain the raw linear points as a fallback.
    }
  }
  // If window.forceLinearPath is true, or if no other condition was met (or errors occurred),
  // finalPoints will be the original set of points, resulting in a linear path.

  const drawConnectorLine = () => {
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('class','path-line solid');
    let d=`M ${finalPoints[0].x},${finalPoints[0].y}`;
    for(let i=1;i<finalPoints.length;i++) d+=` L ${finalPoints[i].x},${finalPoints[i].y}`;
    path.setAttribute('d',d);
    
    const currentWidth = window.pathLineWidth || 1;
    console.log(`[Style] Applying stroke-width: ${currentWidth} to connector path`);
    path.setAttribute('stroke-width', currentWidth);

    svg.appendChild(path);
  };

  // main style cases
  if(['dotted','dashed','solid'].includes(style)){
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('class',`path-line ${style}`);
    let d=`M ${finalPoints[0].x},${finalPoints[0].y}`;
    for(let i=1;i<finalPoints.length;i++) d+=` L ${finalPoints[i].x},${finalPoints[i].y}`;
    path.setAttribute('d',d);

    const currentWidth = window.pathLineWidth || 1;
    console.log(`[Style] Applying stroke-width: ${currentWidth} to main styled path`);
    path.setAttribute('stroke-width', currentWidth);

    svg.appendChild(path);
  }
  if(style==='circles'){
    drawConnectorLine();
    finalPoints.forEach((p,i)=>{
      const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
      c.setAttribute('class','path-marker-circle');
      c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);
      c.setAttribute('r',i===0||i===finalPoints.length-1?6:4);
      svg.appendChild(c);
        });
    }
  if(style==='boxes'){
    drawConnectorLine();
    finalPoints.forEach((p,i)=>{
      const r=document.createElementNS('http://www.w3.org/2000/svg','rect');
      r.setAttribute('class','path-marker-box');
      const size=i===0||i===finalPoints.length-1?10:7;
      r.setAttribute('width',size);
      r.setAttribute('height',size);
      r.setAttribute('x',p.x-size/2);
      r.setAttribute('y',p.y-size/2);
      svg.appendChild(r);
        });
    }
    
    viewport.appendChild(svg);
}

window.xformPathStyles = { pathStyleModes, setupPathStyleButton, updateSelectedPathStyle, applyPathStyle };

// Also expose individual helpers for legacy references
window.setupPathStyleButton = setupPathStyleButton;
window.applyPathStyle = applyPathStyle;
window.updateSelectedPathStyle = updateSelectedPathStyle;

