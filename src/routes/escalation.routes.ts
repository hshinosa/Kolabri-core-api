import { Router } from 'express';
import mongoose from 'mongoose';
import { verifyToken, requireLecturer } from '../middleware/auth.js';
import { EscalationState } from '../models/EscalationState.js';
import { resolveState } from '../services/escalation.service.js';

const router = Router();

const isValidObjectId = (id: string): boolean => mongoose.Types.ObjectId.isValid(id);

router.use(verifyToken);
router.use(requireLecturer);

router.get('/', async (req, res, next) => {
    try {
        const { courseId, groupId, stage, issueType } = req.query as Record<string, string>;
        const filter: Record<string, unknown> = {};

        if (courseId) filter.courseId = courseId;
        if (groupId) filter.groupId = groupId;
        if (stage) filter.currentStage = stage;
        if (issueType) filter.issueType = issueType;

        const escalations = await EscalationState.find(filter)
            .sort({ updatedAt: -1 })
            .limit(100)
            .lean();

        res.json({ data: escalations });
    } catch (error) {
        next(error);
    }
});

router.post('/:id/resolve', async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return res.status(404).json({ message: 'Escalation not found' });
        const user = (req as any).user;
        const reason = req.body?.reason || 'Manually resolved by lecturer';

        const state = await EscalationState.findById(id);
        if (!state) {
            return res.status(404).json({ message: 'Escalation not found' });
        }

        if (state.currentStage === 'resolved') {
            return res.json({ success: true, data: state });
        }

        const updated = await resolveState(state, user?.userId || 'unknown', reason);

        res.json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
});

export default router;
