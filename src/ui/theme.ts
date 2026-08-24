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
      /*
       * The map is allowed the whole screen — under the notch, under the home
       * indicator, into the rounded corners. Nothing drawn on top of it is.
       *
       * Set here rather than on each surface: there are four drawers, opened
       * from three different places, and running under the home indicator is
       * not a property of what happens to be inside one. `--safe-*` resolve to
       * 0 wherever there is nothing to avoid, so a desktop sees no change.
       */
      // The bar reaches the top of the screen, so it is padded rather than the
      // toolbar inside it — the toolbar's own minHeight sets the bar's height,
      // and padding there would shrink the row instead of moving it down.
      MuiAppBar: {
        styleOverrides: {
          root: {
            paddingTop: 'var(--safe-top)',
            paddingLeft: 'var(--safe-left)',
            paddingRight: 'var(--safe-right)',
          },
        },
      },
      // Which edge it came in from decides which insets it has to clear: a
      // sheet from the bottom meets the home indicator, a panel from the side
      // runs the full height and meets both the notch and the indicator.
      MuiDrawer: {
        styleOverrides: {
          paper: ({ ownerState }) => ({
            ...(ownerState.anchor === 'bottom' && {
              // Full width, so a sheet meets the side cutouts in landscape as
              // well as the indicator along the bottom.
              paddingBottom: 'var(--safe-bottom)',
              paddingLeft: 'var(--safe-left)',
              paddingRight: 'var(--safe-right)',
            }),
            ...(ownerState.anchor === 'left' && {
              paddingTop: 'var(--safe-top)',
              paddingBottom: 'var(--safe-bottom)',
              paddingLeft: 'var(--safe-left)',
            }),
            ...(ownerState.anchor === 'right' && {
              paddingTop: 'var(--safe-top)',
              paddingBottom: 'var(--safe-bottom)',
              paddingRight: 'var(--safe-right)',
            }),
          }),
        },
      },
      MuiSnackbar: {
        styleOverrides: {
          anchorOriginBottomCenter: {
            bottom: 'calc(24px + var(--safe-bottom))',
            left: 'calc(8px + var(--safe-left))',
            right: 'calc(8px + var(--safe-right))',
          },
        },
      },
      // MUI inverts a snackbar's background on purpose, which puts a near-white
      // slab in the middle of a dark interface. Two things break on it: the
      // accent colour its own action buttons use fails contrast at 1.9:1, and
      // in red night mode a white panel is exactly the flashlight this app
      // exists to avoid. It uses the same surface as everything else instead.
      MuiSnackbarContent: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary,
            backgroundImage: 'none',
          }),
        },
      },
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
