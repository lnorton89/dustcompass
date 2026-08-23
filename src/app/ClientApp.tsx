'use client'

import dynamic from 'next/dynamic'
import { Box, CircularProgress, Stack, Typography } from '@mui/material'
import { ErrorBoundary } from '../ui/ErrorBoundary'

const DustCompassApp = dynamic(() => import('../App'), {
  ssr: false,
  loading: () => (
    <Box sx={{ position: 'fixed', inset: 0, bgcolor: '#12100e', color: '#e8e0cf' }}>
      <Stack sx={{ height: '100%', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <CircularProgress color="primary" />
        <Typography variant="body2">Preparing your offline map…</Typography>
      </Stack>
    </Box>
  ),
})

export function ClientApp() {
  return (
    <ErrorBoundary>
      <DustCompassApp />
    </ErrorBoundary>
  )
}
