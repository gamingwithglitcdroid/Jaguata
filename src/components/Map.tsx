import { useEffect, useState, useRef } from 'react';
import { APIProvider, Map as GoogleMap, AdvancedMarker, Pin, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { GOOGLE_MAPS_API_KEY, hasValidMapsKey as hasValidKey } from '../lib/maps';

interface MapProps {
  center: { lat: number; lng: number };
  zoom?: number;
  markers?: { lat: number; lng: number; title?: string; type?: 'walker' | 'pickup' }[];
  path?: { lat: number; lng: number }[];
  onLocationSelect?: (lat: number, lng: number) => void;
  readOnly?: boolean;
}

function MapEvents({ onLocationSelect }: { onLocationSelect?: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !onLocationSelect) return;
    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        onLocationSelect(e.latLng.lat(), e.latLng.lng());
      }
    });
    return () => google.maps.event.removeListener(listener);
  }, [map, onLocationSelect]);
  return null;
}

function Polyline({ path }: { path: { lat: number; lng: number }[] }) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const polyRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || !path || path.length < 2 || !mapsLib) return;

    if (polyRef.current) {
      polyRef.current.setMap(null);
    }

    polyRef.current = new mapsLib.Polyline({
      path,
      geodesic: true,
      strokeColor: '#f97316',
      strokeOpacity: 0.8,
      strokeWeight: 4,
    });

    polyRef.current.setMap(map);

    return () => {
      if (polyRef.current) polyRef.current.setMap(null);
    };
  }, [map, path, mapsLib]);

  return null;
}

export default function Map({ center, zoom = 15, markers = [], path = [], onLocationSelect, readOnly = false }: MapProps) {
  if (!hasValidKey) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-50 p-6 text-center font-sans dark:bg-slate-900 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-3xl">
        <div className="max-w-md">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Google Maps API Key Requerida</h2>
          <p className="text-sm text-gray-500 mb-4">Para ver el mapa interactivo, por favor configura tu clave de API:</p>
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl text-left text-xs space-y-3 shadow-sm border border-gray-100 dark:border-slate-700">
            <p>1. Obtén una clave en <a href="https://console.cloud.google.com/google/maps-apis/start" target="_blank" rel="noopener" className="text-orange-500 underline">Google Cloud Console</a></p>
            <p>2. En AI Studio, abre <strong>Settings</strong> (⚙️) → <strong>Secrets</strong></p>
            <p>3. Agrega <code>GOOGLE_MAPS_PLATFORM_KEY</code> con tu clave.</p>
          </div>
          <p className="mt-4 text-[10px] text-gray-400">La aplicación se reiniciará automáticamente al guardar.</p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
      <GoogleMap
        defaultCenter={center}
        center={center}
        defaultZoom={zoom}
        mapId="DEMO_MAP_ID"
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%' }}
        disableDefaultUI={readOnly}
        gestureHandling={readOnly ? 'none' : 'greedy'}
      >
        {markers.map((marker, idx) => (
          <AdvancedMarker key={idx} position={{ lat: marker.lat, lng: marker.lng }} title={marker.title}>
            {marker.type === 'walker' ? (
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 p-1 shadow-lg ring-4 ring-white transition-all scale-110">
                <img src="https://cdn-icons-png.flaticon.com/512/3047/3047928.png" className="h-full w-full object-contain" alt="Paseador" />
                <div className="absolute -bottom-1 -right-1 h-3 w-3 animate-ping rounded-full bg-orange-500" />
              </div>
            ) : marker.type === 'pickup' ? (
              <Pin background="#f97316" glyphColor="#fff" />
            ) : (
              <Pin background="#4285F4" glyphColor="#fff" />
            )}
          </AdvancedMarker>
        ))}
        {path && path.length > 1 && <Polyline path={path} />}
        {!readOnly && onLocationSelect && <MapEvents onLocationSelect={onLocationSelect} />}
      </GoogleMap>
    </APIProvider>
  );
}
