import { createTheme, type Theme } from '@mui/material/styles'
import type { ReadingSize, ThemeMode } from '../map/style'

/**
 * The floor for anything a finger lands on. Every platform guideline agrees on
 * 44px, and this app is worse than the average case for all of them: gloves,
 * dust on the glass, one hand, often in the dark. It applies below `md` only —
 * a pointer is precise, and the desktop toolbar is designed at its own density.
 */
const TOUCH = 44

/**
 * MUI derives every `rem` in the type scale from this, so one number moves the
 * whole interface. 14 is its own default; 16 is a step that stays inside the
 * layouts — the toolbar and the bottom bar were both measured at it.
 */
const BASE_FONT_SIZE = { normal: 14, large: 16 } as const

/**
 * Dark is the default and the point: this gets read at 3am on a dark playa,
 * where a white screen destroys night vision for everyone nearby.
 */
export function playaTheme(mode: ThemeMode, reading: ReadingSize = 'normal'): Theme {
  const night = mode === 'night'
  return createTheme({
    // Not CSS variables: this app has no SSR flash to prevent — `mode` is
    // pure client runtime state — and MUI's CSS-vars ThemeProvider only
    // applies a theme's `palette.mode` once, at mount, via `defaultMode`.
    // Every later mode change here creates a brand new theme object, which
    // classic runtime theming re-applies to every styled component on the
    // next render; the CSS-vars path silently kept rendering whatever scope
    // was active at mount, freezing the AppBar/disclaimer/bottom bar at the
    // very first theme while `paletteFor(mode)` (plain JS, no MUI) — which
    // is what draws the map's own chrome — kept tracking it correctly.
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
    /*
     * Sized for arm's length in sunlight, not for a desk. The scale was short
     * and disciplined already; the problem was where its mass sat — nearly
     * everything the user reads while walking was 12px, and nothing was big
     * enough to carry a screen.
     *
     * `h5` is the display size. It is a real MUI variant rather than a custom
     * one so it needs no module augmentation, and nothing else was using it.
     */
    typography: {
      fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
      // Everything below is in `rem`, so this is the one lever for "I cannot
      // read this" — squinting at a dusty screen in full sun with the glasses
      // still in the tent.
      fontSize: BASE_FONT_SIZE[reading],
      h5: { fontWeight: 700, fontSize: '1.75rem', lineHeight: 1.15, letterSpacing: '-0.02em' },
      h6: { fontWeight: 650, letterSpacing: '-0.01em' },
      // A step up each, which is the difference between glancing at a distance
      // and stopping to read it.
      body2: { fontSize: '0.9375rem' },
      caption: { fontSize: '0.8125rem' },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      /*
       * MapLibre ships its own control chrome, and none of it knew about the
       * three palettes: zoom, compass, geolocate, the scale bar and the
       * attribution strip all rendered white in every mode. In red night that
       * is five lit rectangles in the corner of an interface whose entire
       * purpose is to not be a flashlight. Their buttons were also 29px, the
       * smallest targets in the app.
       *
       * Reached through CssBaseline rather than a stylesheet so the rules are
       * rebuilt from `theme.palette` when the mode changes.
       */
      MuiCssBaseline: {
        styleOverrides: (theme) => ({
          '.maplibregl-ctrl-group': {
            backgroundColor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 10,
            boxShadow: 'none',
            overflow: 'hidden',
          },
          '.maplibregl-ctrl-group button': {
            width: TOUCH,
            height: TOUCH,
            backgroundColor: 'transparent',
          },
          '.maplibregl-ctrl-group button:not(:disabled):hover': {
            backgroundColor: theme.palette.action.hover,
          },
          '.maplibregl-ctrl-group button + button': {
            borderTopColor: theme.palette.divider,
          },
          /*
           * The glyphs are black SVGs baked into background-image data URIs, so
           * they cannot be recoloured — only filtered. Inverting carries them to
           * the dust colour on the dark ground; night takes that result down to
           * the same low red as everything else.
           */
          ...(mode === 'light'
            ? {}
            : {
                '.maplibregl-ctrl-icon': {
                  filter: night
                    ? 'invert(1) sepia(1) saturate(5) hue-rotate(-48deg) brightness(0.72)'
                    : 'invert(1) opacity(0.82)',
                },
              }),
          '.maplibregl-ctrl-scale': {
            backgroundColor: theme.palette.background.paper,
            borderColor: theme.palette.divider,
            borderRadius: '0 0 4px 4px',
            color: theme.palette.text.secondary,
            fontSize: 11,
          },
          // MapLibre's own rule for the collapsed pill is
          // `.maplibregl-ctrl-attrib.maplibregl-compact`, two classes and
          // therefore more specific than one — matching only the single class
          // left the attribution the last white thing on the night screen.
          '.maplibregl-ctrl-attrib, .maplibregl-ctrl-attrib.maplibregl-compact': {
            backgroundColor: theme.palette.background.paper,
          },
          // The text sits in `.maplibregl-ctrl-attrib-inner`, which inherits its
          // colour from the `<details>` above it. Colouring only the details
          // element loses to MapLibre's own rule on the same class, so the inner
          // div is named directly — otherwise this stayed black on near-black
          // in night mode, which is worse than the white pill it replaced.
          '.maplibregl-ctrl-attrib, .maplibregl-ctrl-attrib-inner, .maplibregl-ctrl-attrib-inner a':
            {
              color: theme.palette.text.secondary,
            },
          '.maplibregl-ctrl-attrib-button': {
            backgroundColor: 'transparent',
          },
        }),
      },
      /*
       * The touch contract. Grown through padding and a minimum box, never by
       * scaling the glyph — a 44px target around a 17px icon is correct, a 44px
       * icon is a cartoon. Desktop keeps the density it was designed at.
       */
      MuiIconButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            [theme.breakpoints.down('md')]: { minWidth: TOUCH, minHeight: TOUCH },
          }),
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            [theme.breakpoints.down('md')]: { minWidth: TOUCH, minHeight: TOUCH },
          }),
        },
      },
      // Only the ones that do something when pressed. A chip used as a readout
      // is text, and text does not need a thumb.
      //
      // `root` and `clickable` are two keys of the same `styleOverrides`
      // object, not two separate `MuiChip` component entries — a second
      // `MuiChip` entry below (for night mode's default-chip colour) would
      // replace this one outright rather than merge with it, silently
      // dropping the touch-target floor in the one mode most likely to be
      // used one-handed and in the dark.
      MuiChip: {
        styleOverrides: {
          clickable: ({ theme }) => ({
            [theme.breakpoints.down('md')]: { minHeight: TOUCH },
          }),
          // MUI's default filled chip is neutral grey, which in night mode is
          // both a contrast failure against the red text and a hole in the
          // palette — one grey control in an otherwise entirely red interface.
          root: night
            ? {
                '&.MuiChip-colorDefault.MuiChip-filled': {
                  backgroundColor: '#3d0d0d',
                  color: '#ffb3b3',
                },
              }
            : undefined,
        },
      },
      // Event rows and saved spots: long lists where a mis-tap costs a flight
      // across the map and a journey back.
      MuiListItemButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            [theme.breakpoints.down('md')]: { minHeight: TOUCH },
          }),
        },
      },
      MuiButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            [theme.breakpoints.down('md')]: { minHeight: TOUCH },
          }),
        },
      },
      // Applied to the field's box rather than by moving to `size="medium"`,
      // which would have put a 56px input across the top of every phone.
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }) => ({
            [theme.breakpoints.down('md')]: { minHeight: TOUCH },
          }),
        },
      },
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
    },
  })
}
