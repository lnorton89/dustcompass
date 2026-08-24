import { Box, ButtonBase, Paper, Typography } from '@mui/material'
import type { ReactElement } from 'react'

export interface BottomBarItem {
  key: string
  label: string
  icon: ReactElement
  /** Accessible name, where the visible label is too terse to stand alone. */
  title?: string
  selected?: boolean
  /** Omitted on a button that cycles rather than toggles, such as the theme. */
  pressed?: boolean
  onClick: () => void
}

/**
 * Everything that acts on the map, moved to where a thumb already is.
 *
 * These four used to live in the top bar as 30px icons in the far corner from
 * the hand holding the phone, and between them they were squeezing search down
 * to 79px on a small screen. Search keeps the top bar; the actions come down
 * here, where they can afford to be the size of a fingertip.
 *
 * It is a flex sibling of the map rather than a layer over it, so the scale
 * bar, the attribution, the disclaimer and the navigation strip all end above
 * it without any of them having to know it exists.
 */
export function BottomBar({ items }: { items: BottomBarItem[] }) {
  return (
    <Paper
      component="nav"
      elevation={0}
      square
      sx={{
        flexShrink: 0,
        display: 'flex',
        borderTop: '1px solid',
        borderColor: 'divider',
        // The bar is the last thing on the screen, so it is what meets the
        // home indicator and the corner cutouts.
        pb: 'var(--safe-bottom)',
        pl: 'var(--safe-left)',
        pr: 'var(--safe-right)',
      }}
    >
      {items.map((item) => (
        <ButtonBase
          key={item.key}
          onClick={item.onClick}
          aria-label={item.title ?? item.label}
          aria-pressed={item.pressed}
          sx={{
            flex: 1,
            minHeight: 56,
            flexDirection: 'column',
            gap: 0.3,
            py: 0.75,
            color: item.selected ? 'primary.main' : 'text.secondary',
            transition: 'color 120ms',
            '&:focus-visible': {
              outline: '2px solid',
              outlineColor: 'primary.main',
              outlineOffset: -2,
            },
          }}
        >
          <Box
            sx={{
              display: 'flex',
              // A lit pill behind the icon rather than a colour change alone:
              // in daylight on a dusty screen a hue shift is not a state.
              px: 1.5,
              py: 0.25,
              borderRadius: '12px',
              bgcolor: item.selected ? 'action.selected' : 'transparent',
              transition: 'background-color 120ms',
              '& svg': { display: 'block', fontSize: 22 },
            }}
          >
            {item.icon}
          </Box>
          <Typography
            variant="caption"
            sx={{ fontWeight: item.selected ? 700 : 500, lineHeight: 1.1, fontSize: 11.5 }}
          >
            {item.label}
          </Typography>
        </ButtonBase>
      ))}
    </Paper>
  )
}
