import { useEffect, useRef, useState } from 'react'

type Coordinates = { lat: number; lng: number }
type MapSurface = { fitBounds: (bounds: unknown) => void }
type RoutePolyline = { setMap: (map: MapSurface | null) => void }
type RouteMarker = { map: MapSurface | null }
type ComputedRoute = {
  distanceMeters?: number
  durationMillis?: number
  viewport?: unknown
  createPolylines: () => RoutePolyline[]
  createWaypointAdvancedMarkers: (options: { map: MapSurface }) => Promise<RouteMarker[]>
  legs?: Array<{ endLocation?: Coordinates }>
}
type GoogleMapsRuntime = {
  maps?: {
    importLibrary: (name: string) => Promise<Record<string, unknown>>
  }
}
type MapsWindow = Window & { google?: GoogleMapsRuntime }
type MapLibrary = {
  Map: new (element: HTMLElement, options: { center: Coordinates; zoom: number; mapId: string }) => MapSurface
}
type RoutesLibrary = {
  Route: {
    computeRoutes: (request: {
      origin: string
      destination: string
      travelMode: 'DRIVING'
      fields: string[]
    }) => Promise<{ routes?: ComputedRoute[] }>
  }
}

const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
const warehouseAddress = 'Pamantasan ng Lungsod ng Maynila, Intramuros, Manila, Philippines'
let mapsLoadPromise: Promise<GoogleMapsRuntime> | null = null

function loadGoogleMaps(): Promise<GoogleMapsRuntime> {
  const runtime = window as MapsWindow
  if (runtime.google?.maps?.importLibrary) return Promise.resolve(runtime.google)
  if (mapsLoadPromise) return mapsLoadPromise

  mapsLoadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-maps-api]')
    const script = existingScript ?? document.createElement('script')
    script.async = true
    script.dataset.googleMapsApi = 'true'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsKey ?? '')}&v=weekly&loading=async`
    script.onload = () => {
      const google = runtime.google
      if (google?.maps?.importLibrary) resolve(google)
      else reject(new Error('Google Maps loaded without its Maps JavaScript API.'))
    }
    script.onerror = () => reject(new Error('Google Maps could not load. Check the API key and enabled APIs.'))
    if (!existingScript) document.head.append(script)
  })

  return mapsLoadPromise
}

export default function GoogleRoutePreview({
  destination,
  onRoute,
}: {
  destination: string
  onRoute: (distanceKm: number | null) => void
}) {
  const mapElement = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState('Enter a complete shipping address to calculate a Google Maps driving route.')
  const [routeInfo, setRouteInfo] = useState<{ km: number; minutes: number | null; endpoint: Coordinates | null } | null>(null)
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(warehouseAddress)}&destination=${encodeURIComponent(destination || 'Manila, Philippines')}&travelmode=driving`

  useEffect(() => {
    let cancelled = false
    let polylines: RoutePolyline[] = []
    let markers: RouteMarker[] = []

    setRouteInfo(null)
    onRoute(null)

    if (!destination.trim()) {
      setMessage('Enter a complete shipping address to calculate a Google Maps driving route.')
      return
    }

    if (!mapsKey) {
      setMessage('Google Maps routing needs an API key. Use the link below to check this address in Google Maps meanwhile.')
      return
    }

    setMessage('Finding the address and calculating the driving route…')

    void (async () => {
      try {
        const google = await loadGoogleMaps()
        const mapsLibrary = await google.maps!.importLibrary('maps') as unknown as MapLibrary
        const routesLibrary = await google.maps!.importLibrary('routes') as unknown as RoutesLibrary
        if (cancelled || !mapElement.current) return

        const map = new mapsLibrary.Map(mapElement.current, {
          center: { lat: 14.5896, lng: 120.9787 },
          zoom: 12,
          mapId: 'DEMO_MAP_ID',
        })
        const { routes } = await routesLibrary.Route.computeRoutes({
          origin: warehouseAddress,
          destination,
          travelMode: 'DRIVING',
          fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
        })
        if (cancelled) return
        const route = routes?.[0]
        if (!route?.distanceMeters) {
          setMessage('Google Maps could not find a drivable route to this address. Check the address or choose hub pickup.')
          return
        }

        polylines = route.createPolylines()
        polylines.forEach((polyline) => polyline.setMap(map))
        markers = await route.createWaypointAdvancedMarkers({ map })
        if (cancelled) {
          polylines.forEach((polyline) => polyline.setMap(null))
          markers.forEach((marker) => { marker.map = null })
          return
        }
        if (route.viewport) map.fitBounds(route.viewport)

        const km = route.distanceMeters / 1000
        const endpoint = route.legs?.[0]?.endLocation ?? null
        setRouteInfo({ km, minutes: route.durationMillis ? Math.round(route.durationMillis / 60_000) : null, endpoint })
        setMessage('Google Maps driving route found. Check the destination pin against the address you entered.')
        onRoute(km)
      } catch (error) {
        if (cancelled) return
        setMessage(error instanceof Error ? error.message : 'Google Maps could not calculate this route.')
        onRoute(null)
      }
    })()

    return () => {
      cancelled = true
      polylines.forEach((polyline) => polyline.setMap(null))
      markers.forEach((marker) => { marker.map = null })
    }
  }, [destination, onRoute])

  return (
    <section className="checkout-route-preview" aria-label="Google Maps delivery route">
      <div className="checkout-route-heading">
        <div><span className="prepared-eyebrow">Google Maps route</span><h3>From PLM warehouse</h3></div>
        <span>{routeInfo ? `${routeInfo.km.toFixed(1)} km` : 'Route pending'}</span>
      </div>
      {mapsKey
        ? <div className="checkout-google-map" ref={mapElement} role="region" aria-label="Google Maps driving route from the PLM warehouse to your delivery address" />
        : <div className="checkout-google-map checkout-google-map-empty"><span>Google Maps will show the verified road route and destination pin here after its key is connected.</span></div>}
      <div className="checkout-route-summary">
        <span>Google driving distance</span><strong>{routeInfo ? `${routeInfo.km.toFixed(1)} km` : 'Waiting for route'}</strong>
        <span>Google driving time</span><strong>{routeInfo?.minutes ? `About ${routeInfo.minutes} min` : 'Not available yet'}</strong>
        {routeInfo?.endpoint && <><span>Road endpoint pin</span><strong>{routeInfo.endpoint.lat.toFixed(5)}, {routeInfo.endpoint.lng.toFixed(5)}</strong></>}
        <span>Delivery fee</span><strong>{routeInfo ? 'Based on route distance' : 'Calculated when route is found'}</strong>
      </div>
      <p>{message}</p>
      <p>Route distance is from Google Maps. The fee uses AquaShield’s distance bands, not a courier’s live quote.</p>
      <a className="checkout-map-link" href={directionsUrl} target="_blank" rel="noreferrer">Open this route in Google Maps</a>
    </section>
  )
}
