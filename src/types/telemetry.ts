export type WindowPositionState = 'open' | 'closed' | 'unknown';

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

export interface WindowsValue {
  frontLeft: WindowPositionState;
  frontRight: WindowPositionState;
  rearLeft: WindowPositionState;
  rearRight: WindowPositionState;
}

export interface WindowsSignal {
  value: WindowsValue;
  allClosed: boolean;
  oemUpdatedAt: string;
  retrievedAt: string;
}

export interface VehicleTelemetry {
  vehicleId: string;
  capabilities: {
    windows: boolean;
  };
  signals?: {
    windows?: WindowsSignal;
  };
}
