/**
 * Demo operator key for mutating requests (X-Operator-Key). Entered by the operator at runtime and
 * kept in sessionStorage only — never bundled, logged, or sent anywhere except the backend.
 */
const KEY = "freshflow.operatorKey";
let memory: string | null = null;
const listeners = new Set<() => void>();

export function getOperatorKey(): string | null {
  try {
    return sessionStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function setOperatorKey(value: string | null) {
  memory = value;
  try {
    if (value) sessionStorage.setItem(KEY, value);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: keep in memory for this tab */
  }
  listeners.forEach((l) => l());
}

export function onOperatorKeyChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
