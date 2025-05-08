// xform-path-width.js

// Button for cycling through stroke widths (Width-1/3/5/7/9)
// Generates an orange overlay path that shares width with main path.

// ------------- Configuration -------------
const widthModes = [
  { id: 'w1',  label: 'Width-1',  width: 1  },
  { id: 'w5',  label: 'Width-5',  width: 5  },
  { id: 'w10', label: 'Width-10', width: 10 },
  { id: 'w15', label: 'Width-15', width: 15 },
  { id: 'w20', label: 'Width-20', width: 20 }
];

if (window.currentPathWidthIndex === undefined) window.currentPathWidthIndex = 0;
window.widthModes = widthModes;

// ------------- Helpers -------------
function setupPathWidthButton() {
  let btn = document.getElementById('pathWidthBtn');
  const viewportActions = document.querySelector('.viewport-actions');
  if (!viewportActions) return;
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'pathWidthBtn';
    viewportActions.appendChild(btn);
  }
  if (btn.dataset.pathWidthInit) return;

  btn.title = 'Change Path Width';
  btn.textContent = widthModes[window.currentPathWidthIndex].label;
  const refBtn = document.getElementById('pathStyleBtn');
  if (refBtn && refBtn.nextSibling !== btn) viewportActions.insertBefore(btn, refBtn.nextSibling);

  addWidthStyles();
  btn.addEventListener('click', () => {
    window.currentPathWidthIndex = (window.currentPathWidthIndex + 1) % widthModes.length;
    const mode = widthModes[window.currentPathWidthIndex];
    
    // Add check for valid mode and width
    if (!mode || typeof mode.width === 'undefined') {
        console.error("Invalid width mode found for index:", window.currentPathWidthIndex);
        // Reset index? Or just skip?
        window.currentPathWidthIndex = 0; // Reset to first mode as a fallback
        const fallbackMode = widthModes[0];
        if (fallbackMode) {
            btn.textContent = fallbackMode.label;
            applyPathWidth(fallbackMode.width);
        } else {
             btn.textContent = "ErrW"; // Indicate error
        }
        return; // Stop processing this click
    }

    btn.textContent = mode.label;
    console.log(`[Width] Set index to ${window.currentPathWidthIndex}. Trying to apply width: ${mode.width}px`);
    
    // Call the function to apply the width
    applyPathWidth(mode.width);
    console.log(`[Width] Called applyPathWidth(${mode.width}).`);

    // Explicitly redraw the path visualization AFTER applying the width
    if (typeof window.drawPathVisualization === 'function') {
        window.drawPathVisualization();
        console.log("[Width] Called drawPathVisualization() to update view.");
    } else {
        console.warn("[Width] window.drawPathVisualization function not found, path may not visually update immediately.");
    }

    // Save state if function exists
    if (typeof window.saveCurrentState === 'function') {
        window.saveCurrentState();
    }
  });
  btn.dataset.pathWidthInit = 'true';
  if (widthModes[0].width !== 1) applyPathWidth(widthModes[0].width);
}

function updateSelectedPathWidth() {
  if (window.currentPathWidthIndex === undefined) return;
  applyPathWidth(widthModes[window.currentPathWidthIndex].width);
}

function addWidthStyles() {
  if (document.getElementById('path-visualization-width-styles')) return;
  const s = document.createElement('style');
  s.id = 'path-visualization-width-styles';
  const w = window.pathLineWidth || 1;
  s.textContent = `
  .path-width-vis{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5}
  .width-line{stroke:rgba(255,140,0,.7);fill:none;stroke-width:${w}px}
  .width-marker-circle{fill:rgba(255,140,0,.5);stroke:rgba(255,140,0,.9);stroke-width:1px}
  `;
  document.head.appendChild(s);
}

function applyPathWidth(width){
  const viewport=document.getElementById('viewport');
  if(!viewport) return;
  const old=document.getElementById('path-width-vis');
  if(old) old.remove();

  window.pathLineWidth = window.pathThickness = width; // keep console utils compatibility
  
  // --- REMOVED UNRELIABLE CSS TEXT REPLACEMENT ---
  // Modifying CSS rules within <style> tags using text replacement (regex) is fragile.
  // It can easily break if the CSS format changes slightly (e.g., spacing, missing semicolon).
  // The stroke width should be applied directly by the function that draws the main path
  // (e.g., drawPathVisualization) by reading `window.pathLineWidth`.
  /*
  ['path-visualization-styles','path-visualization-width-styles'].forEach(id=>{
    const el=document.getElementById(id); 
    if(!el) return; 
    el.textContent=el.textContent.replace(/stroke-width:\s*\d+px;/,`stroke-width: ${width}px;`);
  });
  */
  // --- END REMOVED SECTION ---

  // Re-adding or updating the specific width-styles used ONLY for the orange overlay path is okay,
  // as it correctly uses the updated window.pathLineWidth.
  addWidthStyles();

  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.id='path-width-vis'; svg.classList.add('path-width-vis'); svg.setAttribute('width','100%'); svg.setAttribute('height','100%');
  const sr=document.getElementById('startRect'), er=document.getElementById('endRect'); if(!sr||!er) return;
  const srSt=getComputedStyle(sr), erSt=getComputedStyle(er);
  const sx=parseFloat(srSt.left)+parseFloat(srSt.width)/2, sy=parseFloat(srSt.top)+parseFloat(srSt.height)/2;
  const ex=parseFloat(erSt.left)+parseFloat(erSt.width)/2, ey=parseFloat(erSt.top)+parseFloat(erSt.height)/2;
  const pts=[{x:sx,y:sy},...(window.intermediatePoints||[]),{x:ex,y:ey}];
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('class','width-line');
  path.setAttribute('d','M '+pts.map(p=>p.x+','+p.y).join(' L '));
  svg.appendChild(path);
  pts.forEach((p,i)=>{const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('class','width-marker-circle');c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);c.setAttribute('r',i===0||i===pts.length-1?6:4);svg.appendChild(c);});
  viewport.appendChild(svg);
}

window.xformPathWidth={widthModes,setupPathWidthButton,updateSelectedPathWidth,applyPathWidth};
window.setupPathWidthButton=setupPathWidthButton;
window.applyPathWidth=applyPathWidth;
window.updateSelectedPathWidth=updateSelectedPathWidth; 