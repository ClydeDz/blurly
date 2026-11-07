import type { ReactElement } from 'react'

/**
 * A small hand-rolled icon set, in place of emoji. All icons share a 24px
 * grid, 1.75 stroke and round joins so they sit together consistently.
 */

export type IconName =
  | 'aperture'
  | 'droplet'
  | 'grid'
  | 'square'
  | 'circle'
  | 'sliders'
  | 'download'
  | 'shield'
  | 'image'
  | 'alert'
  | 'undo'
  | 'redo'
  | 'close'
  | 'sun'
  | 'moon'
  | 'upload'
  | 'trash'

const PATHS: Record<IconName, ReactElement> = {
  aperture: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v7.5M20.8 7.5l-6.5 3.75M20.8 16.5l-6.5-3.75M12 21v-7.5M3.2 16.5l6.5-3.75M3.2 7.5l6.5 3.75" />
    </>
  ),
  droplet: <path d="M12 3.5c3.4 3.2 5.5 6 5.5 8.7a5.5 5.5 0 0 1-11 0c0-2.7 2.1-5.5 5.5-8.7Z" />,
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </>
  ),
  square: <rect x="4" y="5.5" width="16" height="13" rx="2" />,
  circle: <ellipse cx="12" cy="12" rx="8" ry="6.5" />,
  sliders: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </>
  ),
  download: <path d="M12 3.5v11m0 0 4-4m-4 4-4-4M4 16.5v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />,
  shield: <path d="M12 3.2 5 6v5.4c0 4.1 2.8 7.6 7 9.4 4.2-1.8 7-5.3 7-9.4V6l-7-2.8Z" />,
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.4" />
      <circle cx="8.8" cy="9.8" r="1.6" />
      <path d="m4.5 16.5 4.2-4a1.8 1.8 0 0 1 2.5 0l5 4.8" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.2 2.8 20h18.4L12 4.2Z" />
      <path d="M12 10v4.2M12 17.3v.1" />
    </>
  ),
  undo: <path d="M4 9h10a5 5 0 0 1 0 10h-4M4 9l4-4M4 9l4 4" />,
  redo: <path d="M20 9H10a5 5 0 0 0 0 10h4M20 9l-4-4M20 9l-4 4" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.1M12 19.3v2.1M4.3 4.3l1.5 1.5M18.2 18.2l1.5 1.5M2.6 12h2.1M19.3 12h2.1M4.3 19.7l1.5-1.5M18.2 5.8l1.5-1.5" />
    </>
  ),
  moon: <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z" />,
  upload: <path d="M12 15.5V3.5m0 0 4.2 4.2M12 3.5 7.8 7.7M3.8 14.5v3.6a2.4 2.4 0 0 0 2.4 2.4h11.6a2.4 2.4 0 0 0 2.4-2.4v-3.6" />,
  trash: <path d="M4.5 7h15M9.5 7V5.2a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V7M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12M10.5 11v6M13.5 11v6" />,
}

interface IconProps {
  name: IconName
  size?: number
  className?: string
}

export default function Icon({ name, size = 18, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
