import { useEffect, useState } from 'react';
import { useMapsLibrary, APIProvider } from '@vis.gl/react-google-maps';
import { GOOGLE_MAPS_API_KEY, hasValidMapsKey } from '../lib/maps';
import { Clock } from 'lucide-react';

interface WalkETAProps {
  origin: { lat: number; lng: number } | null | undefined;
  destination: { lat: number; lng: number };
}

function ETACalculator({ origin, destination }: WalkETAProps) {
  const routesLib = useMapsLibrary('routes');
  const [eta, setEta] = useState<string | null>(null);

  useEffect(() => {
    if (!routesLib || !origin || !destination) return;

    routesLib.Route.computeRoutes({
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      travelMode: 'DRIVING', // Assuming the walker might use a vehicle or we just want a standard estimate
      fields: ['durationMillis'],
    }).then(({ routes }) => {
      if (routes?.[0]?.durationMillis) {
        const duration = typeof routes[0].durationMillis === 'string' 
          ? parseInt(routes[0].durationMillis) 
          : routes[0].durationMillis;
        const minutes = Math.ceil(duration / 60000);
        setEta(`${minutes} min`);
      }
    }).catch(err => {
      console.error("Error calculating ETA:", err);
    });
  }, [routesLib, origin, destination]);

  if (!eta || !origin) return null;

  return (
    <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-blue-600 ring-1 ring-blue-100 animate-pulse">
      <Clock size={14} />
      <span className="text-xs font-bold">Llega en {eta}</span>
    </div>
  );
}

export default function WalkETA(props: WalkETAProps) {
  if (!hasValidMapsKey) return null;

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
      <ETACalculator {...props} />
    </APIProvider>
  );
}
