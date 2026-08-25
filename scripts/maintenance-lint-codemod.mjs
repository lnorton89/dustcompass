import fs from 'node:fs'

function replaceExactly(path, from, to) {
  const source = fs.readFileSync(path, 'utf8')
  if (!source.includes(from)) throw new Error(`${path}: expected source pattern not found`)
  fs.writeFileSync(path, source.replace(from, to))
}

function replaceRegex(path, pattern, replacement) {
  const source = fs.readFileSync(path, 'utf8')
  const next = source.replace(pattern, replacement)
  if (next === source) throw new Error(`${path}: expected regex pattern not found`)
  fs.writeFileSync(path, next)
}

// App.tsx: make persisted-filter validation type-safe rather than passing `any`
// from JSON.parse/Array.isArray into a Set<Filter> lookup.
replaceExactly(
  'src/App.tsx',
  "const VALID_FILTER_KEYS = new Set<Filter>(FILTERS.map((f) => f.key))",
  "const VALID_FILTER_KEYS: ReadonlySet<string> = new Set(FILTERS.map((f) => f.key))",
)

// Depend on stable method references rather than the fresh object returned by
// useGeolocation(), satisfying exhaustive-deps without causing callback churn.
replaceExactly(
  'src/App.tsx',
  "  const location = useGeolocation()\n  const here = location.position",
  "  const location = useGeolocation()\n  const here = location.position\n  const startLocation = location.start\n  const stopLocation = location.stop",
)
replaceExactly('src/App.tsx', '      location.start(initialFix)', '      startLocation(initialFix)')
replaceExactly('src/App.tsx', '    [location.start],', '    [startLocation],')
replaceExactly('src/App.tsx', '      if (locationOwners.current.size === 0) location.stop()', '      if (locationOwners.current.size === 0) stopLocation()')
replaceExactly('src/App.tsx', '    [location.stop],', '    [stopLocation],')

// These storage reads intentionally happen after hydration. Defer the state
// update to a microtask so the effect synchronizes with browser storage without
// a synchronous cascading render.
replaceExactly(
  'src/App.tsx',
  "      if (localStorage.getItem(DISCLAIMER_SURFACE_KEY) === 'dismissed') {\n        setDisclaimerSurfaceDismissed(true)\n      }",
  "      if (localStorage.getItem(DISCLAIMER_SURFACE_KEY) === 'dismissed') {\n        queueMicrotask(() => setDisclaimerSurfaceDismissed(true))\n      }",
)
replaceExactly(
  'src/App.tsx',
  "      if (localStorage.getItem(EMBARGO_NOTICE_KEY) === 'seen') setEmbargoNoticeSeen(true)",
  "      if (localStorage.getItem(EMBARGO_NOTICE_KEY) === 'seen') {\n        queueMicrotask(() => setEmbargoNoticeSeen(true))\n      }",
)
replaceExactly(
  'src/App.tsx',
  "      if (localStorage.getItem(STALE_NOTICE_KEY) === 'seen') setStaleNoticeSeen(true)",
  "      if (localStorage.getItem(STALE_NOTICE_KEY) === 'seen') {\n        queueMicrotask(() => setStaleNoticeSeen(true))\n      }",
)

// Declare the navigation framing ref before the callback that mutates it. The
// React compiler's immutability analysis treats a later declaration captured by
// an earlier hook callback as a hook-argument mutation hazard.
replaceExactly(
  'src/App.tsx',
  "\n  const framedNavigationFor = useRef<string | undefined>(undefined)\n  useEffect(() => {",
  "\n  useEffect(() => {",
)
replaceExactly(
  'src/App.tsx',
  "  const navigateTo = useCallback(\n",
  "  const framedNavigationFor = useRef<string | undefined>(undefined)\n  const navigateTo = useCallback(\n",
)

