module.exports = {
  darkMode: "class",
  content: ["./static/index.html", "./static/app.js"],
  theme: {
    extend: {
      colors: Object.fromEntries(
        ["surface", "surface-dim", "surface-bright", "surface-container-lowest", "surface-container-low", "surface-container", "surface-container-high", "surface-container-highest", "on-surface", "on-surface-variant", "outline", "outline-variant", "surface-tint", "primary", "on-primary", "primary-container", "on-primary-container", "primary-fixed", "primary-fixed-dim", "secondary", "on-secondary", "secondary-container", "on-secondary-container", "secondary-fixed", "tertiary", "on-tertiary", "tertiary-container", "on-tertiary-container", "tertiary-fixed", "error", "on-error"].map((n) => [n, `rgb(var(--c-${n}) / <alpha-value>)`])
      ),
      borderRadius: { "DEFAULT": "1rem", "lg": "2rem", "xl": "3rem", "full": "9999px" },
      spacing: {
        "space-xs": "0.25rem", "space-sm": "0.5rem", "space-md": "1rem", "space-lg": "1.5rem", "space-xl": "2.5rem",
        "gutter-sm": "1rem", "gutter": "1.5rem", "gutter-lg": "2rem",
        "margin-mobile": "1rem", "margin": "2rem", "margin-tv": "3.5rem"
      },
      fontSize: {
        "display-hero": ["56px", { lineHeight: "64px", letterSpacing: "-0.02em", fontWeight: "800" }],
        "display-hero-mobile": ["36px", { lineHeight: "44px", letterSpacing: "-0.01em", fontWeight: "800" }],
        "headline-lg": ["32px", { lineHeight: "40px", letterSpacing: "-0.015em", fontWeight: "700" }],
        "headline-lg-mobile": ["26px", { lineHeight: "34px", letterSpacing: "-0.01em", fontWeight: "700" }],
        "headline-md": ["22px", { lineHeight: "30px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "headline-sm": ["18px", { lineHeight: "24px", letterSpacing: "0em", fontWeight: "600" }],
        "body-lg": ["16px", { lineHeight: "24px", letterSpacing: "0em", fontWeight: "400" }],
        "body-md": ["14px", { lineHeight: "20px", letterSpacing: "0.01em", fontWeight: "400" }],
        "body-sm": ["12px", { lineHeight: "16px", letterSpacing: "0.02em", fontWeight: "500" }],
        "label-lg": ["13px", { lineHeight: "18px", letterSpacing: "0.05em", fontWeight: "600" }],
        "label-md": ["11px", { lineHeight: "16px", letterSpacing: "0.08em", fontWeight: "500" }],
        "label-caps": ["10px", { lineHeight: "14px", letterSpacing: "0.12em", fontWeight: "700" }]
      },
      fontFamily: {
        "display-hero": ["Sora", "sans-serif"], "headline-lg": ["Sora", "sans-serif"],
        "headline-md": ["Sora", "sans-serif"], "headline-sm": ["Sora", "sans-serif"],
        "body-lg": ["Manrope", "sans-serif"], "body-md": ["Manrope", "sans-serif"],
        "body-sm": ["Manrope", "sans-serif"], "label-lg": ["JetBrains Mono", "monospace"],
        "label-md": ["JetBrains Mono", "monospace"]
      }
    }
  }
};
