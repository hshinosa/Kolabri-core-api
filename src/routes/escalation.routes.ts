import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { verifyToken, requireLecturer } from "../middleware/auth.js";
import { EscalationState } from "../models/EscalationState.js";
import { resolveState } from "../services/escalation.service.js";
import { validateQuery } from "../validators/validate.js";
import prisma from "../config/database.js";

const router = Router();

const isValidObjectId = (id: string): boolean =>
  mongoose.Types.ObjectId.isValid(id);

/**
 * M8: strict query schema. Only known keys with safe value shapes reach the
 * Mongo filter, which closes the operator-injection hole in `?courseId=...`.
 */
const escalationListQuerySchema = z.object({
  courseId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  stage: z
    .enum(["new", "nudge", "probe-blocker", "flag-lecturer", "resolved"])
    .optional(),
  issueType: z
    .enum(["silence", "low_quality", "unresolved_blocker"])
    .optional(),
});

interface Actor {
  userId?: string;
  role?: string;
}

const isAdmin = (actor: Actor | undefined): boolean => actor?.role === "admin";

/**
 * M8: an escalation is only visible/mutable by the course owner (admins pass).
 * Returns true when the actor may proceed; false when it must be rejected.
 */
async function ownsCourse(
  actor: Actor | undefined,
  courseId: string,
): Promise<boolean> {
  if (!actor?.userId) return false;
  if (isAdmin(actor)) return true;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { ownerId: true },
  });

  return course?.ownerId === actor.userId;
}

async function ownedCourseIds(userId: string): Promise<string[]> {
  const courses = await prisma.course.findMany({
    where: { ownerId: userId },
    select: { id: true },
  });
  return courses.map((course) => course.id);
}

router.use(verifyToken);
router.use(requireLecturer);

router.get(
  "/",
  validateQuery(escalationListQuerySchema),
  async (req, res, next) => {
    try {
      const { courseId, groupId, stage, issueType } = req.query as z.infer<
        typeof escalationListQuerySchema
      >;
      const actor = (req as { user?: Actor }).user;
      const filter: Record<string, unknown> = {};

      if (stage) filter.currentStage = stage;
      if (issueType) filter.issueType = issueType;
      if (groupId) filter.groupId = groupId;

      if (courseId) {
        // M8: explicit course filter must point at a course the lecturer owns.
        if (!(await ownsCourse(actor, courseId))) {
          return res
            .status(403)
            .json({ message: "You do not own this course" });
        }
        filter.courseId = courseId;
      } else if (!isAdmin(actor)) {
        // M8: no filter → scope the result to the lecturer's own courses.
        filter.courseId = { $in: await ownedCourseIds(actor?.userId || "") };
      }

      const escalations = await EscalationState.find(filter)
        .sort({ updatedAt: -1 })
        .limit(100)
        .lean();

      res.json({ data: escalations });
    } catch (error) {
      next(error);
    }
  },
);

router.post("/:id/resolve", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id))
      return res.status(404).json({ message: "Escalation not found" });
    const actor = (req as { user?: Actor }).user;
    const reason = req.body?.reason || "Manually resolved by lecturer";

    const state = await EscalationState.findById(id);
    if (!state) {
      return res.status(404).json({ message: "Escalation not found" });
    }

    // M8: mutating an escalation requires owning the course it belongs to.
    if (!(await ownsCourse(actor, state.courseId))) {
      return res.status(403).json({ message: "You do not own this course" });
    }

    if (state.currentStage === "resolved") {
      return res.json({ success: true, data: state });
    }

    const updated = await resolveState(
      state,
      actor?.userId || "unknown",
      reason,
    );

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

export default router;
