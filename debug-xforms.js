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
      
      console.log(`📋 Examining XForm: "${xform.xformName}" (ID: ${xform.id})`);
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
        xformName: xform.xformName,
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

// Debug helpers for XForm operations

// Global storage for the last saved XForm
window.lastSavedXForm = null;

// Hook into save operation
const originalSaveCurrentXForm = window.saveCurrentXForm;
window.saveCurrentXForm = async function() {
    // Get XForm data before saving
    const xformData = createXFormDataObject();
    
    // Store a deep copy of the XForm being saved
    window.lastSavedXForm = JSON.parse(JSON.stringify(xformData));
    
    // Log the XForm being saved
    console.group("🔍 SAVING XFORM TO DATABASE");
    console.log("XForm ID:", xformData.id);
    console.log("XForm Name:", xformData.xformName);
    console.log("Rectangles:", {
        start: xformData.startRect,
        end: xformData.endRect
    });
    console.log("Waypoints:", xformData.waypoints.length);
    console.log("Rotations:", xformData.rotations);
    console.log("Duration:", xformData.duration + "ms");
    console.log("Last Modified:", new Date(xformData.lastModified).toLocaleString());
    console.log("Full XForm Data:", xformData);
    console.groupEnd();
    
    // Call the original save function
    return originalSaveCurrentXForm.apply(this, arguments);
};

// Compare two XForms and show differences
window.compareXForms = async function(xformId1, xformId2) {
    // If second ID not provided, use the last saved
    if (!xformId2 && window.lastSavedXForm) {
        xformId2 = window.lastSavedXForm.id;
    }
    
    // Load both XForms
    const xform1 = await loadXFormById(xformId1);
    const xform2 = xformId2 === window.lastSavedXForm?.id ? 
        window.lastSavedXForm : 
        await loadXFormById(xformId2);
    
    if (!xform1 || !xform2) {
        console.error("❌ Could not load one or both XForms for comparison");
        return;
    }
    
    // Compare and show differences
    console.group(`🔍 COMPARING XFORMs: "${xform1.xformName}" vs "${xform2.xformName}"`);
    
    // Basic properties
    compareProperty("ID", xform1.id, xform2.id);
    compareProperty("Name", xform1.xformName, xform2.xformName);
    compareProperty("Duration", xform1.duration, xform2.duration);
    
    // Rectangles
    console.group("Rectangles");
    if (xform1.startRect && xform2.startRect) {
        console.group("Start Rectangle");
        compareProperty("Left", xform1.startRect.left, xform2.startRect.left);
        compareProperty("Top", xform1.startRect.top, xform2.startRect.top);
        compareProperty("Width", xform1.startRect.width, xform2.startRect.width);
        compareProperty("Height", xform1.startRect.height, xform2.startRect.height);
        console.groupEnd();
    }
    
    if (xform1.endRect && xform2.endRect) {
        console.group("End Rectangle");
        compareProperty("Left", xform1.endRect.left, xform2.endRect.left);
        compareProperty("Top", xform1.endRect.top, xform2.endRect.top);
        compareProperty("Width", xform1.endRect.width, xform2.endRect.width);
        compareProperty("Height", xform1.endRect.height, xform2.endRect.height);
        console.groupEnd();
    }
    console.groupEnd();
    
    // Rotations
    if (xform1.rotations && xform2.rotations) {
        console.group("Rotations");
        compareProperty("X", xform1.rotations.x, xform2.rotations.x);
        compareProperty("Y", xform1.rotations.y, xform2.rotations.y);
        compareProperty("Z", xform1.rotations.z, xform2.rotations.z);
        console.groupEnd();
    }
    
    // Waypoints
    const waypoints1 = xform1.waypoints || [];
    const waypoints2 = xform2.waypoints || [];
    
    console.group("Waypoints");
    compareProperty("Count", waypoints1.length, waypoints2.length);
    
    if (waypoints1.length > 0 && waypoints2.length > 0) {
        // Check a few waypoints if available
        const sampleCount = Math.min(3, waypoints1.length, waypoints2.length);
        for (let i = 0; i < sampleCount; i++) {
            console.group(`Waypoint ${i}`);
            if (waypoints1[i] && waypoints2[i]) {
                compareProperty("X", waypoints1[i].x, waypoints2[i].x);
                compareProperty("Y", waypoints1[i].y, waypoints2[i].y);
            }
            console.groupEnd();
        }
    }
    console.groupEnd();
    
    console.groupEnd();
};

// Helper function to compare and format property differences
function compareProperty(xformName, value1, value2) {
    const isDifferent = JSON.stringify(value1) !== JSON.stringify(value2);
    
    if (isDifferent) {
        console.log(
            `%c${xformName}: %c${JSON.stringify(value1)} %c→ %c${JSON.stringify(value2)}`,
            "font-weight: bold;", 
            "color: #ff6b6b;", 
            "color: gray;", 
            "color: #4caf50; font-weight: bold;"
        );
    } else {
        console.log(`${xformName}: ${JSON.stringify(value1)} (unchanged)`);
    }
}

// List all XForms in DB with IDs for easy comparison
window.listAllXForms = async function() {
    const xforms = await listXForms();
    
    console.group("📋 ALL XFORMS IN DATABASE");
    console.table(xforms.map(x => ({
        ID: x.id,
        Name: x.xformName,
        Waypoints: x.waypoints?.length || 0,
        LastModified: new Date(x.lastModified).toLocaleString()
    })));
    console.groupEnd();
    
    return xforms;
};

// Compare the last saved XForm with any XForm from the DB
window.compareWithLastSaved = async function(xformId) {
    if (!window.lastSavedXForm) {
        console.error("No last saved XForm available. Save an XForm first.");
        return;
    }
    
    await window.compareXForms(xformId, window.lastSavedXForm.id);
};

console.log("✅ XForm debugging tools loaded. Use these in the console:");
console.log("- window.listAllXForms() - List all XForms with IDs");
console.log("- window.compareXForms(id1, id2) - Compare two XForms");
console.log("- window.compareWithLastSaved(id) - Compare an XForm with the last saved one"); 