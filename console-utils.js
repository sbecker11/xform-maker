// ===== XForm Console Utilities =====
// Copy these functions to your browser console for easy debugging

// 1. Reset the database (clear all XForms)
async function db_reset() {
  console.group('🗑️ Database Reset');
  try {
    // Get current count before deletion
    const xforms = await window.listXForms();
    const count = xforms.length;
    
    if (count === 0) {
      // No XForms to delete
      console.log('ℹ️ Database is already empty. Nothing to reset.');
      console.groupEnd();
      return;
    }
    
    // Suggest export first
    console.log('⚠️ RECOMMENDATION: Export your XForms before resetting the database!');
    console.log('You can export all XForms using the 📤 button in the UI or run:');
    console.log('await window.exportAllXFormsToFile()');
    
    // Prompt user to confirm they've exported or want to proceed anyway
    const exportConfirm = confirm(`🔄 BACKUP RECOMMENDED 🔄\n\n` +
                                 `You have ${count} XForms in your database.\n\n` +
                                 `Have you exported your XForms before proceeding?\n` +
                                 `(Click Cancel to go back and export first)`);
    
    if (!exportConfirm) {
      console.log('🛑 Reset canceled to allow export first.');
      console.groupEnd();
      return;
    }
    
    // After export confirmation, double-check with detailed warning
    const message = `⚠️ WARNING - DESTRUCTIVE ACTION ⚠️\n\n` +
                    `This will permanently delete ALL your XForms (${count} found).\n\n` +
                    `This action CANNOT be undone!\n\n` +
                    `Are you absolutely sure you want to continue?`;
    
    if (confirm(message)) {
      try {
        await window.resetDatabase();
        console.log('✅ Database has been reset. All XForms have been deleted.');
        
        // Refresh the UI list if possible
        if (typeof window.refreshListWithEmptyState === 'function') {
          window.refreshListWithEmptyState();
        }
      } catch (resetError) {
        if (resetError.toString().includes('blocked')) {
          console.error('❌ Database reset was blocked by other connections.');
          console.log('💡 TIP: Try one of these approaches:');
          console.log('  1. Refresh the page and try again');
          console.log('  2. Close all other browser tabs with this site open');
          console.log('  3. Restart your browser');
          
          if (confirm('Would you like to refresh the page now to try to clear all connections?')) {
            window.localStorage.setItem('pendingDbReset', 'true');
            window.location.reload();
          }
        } else {
          console.error('❌ Error resetting database:', resetError);
        }
      }
    } else {
      console.log('❌ Reset canceled by user.');
    }
  } catch (error) {
    console.error('❌ Error resetting database:', error);
  }
  console.groupEnd();
}

// 2. Run diagnostics on the database
async function db_diagnose() {
  console.group('🔍 Database Diagnostics');
  try {
    const db = await window.openDB();
    console.log(`✅ Connected to database: ${XFORM_DB_NAME} (version ${db.version})`);
    
    // Check object stores
    const storeNames = Array.from(db.objectStoreNames);
    console.log(`📦 Object stores (${storeNames.length}): ${storeNames.join(', ')}`);
    
    // Check XForms store
    if (storeNames.includes(XFORMS_STORE)) {
      const tx = db.transaction(XFORMS_STORE, 'readonly');
      const store = tx.objectStore(XFORMS_STORE);
      
      // Check indexes
      const indexNames = Array.from(store.indexNames);
      console.log(`📋 Indexes on ${XFORMS_STORE}: ${indexNames.join(', ')}`);
      
      // Count records
      const countRequest = store.count();
      const count = await new Promise(resolve => {
        countRequest.onsuccess = () => resolve(countRequest.result);
        countRequest.onerror = () => resolve('ERROR');
      });
      
      console.log(`🔢 Total XForms stored: ${count}`);
      
      // Check for duplicate IDs
      const getAllRequest = store.getAll();
      const allRecords = await new Promise(resolve => {
        getAllRequest.onsuccess = () => resolve(getAllRequest.result);
        getAllRequest.onerror = () => resolve([]);
      });
      
      const ids = allRecords.map(r => r.id);
      const uniqueIds = new Set(ids);
      if (ids.length !== uniqueIds.size) {
        console.warn(`⚠️ WARNING: Found ${ids.length - uniqueIds.size} duplicate IDs!`);
        
        const idCounts = {};
        ids.forEach(id => {
          idCounts[id] = (idCounts[id] || 0) + 1;
        });
        
        Object.entries(idCounts)
          .filter(([_, count]) => count > 1)
          .forEach(([id, count]) => {
            console.warn(`  - ID ${id} appears ${count} times`);
          });
      } else {
        console.log('✅ No duplicate IDs found');
      }
      
      console.log('✅ Database appears to be in good health');
    } else {
      console.error(`❌ Required store '${XFORMS_STORE}' not found!`);
    }
  } catch (error) {
    console.error('❌ Error diagnosing database:', error);
  }
  console.groupEnd();
}

