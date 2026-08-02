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

export interface TileDoc {
  strengths: Record<string, number>;
  gh6: string;
  lat: number;
  lng: number;
  updatedAt: number;
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
  claimedTiles: number;
  lat?: number;
  lng?: number;
  accuracy?: number;
  mocked?: boolean;
  path?: LatLng[];
}
