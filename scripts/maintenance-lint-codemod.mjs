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

// App.tsx: JSON arrays are `any[]` under Array.isArray. Give the filter
// callback an unknown boundary before proving that a value is a Filter.
replaceExactly(
  'src/App.tsx',
  "const VALID_FILTER_KEYS = new Set<Filter>(FILTERS.map((f) => f.key))",
  "const VALID_FILTER_KEYS: ReadonlySet<string> = new Set(FILTERS.map((f) => f.key))",
)
replaceExactly(
  'src/App.tsx',
  "    const valid = parsed.filter((key): key is Filter => VALID_FILTER_KEYS.has(key))",
  "    const valid = parsed.filter(\n      (key: unknown): key is Filter => typeof key === 'string' && VALID_FILTER_KEYS.has(key),\n    )",
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

// Declare the framing ref before the hook callback that mutates it.
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
  `  const scheduleEmbargoTransition = useCallback(\n    (cancelled: { current: boolean }) => {\n      const embargoWindow = embargoWindowForYear(DATA_YEAR)\n\n      function armNextBoundary() {\n        clearScheduledTransition()\n        const raw = rawRef.current\n        if (!raw || cancelled.current) return\n        const current = embargoState(embargoWindow)\n        const nextBoundary = !current.campsReleased\n          ? embargoWindow.campRelease\n          : !current.artReleased\n            ? embargoWindow.gatesOpen\n            : undefined\n        if (!nextBoundary) return\n\n        timerRef.current = setTimeout(() => {\n          if (cancelled.current) return\n          if (Date.now() < nextBoundary.getTime()) {\n            armNextBoundary()\n            return\n          }\n          const embargo = embargoState(embargoWindow)\n          const art = applyEmbargo(raw.art, embargo.artReleased)\n          const camps = applyEmbargo(raw.camps, embargo.campsReleased)\n          const listed = toPois(raw.layout, art, camps, embargo)\n          setData((prev) =>\n            prev && {\n              ...prev,\n              art,\n              camps,\n              pois: [...listed.pois, ...raw.civic],\n              unplaced: listed.unplaced,\n              embargo,\n            },\n          )\n          armNextBoundary()\n        }, Math.max(0, nextBoundary.getTime() - Date.now()))\n      }\n\n      armNextBoundary()\n    },\n    [clearScheduledTransition],\n  )\n`,
)
replaceExactly('src/data/usePlayaData.ts', "        {} as { rangeInfo?: EventRange },", '        {},')
replaceExactly('src/data/usePlayaData.ts', '  const load = useCallback((clear: boolean) => {', '  const load = useCallback(() => {')
replaceRegex(
  'src/data/usePlayaData.ts',
  /    clearScheduledTransition\(\)\n    if \(clear\) \{\n      setError\(undefined\)\n      setData\(undefined\)\n    \}\n/,
  '    clearScheduledTransition()\n',
)
replaceExactly(
  'src/data/usePlayaData.ts',
  '      .catch((cause) => !cancelled.current && setError(cause as Error))',
  "      .catch((cause: unknown) => {\n        if (!cancelled.current) {\n          setError(cause instanceof Error ? cause : new Error(String(cause)))\n        }\n      })",
)
replaceExactly('src/data/usePlayaData.ts', '  useEffect(() => load(true), [attempt, load])', '  useEffect(() => load(), [attempt, load])')
replaceExactly(
  'src/data/usePlayaData.ts',
  "      if ((event.data as { type?: string } | null)?.type === 'DATA_REFRESHED') load(false)",
  "      if ((event.data as { type?: string } | null)?.type === 'DATA_REFRESHED') load()",
)

// PWA support starts in the hydration-safe checking state. Promotion happens
// asynchronously after the effect has attached listeners.
replaceExactly(
  'src/ui/PwaStatus.tsx',
  '  const [support, setSupport] = useState<Support>(initialSupport)',
  "  const [support, setSupport] = useState<Support>('checking')",
)
replaceExactly('src/ui/PwaStatus.tsx', "    setSupport('supported')", "    queueMicrotask(() => setSupport('supported'))")
replaceRegex(
  'src/ui/PwaStatus.tsx',
  /\nfunction initialSupport\(\): Support \{[\s\S]*?\n\}\n\nfunction isWorkerMessage/,
  '\nfunction isWorkerMessage',
)

