import { useColorScheme } from 'react-native';

/** Material 3 color roles. Light + dark schemes derived from a single blue seed. */
export interface M3Scheme {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  background: string;
  onBackground: string;
  outline: string;
  outlineVariant: string;
}

/** Glassmorphism surfaces layered on top of `scheme` tokens. */
export interface Glass {
  panel: string; // rgba surface for cards / panels
  panelBorder: string;
  panelHighlight: string;
  chip: string; // smaller elements: pills, badges
  chipBorder: string;
  strong: string; // higher-opacity panel for text-heavy areas
  strongBorder: string;
}

export const lightScheme: M3Scheme = {
  primary: '#2563eb',
  onPrimary: '#ffffff',
  primaryContainer: '#dce3ff',
  onPrimaryContainer: '#001455',
  secondary: '#5a6272',
  onSecondary: '#ffffff',
  secondaryContainer: '#dce2f9',
  onSecondaryContainer: '#161c2b',
  tertiary: '#007a64',
  onTertiary: '#ffffff',
  tertiaryContainer: '#9cf2dc',
  onTertiaryContainer: '#00201a',
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#410002',
  surface: '#faf9fd',
  onSurface: '#1a1b20',
  surfaceVariant: '#e2e2e8',
  onSurfaceVariant: '#44474f',
  background: '#faf9fd',
  onBackground: '#1a1b20',
  outline: '#74777f',
  outlineVariant: '#c4c6d0',
};

export const darkScheme: M3Scheme = {
  primary: '#a9c3ff',
  onPrimary: '#002e78',
  primaryContainer: '#0046a8',
  onPrimaryContainer: '#dce3ff',
  secondary: '#bfc6da',
  onSecondary: '#293040',
  secondaryContainer: '#3f4658',
  onSecondaryContainer: '#dce2f9',
  tertiary: '#74d6c1',
  onTertiary: '#00382d',
  tertiaryContainer: '#005143',
  onTertiaryContainer: '#9cf2dc',
  error: '#ffb4ab',
  onError: '#690005',
  errorContainer: '#93000a',
  onErrorContainer: '#ffdad6',
  surface: '#121318',
  onSurface: '#e2e2e9',
  surfaceVariant: '#44474f',
  onSurfaceVariant: '#c4c6d0',
  background: '#121318',
  onBackground: '#e2e2e9',
  outline: '#8e9099',
  outlineVariant: '#44474f',
};

export function glassFor(scheme: M3Scheme, isDark: boolean): Glass {
  if (isDark) {
    return {
      panel: 'rgba(30, 32, 40, 0.6)',
      panelBorder: 'rgba(255, 255, 255, 0.14)',
      panelHighlight: 'rgba(255, 255, 255, 0.06)',
      chip: 'rgba(255, 255, 255, 0.1)',
      chipBorder: 'rgba(255, 255, 255, 0.16)',
      strong: 'rgba(28, 30, 38, 0.86)',
      strongBorder: 'rgba(255, 255, 255, 0.18)',
    };
  }
  return {
    panel: 'rgba(255, 255, 255, 0.55)',
    panelBorder: 'rgba(255, 255, 255, 0.75)',
    panelHighlight: 'rgba(255, 255, 255, 0.9)',
    chip: 'rgba(255, 255, 255, 0.7)',
    chipBorder: 'rgba(255, 255, 255, 0.9)',
    strong: 'rgba(255, 255, 255, 0.9)',
    strongBorder: 'rgba(255, 255, 255, 0.95)',
  };
}

export function useTheme(): { scheme: M3Scheme; glass: Glass; isDark: boolean } {
  const isDark = useColorScheme() === 'dark';
  const scheme = isDark ? darkScheme : lightScheme;
  return { scheme, glass: glassFor(scheme, isDark), isDark };
}
