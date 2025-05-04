// ===== XForm Console Utilities =====
// These functions primarily deal with path/style settings and less critical utilities.
// Core DB/XForm inspection functions have been moved to script.js for reliability.

// 5. Set path visualization thickness
function set_path_thickness(thickness) {
  console.group('🎨 Path Visualization Settings');
  
  // Validate the input
  if (typeof thickness !== 'number' || isNaN(thickness)) {
    console.error('❌ Invalid thickness value. Please provide a number between 1 and 10.');
    console.groupEnd();
    return;
  }
  
  // Enforce limits
  const validThickness = Math.max(1, Math.min(10, Math.round(thickness)));
  if (validThickness !== thickness) {
    console.log(`⚠️ Thickness value adjusted from ${thickness} to ${validThickness} (valid range: 1-10)`);
  }
  
  // Update the global variable
  window.pathThickness = validThickness;
  console.log(`✅ Path thickness set to ${validThickness}px`);
  
  // Update the CSS custom property
  let style = document.getElementById('path-visualization-styles');
  if (style) {
    // Get existing style content
    let styleContent = style.textContent;
    
    // Replace the stroke-width value while preserving other styles
    styleContent = styleContent.replace(
      /stroke-width:\s*(\d+)px;/,
      `stroke-width: ${validThickness}px;`
    );
    
    // Update the style element
    style.textContent = styleContent;
    console.log('✅ Style updated in the DOM');
  } else {
    console.warn('⚠️ Path visualization styles not found in the DOM. Changes will apply after page reload.');
  }
  
  // If path visualization is currently visible, refresh it
  const currentPathStyle = window.currentPathStyleIndex !== undefined ? 
    window.pathStyleModes?.[window.currentPathStyleIndex]?.style : null;
  
  if (currentPathStyle && currentPathStyle !== 'none' && typeof window.applyPathStyle === 'function') {
    window.applyPathStyle(currentPathStyle);
    console.log('✅ Path visualization refreshed with new thickness');
  }
  
  console.log('💡 Path thickness will be used for all path visualizations');
  console.groupEnd();
  return validThickness;
}

// *** NEW: Style Control ***
window.set_path_style = function(styleName) {
    if (!window.pathStyleModes || !Array.isArray(window.pathStyleModes)) {
        console.error('❌ Path style modes not available (window.pathStyleModes is missing).');
        return;
    }
    const targetStyle = styleName.toLowerCase();
    const modeIndex = window.pathStyleModes.findIndex(mode => mode.style === targetStyle);

    if (modeIndex === -1) {
        console.error(`❌ Invalid path style: "${styleName}". Valid styles are: ${window.pathStyleModes.map(m => m.style).join(', ')}`);
        console.log(`Current style index is: ${window.currentPathStyleIndex !== undefined ? window.pathStyleModes[window.currentPathStyleIndex].style : 'unknown'}`);
        return;
    }

    const newMode = window.pathStyleModes[modeIndex];
    window.currentPathStyleIndex = modeIndex;
    console.log(`✅ Path style set to: ${newMode.style}`);

    // Update button text if button exists
    const pathStyleBtn = document.getElementById('pathStyleBtn');
    if (pathStyleBtn) {
        pathStyleBtn.textContent = newMode.label;
    }

    // Apply the style
    if (typeof window.applyPathStyle === 'function') {
        window.applyPathStyle(newMode.style);
        console.log('Path visualization updated with new style.');
    } else {
        console.warn('⚠️ window.applyPathStyle function not found. Cannot apply style.');
    }
};
window.style = window.set_path_style; // Alias

