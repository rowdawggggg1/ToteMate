"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";

export type AddressMapPreviewProps = {
  lat: number;
  lng: number;
  /** Fired with the new point whenever the pin is dragged to a new spot. */
  onPinMoved: (lat: number, lng: number) => void;
  className?: string;
};

/**
 * Patch 5: shows the resolved point for an address on an OpenStreetMap
 * tile map, with a draggable pin -- so a customer whose address resolved
 * ambiguously (or just plain wrong) can fix it right here, without going
 * back to re-type the address and without ever leaving the booking form.
 * Dragging the pin doesn't change the saved address text, just the exact
 * point used for delivery/pickup distance pricing (see
 * CreateBookingInput.deliveryLatLngOverride in lib/orders.ts).
 *
 * Deliberately plain Leaflet + OpenStreetMap's free tile server (no API
 * key, no paid mapping dependency) rather than a commercial maps SDK --
 * consistent with keeping this app's running costs low.
 *
 * Leaflet is imported dynamically, inside useEffect, rather than as a
 * normal top-level import -- Leaflet's module touches `document` as soon
 * as it loads (browser-feature detection), which throws during Next.js's
 * server-side render of this page. A dynamic import only ever runs in the
 * browser, after this component has mounted.
 */
export function AddressMapPreview({ lat, lng, onPinMoved, className }: AddressMapPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const onPinMovedRef = useRef(onPinMoved);
  onPinMovedRef.current = onPinMoved;
  // Latest desired point, read by the async setup effect below in case
  // lat/lng changed again before the dynamic import finished resolving.
  const latestPointRef = useRef({ lat, lng });
  latestPointRef.current = { lat, lng };

  // Create the map once, after dynamically loading Leaflet client-side.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    void import("leaflet").then((leafletModule) => {
      if (cancelled || mapRef.current) return;
      const L = leafletModule.default;

      // See the file-level comment for why this is an inline SVG rather
      // than Leaflet's default marker images -- those reference image
      // files by a relative path that Next.js's build doesn't copy over,
      // which silently produces a broken-image pin.
      const pinIcon = L.divIcon({
        className: "",
        html: `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 26 16 26s16-15 16-26c0-8.8-7.2-16-16-16z" fill="#c0392b"/>
          <circle cx="16" cy="16" r="6" fill="#fff"/>
        </svg>`,
        iconSize: [32, 42],
        iconAnchor: [16, 42],
      });

      const { lat: startLat, lng: startLng } = latestPointRef.current;
      const map = L.map(container, {
        center: [startLat, startLng],
        zoom: 16,
        scrollWheelZoom: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([startLat, startLng], { icon: pinIcon, draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onPinMovedRef.current(pos.lat, pos.lng);
      });

      mapRef.current = map;
      markerRef.current = marker;
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Intentionally only runs once -- lat/lng changes after that are
    // handled by the effect below via setView/setLatLng, not a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-center the map and pin whenever the resolved address changes (e.g.
  // the customer edited the address and it was re-geocoded).
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    mapRef.current.setView([lat, lng]);
    markerRef.current.setLatLng([lat, lng]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height: 220, borderRadius: 12 }}
    />
  );
}