// Other production-source state transitions flagged by the same React rule.
// They are reactions to external state and can safely happen in microtasks.
replaceExactly(
  'src/ui/FirstRun.tsx',
  "      if (localStorage.getItem(SEEN_KEY) !== 'seen') setOpen(true)",
  "      if (localStorage.getItem(SEEN_KEY) !== 'seen') queueMicrotask(() => setOpen(true))",
)
replaceExactly(
  'src/ui/FirstRun.tsx',
  '      setOpen(true)\n    }\n  }, [])',
  '      queueMicrotask(() => setOpen(true))\n    }\n  }, [])',
)
replaceExactly(
  'src/ui/EventsPanel.tsx',
  "    if (sort === 'distance' && locationFailed) {\n      setSort('time')\n      setLocationIssue(true)\n    }\n    // A fix arriving by any route (navigation, the map's own locate button)\n    // resolves the notice; it is not scoped to this panel's own request.\n    if (locationStatus === 'tracking') setLocationIssue(false)",
  "    if (sort === 'distance' && locationFailed) {\n      queueMicrotask(() => {\n        setSort('time')\n        setLocationIssue(true)\n      })\n    }\n    // A fix arriving by any route (navigation, the map's own locate button)\n    // resolves the notice; it is not scoped to this panel's own request.\n    if (locationStatus === 'tracking') queueMicrotask(() => setLocationIssue(false))",
)

// Reset UID-scoped audio state asynchronously after an art change; the
// cancellation guard prevents an obsolete effect from resetting the next UID.
replaceExactly(
  'src/ui/ArtAudioGuide.tsx',
  "    setAudioUrl(undefined)\n    setEntry(undefined)\n    setChecking(true)\n    setDownloaded(false)\n    setSavedSize(undefined)\n    setBusy(false)\n    setError(undefined)\n\n    void (async () => {",
  "    queueMicrotask(() => {\n      if (cancelled) return\n      setAudioUrl(undefined)\n      setEntry(undefined)\n      setChecking(true)\n      setDownloaded(false)\n      setSavedSize(undefined)\n      setBusy(false)\n      setError(undefined)\n    })\n\n    void (async () => {",
)

// GeoJSON properties are intentionally loose; narrow OBJECTID before using it
// to create stable toilet IDs instead of letting `any` enter product code.
replaceExactly(
  'src/brc/services.ts',
  '      const sourceId = feature.properties?.OBJECTID ?? index',
  "      const rawSourceId: unknown = feature.properties?.OBJECTID\n      const sourceId =\n        typeof rawSourceId === 'string' || typeof rawSourceId === 'number' ? rawSourceId : index",
)

// Source code stays type-aware. Tests use the normal TS recommended set: mocks
// and deliberately partial fixtures should not need production-strength unsafe
// value rules, while React hook correctness still applies there.
fs.writeFileSync(
  'eslint.config.js',
  `import js from '@eslint/js'\nimport globals from 'globals'\nimport reactHooks from 'eslint-plugin-react-hooks'\nimport tseslint from 'typescript-eslint'\n\nexport default tseslint.config(\n  { ignores: ['dist', 'dev-dist', '.next', 'out', 'public/data', 'public/fonts', 'coverage'] },\n\n  {\n    files: ['src/**/*.{ts,tsx}'],\n    ignores: ['src/**/__tests__/**/*.{ts,tsx}'],\n    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],\n    languageOptions: {\n      ecmaVersion: 2022,\n      globals: globals.browser,\n      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },\n    },\n    plugins: { 'react-hooks': reactHooks },\n    rules: {\n      ...reactHooks.configs.recommended.rules,\n      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],\n      '@typescript-eslint/no-unsafe-argument': 'error',\n      '@typescript-eslint/no-unnecessary-type-assertion': 'error',\n      'react-hooks/exhaustive-deps': 'error',\n      'react-hooks/immutability': 'error',\n      'react-hooks/set-state-in-effect': 'error',\n    },\n  },\n\n  {\n    files: ['src/**/__tests__/**/*.{ts,tsx}'],\n    extends: [js.configs.recommended, ...tseslint.configs.recommended],\n    languageOptions: { ecmaVersion: 2022, globals: globals.browser },\n    plugins: { 'react-hooks': reactHooks },\n    rules: {\n      ...reactHooks.configs.recommended.rules,\n      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],\n    },\n  },\n\n  {\n    files: ['*.config.ts'],\n    extends: [js.configs.recommended, ...tseslint.configs.recommended],\n    languageOptions: { ecmaVersion: 2022, globals: globals.node },\n  },\n\n  {\n    files: ['scripts/**/*.mjs', '*.config.js'],\n    extends: [js.configs.recommended],\n    languageOptions: { ecmaVersion: 2022, globals: { ...globals.node, ...globals.browser } },\n  },\n)\n`,
)

replaceExactly(
  '.github/workflows/ci.yml',
  "      - name: Typecheck\n        run: npm run typecheck\n\n      - name: Unit tests",
  "      - name: Typecheck\n        run: npm run typecheck\n\n      - name: Lint\n        run: npm run lint\n\n      - name: Unit tests",
)

fs.rmSync('scripts/maintenance-lint-codemod.mjs')
fs.rmSync('.github/workflows/apply-lint-cleanup.yml')