// 3. List all XForms (concise version)
async function xforms_list() {
  console.group('📋 XForms List');
  try {
    const xforms = await window.listXForms();
    
    if (xforms.length === 0) {
      console.log('No XForms found in the database');
    } else {
      console.log(`Found ${xforms.length} XForms:`);
      
      // Create a compact table display
      console.table(xforms.map(x => ({
        id: x.id,
        name: x.name,
        modified: new Date(x.lastModified).toLocaleString(),
        waypoints: x.waypoints?.length || 0
      })));
      
      // Show a hint for detailed view
      console.log('\nTip: Use xform_details(id) to see details of a specific XForm');
    }
  } catch (error) {
    console.error('❌ Error listing XForms:', error);
  }
  console.groupEnd();
}

// 4. Show details for a specific XForm
async function xform_details(id) {
  if (!id) {
    console.error('❌ No ID provided. Usage: xform_details(id)');
    return;
  }
  
  console.group(`🔍 XForm Details (ID: ${id})`);
  try {
    const xform = await window.loadXFormById(id);
    
    if (!xform) {
      console.error(`❌ No XForm found with ID: ${id}`);
      console.groupEnd();
      return;
    }
    
    // Basic info
    console.log(`📝 Name: ${xform.name || 'Untitled'}`);
    console.log(`⏱️ Created: ${new Date(xform.timestamp || xform.id).toLocaleString()}`);
    console.log(`🔄 Modified: ${new Date(xform.lastModified).toLocaleString()}`);
    
    // Animation settings
    console.group('▶️ Animation Settings');
    console.log(`⏱️ Duration: ${xform.duration || 500}ms`);
    console.log(`🔄 Rotations:`);
    console.log(`  X-axis: ${xform.rotations?.x || 1}`);
    console.log(`  Y-axis: ${xform.rotations?.y || 1}`);
    console.log(`  Z-axis: ${xform.rotations?.z || 1}`);
    console.groupEnd();
    
    // Rectangle positions
    console.group('🎯 Rectangles');
    console.log('🟢 Start Rectangle:');
    console.log(`  Position: (${xform.startRect?.left || 0}, ${xform.startRect?.top || 0})`);
    console.log(`  Size: ${xform.startRect?.width || 100} × ${xform.startRect?.height || 60}px`);
    
    console.log('🔴 End Rectangle:');
    console.log(`  Position: (${xform.endRect?.left || 0}, ${xform.endRect?.top || 0})`);
    console.log(`  Size: ${xform.endRect?.width || 100} × ${xform.endRect?.height || 60}px`);
    console.groupEnd();
    
    // Waypoints
    const waypointCount = xform.waypoints?.length || 0;
    console.group(`📍 Waypoints (${waypointCount})`);
    
    if (waypointCount > 0) {
      xform.waypoints.forEach((wp, idx) => {
        console.log(`  Point #${idx+1}: (${wp.x}, ${wp.y})`);
      });
    } else {
      console.log('  No waypoints defined');
    }
    console.groupEnd();
    
    // Raw data access
    console.log('\n💾 To inspect raw data, copy this XForm to a variable:');
    console.log(`const myXForm = ${JSON.stringify(xform, null, 2)}`);
  } catch (error) {
    console.error('❌ Error loading XForm details:', error);
  }
  console.groupEnd();
}

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
                console.error('❌ Missing style name. Usage: xf("style <styleName>")');
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
console.log('🛠️ XForm Console Utilities loaded!');
console.log('Available commands:');
console.log('• db_reset()             - Reset the database (delete all XForms)');
console.log('• db_diagnose()          - Run diagnostics on the database');
console.log('• xforms_list()          - List all XForms');
console.log('• xform_details(id)      - Show details for a specific XForm');
console.log('• set_path_thickness(n)  - Set path visualization thickness (1-10)');
console.log('• help()                 - Show help for all available commands');

