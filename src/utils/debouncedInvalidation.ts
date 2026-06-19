import { invalidateDashboardCache } from '../services/dashboard.service.js';

let pendingTimeout: NodeJS.Timeout | null = null;
const DEBOUNCE_MS = 5000;

export function debouncedInvalidateDashboard(): void {
    if (pendingTimeout) return; // Already scheduled
    pendingTimeout = setTimeout(() => {
        invalidateDashboardCache();
        pendingTimeout = null;
    }, DEBOUNCE_MS);
}
