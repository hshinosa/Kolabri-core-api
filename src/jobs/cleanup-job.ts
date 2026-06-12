import { AccountDeletionService } from '../services/account-deletion.service.js';
import { DataExportService } from '../services/data-export.service.js';

export async function runCleanupJobs() {
    console.log('[Cleanup] Starting scheduled cleanup...');

    const accountResult = await AccountDeletionService.cleanupExpiredData();
    console.log(`[Cleanup] Hard deleted ${accountResult.deletedAccounts} expired accounts`);

    const exportResult = await DataExportService.cleanupExpiredExports();
    console.log(`[Cleanup] Cleaned ${exportResult.cleaned} expired export files`);

    return {
        deletedAccounts: accountResult.deletedAccounts,
        cleanedExports: exportResult.cleaned,
    };
}
