// Theme colors are CSS variables; color-mix lets opacity modifiers such as bg-accent/10 apply to them.
const themeColor = (variable) => `color-mix(in srgb, var(${variable}) calc(<alpha-value> * 100%), transparent)`

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{ts,tsx}',
    './node_modules/streamdown/dist/**/*.js'
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: themeColor('--ds-accent'),
          foreground: '#ffffff',
          soft: themeColor('--ds-accent-soft')
        },
        background: themeColor('--ds-bg-canvas'),
        foreground: themeColor('--ds-text'),
        border: themeColor('--ds-border'),
        muted: {
          DEFAULT: themeColor('--ds-surface-subtle'),
          foreground: themeColor('--ds-text-muted')
        },
        sidebar: themeColor('--ds-surface-subtle'),
        primary: {
          DEFAULT: themeColor('--ds-accent'),
          foreground: '#ffffff'
        },
        ds: {
          main: themeColor('--ds-bg-main'),
          sidebar: themeColor('--ds-bg-sidebar'),
          canvas: themeColor('--ds-bg-canvas'),
          card: themeColor('--ds-surface-card'),
          'card-muted': themeColor('--ds-card-muted'),
          elevated: themeColor('--ds-surface-elevated'),
          subtle: themeColor('--ds-surface-subtle'),
          hover: themeColor('--ds-surface-hover'),
          border: themeColor('--ds-border'),
          'border-muted': themeColor('--ds-border-muted'),
          ink: themeColor('--ds-text'),
          text: themeColor('--ds-text'),
          muted: themeColor('--ds-text-muted'),
          faint: themeColor('--ds-text-faint'),
          success: themeColor('--ds-success'),
          'success-soft': themeColor('--ds-success-soft'),
          danger: themeColor('--ds-danger'),
          'danger-soft': themeColor('--ds-danger-soft'),
          'diff-added': themeColor('--ds-diff-added'),
          'diff-added-soft': themeColor('--ds-diff-added-soft'),
          'diff-removed': themeColor('--ds-diff-removed'),
          'diff-removed-soft': themeColor('--ds-diff-removed-soft'),
          skill: themeColor('--ds-skill'),
          'skill-soft': themeColor('--ds-skill-soft'),
          userbubble: themeColor('--ds-bubble-user'),
          userbubbleFg: themeColor('--ds-bubble-user-fg')
        }
      },
      boxShadow: {
        composer: 'var(--ds-shadow-composer)',
        shell: 'var(--ds-shadow-shell)',
        panel: 'var(--ds-shadow-panel)'
      },
      fontSize: {
        'ui-caption': '11.5px',
        'ui-meta': '12px',
        'ui-body-sm': '12.5px',
        'ui-body': '13.5px',
        'ui-title': '24px'
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
        '3xl': '22px'
      }
    }
  },
  plugins: []
}
