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
    .path-line{stroke:rgba(65,105,225,.7);fill:none;stroke-width:${thickness}px}
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
  const existing = document.getElementById('path-visualization');
  if (existing) existing.remove();
  if (style === 'none') return;

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
    
  let finalPoints = points;
  if (!window.forceLinearPath && typeof window.generateSplinePath==='function'){
    try{const out=window.generateSplinePath(points);if(out?.length)finalPoints=out;}catch{}}

  const drawConnectorLine = () => {
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('class','path-line solid');
    let d=`M ${finalPoints[0].x},${finalPoints[0].y}`;
    for(let i=1;i<finalPoints.length;i++) d+=` L ${finalPoints[i].x},${finalPoints[i].y}`;
    path.setAttribute('d',d);
    svg.appendChild(path);
  };

  // main style cases
  if(['dotted','dashed','solid'].includes(style)){
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('class',`path-line ${style}`);
    let d=`M ${finalPoints[0].x},${finalPoints[0].y}`;
    for(let i=1;i<finalPoints.length;i++) d+=` L ${finalPoints[i].x},${finalPoints[i].y}`;
    path.setAttribute('d',d);
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

