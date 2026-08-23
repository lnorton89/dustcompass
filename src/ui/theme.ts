import { createTheme, type Theme } from '@mui/material/styles'
import type { ThemeMode } from '../map/style'

/**
 * Dark is the default and the point: this gets read at 3am on a dark playa,
 * where a white screen destroys night vision for everyone nearby.
 */
export function playaTheme(mode: ThemeMode): Theme {
  const night = mode === 'night'
  return createTheme({
    cssVariables: true,
    palette: {
      mode: mode === 'light' ? 'light' : 'dark',
      primary: { main: night ? '#ff6b6b' : mode === 'dark' ? '#ff8a4c' : '#c2410c' },
      secondary: { main: night ? '#c94040' : mode === 'dark' ? '#5ec8d8' : '#0e7490' },
      // Night mode keeps the whole interface on one low-luminance red, not just
      // the map — a bright white dialog would undo the point of it. Spread
      // rather than set to undefined: createTheme with CSS variables reads
      // these keys and an explicit undefined is not the same as absent.
      ...(night
        ? {
            text: { primary: '#ff8f8f', secondary: '#c96b6b' },
            divider: 'rgba(255,107,107,0.18)',
          }
        : {}),
      background: night
        ? { default: '#0a0000', paper: '#170404' }
        : mode === 'dark'
          ? { default: '#12100e', paper: '#1c1917' }
          : { default: '#e8e0cf', paper: '#faf6ec' },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
      h6: { fontWeight: 650, letterSpacing: '-0.01em' },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      // MUI's default filled chip is neutral grey, which in night mode is both
      // a contrast failure against the red text and a hole in the palette —
      // one grey control in an otherwise entirely red interface.
      ...(night
        ? {
            MuiChip: {
              styleOverrides: {
                root: {
                  '&.MuiChip-colorDefault.MuiChip-filled': {
                    backgroundColor: '#3d0d0d',
                    color: '#ffb3b3',
                  },
                },
              },
            },
          }
        : {}),
    },
  })
}