// *** NEW: Path Interpolation Mode Control ***
window.set_path_mode = function(mode) {
    const validModes = ['passthrough', 'gravity'];
    if (!mode || !validModes.includes(mode.toLowerCase())) {
        console.error(`Invalid path mode: "${mode}". Please use 'passthrough' or 'gravity'.`);
        console.log(`Current mode is: ${window.pathInterpolationMode || 'passthrough'}`);
        return;
    }
    const newMode = mode.toLowerCase();
    window.pathInterpolationMode = newMode;
    console.log(`✅ Path interpolation mode set to: ${newMode}`);
    // Trigger path redraw if possible
    if (typeof window.drawPathVisualization === 'function') {
        window.drawPathVisualization();
        console.log('Path visualization redrawn.');
    } else if (typeof window.applyPathStyle === 'function' && window.pathStyleModes && window.currentPathStyleIndex !== undefined) {
         // Fallback to calling applyPathStyle directly
        const currentStyle = window.pathStyleModes[window.currentPathStyleIndex].style;
        window.applyPathStyle(currentStyle);
        console.log('Path visualization redrawn via applyPathStyle.');
    } else {
        console.warn('Could not automatically redraw path visualization.');
    }
};
window.path_mode = window.set_path_mode; // Alias

// *** NEW: Shortcut Functions ***
window.linear = function() { 
    console.log('Setting path mode to: LINEAR (straight segments)');
    window.forceLinearPath = true; // Set flag for applyPathStyle
    // Redraw using the current *visual* style
    if (typeof window.drawPathVisualization === 'function') {
        window.drawPathVisualization();
    } else if (typeof window.applyPathStyle === 'function' && window.pathStyleModes && window.currentPathStyleIndex !== undefined) {
        const currentStyle = window.pathStyleModes[window.currentPathStyleIndex].style;
        window.applyPathStyle(currentStyle);
    }
}; // Note: This doesn't change the underlying interpolation mode setting

window.gravity = function() { window.set_path_mode('gravity'); }; // Alias for gravity
window.pass_thru = function() { window.set_path_mode('passthrough'); };
window.passthru = window.pass_thru; // Alias

window.thick_1 = function() { window.set_path_thickness(1); };
window.thick_10 = function() { window.set_path_thickness(10); };

window.box_10 = function() { 
    console.warn('⚠️ box_10() sets style to boxes. Marker size is fixed in CSS (not 10px).'); 
    window.set_path_style('boxes'); 
};
window.circle_7 = function() { 
    console.warn('⚠️ circle_7() sets style to circles. Marker size is fixed in CSS (not 7px).'); 
    window.set_path_style('circles'); 
};

// *** NEW: Style Shortcuts ***
window.none = function() { window.set_path_style('none'); };
window.dotted = function() { window.set_path_style('dotted'); };
window.dashed = function() { window.set_path_style('dashed'); };
window.solid = function() { window.set_path_style('solid'); };
window.circles = function() { window.set_path_style('circles'); };
window.boxes = function() { window.set_path_style('boxes'); };

// *** NEW: Command Parser Function ***
window.xf = function(commandString) {
    if (!commandString || typeof commandString !== 'string') {
        console.error('❌ Invalid input. Usage: xf("command argument")');
        return;
    }
    
    const parts = commandString.trim().toLowerCase().split(/\s+/);
    const command = parts[0];
    const argument = parts[1]; // Argument might be undefined
    
    console.log(`⚙️ Parsing command: "${command}", argument: "${argument}"`);

    switch (command) {
        case 'thick':
        case 'thickness':
            const thickness = parseInt(argument, 10);
            if (isNaN(thickness)) {
                console.error(`❌ Invalid thickness value: "${argument}". Please provide a number.`);
            } else {
                window.set_path_thickness(thickness); // Let the function handle clamping
            }
            break;
            
        case 'style':
            if (!argument) {
                console.error('❌ Missing style xformName. Usage: xf("style <styleName>")');
            } else {
                window.set_path_style(argument);
            }
            break;
            
        case 'curve':
        case 'mode':
            if (!argument) {
                console.error('❌ Missing curve mode. Usage: xf("curve <modeName>")');
            } else if (argument === 'linear') {
                window.linear(); // Use the linear shortcut
            } else if (argument === 'passthrough' || argument === 'pass_thru' || argument === 'passthru') {
                window.set_path_mode('passthrough');
            } else if (argument === 'gravity' || argument === 'gravity') {
                window.set_path_mode('gravity');
            } else {
                console.error(`❌ Invalid curve mode: "${argument}". Use 'linear', 'passthrough', or 'gravity'.`);
            }
            break;
            
        default:
            console.error(`❌ Unknown command: "${command}". Use help() to see commands.`);
            break;
    }
};

