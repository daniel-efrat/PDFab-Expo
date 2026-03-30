export const theme = {
  colors: {
    bg: '#1d2434',
    bgAlt: '#20283a',
    surface: '#273047',
    surfaceAlt: '#2c3650',
    surfaceSoft: '#313b56',
    surfaceMuted: '#232c41',
    border: '#3b4560',
    borderStrong: '#46506d',
    text: '#f3f4f7',
    textMuted: '#a5aec2',
    textSoft: '#7c869f',
    accent: '#d96a2b',
    accentStrong: '#f47b20',
    accentSoft: 'rgba(217,106,43,0.18)',
    accentBorder: 'rgba(244,123,32,0.42)',
    info: '#7fa5ff',
    infoSoft: 'rgba(127,165,255,0.18)',
    success: '#78c58d',
    successSoft: 'rgba(120,197,141,0.18)',
    warning: '#f2b25d',
    warningSoft: 'rgba(242,178,93,0.18)',
    danger: '#e1786c',
    dangerSoft: 'rgba(225,120,108,0.18)',
    overlay: 'rgba(9,12,20,0.72)',
    white: '#ffffff',
    black: '#000000',
    page: '#f6f2eb',
  },
  radius: {
    sm: 12,
    md: 18,
    lg: 24,
    pill: 999,
  },
  neu: {
    colors: {
      lightShadow: 'rgba(255, 255, 255, 0.05)',
      darkShadow: 'rgba(0, 0, 0, 0.5)',
    },
    shadowStyles: {
      lightLayer: {
        shadowColor: 'rgba(255, 255, 255, 1)',
        shadowOffset: { width: -4, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2, // Android light shadow equivalent (hard to do exactly right on Android without custom SVG)
      },
      darkLayer: {
        shadowColor: 'rgba(0, 0, 0, 1)',
        shadowOffset: { width: 4, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 8,
      },
      lightLayerInset: {
        // Inset shadows are tricky in RN, usually simulated or using external packages. 
        // We will approximate on web with CSS string, and rely on border tricks on native if needed.
        boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.5), inset -4px -4px 8px rgba(255, 255, 255, 0.05)',
      }
    }
  }
};

export type AppTheme = typeof theme;
