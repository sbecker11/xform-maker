# X-Form Maker – File-List Interaction Rules

Below are the canonical UI rules governing selection, colouring and button state for the **file-list** inside the left persistence column.
If you change JS/CSS around that list, re-run these test-cases to confirm behaviour.

---
## Class semantics (precedence)
| Class              | Colour  | Notes                               |
|--------------------|---------|-------------------------------------|
| `single-selected`  | Blue    | One item the user just clicked      |
| `single-loaded`    | Green   | The currently *loaded* X-Form       |
| `bulk-selected`    | Orange  | Item is part of a multi-selection   |

Precedence (same element):  **bulk-selected** ⟹ orange overrides everything; otherwise **single-loaded** (green) overrides blue.

---
## Use-cases

### A – Single click (no modifiers) on a neutral item
1. Remove *all* selection classes from every item.
2. Add `single-selected` (blue) to the clicked item.
3. `filenameInput` stays **blank**.
4. Sort button hidden/disabled.
5. MEM button **enabled** / ATM disabled.
6. Bulk-delete button hidden.
7. Save button disabled.

### B – Second single click on the same blue item
1. The file is loaded.
2. `filenameInput` set to that file's user name.
3. Add `single-loaded` (green) to the item (green overrides blue).
4. Save button enabled, bulk-delete hidden, sort disabled.

### C – Click on a green (loaded) item
• No change (already loaded).

### D – Alt/⌥-Click on another neutral item (non-contiguous selection)
1. Add `bulk-selected` (orange) to that item.
2. Promote any existing blue/green items to orange (`bulk-selected`).
3. When **>1** items are orange:
   * Clear `filenameInput`.
   * Activate MEM / deactivate ATM.
   * Disable Save.
   * Show Bulk-Delete.
   * Enable Sort.
4. If only one item remains active switch back to case A or B rules.

### E – Normal click on an orange item
1. Remove *all* classes from that item.
2. Re-evaluate counts and apply rules from D3 or A/B accordingly.

---
### Developer tips
* JS: State object `state.selectedSet`, `state.bulkSet`, `state.loadedFile` drives classes.
* CSS override rules ensure colour precedence regardless of class order.
* `toggleFilenameControls(enable)` centralises button/input enable/disable.

Happy hacking! 🎉 