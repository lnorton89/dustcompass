import { spawn } from 'node:child_process'

const child = spawn(process.execPath, ['scripts/human-e2e-live.mjs'], {
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => { output += chunk })
child.stderr.on('data', (chunk) => { output += chunk })

const code = await new Promise((resolve) => child.on('close', resolve))
const audioJourney = 'official art audio survives offline reload and does not leak across art UIDs'
// human-e2e-live now has first-class SKIP reporting (#139). Match that output
// directly; looking for the old OBSERVATION text makes this guard permanently
// false and silently disables the post-embargo coverage gate.
const skippedAudio = output.includes(`SKIP: ${audioJourney}:`)

process.stdout.write(output)

if (code !== 0) process.exit(code ?? 1)

// Once the location embargo is over, continuing to skip this coverage means
// the production dataset/test fixture is stale rather than legitimately
// unavailable. Make that loss of coverage actionable instead of green noise.
const now = new Date()
const embargoReleased = now.getUTCFullYear() > 2026 || (now.getUTCFullYear() === 2026 && (now.getUTCMonth() > 7 || (now.getUTCMonth() === 7 && now.getUTCDate() >= 30)))
if (skippedAudio && embargoReleased) {
  console.error('HUMAN_E2E_FAILURE: art-audio journey is still skipped after the 2026 location embargo release')
  process.exit(1)
}