// Instructions
console.log('🛠️ XForm Console Utilities (Partial - Core functions moved to script.js) loaded!');

// *** Consolidated Help Function (adjust to reflect moved functions) ***
window.help = function(command) {
    console.log("--- help() function entered ---");
    console.clear();
    console.group('🛠️ XForm Maker - Console Utilities Help');
    
    // --- Basic Commands ---
    console.group('%cBasic Commands', 'color: #007bff; font-weight: bold');
    console.log("%chelp()", "font-weight:bold;");
    console.log("  Shows this help information.");
    console.log("%cxf(\"command arg\")", "font-weight:bold;");
    console.log("  Main parser for visualization commands (thick, style, curve). Use help('style') etc. for details.");
    console.groupEnd();

    // --- XForm/DB/Troubleshooting (Mention they are in global scope now) ---
    console.group('%cCore Inspection & Management (Defined globally in script.js)', 'color: #6c757d; font-weight: bold');
    console.log("  Use these commands directly in the console:");
    console.log("  - previewEditorState(), previewSelectedXForms()");
    console.log("  - getXFormValues(), inspectXFormElements(), verifyXFormUIConsistency()");
    console.log("  - listAllXForms(), listXFormsAsJsonl(), xform_details(id)");
    console.log("  - dumpDatabaseInfo(), db_diagnose(), diagnoseAndRepairDatabase()");
    console.log("  - completeReset(), db_reset(), delsel(), fixXFormList(), debugXFormLoading(id?)");
    console.groupEnd();

    // --- Visualization Commands (Still here) --- 
    console.group('%cVisualization Commands (Defined Here)', 'color: #E91E63; font-weight: bold');
    console.log("%cset_path_thickness(thickness)", "font-weight: bold");
    console.log("  Sets the path visualization thickness (1-10).");
    console.log("%cset_path_style(styleName)", "font-weight: bold");
    console.log("  Sets the path style (none, dotted, dashed, solid, circles, boxes).");
    console.log("%cset_path_mode(modeName)", "font-weight: bold");
    console.log("  Sets the path interpolation mode (passthrough, gravity, linear via linear()).");
    console.log("  Shortcuts: none(), dotted(), dashed(), solid(), circles(), boxes(), linear(), gravity(), pass_thru(), thick_1(), thick_10()");
    console.groupEnd();
    
    console.groupEnd(); // End main group
};
window.xform_help = window.help; // Alias

// IMPORTANT: Explicitly attach all functions to the window object
// Ensure this block is at the VERY END of the file after all functions are defined
window.set_path_thickness = set_path_thickness;
window.set_path_style = set_path_style;
window.set_path_mode = set_path_mode;
window.help = help; // Consolidated help
window.xf = xf;
window.showUsageModal = showUsageModal; // Keep this if defined here
window.linear = linear;
window.gravity = gravity;
window.pass_thru = pass_thru;
window.passthru = passthru;
window.thick_1 = thick_1;
window.thick_10 = thick_10;
window.box_10 = box_10;
window.circle_7 = circle_7;
window.none = none;
window.dotted = dotted;
window.dashed = dashed;
window.solid = solid;
window.circles = circles;
window.boxes = boxes;
window.path_mode = path_mode;
window.xform_help = help;

// REMOVED assignments for functions moved to script.js

console.log("✅ Console utilities (partial) initialized and attached to window."); 