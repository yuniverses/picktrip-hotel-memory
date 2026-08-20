"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import type mapboxgl from "mapbox-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MapPin } from "@/src/domain/schemas";
import type { DisplayHotel } from "@/src/lib/picktrip/hotel-commerce";
import {
  buildHotelMapMarkerSpecs,
  type HotelMapMarkerSpec,
  markerAnchorForKind,
  markerBoundsKey,
  mergeMarkerClassNames,
} from "./hotel-map-state";

export function HotelMap({
  hotels,
  aiPins,
  selectedId,
  onSelect,
}: {
  hotels: DisplayHotel[];
  aiPins: MapPin[];
  selectedId: string | null;
  onSelect: (id: string, kind: MapPin["kind"]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapboxRef = useRef<typeof import("mapbox-gl").default | null>(null);
  const markersRef = useRef(new Map<string, mapboxgl.Marker>());
  const onSelectRef = useRef(onSelect);
  const lastBoundsKeyRef = useRef("");
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const specs = useMemo(() => buildHotelMapMarkerSpecs(hotels, aiPins), [hotels, aiPins]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    void import("mapbox-gl")
      .then(({ default: mapbox }) => {
        if (disposed || !containerRef.current) return;
        mapbox.accessToken = token;
        mapboxRef.current = mapbox;
        const map = new mapbox.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [139.7671, 35.6812],
          zoom: 11.8,
        });
        map.addControl(new mapbox.NavigationControl({ showCompass: false }), "bottom-right");
        resizeObserver = new ResizeObserver(() => map.resize());
        resizeObserver.observe(containerRef.current);
        map.once("load", () => {
          if (!disposed) setMapReady(true);
        });
        map.once("error", () => {
          if (!disposed && !map.loaded()) setError("The map could not be loaded.");
        });
        mapRef.current = map;
      })
      .catch(() => setError("This device could not start the Mapbox map."));
    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      setMapReady(false);
      for (const marker of markersRef.current.values()) marker.remove();
      markersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      mapboxRef.current = null;
      lastBoundsKeyRef.current = "";
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    const mapbox = mapboxRef.current;
    if (!mapReady || !map || !mapbox) return;
    const byId = new Map(specs.map((spec) => [spec.id, spec]));
    for (const [id, marker] of markersRef.current) {
      if (!byId.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
    for (const [id, spec] of byId) {
      const existing = markersRef.current.get(id);
      if (existing) {
        existing.setLngLat([spec.longitude, spec.latitude]);
        updateMarkerElement(existing.getElement(), spec, selectedId === spec.entityId);
        continue;
      }
      const element = document.createElement("button");
      element.type = "button";
      updateMarkerElement(element, spec, selectedId === spec.entityId);
      element.addEventListener("click", () => onSelectRef.current(spec.entityId, spec.kind));
      markersRef.current.set(
        id,
        new mapbox.Marker({ element, anchor: markerAnchorForKind(spec.kind) })
          .setLngLat([spec.longitude, spec.latitude])
          .addTo(map),
      );
    }
    const boundsKey = markerBoundsKey(specs);
    if (specs.length > 0 && boundsKey !== lastBoundsKeyRef.current) {
      const bounds = new mapbox.LngLatBounds();
      for (const spec of specs) bounds.extend([spec.longitude, spec.latitude]);
      map.fitBounds(bounds, { padding: 76, maxZoom: 14, duration: 650 });
      lastBoundsKeyRef.current = boundsKey;
    }
  }, [mapReady, specs, selectedId]);

  if (!token) {
    return (
      <div className="map-fallback">
        <div className="fallback-grid" />
        <strong>Mapbox is not configured</strong>
        <span className="fallback-copy">
          Add a public Mapbox token to display hotel and AI pins.
        </span>
      </div>
    );
  }
  if (error) return <div className="map-fallback">{error}</div>;
  return (
    <div className="map-surface">
      <div ref={containerRef} className="map-canvas" role="application" aria-label="Hotel map" />
      {!mapReady ? <div className="map-loading">Loading map…</div> : null}
    </div>
  );
}

function updateMarkerElement(element: HTMLElement, spec: HotelMapMarkerSpec, selected: boolean) {
  element.className = mergeMarkerClassNames(element.className, spec, selected);
  element.setAttribute("aria-label", `${spec.title}. ${spec.reason}`);
  element.title = `${spec.title} · ${spec.reason}`;
  element.textContent = spec.label;
}
