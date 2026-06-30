import type { Confidence, LocationType, ServiceWindowAvailabilityStatus } from '../types/dining.js';

export type FoodTruckLocationInput = {
  id: string;
  name: string;
  type?: LocationType;
  address?: string;
  latitude?: number;
  longitude?: number;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
};

export type FoodTruckVendorInput = {
  id: string;
  name: string;
  websiteUrl?: string;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
};

export type FoodTruckServiceWindowInput = {
  id: string;
  schoolId: string;
  date: string;
  meal?: string;
  startTime?: string;
  endTime?: string;
  status: ServiceWindowAvailabilityStatus;
  location: FoodTruckLocationInput;
  vendor?: FoodTruckVendorInput;
  sourceUrl: string;
  sourceUpdatedAt?: string;
  confidence: Confidence;
  isEstimated: boolean;
  metadata?: Record<string, unknown>;
};

export type FoodTruckFetchResult =
  | {
      state: 'adapter_ready';
      schoolId: string;
      sourceUrl: string;
      fetchedAt: string;
      serviceWindows: FoodTruckServiceWindowInput[];
      warnings?: string[];
    }
  | {
      state: 'adapter_pending' | 'unsupported' | 'provider_error';
      schoolId: string;
      sourceUrl: string;
      reason: string;
      error?: string;
    };

export type FoodTruckAdapter = {
  schoolIds: string[];
  sourceUrl: string;
  fetch(date: string, schoolId: string): Promise<FoodTruckFetchResult>;
};
