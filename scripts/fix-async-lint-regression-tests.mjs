import fs from 'node:fs'

function replaceExactly(path, from, to) {
  const source = fs.readFileSync(path, 'utf8')
  if (!source.includes(from)) throw new Error(`${path}: expected source pattern not found`)
  fs.writeFileSync(path, source.replace(from, to))
}

replaceExactly(
  'src/ui/PwaStatus.tsx',
  `    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) {
      return () => {
        window.removeEventListener('online', goOnline)
        window.removeEventListener('offline', goOffline)
      }
    }
`,
  `    if (process.env.NODE_ENV !== 'production') {
      queueMicrotask(() => setSupport('supported'))
      return () => {
        window.removeEventListener('online', goOnline)
        window.removeEventListener('offline', goOffline)
      }
    }
    if (!('serviceWorker' in navigator)) {
      queueMicrotask(() => setSupport('unsupported'))
      return () => {
        window.removeEventListener('online', goOnline)
        window.removeEventListener('offline', goOffline)
      }
    }
`,
)

replaceExactly(
  'src/ui/__tests__/FirstRun.test.tsx',
  `  it('opens when localStorage.getItem throws', () => {`,
  `  it('opens when localStorage.getItem throws', async () => {`,
)
replaceExactly(
  'src/ui/__tests__/FirstRun.test.tsx',
  `    render(<FirstRun />)\n    expect(screen.getByText('Before you set off')).toBeDefined()`,
  `    render(<FirstRun />)\n    expect(await screen.findByText('Before you set off')).toBeDefined()`,
)
replaceExactly(
  'src/ui/__tests__/FirstRun.test.tsx',
  `    render(<FirstRun />)\n    expect(screen.getByText('Before you set off')).toBeDefined()\n\n    expect(() => {`,
  `    render(<FirstRun />)\n    expect(await screen.findByText('Before you set off')).toBeDefined()\n\n    expect(() => {`,
)

replaceExactly(
  'src/ui/__tests__/EventsPanel.test.tsx',
  `import { cleanup, fireEvent, render, screen } from '@testing-library/react'`,
  `import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'`,
)
replaceExactly(
  'src/ui/__tests__/EventsPanel.test.tsx',
  `  it('does not leave "Closest" selected while silently falling back to time order on denial', () => {`,
  `  it('does not leave "Closest" selected while silently falling back to time order on denial', async () => {`,
)
replaceExactly(
  'src/ui/__tests__/EventsPanel.test.tsx',
  `    expect(screen.getByRole('button', { name: /closest/i }).getAttribute('aria-pressed')).toBe('false')\n    expect(screen.getByText(/location access is off/i)).toBeDefined()`,
  `    await waitFor(() =>\n      expect(screen.getByRole('button', { name: /closest/i }).getAttribute('aria-pressed')).toBe('false'),\n    )\n    expect(screen.getByText(/location access is off/i)).toBeDefined()`,
)
replaceExactly(
  'src/ui/__tests__/EventsPanel.test.tsx',
  `  it('offers an explicit retry that asks for location again', () => {`,
  `  it('offers an explicit retry that asks for location again', async () => {`,
)
replaceExactly(
  'src/ui/__tests__/EventsPanel.test.tsx',
  `    fireEvent.click(screen.getByRole('button', { name: /retry/i }))`,
  `    fireEvent.click(await screen.findByRole('button', { name: /retry/i }))`,
)
replaceExactly(
  'src/ui/__tests__/EventsPanel.test.tsx',
  `  it('uses the shared MUI button touch-target contract for Retry', () => {`,
  `  it('uses the shared MUI button touch-target contract for Retry', async () => {`,
)
replaceExactly(
  'src/ui/__tests__/EventsPanel.test.tsx',
  `    const retry = screen.getByRole('button', { name: /retry/i })`,
  `    const retry = await screen.findByRole('button', { name: /retry/i })`,
)

fs.rmSync('scripts/fix-async-lint-regression-tests.mjs')
