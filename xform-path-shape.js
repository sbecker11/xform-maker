// xform-path-shape.js

// Button cycles through interpolation shapes: Linear, Pass-thru (Catmull-Rom), Gravity (Bezier w/ pull)

const shapeModes=[
  {id:'linear', label:'Linear'},
  {id:'passthrough', label:'Pass-thru'},
  {id:'gravity', label:'Gravity'}
];
if(window.currentPathShapeIndex===undefined) window.currentPathShapeIndex=0;
window.shapeModes=shapeModes;

function setupPathShapeButton(){
  let btn=document.getElementById('pathShapeBtn');
  const container=document.querySelector('.viewport-actions');
  if(!container) return;
  if(!btn){btn=document.createElement('button');btn.id='pathShapeBtn';container.appendChild(btn);}  
  if(btn.dataset.shapeInit) return;

  const applyCurrent=()=>{
    const mode=shapeModes[window.currentPathShapeIndex];
    btn.textContent=mode.label;
    if(mode.id==='linear'){
      window.forceLinearPath=true;
      window.pathInterpolationMode='passthrough'; // fallback value but linear flag dominates
    }else{
      window.forceLinearPath=false;
      window.pathInterpolationMode=mode.id;
    }
    if(typeof window.applyPathStyle==='function' && window.pathStyleModes){
      const curStyle=window.pathStyleModes[window.currentPathStyleIndex||0].style;
      window.applyPathStyle(curStyle);
    }
  };

  applyCurrent();
  btn.addEventListener('click',()=>{
    window.currentPathShapeIndex=(window.currentPathShapeIndex+1)%shapeModes.length;
    applyCurrent();
  });
  btn.dataset.shapeInit='true';

  // ensure button positioned after width button
  const widthBtn=document.getElementById('pathWidthBtn');
  if(widthBtn && widthBtn.nextSibling!==btn){container.insertBefore(btn,widthBtn.nextSibling);}
}

window.xformPathShape={shapeModes,setupPathShapeButton};
window.setupPathShapeButton=setupPathShapeButton; 