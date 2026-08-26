from pathlib import Path
p=Path('src/App.tsx'); s=p.read_text()
s=s.replace("  readDirectionsIntent,\n  type DirectionsEndpoint,", "  readDirectionsResult,\n  type DirectionsEndpoint,\n  type DirectionsReadResult,")
s=s.replace("    mode?: DirectionsMode\n  }>()\n  const [initialDirections] = useState(() => readDirectionsIntent())\n  const [directionsOpen, setDirectionsOpen] = useState(() => Boolean(initialDirections))", "    mode?: DirectionsMode\n    routeFrom?: DirectionsEndpoint\n    routeTo?: DirectionsEndpoint\n  }>()\n  const [initialDirectionsResult] = useState(() => readDirectionsResult())\n  const initialDirections = initialDirectionsResult.status === 'resolved' ? initialDirectionsResult.intent : undefined\n  const [directionsLinkError, setDirectionsLinkError] = useState<DirectionsReadResult | undefined>(() => initialDirectionsResult.status !== 'none' && initialDirectionsResult.status !== 'resolved' ? initialDirectionsResult : undefined)\n  const [directionsOpen, setDirectionsOpen] = useState(() => Boolean(initialDirections))")
old="""        if (saving) return
        if (eventsOpen) setEventsOpen(false)
        else if (filtersOpen) setFiltersOpen(false)"""; new="""        if (saving) return
        if (directionsOpen) { setDirectionsOpen(false); return }
        if (eventsOpen) setEventsOpen(false)
        else if (filtersOpen) setFiltersOpen(false)"""; assert old in s; s=s.replace(old,new)
s=s.replace("  }, [eventsOpen, filtersOpen, heading, releaseLocation, saving, selected])", "  }, [directionsOpen, eventsOpen, filtersOpen, heading, releaseLocation, saving, selected])")
s=s.replace("    if (staleLink) return\n", "    if (staleLink || directionsLinkError) return\n")
old="""    if (directionsOpen) return
    if (selected) publish({ poi: selected.uid })"""; new="""    if (directionsOpen) return
    if (heading?.routeFrom && heading.routeTo) {
      const next = directionsUrl({ version: 1, from: heading.routeFrom, to: heading.routeTo, mode: heading.mode ?? directionsMode })
      if (next !== window.location.href) window.history.replaceState(null, '', next)
      return
    }
    if (selected) publish({ poi: selected.uid })"""; assert old in s; s=s.replace(old,new)
s=s.replace("    staleLink,\n    directionsOpen,", "    staleLink,\n    directionsLinkError,\n    directionsOpen,\n    directionsMode,")
old="""      mode: directionsMode,
    })
    arrived.current = false"""; new="""      mode: directionsMode,
      routeFrom: directionsFrom,
      routeTo: directionsTo,
    })
    arrived.current = false"""; assert old in s; s=s.replace(old,new,1)
old="""        mode: directionsMode,
      })
      arrived.current = false"""; new="""        mode: directionsMode,
        routeFrom: routeOrigin,
        routeTo: target.uid ? { kind: 'poi', uid: target.uid } : target.address ? { kind: 'address', address: target.address, position: target.position } : { kind: 'fixed', label: target.name, position: target.position },
      })
      arrived.current = false"""; assert old in s; s=s.replace(old,new,1)
marker="  const navigation = useMemo(() => {\n"; effect="""  useEffect(() => {
    if (!heading?.uid || !data) return
    const latest = data.pois.find((poi) => poi.uid === heading.uid)
    if (!latest) {
      const id = requestAnimationFrame(() => { setProbe('This navigation destination is no longer in the current map.'); setHeading(undefined); releaseLocation('navigation') })
      return () => cancelAnimationFrame(id)
    }
    if (latest.position[0] === heading.position[0] && latest.position[1] === heading.position[1] && latest.name === heading.name && latest.address === heading.address) return
    const id = requestAnimationFrame(() => { arrived.current = false; setHeading((current) => current?.uid === latest.uid ? { ...current, name: latest.name, position: latest.position, address: latest.address, approximate: latest.accuracyClass === 'derived' } : current) })
    return () => cancelAnimationFrame(id)
  }, [data, heading?.address, heading?.name, heading?.position, heading?.uid, releaseLocation])

"""; assert marker in s; s=s.replace(marker,effect+marker,1)
marker="                {staleLink && (\n"; notice="""                {directionsLinkError && (
                  <Paper elevation={0} sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 1.25, pr: 0.5, py: 0.25, border: '1px solid', borderColor: 'divider' }}>
                    <LinkOffIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ flex: 1, color: 'text.secondary' }}>
                      {directionsLinkError.status === 'wrong-year' ? `These directions are for ${directionsLinkError.year ?? 'another data year'} and cannot be applied to the ${DATA_YEAR} map.` : directionsLinkError.status === 'unsupported-version' ? 'This directions link uses a route format this version of Dust Compass does not support.' : 'This directions link is incomplete or malformed.'}
                    </Typography>
                    <Button size="small" onClick={() => { setDirectionsLinkError(undefined); setDirectionsOpen(true) }}>Plan new route</Button>
                    <Button size="small" onClick={() => setDirectionsLinkError(undefined)}>Show map</Button>
                  </Paper>
                )}
"""; assert marker in s; s=s.replace(marker,notice+marker,1)
p.write_text(s)
