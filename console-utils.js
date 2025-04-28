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
window.help = help; // Add the help function too

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