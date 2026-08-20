import type { MapPin, PinOperation } from "./schemas";

export type HotelUiState = {
  destination: string;
  threadId: string;
  pins: MapPin[];
  recalledPreferences: Array<{ id: string; statement: string }>;
};

export type HotelUiAction =
  | { type: "apply-pin-operations"; operations: PinOperation[] }
  | { type: "preferences-recalled"; preferences: Array<{ id: string; statement: string }> }
  | { type: "destination-changed"; destination: string; threadId: string };

export function createInitialHotelState(destination: string): HotelUiState {
  return { destination, threadId: crypto.randomUUID(), pins: [], recalledPreferences: [] };
}

export function reducePins(current: MapPin[], operations: PinOperation[]): MapPin[] {
  const byId = new Map(current.map((pin) => [pin.id, pin]));
  for (const operation of operations) {
    if (operation.operation === "clear") {
      byId.clear();
    } else if (operation.operation === "remove") {
      for (const id of operation.pinIds) byId.delete(id);
    } else {
      for (const pin of operation.pins) byId.set(pin.id, pin);
    }
  }
  return [...byId.values()];
}

export function reduceHotelState(state: HotelUiState, action: HotelUiAction): HotelUiState {
  if (action.type === "apply-pin-operations") {
    return { ...state, pins: reducePins(state.pins, action.operations) };
  }
  if (action.type === "preferences-recalled") {
    return { ...state, recalledPreferences: action.preferences };
  }
  return {
    ...state,
    destination: action.destination,
    threadId: action.threadId,
    pins: [],
  };
}
