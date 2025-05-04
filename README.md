# X-Form Maker – xform-List Interaction Rules

Below are the canonical UI rules governing selection, colouring and button state for the **xform-list** inside the left persistence column.
If you change JS/CSS around that list, re-run these test-cases to confirm behaviour.

---
## Class semantics (precedence)
| Class              | Colour  | Notes                               |
|--------------------|---------|-------------------------------------|
| `selected`  | Blue    | One item the user just clicked      |
| `single-loaded`    | Green   | The currently *loaded* X-Form       |
| `bulk-selected`    | Orange  | Item is part of a multi-selection   |

Precedence (same element):  **bulk-selected** ⟹ orange overrides everything; otherwise **single-loaded** (green) overrides blue.

---
## Use-cases

### A – Single click (no modifiers) on a neutral item
1. Select that xform
2, Style it as different from unselcted items.

### B – Second single click on a selected
item
1. Unselect that item.

### C – double-click on a selected or unselected item
• Unselect all other items
• Display this lime item as "loaded" which is visually stronger than the selected style.
• Load this xform into the xform maker input fields
- Set XformNamingMode to MEM mode to prevent it being overwritting during ATM mode.

### D – Shift-click to select a contiguous set of items
1. Toggle seleted status for all items in that set, except the currently loaded xform.

### E - Cmd-click to select non-continuous set of items
1. Same as for shift-clicked items
### E – Normal click on an orange item

---
### Developer tips
* JS: State object `state.selectedSet`, `state.bulkSet`, `state.loadedxform` drives classes.
* CSS override rules ensure colour precedence regardless of class order.
* `togglexformnameControls(enable)` centralises button/input enable/disable.

Happy hacking! 🎉 