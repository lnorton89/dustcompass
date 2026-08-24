import { Box, ButtonBase, Tooltip, type Theme } from '@mui/material'
import type { ReactElement, ReactNode } from 'react'

/**
 * Written out rather than reached for with `alpha()`: the theme runs on CSS
 * variables, so `palette.text.primary` is the string `var(--mui-…)` at runtime
 * and `alpha()` quietly hands back a transparent colour.
 */
const ink = (dark: boolean, opacity: number) =>
  dark ? `rgba(255,255,255,${opacity})` : `rgba(0,0,0,${opacity})`

/**
 * Controls that belong together, sharing one sunken track.
 *
 * The toolbar used to be a row of loose pills in five different colours, so a
 * passive status readout, a filter and a view switch all looked like the same
 * kind of thing. Grouping them says which controls answer the same question,
 * and leaves colour free to mean something.
 */
export function ControlGroup({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        // The track grows with the keys it holds — see ControlButton, which
        // takes the 44px touch floor on a phone and this group's own density
        // wherever there is a pointer.
        p: { xs: '4px', md: '3px' },
        flexShrink: 0,
        borderRadius: { xs: '18px', md: '13px' },
        border: '1px solid',
        borderColor: 'divider',
        // A track sunk below the bar, so the selected key can sit proud of it
        // using the same surface as every other raised thing in the app.
        bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.32)' : 'rgba(0,0,0,0.05)'),
      }}
    >
      {children}
    </Box>
  )
}

interface ControlButtonProps {
  icon: ReactElement
  /** Dropped when the bar is too narrow to afford it; the tooltip takes over. */
  label?: string
  /** Accessible name. Always given, because the label may not be. */
  title: string
  /** Tooltip text where it should describe the current state, not the action. */
  tooltip?: string
  selected?: boolean
  /** Omit on buttons that are not a two-state toggle, such as a mode cycle. */
  pressed?: boolean
  /**
   * The colour this layer is drawn in on the map. It lights the icon only while
   * the layer is actually shown, which makes the filter row double as a legend.
   */
  accent?: string
  onClick: () => void
}

export function ControlButton({
  icon,
  label,
  title,
  tooltip,
  selected = false,
  pressed,
  accent,
  onClick,
}: ControlButtonProps) {
  const button = (
    <ButtonBase
      onClick={onClick}
      aria-label={title}
      aria-pressed={pressed}
      sx={{
        // 44px is the touch floor everywhere a finger is the pointer. Above
        // `md` the mouse is precise and the toolbar keeps the tighter rhythm
        // this group was designed at.
        height: { xs: 44, md: 28 },
        minWidth: { xs: 44, md: 28 },
        px: label ? { xs: 1.4, md: 0.9 } : 0,
        gap: 0.65,
        borderRadius: { xs: '14px', md: '10px' },
        fontSize: { xs: 14, md: 13 },
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        color: selected ? 'text.primary' : 'text.secondary',
        bgcolor: selected ? 'background.paper' : 'transparent',
        // A key sitting proud of the track: a hairline to catch its edge and a
        // short shadow under it. Outdoors in daylight the shadow alone is not
        // enough to read a toggle by.
        boxShadow: (theme) =>
          selected
            ? `0 1px 2px rgba(0,0,0,0.35), inset 0 0 0 1px ${ink(theme.palette.mode === 'dark', 0.14)}`
            : 'none',
        transition: 'background-color 120ms, color 120ms, box-shadow 120ms',
        // Left off entirely when the key is already lit, so the base rule's
        // themed background stands rather than being frozen to one scheme.
        ...(selected
          ? {}
          : { '&:hover': { bgcolor: (theme: Theme) => ink(theme.palette.mode === 'dark', 0.08) } }),
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 1,
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          color: selected ? (accent ?? 'primary.main') : 'inherit',
          opacity: selected ? 1 : 0.8,
          '& svg': { display: 'block', fontSize: { xs: 21, md: 17 } },
        }}
      >
        {icon}
      </Box>
      {label && <Box component="span">{label}</Box>}
    </ButtonBase>
  )
  // A tooltip repeating a label the user can already read is just noise.
  return label ? button : <Tooltip title={tooltip ?? title}>{button}</Tooltip>
}

/** Separates two runs of keys on one track — filters from what opens the rest. */
export function ControlDivider() {
  return (
    <Box
      sx={{ width: '1px', height: { xs: 26, md: 16 }, mx: '2px', bgcolor: 'divider', flexShrink: 0 }}
    />
  )
}
