import { createGlobalStyle } from 'styled-components';
import { tokensToCssVariables } from './tokens';

export const GlobalStyle = createGlobalStyle`
  :root {
    ${tokensToCssVariables()}
    color-scheme: dark;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  html, body, #root {
    height: 100%;
    margin: 0;
    padding: 0;
  }

  body {
    background: var(--color-background);
    color: var(--color-text-primary);
    font-family: var(--font-sans);
    font-size: var(--font-size-md);
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    overflow: hidden;
    font-feature-settings: "cv11", "ss01", "tnum";
  }

  /* Landing scrolls; editor stays viewport-locked. */
  body[data-scroll='auto'] {
    overflow: auto;
    height: auto;
  }
  html:has(body[data-scroll='auto']) {
    scroll-behavior: smooth;
  }
  html:has(body[data-scroll='auto']),
  body[data-scroll='auto'] #root {
    height: auto;
    min-height: 100%;
  }
  body[data-scroll='locked'] {
    overflow: hidden;
  }

  button, input, select, textarea {
    font: inherit;
    color: inherit;
  }

  button {
    cursor: pointer;
    border: 0;
    background: none;
    padding: 0;
  }

  a {
    color: var(--color-accent);
    text-decoration: none;
  }

  ::selection {
    background: var(--color-accent-muted);
    color: var(--color-text-primary);
  }

  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ::-webkit-scrollbar-thumb {
    background: var(--color-surface-active);
    border-radius: 4px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: var(--color-text-muted);
    background-clip: padding-box;
    border: 2px solid transparent;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }

  :focus-visible {
    outline: 1px solid var(--color-accent);
    outline-offset: 1px;
  }

  .maplibregl-ctrl-attrib {
    background: var(--color-overlay) !important;
    color: var(--color-text-muted) !important;
    font-size: 10px !important;
    font-family: var(--font-sans);
    padding: 1px 6px !important;
    border-radius: var(--radius-sm) 0 0 0 !important;
  }
  .maplibregl-ctrl-attrib a {
    color: var(--color-text-secondary) !important;
  }
  .maplibregl-canvas {
    outline: none;
  }

  @keyframes me-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes me-slide-up {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes me-slide-down {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes me-scale-in {
    from { opacity: 0; transform: scale(0.97); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes me-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }
  @keyframes me-shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes me-stripes {
    from { background-position: 0 0; }
    to { background-position: 24px 0; }
  }
  @keyframes me-spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
`;
