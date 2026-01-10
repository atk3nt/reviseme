/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  plugins: [
    require("daisyui"),
  ],
  daisyui: {
    themes: [
      {
        light: {
          // Brand Primary Colors
          "primary": "#0066FF",        // Primary Blue - CTA buttons, links, primary interactive elements
          "primary-focus": "#0052CC",  // Hover Blue - hover states on buttons and links
          "primary-content": "#ffffff",
          
          // Map semantic colors to brand guidelines
          "base-content": "#001433",   // Text Dark - H1, H2, important headlines (becomes default text)
          "base-200": "#E5F0FF",      // Background Light - section backgrounds and card backgrounds
          "base-300": "#E5F0FF",      // Background Light (lighter variant)
          
          // Keep base-100 as white (DaisyUI default)
          // All other colors (secondary, accent, neutral, success, error, warning, info) use DaisyUI defaults
        },
      },
    ],
  },
};