// Help function to list and explain all available commands
function help() {
  console.log("--- help() function entered ---");
  console.clear();
  console.group('🛠️ XForm Maker - Console Utilities Help');
  
  console.log(`
===================================================
  XForm Maker Console Utilities
===================================================

These utilities help you inspect and manage your XForms database
directly from the browser console.

Available Commands:
------------------`);

  // DB Commands
  console.group('%cDatabase Commands', 'color: #4CAF50; font-weight: bold');
  
  console.log('%cdb_diagnose()', 'font-weight: bold');
  console.log('  Runs diagnostics on the database to check its health.');
  console.log('  Shows object stores, indexes, record count, and checks for duplicate IDs.');
  console.log('  Example: db_diagnose()');
  console.log('');
  
  console.log('%cdb_reset()', 'font-weight: bold');
  console.log('  Resets the database by deleting all XForms.');
  console.log('  Includes confirmation prompts and suggests backing up first.');
  console.log('  Example: db_reset()');
  console.log('');
  
  console.groupEnd();
  
  // XForm Commands
  console.group('%cXForm Commands', 'color: #2196F3; font-weight: bold');
  
  console.log('%cxforms_list()', 'font-weight: bold');
  console.log('  Lists all XForms in the database in a table format.');
  console.log('  Shows ID, name, modification date, and waypoint count.');
  console.log('  Example: xforms_list()');
  console.log('');
  
  console.log('%cxform_details(id)', 'font-weight: bold');
  console.log('  Shows detailed information about a specific XForm.');
  console.log('  Displays properties like positions, dimensions, rotations, waypoints, etc.');
  console.log('  Example: xform_details(1745808947366)  // Replace with actual ID');
  console.log('');
  
  console.groupEnd();
  
  // Visualization Commands
  console.group('%cVisualization Commands', 'color: #E91E63; font-weight: bold');
  
  console.log('%cset_path_thickness(thickness)', 'font-weight: bold');
  console.log('  Sets the thickness of path visualization lines in pixels.');
  console.log('  Accepts values between 1 and 10 (integers).');
  console.log('  Example: set_path_thickness(5)  // Sets path thickness to 5px');
  console.log('');
  
  console.groupEnd();
  
  // Help
  console.group('%cHelp', 'color: #FF9800; font-weight: bold');
  
  console.log('%chelp()', 'font-weight: bold');
  console.log('  Shows this help information.');
  console.log('  Example: help()');
  console.log('');
  
  console.groupEnd();
  
  // Tips & Tricks
  console.group('%cTips & Tricks', 'color: #9C27B0; font-weight: bold');
  
  console.log('• Use xforms_list() first to see what XForms are available and their IDs');
  console.log('• Always export your XForms before using db_reset()');
  console.log('• You can export XForms from the console with: await window.exportAllXFormsToFile()');
  console.log('• For any errors, check the console output or run db_diagnose()');
  console.log('• Use set_path_thickness(8) before taking screenshots to make paths more visible');
  
  console.groupEnd();
  
  console.groupEnd();
  return "Use any of the commands above to interact with your XForms database";
}

// IMPORTANT: Explicitly attach these functions to the window object
// so they can be detected by the UI code
window.db_reset = db_reset;
window.db_diagnose = db_diagnose;
window.xforms_list = xforms_list;
window.xform_details = xform_details;
window.set_path_thickness = set_path_thickness;
window.set_path_style = set_path_style; // Expose new style setter
window.set_path_mode = set_path_mode; // Expose mode setter
window.help = help; // Add the help function too

// Add shortcut assignments to window
window.linear = linear;
window.gravity = gravity;
window.pass_thru = pass_thru;
window.passthru = passthru;
window.thick_1 = thick_1;
window.thick_10 = thick_10;
window.box_10 = box_10;
window.circle_7 = circle_7;

// *** NEW: Add style shortcut assignments to window ***
window.none = none;
window.dotted = dotted;
window.dashed = dashed;
window.solid = solid;
window.circles = circles;
window.boxes = boxes;

// If any UI elements with these functions already exist, remove them
document.addEventListener('DOMContentLoaded', () => {
  // When console utils are loaded, remove the UI buttons if they exist
  const resetBtn = document.getElementById('db-troubleshoot-btn');
  if (resetBtn) {
    console.log('Console utils loaded - removing DB reset button from UI');
    resetBtn.remove();
  }
  
  const diagBtn = document.getElementById('db-diagnostics-btn');
  if (diagBtn) {
    console.log('Console utils loaded - removing diagnostics button from UI');
    diagBtn.remove();
  }
});

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

