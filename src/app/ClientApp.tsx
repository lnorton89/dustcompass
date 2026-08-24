'use client'

import dynamic from 'next/dynamic'
import { Box, CircularProgress, CssBaseline, Stack, ThemeProvider, Typography } from '@mui/material'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { playaTheme } from '../ui/theme'

/**
 * App.tsx owns the real ThemeProvider, built from theme mode state that lives
 * (and can be lost) inside App itself. That leaves two surfaces themeless:
 * this dynamic import's `loading` fallback, shown before App has mounted
 * anything at all, and ErrorBoundary's fallback, shown after a crash has
 * unmounted App's subtree — ThemeProvider included. Both then fall back to
 * MUI's built-in light-blue default, which is exactly the bright screen this
 * app's dark and red-night modes exist to avoid.
 *
 * This shell theme wraps both from outside App, so they are always themed
 * regardless of whether App ever mounts or survives. Fixed at 'dark' rather
 * than mirroring whatever mode the user last chose (persisted separately,
 * inside App) — the goal here is a safe floor, not a synced preference, and
 * dark is never the jarring bright default this exists to avoid, whatever the
 * last real mode was.
 */
const shellTheme = playaTheme('dark')

const DustCompassApp = dynamic(() => import('../App'), {
  ssr: false,
  loading: () => (
    <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'background.default', color: 'text.primary' }}>
      <Stack sx={{ height: '100%', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <CircularProgress color="primary" />
        <Typography variant="body2">Preparing your offline map…</Typography>
      </Stack>
    </Box>
  ),
})

export function ClientApp() {
  return (
    <ThemeProvider theme={shellTheme} defaultMode="dark">
      {/* Paints the actual page background/text from theme tokens, so the
          html/body behind everything below is never MUI's unstyled white
          even before this ThemeProvider's own children have painted
          anything. App renders its own CssBaseline too, against its own
          (possibly light) theme — harmless and redundant once App has
          mounted, but this outer one is what covers the loading and crash
          states App's copy never reaches. */}
      <CssBaseline />
      <ErrorBoundary>
        <DustCompassApp />
      </ErrorBoundary>
    </ThemeProvider>
  )
}
