"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useCrisis } from "@/context/CrisisContext";
import {
  CATEGORY_COLORS,
  getDecayOpacity,
  getDecayStage,
  type CrisisEvent,
  type DecayStage,
} from "@/types/crisis";

type LatLng = [number, number];

/**
 * Quadratic-bezier sampling between two coords. The control point is pushed
 * perpendicular to the chord by an offset that scales with chord length, so
 * longer vectors arc higher and short ones stay flat — preventing overlap.
 */
function buildCurve(src: LatLng, dst: LatLng): LatLng[] {
  const [lat1, lng1] = src;
  const [lat2, lng2] = dst;
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  const chord = Math.sqrt(dLat * dLat + dLng * dLng) || 1;

  const offset = chord * 0.28 + 0.4;
  const px = -dLng / chord;
  const py = dLat / chord;
  const ctrlLat = (lat1 + lat2) / 2 + px * offset;
  const ctrlLng = (lng1 + lng2) / 2 + py * offset;

  const steps = 50;
  const points: LatLng[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    const lat = mt * mt * lat1 + 2 * mt * t * ctrlLat + t * t * lat2;
    const lng = mt * mt * lng1 + 2 * mt * t * ctrlLng + t * t * lng2;
    points.push([lat, lng]);
  }
  return points;
}

function nodeIcon(color: string, stage: DecayStage, pulse: boolean): L.DivIcon {
  const op = getDecayOpacity(stage);
  const staticClass = stage === "recent" ? "gp-static" : "";
  return L.divIcon({
    className: "gp-divicon",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<div class="gp-node ${staticClass}" style="--node-color:${color}; opacity:${op}">
      ${pulse ? '<span class="gp-node-pulse"></span>' : ""}
      <span class="gp-node-dot"></span>
    </div>`,
  });
}

function unrestIcon(color: string, stage: DecayStage): L.DivIcon {
  const op = getDecayOpacity(stage);
  const staticClass = stage === "recent" ? "gp-static" : "";
  return L.divIcon({
    className: "gp-divicon",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<div class="gp-rings ${staticClass}" style="--ring-color:${color}; opacity:${op}">
      <span class="gp-ring r1"></span>
      <span class="gp-ring r2"></span>
      <span class="gp-ring r3"></span>
      <span class="gp-core"></span>
    </div>`,
  });
}

function FlyController({
  events,
  selectedEventId,
}: {
  events: CrisisEvent[];
  selectedEventId: string | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!selectedEventId) return;
    const target = events.find((event) => event.id === selectedEventId);
    if (!target) return;
    map.flyTo(target.sourceCoords, Math.max(map.getZoom(), 6), {
      duration: 1.5,
      easeLinearity: 0.25,
    });
  }, [selectedEventId, events, map]);
  return null;
}

function VectorEvent({
  event,
  stage,
  selected,
}: {
  event: CrisisEvent;
  stage: DecayStage;
  selected: boolean;
}) {
  const color = CATEGORY_COLORS[event.type];
  const opacity = getDecayOpacity(stage);
  const curve = useMemo(
    () => (event.targetCoords ? buildCurve(event.sourceCoords, event.targetCoords) : null),
    [event.sourceCoords, event.targetCoords],
  );
  const staticClass = stage === "recent" ? "gp-static" : "";
  const baseWeight = selected ? 4 : 2.5;
  const pulseWeight = selected ? 5 : 3.5;

  return (
    <>
      {curve && (
        <>
          <Polyline
            positions={curve}
            pathOptions={{
              color,
              weight: baseWeight,
              opacity: opacity * 0.5,
              className: "gp-vector-base",
            }}
          />
          <Polyline
            positions={curve}
            pathOptions={{
              color,
              weight: pulseWeight,
              opacity,
              className: `gp-vector-pulse ${staticClass}`,
            }}
          />
        </>
      )}
      <Marker
        position={event.sourceCoords}
        icon={nodeIcon(color, stage, stage === "fresh")}
        zIndexOffset={selected ? 1000 : 0}
      >
        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
          <span className="text-xs font-semibold">{event.title}</span>
        </Tooltip>
      </Marker>
      {event.targetCoords && (
        <Marker
          position={event.targetCoords}
          icon={nodeIcon(color, stage, stage === "fresh")}
        />
      )}
    </>
  );
}

function UnrestEvent({
  event,
  stage,
  selected,
}: {
  event: CrisisEvent;
  stage: DecayStage;
  selected: boolean;
}) {
  const color = CATEGORY_COLORS.unrest;
  return (
    <Marker
      position={event.sourceCoords}
      icon={unrestIcon(color, stage)}
      zIndexOffset={selected ? 1000 : 0}
    >
      <Tooltip direction="top" offset={[0, -12]} opacity={1}>
        <span className="text-xs font-semibold">{event.title}</span>
      </Tooltip>
    </Marker>
  );
}

export default function GeoPulseMap() {
  const { activeEvents, selectedEventId, selectedCategoryFilter, nowMs } = useCrisis();

  const renderable = useMemo(() => {
    return activeEvents
      .map((event) => ({ event, stage: getDecayStage(event.timestamp, nowMs) }))
      .filter(({ stage }) => stage !== "archived")
      .filter(
        ({ event }) =>
          selectedCategoryFilter === "all" || event.type === selectedCategoryFilter,
      );
  }, [activeEvents, selectedCategoryFilter, nowMs]);

  return (
    <MapContainer
      center={[24, 40]}
      zoom={3}
      minZoom={2}
      maxZoom={9}
      worldCopyJump
      zoomControl
      className="h-full w-full"
      preferCanvas={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
        subdomains="abcd"
        maxZoom={20}
      />
      <FlyController events={activeEvents} selectedEventId={selectedEventId} />
      {renderable.map(({ event, stage }) =>
        event.type === "unrest" ? (
          <UnrestEvent
            key={event.id}
            event={event}
            stage={stage}
            selected={event.id === selectedEventId}
          />
        ) : (
          <VectorEvent
            key={event.id}
            event={event}
            stage={stage}
            selected={event.id === selectedEventId}
          />
        ),
      )}
    </MapContainer>
  );
}
