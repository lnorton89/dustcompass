import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'

interface Props {
  children: ReactNode
}

interface State {
  error?: Error
}

/**
 * A blank screen is a dead app, and out here there is no second device to look
 * something up on and no connection to reload from. If a render throws, say so
 * plainly and offer the two things that actually recover it — reload, and
 * failing that, clear the stored state that might be causing it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Dust Compass crashed:', error, info.componentStack)
  }

  private reset = () => {
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          p: 3,
          bgcolor: 'background.default',
          color: 'text.primary',
        }}
      >
        <Stack spacing={2} sx={{ maxWidth: 420, textAlign: 'center' }}>
          <Typography variant="h6">The map stopped working</Typography>
          <Typography variant="body2" color="text.secondary">
            The map data is stored on this device, so reloading should bring it back without a
            connection.
          </Typography>
          <Typography
            variant="caption"
            component="pre"
            sx={{
              color: 'text.secondary',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              textAlign: 'left',
            }}
          >
            {error.message}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
            <Button variant="contained" onClick={this.reset}>
              Reload
            </Button>
          </Stack>
        </Stack>
      </Box>
    )
  }
}