// --- Help Function ---
window.help = function(command) {
    console.log("--- help() function entered ---");
    // console.clear(); // Keep clear commented out for now
    console.log('==== XForm Maker - Console Utilities Help ====');

    // Specific keyword help messages
    const keywordHelp = {
        'curve_style': "curve style: with values none, dotted, dashed, circles, and boxes",
        'style': "curve style: with values none, dotted, dashed, circles, and boxes",
        'curve_type': "curve type: with values linear, passthru, gravity",
        'type': "curve type: with values linear, passthru, gravity",
        'curve_thickness': "curve thickness: with values that range from 1 to 10",
        'thickness': "curve thickness: with values that range from 1 to 10"
    };

    // General command help
    const commands = {
        'db_reset': 'Delete all saved XForms and reset the database. Use with caution!',
        'db_diagnose': 'Check the database for issues and list contents.',
        'xforms_list': 'List all saved XForm names and IDs.',
        'xform_details(id)': 'Show detailed info for an XForm.',
        'xf("command arg")': 'Main parser for commands (e.g., xf("thick 5"), xf("style solid"), xf("curve linear"))',
        'help(keyword?)': 'Show general help or help for a specific keyword (style, type, thickness).'
    };

    if (command) {
        const lowerCommand = command.toLowerCase();
        if (keywordHelp[lowerCommand]) {
            // Show specific keyword help
            console.log(`Help for keyword: ${lowerCommand}`);
            console.log(`-> ${keywordHelp[lowerCommand]}`);
            console.log(`   Use with xf(): xf('${lowerCommand} <value>')`);
        } else if (commands[lowerCommand]) {
             // Show specific command help (less likely needed now)
             console.log(`Help for command: ${lowerCommand}`);
             console.log(`  ${commands[lowerCommand]}`);
        } else {
            console.log(`Unknown command or keyword: "${command}". Use help() to see general commands.`);
        }
    } else {
        // Show general help
        console.log("General Commands:");
        for (const cmd in commands) {
            console.log(`- ${cmd}: ${commands[cmd]}`);
        }
        console.log("\nFor details on curve commands, use: help('style'), help('type'), or help('thickness')");
        console.log("==============================================");
    }
    
    // Return undefined implicitly
}
window.xform_help = window.help; // Alias 

// *** NEW: Usage Modal Function ***
window.showUsageModal = async function() {
    let backdrop = document.getElementById('usageModalBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'usageModalBackdrop';
        // Combine classes for styling reuse
        backdrop.className = 'modal-backdrop usage-modal-backdrop'; 
        backdrop.innerHTML = `
            <div class="custom-confirm-modal usage-modal">
                <h3 class="usage-title">Usage Information</h3>
                <div class="usage-content"></div>
                <div class="custom-confirm-buttons usage-buttons">
                    <button id="usageCloseBtn" class="modal-btn secondary">Close</button>
                </div>
            </div>`;
        document.body.appendChild(backdrop);

        // Add listener for the close button *once*
        backdrop.querySelector('#usageCloseBtn').addEventListener('click', () => {
            backdrop.style.display = 'none';
            // Remove ESC listener when closed
            document.removeEventListener('keydown', backdrop._escHandler); 
        });
        // Add backdrop click dismiss listener *once*
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                backdrop.style.display = 'none';
                document.removeEventListener('keydown', backdrop._escHandler); 
            }
        });
    }

    // Populate content
    const contentDiv = backdrop.querySelector('.usage-content');
    // Load text from usage.txt
    let text = '';
    try {
        const resp = await fetch('usage.txt');
        if (resp.ok) {
            text = await resp.text();
        } else {
            console.warn('Failed to fetch usage.txt:', resp.status);
        }
    } catch (e) {
        console.warn('Could not load usage.txt, using built-in text');
    }
    contentDiv.innerText = text || 'Usage information not available.';
    // Ensure scroll position is reset
    contentDiv.scrollTop = 0;

    // Define ESC handler specific to this modal instance
    backdrop._escHandler = (ev) => {
        if (ev.key === 'Escape') {
            backdrop.style.display = 'none';
            document.removeEventListener('keydown', backdrop._escHandler); // Remove this specific listener
        }
    };
    // Remove potentially stale listener before adding
    document.removeEventListener('keydown', backdrop._escHandler);
    // Add listener when showing
    document.addEventListener('keydown', backdrop._escHandler);
   
    // Show modal
    backdrop.style.display = 'flex';
};

// Attach help button listener after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const helpBtn = document.getElementById('helpBtn');
    if (helpBtn) {
        helpBtn.addEventListener('click', window.showUsageModal);
    }
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
        });
    }
});

// IMPORTANT: Explicitly attach these functions to the window object
window.set_path_thickness = set_path_thickness;
window.set_path_style = set_path_style;
window.set_path_mode = set_path_mode;
window.help = help;
window.xf = xf;
window.showUsageModal = showUsageModal; // Expose Usage Modal function

// Shortcuts
window.linear = linear; 

// *** NEW: Shortcut to delete all selected XForms via console ***
window.delsel = async function() {
    const selected = window.selectedXforms || [];
    const count = selected.length;
    if (count === 0) {
        console.warn('No selected xforms to delete.');
        return;
    }
    const result = await showModalDialog({
        message: `Delete ${count} selected XForm${count > 1 ? 's' : ''}? This cannot be undone.`,
        buttons: [
            { id: 'delete', label: 'Delete Selected', class: 'danger' },
            { id: 'cancel', label: 'Cancel', class: 'secondary' }
        ]
    });
    if (result !== 'delete') {
        console.log('Deletion canceled.');
        return;
    }
    try {
        const deleted = await deleteSelectedXForms();
        console.log(`Deleted ${deleted} XForm${deleted > 1 ? 's' : ''}.`);
    } catch (err) {
        console.error('Error deleting selected XForms:', err);
    }
}; 