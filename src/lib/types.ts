import type { LatLng } from './geo';

export interface WalkUser {
  uid: string;
  name: string;
  email?: string;
  avatar?: string;
  totalDistanceKm: number;
  totalSteps: number;
  territoryScore: number;
  distinctTiles: number;
  lastActiveAt: number;
  createdAt: number;
  isPro: boolean;
}

export interface TerritoryDoc {
  id: string;
  ownerId: string;
  ring: LatLng[];
  center: LatLng;
  gh5: string;
  areaM2: number;
  createdAt: number;
}

export interface TerritoryPolygon {
  ring: [number, number][];
  color: string;
  ownerId: string;
}

export interface WalkStats {
  distanceM: number;
  steps: number;
  speedMps: number;
  lat?: number;
  lng?: number;
  accuracy?: number;
  heading?: number;
  mocked?: boolean;
  path?: LatLng[];
}
