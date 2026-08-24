import { useCallback, useState } from 'react'
import { Box, Button, Dialog, Stack, Typography } from '@mui/material'
import ExploreIcon from '@mui/icons-material/Explore'
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined'
import CloudDoneIcon from '@mui/icons-material/CloudDone'
import type { ReactElement } from 'react'
import { BrandMark } from './BrandMark'

/**
 * Bumped only when there is something genuinely new to say. Seeing this once is
 * the point of it; seeing it again every August would make it furniture.
 */
const SEEN_KEY = 'dust-compass:first-run:1'

const CARDS: { icon: ReactElement; title: string; body: string }[] = [
  {
    icon: <ExploreIcon />,
    title: 'Addresses are a time and a street',
    body: 'Everything out here sits at something like 7:30 & Esplanade. Type one straight into the search box, or tap bare playa to find out where you are standing.',
  },
  {
    icon: <PlaceOutlinedIcon />,
    title: 'Save where you left things',
    body: 'Tap anywhere on the map to drop a pin and name it — your tent, your bike, where you said you would meet. Saved spots survive going offline and come first in search.',
  },
  {
    icon: <CloudDoneIcon />,
    title: 'It works with no signal',
    body: 'The city and this year’s listings are saved onto your device while you still have a connection. When the bar says “Ready offline”, you can put the phone away.',
  },
]

/**
 * The one screen that explains the vocabulary before the map demands it.
 *
 * Without it a first-time user arrives at a field of numbered circles with no
 * hint that the city has its own address system, that a tap saves a place, or
 * that any of this survives losing signal — three things the app is entirely
 * built around and none of them discoverable by looking.
 *
 * Shown once, then never again. It is deliberately one screen rather than a
 * three-step wizard: nobody came here to be onboarded.
 */
export function FirstRun() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) !== 'seen'
    } catch {
      // Private windows and blocked site data both throw. Better to show this
      // twice than to let it stop the map from opening.
      return false
    }
  })

  const dismiss = useCallback(() => {
    setOpen(false)
    try {
      localStorage.setItem(SEEN_KEY, 'seen')
    } catch {
      /* nothing to do — see above */
    }
  }, [])

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      fullWidth
      maxWidth="xs"
      aria-labelledby="first-run-title"
      slotProps={{ paper: { sx: { m: 2 } } }}
    >
      <Box sx={{ p: 3, pb: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 2.5 }}>
          <BrandMark size={36} sx={{ flexShrink: 0 }} />
          <Typography id="first-run-title" variant="h5">
            Before you set off
          </Typography>
        </Stack>

        <Stack spacing={2.5}>
          {CARDS.map((card) => (
            <Stack key={card.title} direction="row" spacing={1.75}>
              <Box
                sx={{
                  flexShrink: 0,
                  display: 'flex',
                  color: 'primary.main',
                  mt: '2px',
                  '& svg': { fontSize: 22 },
                }}
              >
                {card.icon}
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ lineHeight: 1.3 }}>
                  {card.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  {card.body}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
          Your location is only ever read while you are navigating, and it stays on this device.
        </Typography>

        <Button variant="contained" fullWidth onClick={dismiss} sx={{ mt: 2 }}>
          Show me the map
        </Button>
      </Box>
    </Dialog>
  )
}
