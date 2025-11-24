'use client';

import { useEffect, useRef } from 'react';
import Script from 'next/script';

type GoogleMapProps = {
  lat: number;
  lng: number;
  zoom?: number;
};

declare global {
  interface Window {
    initMap?: () => void;
  }
}

export default function GoogleMap({ lat, lng, zoom = 15 }: GoogleMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);

  // Esta función se llama cuando el script de Google Maps termina de cargar
  const handleScriptLoad = () => {
    if (!mapRef.current) return;
    if (!(window as any).google) return;

    const center = { lat, lng };

    const map = new (window as any).google.maps.Map(mapRef.current, {
      center,
      zoom,
      disableDefaultUI: false,
    });

    new (window as any).google.maps.Marker({
      position: center,
      map,
    });
  };

  return (
    <>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
        strategy="afterInteractive"
        onLoad={handleScriptLoad}
      />
      <div
        ref={mapRef}
        className="w-full h-72 rounded-xl border border-slate-300"
      />
    </>
  );
}
