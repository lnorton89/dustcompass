'use client'

import { useEffect } from 'react'
import { assetUrl } from '../../../config'

/**
 * Nobody is meant to stop here. The crawler that unfurls the link has already
 * read the metadata by the time this renders; a person gets sent on to the map
 * with the place selected. The link stays visible and real so that a browser
 * with no JavaScript — or a reader who lands here mid-redirect — still has a
 * way through rather than a blank page.
 *
 * `data-dust-compass-share-page` is also a deliberately stable authenticity
 * marker for the service worker. A captive portal can return arbitrary 200 OK
 * HTML for this URL; the worker only accepts network HTML that contains this
 * marker, otherwise it falls back to the cached app with the UID preserved
 * (#94).
 */
export function ShareRedirect({
  uid,
  name,
  address,
}: {
  uid: string
  name?: string
  address?: string
}) {
  const target = `${assetUrl('')}?poi=${encodeURIComponent(uid)}`.replace('/?', '/?')

  useEffect(() => {
    window.location.replace(target)
  }, [target])

  return (
    <main
      data-dust-compass-share-page="1"
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        textAlign: 'center',
        background: '#12100e',
        color: '#e8e0cf',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.25rem' }}>{name ?? 'Opening the map'}</h1>
        {address && <p style={{ margin: '0 0 1.5rem', opacity: 0.75 }}>{address}</p>}
        <a href={target} style={{ color: '#ff8a4c' }}>
          Open in Dust Compass
        </a>
      </div>
    </main>
  )
}
