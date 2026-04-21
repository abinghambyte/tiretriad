# Design System Document: Tactical Industrialism

## 1. Overview & Creative North Star: "The Precision Cockpit"
This design system is built to transform a standard utility portal into a high-end instrument panel. Our North Star is **The Precision Cockpit**: an aesthetic that balances the rugged durability of industrial service machinery with the refined digital clarity of a premium aerospace interface.

To move beyond "generic dark mode," we reject the traditional grid-and-border approach. Instead, we embrace **Tonal Depth** and **Intentional Asymmetry**. Elements should feel docked or machined into the interface, using overlapping layers and neon-etched accents to guide the eye. This isn't just a dashboard; it’s a command center for high-stakes logistics.

---

## 2. Colors & Surface Architecture
The palette is rooted in the "Zinc" spectrum to provide a neutral, sophisticated foundation, allowing functional accents to communicate status without visual noise.

### Core Palette
- **Background (`#131315` / `zinc-950`):** The absolute floor. Used for the furthest layer back.
- **Surface (`#201f22` / `zinc-900`):** The primary canvas for content.
- **On-Surface (`#e5e1e4` / `zinc-50`):** High-contrast primary text.
- **Muted (`#869580` / `zinc-400`):** For secondary labels and metadata.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders to define sections. Layout boundaries must be achieved through background color shifts. 
- A card should sit on the `surface` by being `surface-container-high`.
- A sidebar should be defined by its `surface-container-low` fill against the `background`.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of machined plates:
1.  **Level 0 (Base):** `surface-dim` (`#131315`)
2.  **Level 1 (Sub-Sections):** `surface-container-low` (`#1c1b1d`)
3.  **Level 2 (Main Cards):** `surface-container` (`#201f22`)
4.  **Level 3 (Interactive/Floating):** `surface-container-highest` (`#353437`)

### Signature Neon & Accents
- **Neon-Lime (`#32CD32`):** Our "Active Signal." Use this exclusively for active states, small UI pips, or critical outlines.
- **Functional Accents:** Use the specific tokens for categorical data (e.g., `Teal` for tires, `Emerald` for success) but apply them as subtle glows or typography-only indicators to maintain the dark-mode aesthetic.

---

## 3. Typography
We use **Inter** for its neutral, technical clarity. However, to achieve the "Instrument Panel" feel, we rely on weight and numeral formatting.

- **The Figure Rule:** All numerical data (prices, quantities, coordinates) must use `font-variant-numeric: tabular-nums`. This ensures vertical alignment in tables, mimicking mechanical readouts.
- **Display-LG (3.5rem):** Reserved for hero metrics. Bold, tight tracking (-0.02em).
- **Headline-SM (1.5rem):** Section headers. Use `text-zinc-50` with semi-bold weight.
- **Label-MD (0.75rem):** Metadata and small caps. Use `text-zinc-400` for an etched look.

---

## 4. Elevation & Depth
Depth is created through light, not lines.

### Tonal Layering
Instead of traditional drop shadows, use **Surface Stacking**. A `surface-container-lowest` card placed inside a `surface-container-high` container creates a "recessed" look, suggesting the element is carved into the dashboard.

### Glassmorphism & Ambient Shadows
For floating elements (Modals, Hover Tooltips):
- **Glass:** Use `surface` at 70% opacity with a `24px blur`.
- **Shadows:** Use a `0 20px 40px rgba(0,0,0,0.4)` shadow. The color should be a tinted version of the background, never pure black.

### The "Ghost Border" Fallback
If a boundary is required for accessibility, use a **Ghost Border**: `outline-variant` (`#3d4a39`) at **15% opacity**. This provides a whisper of a line that disappears into the dark theme.

---

## 5. Components

### Navigation: The Floating Command Bar
- **Position:** Far left, floating `16px` from the edge.
- **Style:** `surface-container-low` with a `24px` backdrop blur. 
- **Active State:** The top icon glows in `Neon-Lime` (`#32CD32`) with a subtle `4px` outer glow (bloom).

### Buttons & Interaction
- **Primary:** `surface-tint` (`#4ce346`) background with `on-primary` (`#003a03`) text. 
- **Secondary (The Industrial Look):** A Ghost Border button with `Neon-Lime` text.
- **States:** Hovering should increase the "bloom" (glow) of the element rather than just changing the hex color.

### Cards & Metrics
- **Cards:** `rounded-xl` (12px). No borders. Use `surface-container-highest` for the header and `surface-container` for the body to create a natural split.
- **Heroes:** `rounded-2xl` (16px). Use a subtle linear gradient (`surface-bright` to `surface`) to give a curved, metallic feel.

### Input Fields
- **Base:** `surface-container-lowest`. 
- **Focus:** Instead of a thick border, use a 1px `Neon-Lime` "Ghost Border" and a tiny neon pip in the top right corner of the field to indicate focus.

---

## 6. Do’s and Don’ts

### Do:
- **Use Vertical White Space:** Separate list items with `16px` of space instead of divider lines.
- **Embrace Asymmetry:** Let hero elements span 70% of the width, with metadata tucked into a 30% side column.
- **Use Tabular Nums:** Always. Data should look like it was printed by a thermal printer.

### Don’t:
- **No 100% Opaque Borders:** This kills the "industrial" sophistication.
- **Don’t Overuse Neon:** If everything glows, nothing is important. Use `Neon-Lime` for less than 3% of the total screen real estate.
- **No Pure White:** Always use `text-zinc-50`. Pure white (`#FFFFFF`) is too harsh for the dark-mode instrument panel vibe.