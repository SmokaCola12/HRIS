export function calculateTardinessPoints(lateMinutes: number): number {
  const minutes = Math.max(0, Math.floor(Number(lateMinutes) || 0));
  if (minutes === 0) return 0;
  if (minutes <= 10) return 0.2;
  if (minutes <= 20) return 0.4;
  if (minutes <= 30) return 0.6;
  return 1;
}

