// 型定義ファイル
declare global {
  interface Window {
    google: any;
    fullRouteStops?: any[];
  }
}

export type PassedStopRecord = {
  stopId: string;
  stopName: string;
  passTime: Date;
  scheduledTime?: string;
  delay: number;
  username?: string;
  userId?: string;
  inferred?: boolean;
};

export type BusStop = {
  stop_id: string;
  stop_name: string;
  stop_lat: string | number;
  stop_lon: string | number;
  seq?: string | number;
  arrival_time?: string;
  departure_time?: string;
  isBeforeStart?: boolean;
};

export type TripInfo = {
  trip_id: string;
  route_short_name?: string;
  route_long_name?: string;
  trip_headsign?: string;
  stops?: BusStop[];
};

export type RiderLocation = {
  id: string;
  username: string;
  lat: number;
  lng: number;
  timestamp: Date;
  tripId: string;
  lastSeen?: Date;
};

export type SearchResult = {
  type: 'stop' | 'place';
  stop_id?: string;
  stop_name?: string;
  place_name?: string;
  stop_lat?: number;
  stop_lon?: number;
  lat?: number;
  lng?: number;
  display_name?: string;
};

export type DelayInfo = {
  delay_seconds?: number;
  estimated_arrival?: string;
};

export type ValidationResult = {
  valid: boolean;
  reason?: string;
};