// usePlayaData.ts: keep embargo rescheduling local so a callback never reaches
// forward to its own hook-produced value.
replaceRegex(
  'src/data/usePlayaData.ts',
  /  const scheduleEmbargoTransition = useCallback\(\n    \(cancelled: \{ current: boolean \}\) => \{[\s\S]*?\n    \[clearScheduledTransition\],\n  \)\n/,
  `  const scheduleEmbargoTransition = useCallback(\n    (cancelled: { current: boolean }) => {\n      const embargoWindow = embargoWindowForYear(DATA_YEAR)\n\n      function armNextBoundary() {\n        clearScheduledTransition()\n        const raw = rawRef.current\n        if (!raw || cancelled.current) return\n        const current = embargoState(embargoWindow)\n        const nextBoundary = !current.campsReleased\n          ? embargoWindow.campRelease\n          : !current.artReleased\n            ? embargoWindow.gatesOpen\n            : undefined\n        if (!nextBoundary) return\n\n        timerRef.current = setTimeout(() => {\n          if (cancelled.current) return\n          // A fake/host-clamped timer can fire a tick early. Re-arm from the\n          // wall clock rather than revealing embargoed data prematurely.\n          if (Date.now() < nextBoundary.getTime()) {\n            armNextBoundary()\n            return\n          }\n          const embargo = embargoState(embargoWindow)\n          const art = applyEmbargo(raw.art, embargo.artReleased)\n          const camps = applyEmbargo(raw.camps, embargo.campsReleased)\n          const listed = toPois(raw.layout, art, camps, embargo)\n          setData((prev) =>\n            prev && {\n              ...prev,\n              art,\n              camps,\n              pois: [...listed.pois, ...raw.civic],\n              unplaced: listed.unplaced,\n              embargo,\n            },\n          )\n          armNextBoundary()\n        }, Math.max(0, nextBoundary.getTime() - Date.now()))\n      }\n\n      armNextBoundary()\n    },\n    [clearScheduledTransition],\n  )\n`,
)
replaceExactly(
  'src/data/usePlayaData.ts',
  "        {} as { rangeInfo?: EventRange },",
  "        {},",
)

// Loading no longer synchronously clears state from an effect. Retry already
// clears stale error/data in the user event before incrementing `attempt`, and
// background refreshes intentionally keep current data visible.
replaceExactly(
  'src/data/usePlayaData.ts',
  "  const load = useCallback((clear: boolean) => {",
  "  const load = useCallback(() => {",
)
replaceRegex(
  'src/data/usePlayaData.ts',
  /    clearScheduledTransition\(\)\n    if \(clear\) \{\n      setError\(undefined\)\n      setData\(undefined\)\n    \}\n/,
  "    clearScheduledTransition()\n",
)
replaceExactly(
  'src/data/usePlayaData.ts',
  "      .catch((cause) => !cancelled.current && setError(cause as Error))",
  "      .catch((cause: unknown) => {\n        if (!cancelled.current) {\n          setError(cause instanceof Error ? cause : new Error(String(cause)))\n        }\n      })",
)
replaceExactly('src/data/usePlayaData.ts', '  useEffect(() => load(true), [attempt, load])', '  useEffect(() => load(), [attempt, load])')
replaceExactly(
  'src/data/usePlayaData.ts',
  "      if ((event.data as { type?: string } | null)?.type === 'DATA_REFRESHED') load(false)",
  "      if ((event.data as { type?: string } | null)?.type === 'DATA_REFRESHED') load()",
)

// PwaStatus: keep the server/client initial render stable and move support
// promotion into an asynchronous callback rather than setting state directly
// in the effect body.
replaceExactly(
  'src/ui/PwaStatus.tsx',
  '  const [support, setSupport] = useState<Support>(initialSupport)',
  "  const [support, setSupport] = useState<Support>('checking')",
)
replaceExactly(
  'src/ui/PwaStatus.tsx',
  "    setSupport('supported')",
  "    queueMicrotask(() => setSupport('supported'))",
)

// Make the IDE's strict findings explicit project policy rather than relying on
// transitive preset contents, and make CI actually run the linter.
replaceExactly(
  'eslint.config.js',
  "      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],",
  `      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],\n      '@typescript-eslint/no-unsafe-argument': 'error',\n      '@typescript-eslint/no-unnecessary-type-assertion': 'error',\n      'react-hooks/exhaustive-deps': 'error',\n      'react-hooks/immutability': 'error',\n      'react-hooks/set-state-in-effect': 'error',`,
)
replaceExactly(
  '.github/workflows/ci.yml',
  "      - name: Typecheck\n        run: npm run typecheck\n\n      - name: Unit tests",
  "      - name: Typecheck\n        run: npm run typecheck\n\n      - name: Lint\n        run: npm run lint\n\n      - name: Unit tests",
)

// This is a one-shot maintenance helper; leave no codemod or workflow debris in
// the product branch after it has done its job.
fs.rmSync('scripts/maintenance-lint-codemod.mjs')
fs.rmSync('.github/workflows/apply-lint-cleanup.yml')
