import { useCallback, useEffect, useState } from 'react'
import { Box, Button, Dialog, Stack, Typography } from '@mui/material'
import ExploreIcon from '@mui/icons-material/Explore'
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined'
import CloudDoneIcon from '@mui/icons-material/CloudDone'
import type { ReactElement } from 'react'
import { BrandMark } from './BrandMark'
import { BRAND } from '../brand'

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
  // Starts closed — matching what the static export's prerendered HTML has
  // to assume, since localStorage does not exist at build time — and
  // corrected right after mount for anyone who hasn't seen it. Reading the
  // real value straight from the useState initializer instead made the very
  // first client render disagree with the server-rendered markup for any
  // returning visitor, which is a hydration error, not merely a startup
  // flash: every fresh page load hit it, since this dialog gates virtually
  // everything else the app renders.
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) !== 'seen') queueMicrotask(() => setOpen(true))
    } catch {
      // Private windows and blocked site data both throw. Open rather than
      // skip: dismiss() below swallows its own write failure, so the worst
      // case is this screen coming back every launch — never zero onboarding.
      queueMicrotask(() => setOpen(true))
    }
  }, [])

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
          City survey &amp; listings: Burning Man Project. {BRAND.disclaimer}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Your location is only ever read when you ask for it — navigating, sorting events by
          distance, or the map's own locate button — and it stays on this device.
        </Typography>

        <Button variant="contained" fullWidth onClick={dismiss} sx={{ mt: 2 }}>
          Show me the map
        </Button>
      </Box>
    </Dialog>
  )
}
