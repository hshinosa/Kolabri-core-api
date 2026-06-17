import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        exportJob: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    },
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
}));

import { DataExportService } from './data-export.service.js';

type ProcessExport = (jobId: string, userId: string, exportType: string, courseId?: string) => Promise<void>;

const originalProcessExport = Reflect.get(DataExportService, 'processExport') as ProcessExport;

describe('DataExportService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Reflect.set(DataExportService, 'processExport', originalProcessExport);
    });

    it('allows a new export when only failed jobs exist in the last 24 hours', async () => {
        const processMock = vi.fn().mockResolvedValue(undefined);
        Reflect.set(DataExportService, 'processExport', processMock);

        prismaMock.exportJob.findFirst.mockImplementation(async (args: { where?: { status?: string | { in: string[] } } }) => {
            if (typeof args.where?.status === 'object') {
                return null;
            }
            if (args.where?.status === 'completed') {
                return null;
            }
            return { id: 'failed-export', status: 'failed' };
        });
        prismaMock.exportJob.create.mockResolvedValue({ id: 'new-export', status: 'pending' });

        await expect(DataExportService.requestExport('user-1')).resolves.toEqual({
            jobId: 'new-export',
            status: 'pending',
        });

        expect(prismaMock.exportJob.create).toHaveBeenCalledWith({
            data: { userId: 'user-1', exportType: 'USER_DATA', courseId: undefined, status: 'pending' },
        });
        expect(processMock).toHaveBeenCalledWith('new-export', 'user-1', 'USER_DATA', undefined);
    });
});
