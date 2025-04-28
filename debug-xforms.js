// ===== XForm Debug Function =====
// Copy this entire function and paste it into your browser console

async function debugXForms(id = null) {
  try {
    console.clear();
    console.group('🛠️ XForm Debugger');
    
    if (id) {
      // Debug a specific XForm
      const xform = await window.loadXFormById(id);
      if (!xform) {
        console.error(`❌ No XForm found with ID: ${id}`);
        console.groupEnd();
        return;
      }
      
      console.log(`📋 Examining XForm: "${xform.name}" (ID: ${xform.id})`);
      console.log(`⏱️ Created: ${new Date(xform.timestamp || xform.id).toLocaleString()}`);
      console.log(`🔄 Last Modified: ${new Date(xform.lastModified).toLocaleString()}`);
      
      // Key animation properties
      console.group('🎮 Animation Properties');
      console.log(`⏱️ Duration: ${xform.duration || 500}ms`);
      console.log(`🔄 Rotations: X=${xform.rotations?.x || 1}, Y=${xform.rotations?.y || 1}, Z=${xform.rotations?.z || 1}`);
      console.log(`🔢 Waypoints: ${xform.waypoints?.length || 0}`);
      console.groupEnd();
      
      // Rectangle positions and dimensions
      console.group('📏 Rectangles');
      console.log(`🟢 Start: (${xform.startRect?.left || 0}, ${xform.startRect?.top || 0}) | ${xform.startRect?.width || 100}×${xform.startRect?.height || 60}px`);
      console.log(`🔴 End: (${xform.endRect?.left || 0}, ${xform.endRect?.top || 0}) | ${xform.endRect?.width || 100}×${xform.endRect?.height || 60}px`);
      console.groupEnd();
      
      // Waypoints
      if (xform.waypoints && xform.waypoints.length > 0) {
        console.group(`📍 Waypoint Coordinates (${xform.waypoints.length})`);
        xform.waypoints.forEach((wp, idx) => {
          console.log(`#${idx+1}: (${wp.x}, ${wp.y})`);
        });
        console.groupEnd();
      }
      
      // Export option
      console.log('\n📋 To copy this XForm as JSON to clipboard, run:');
      console.log(`copy('${JSON.stringify(xform).replace(/'/g, "\\'")}')`);
    } else {
      // List all XForms
      const xforms = await window.listXForms();
      console.log(`📋 Found ${xforms.length} XForms in database`);
      
      // Create a summary table
      console.table(xforms.map(xform => ({
        id: xform.id,
        name: xform.name,
        modified: new Date(xform.lastModified).toLocaleString(),
        waypoints: xform.waypoints?.length || 0,
        duration: xform.duration || 'N/A',
        rotations: `X:${xform.rotations?.x || 1} Y:${xform.rotations?.y || 1} Z:${xform.rotations?.z || 1}`,
        dimensions: `${xform.startRect?.width || 'N/A'}×${xform.startRect?.height || 'N/A'}`
      })));
      
      // Show how to inspect a specific XForm
      if (xforms.length > 0) {
        console.log(`\n🔍 To inspect a specific XForm, run debugXForms() with its ID. Example:`);
        console.log(`debugXForms(${xforms[0].id})`);
      }
    }
    
    console.groupEnd();
  } catch (error) {
    console.error('❌ Error debugging XForms:', error);
  }
}

// Show usage instructions
console.log('🛠️ XForm Debugger loaded! Use:');
console.log('• debugXForms()         - Show all XForms');
console.log('• debugXForms(id)       - Inspect a specific XForm by ID');
console.log('Example: debugXForms(1234567890);'); 