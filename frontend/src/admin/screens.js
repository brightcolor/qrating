// The widths at which the admin area changes its frame. Tailwind reads them for its `lg:`
// classes (tailwind.config.js), the drawer for phones reads the same value in script.
export const screens = { lg: '1024px' };

export const wideScreenQuery = `(min-width: ${screens.lg})`;
