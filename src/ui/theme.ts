import { createTheme, type Theme } from '@mui/material/styles'

/**
 * Dark is the default and the point: this gets read at 3am on a dark playa,
 * where a white screen destroys night vision for everyone nearby.
 */
export function playaTheme(mode: 'dark' | 'light'): Theme {
  return createTheme({
    cssVariables: true,
    palette: {
      mode,
      primary: { main: mode === 'dark' ? '#ff8a4c' : '#c2410c' },
      secondary: { main: mode === 'dark' ? '#5ec8d8' : '#0e7490' },
      background:
        mode === 'dark'
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
    },
  })
}
