import { Box, type BoxProps } from '@mui/material'

interface Props extends Omit<BoxProps<'svg'>, 'component'> {
  size?: number
}

/**
 * An original compass-and-horizon mark. It deliberately avoids the Man symbol,
 * event photography, and the protected city-map silhouette.
 */
export function BrandMark({ size = 32, ...props }: Props) {
  return (
    <Box
      component="svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      {...props}
    >
      <rect width="64" height="64" rx="15" fill="#12100e" />
      <circle cx="32" cy="32" r="20" fill="none" stroke="#5ec8d8" strokeWidth="2.5" />
      <path d="M32 12v8M32 44v8M12 32h8M44 32h8" stroke="#5ec8d8" strokeWidth="2.5" strokeLinecap="round" />
      <path d="m32 20 6.5 14.5L32 32l-6.5 2.5L32 20Z" fill="#ff8a4c" />
      <path d="M19 40c7-3 19-3 26 0" fill="none" stroke="#e8e0cf" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="32" r="2.5" fill="#e8e0cf" />
    </Box>
  )
}

