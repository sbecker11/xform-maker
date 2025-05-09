// xform-path-shape.js

// Button cycles through interpolation shapes: Linear, Pass-thru (Catmull-Rom), Gravity (Bezier w/ pull)

// Defines the available path shape modes for the UI button.
// Each object has an 'id' for internal logic and a 'label' for the button text.
const shapeModes=[
  {id:'linear', label:'Linear'}, // Simple straight lines between points.
  {id:'passthrough', label:'Pass-thru'}, // Typically a Catmull-Rom spline that passes through all points.
  {id:'approx', label:'Approx'} // RENAMED: Generalized N-degree Bezier curve, uses all points as control points.
];
if(window.currentPathShapeIndex===undefined) window.currentPathShapeIndex=0;
window.shapeModes=shapeModes;

function setupPathShapeButton(){
  let btn=document.getElementById('pathShapeBtn');
  const container=document.querySelector('.viewport-actions');
  if(!container) return;
  if(!btn){btn=document.createElement('button');btn.id='pathShapeBtn';container.appendChild(btn);}
  if(btn.dataset.shapeInit) return;

  // This function is called when the button is clicked or initially to set the state.
  const applyCurrent=()=>{
    const mode=shapeModes[window.currentPathShapeIndex];
    btn.textContent=mode.label;

    // Set global flags based on the selected mode.
    // window.pathInterpolationMode is used by the drawing logic to select the correct curve algorithm.
    // window.forceLinearPath can override spline generation for simple linear paths.
    if(mode.id==='linear'){
      window.forceLinearPath=true;
      // For 'linear', even if passthrough is set, forceLinearPath will ensure straight lines.
      window.pathInterpolationMode='passthrough'; // Could also be 'linear' if a distinct linear generator is preferred.
    }else if(mode.id==='approx'){ // RENAMED: Our generalized Bezier mode.
      window.forceLinearPath=false; // It's a curve, not forced linear.
      window.pathInterpolationMode='approx'; // RENAMED: Specific mode for the generalized N-point Bezier.
    }else{ // Default case, currently 'passthrough' (Catmull-Rom) or any other mode not explicitly handled above.
      window.forceLinearPath=false;
      window.pathInterpolationMode='passthrough'; // Defaulting to passthrough for safety if mode.id is unexpected.
                                                  // If 'passthrough' is the only other option, this becomes its explicit handler.
    }

    // After setting the mode, re-apply the path style which triggers a redraw with the new mode.
    if(typeof window.applyPathStyle==='function' && window.pathStyleModes){
      const curStyle=window.pathStyleModes[window.currentPathStyleIndex||0].style;
      window.applyPathStyle(curStyle);
    }
  };

  applyCurrent(); // Apply the initial state.

  // Event listener for button clicks to cycle through modes.
  btn.addEventListener('click',()=>{
    window.currentPathShapeIndex=(window.currentPathShapeIndex+1)%shapeModes.length;
    applyCurrent(); // Apply the new mode.
    console.log(`[Shape] now: ${shapeModes[window.currentPathShapeIndex].id}`);
  });
  btn.dataset.shapeInit='true';

  // ensure button positioned after width button
  const widthBtn=document.getElementById('pathWidthBtn');
  if(widthBtn && widthBtn.nextSibling!==btn){container.insertBefore(btn,widthBtn.nextSibling);}
}

window.xformPathShape={shapeModes,setupPathShapeButton};
window.setupPathShapeButton=setupPathShapeButton; 