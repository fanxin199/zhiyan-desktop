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
          warning: themeColor('--ds-warning'),
          'warning-soft': themeColor('--ds-warning-soft'),
          'domain-teaching': themeColor('--ds-domain-teaching'),
          'domain-teaching-soft': themeColor('--ds-domain-teaching-soft'),
          'domain-research': themeColor('--ds-domain-research'),
          'domain-research-soft': themeColor('--ds-domain-research-soft'),
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
      // Solid accent fills carry white text, so they use a fill shade that stays dark enough in dark mode.
      backgroundColor: {
        accent: {
          DEFAULT: themeColor('--ds-accent-fill')
        }
      },
      boxShadow: {
        composer: 'var(--ds-shadow-composer)',
        shell: 'var(--ds-shadow-shell)',
        panel: 'var(--ds-shadow-panel)'
      },
      fontSize: {
        caption: 'var(--ds-font-caption)',
        small: 'var(--ds-font-small)',
        body: 'var(--ds-font-body)',
        heading: 'var(--ds-font-heading)',
        title: 'var(--ds-font-title)',
        display: 'var(--ds-font-display)',
        'ui-caption': '11.5px',
        'ui-meta': '12px',
        'ui-body-sm': '12.5px',
        'ui-body': '13.5px',
        'ui-title': '24px'
      },
      lineHeight: {
        prose: 'var(--ds-leading-prose)'
      },
      borderRadius: {
        xl: '12px'
      }
    }
  },
  plugins: []
}
