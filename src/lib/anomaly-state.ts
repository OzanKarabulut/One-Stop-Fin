export type DropState = "recovery" | "continuing";

export function classifyDropState(drop1d: number): DropState {
  return drop1d >= 0 ? "recovery" : "continuing";
}
