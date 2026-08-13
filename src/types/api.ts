export interface Vehicle {
  id: string;
  displayName: string;
  make: string;
  model: string;
  year?: number;
  color: string;
}

export interface VehiclesResponse {
  vehicles: Vehicle[];
}

export const PARKED_AT_HOME_EVENT_TYPE = 'parked_at_home' as const;
export type ParkedAtHomeEventType = typeof PARKED_AT_HOME_EVENT_TYPE;

export interface ParkedAtHomeEvent {
  id: string;
  type: ParkedAtHomeEventType;
  vehicleId: string;
  occurredAt: string;
  expiresAt: string;
}

export interface ParkedAtHomeEventsResponse {
  events: ParkedAtHomeEvent[];
}
