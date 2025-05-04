// XForm Inspector - Utility functions for examining XForm data
// Add this to your browser console to inspect XForms

// Inspect all XForms in the database
async function inspectAllXForms() {
  try {
    // Get all XForms using the existing function
    const xforms = await window.listXForms();
    
    console.group('📊 XForm Inspector - All XForms');
    console.log(`Found ${xforms.length} XForms in database`);
    
    // Create a summary table
    console.table(xforms.map(xform => ({
      id: xform.id,
      xformName: xform.xformName,
      modified: new Date(xform.lastModified).toLocaleString(),
      waypoints: xform.waypoints?.length || 0,
      duration: xform.duration || 'N/A',
      dimensions: `${xform.startRect?.width || 'N/A'}x${xform.startRect?.height || 'N/A'}`
    })));
    
    // Detailed rotation and other properties
    xforms.forEach((xform, index) => {
      console.group(`XForm #${index+1}: ${xform.xformName}`);
      console.log('ID:', xform.id);
      console.log('Last Modified:', new Date(xform.lastModified).toLocaleString());
      console.log('Start Position:', `(${xform.startRect?.left || 0}, ${xform.startRect?.top || 0})`);
      console.log('End Position:', `(${xform.endRect?.left || 0}, ${xform.endRect?.top || 0})`);
      console.log('Dimensions:', `${xform.startRect?.width || 100}x${xform.startRect?.height || 60}`);
      console.log('Duration:', `${xform.duration || 500}ms`);
      console.log('Rotations:', {
        x: xform.rotations?.x || 1,
        y: xform.rotations?.y || 1, 
        z: xform.rotations?.z || 1
      });
      console.log('Waypoints:', xform.waypoints?.length || 0);
      if (xform.waypoints && xform.waypoints.length > 0) {
        console.log('Waypoint coordinates:', xform.waypoints.map(wp => `(${wp.x}, ${wp.y})`));
      }
      console.groupEnd();
    });
    
    console.groupEnd();
    return xforms;
  } catch (error) {
    console.error('Error inspecting XForms:', error);
    return [];
  }
}

// Inspect a specific XForm by ID
async function inspectXFormById(id) {
  try {
    const xform = await window.loadXFormById(id);
    if (!xform) {
      console.error(`No XForm found with ID: ${id}`);
      return null;
    }
    
    console.group(`📊 XForm Inspector - ${xform.xformName}`);
    console.log('ID:', xform.id);
    console.log('Created:', new Date(xform.timestamp || xform.id).toLocaleString());
    console.log('Last Modified:', new Date(xform.lastModified).toLocaleString());
    
    console.group('Rectangles');
    console.log('Start:', xform.startRect);
    console.log('End:', xform.endRect); 
    console.groupEnd();
    
    console.group('Animation');
    console.log('Duration:', `${xform.duration || 500}ms`);
    console.log('Rotations:', xform.rotations || { x: 1, y: 1, z: 1 });
    console.groupEnd();
    
    console.group('Waypoints');
    console.log(`Count: ${xform.waypoints?.length || 0}`);
    if (xform.waypoints && xform.waypoints.length > 0) {
      console.table(xform.waypoints);
    }
    console.groupEnd();
    
    console.groupEnd();
    return xform;
  } catch (error) {
    console.error('Error inspecting XForm:', error);
    return null;
  }
}

// Export the full XForm data as JSON
function exportXFormAsJSON(xform) {
  if (!xform) return null;
  
  console.group(`JSON for XForm: ${xform.xformName}`);
  console.log(JSON.stringify(xform, null, 2));
  console.groupEnd();
  
  // Copy to clipboard
  try {
    const jsonString = JSON.stringify(xform, null, 2);
    navigator.clipboard.writeText(jsonString)
      .then(() => console.log('XForm JSON copied to clipboard!'))
      .catch(err => console.error('Failed to copy to clipboard:', err));
  } catch (e) {
    console.error('Error copying to clipboard:', e);
  }
  
  return xform;
}

// New: Preview current editor state
async function previewEditorState() {
  try {
    const data = {
      id: window.currentXFormId,
      xformName: window.currentXFormName,
      // Rectangles from editor
      startRect: window.startRect ? {
        left: parseInt(window.startRect.style.left, 10),
        top: parseInt(window.startRect.style.top, 10),
        width: window.startRect.offsetWidth,
        height: window.startRect.offsetHeight
      } : null,
      endRect: window.endRect ? {
        left: parseInt(window.endRect.style.left, 10),
        top: parseInt(window.endRect.style.top, 10),
        width: window.endRect.offsetWidth,
        height: window.endRect.offsetHeight
      } : null,
      rotations: {
        x: window.xRotationDirection,
        y: window.yRotationDirection,
        z: window.zRotationDirection
      },
      duration: window.durationInput ? Number(window.durationInput.value) : null,
      waypoints: window.intermediatePoints ? window.intermediatePoints.map(pt => ({ x: pt.x, y: pt.y })) : []
    };
    console.group('📋 XForm Editor Preview');
    console.log(data);
    console.groupEnd();
    return data;
  } catch (error) {
    console.error('Error in previewEditorState:', error);
    return null;
  }
}

// New: Preview selected XForms in the listing
async function previewSelectedXForms() {
  const selected = window.selectedXforms || [];
  if (selected.length === 0) {
    console.warn('No XForms selected for preview');
    return [];
  }
  console.group('📋 Preview of Selected XForms');
  const previews = [];
  for (const xform of selected) {
    const data = await inspectXFormById(xform.id);
    previews.push(data);
  }
  console.groupEnd();
  return previews;
}

// Make functions available in window scope
window.inspectAllXForms = inspectAllXForms;
window.inspectXFormById = inspectXFormById;
window.exportXFormAsJSON = exportXFormAsJSON;
window.previewEditorState = previewEditorState;
window.previewSelectedXForms = previewSelectedXForms;

console.log('✅ XForm Inspector loaded. Available commands:');
console.log('• inspectAllXForms() - View all XForms');
console.log('• inspectXFormById(id) - View a specific XForm by ID');
console.log('• exportXFormAsJSON(xform) - Export an XForm as JSON (also copies to clipboard)'); 
console.log('• previewEditorState() - Preview current editor state');
console.log('• previewSelectedXForms() - Preview selected XForms in the listing');