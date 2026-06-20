# Design: Fix Missing Teacher Notification Webhook and Engagement Data Persistence

## Approach

### Bug 1: Missing `/api/webhooks/teacher-notification` Endpoint

**Root Cause**: AI Engine's `orchestration.py` calls `POST /api/webhooks/teacher-notification` when `should_notify_teacher=True` (high-severity anomalies), but endpoint never implemented in core-api.

**Fix Strategy**: Add webhook endpoint following existing pattern from `webhook.routes.ts`:
1. Register route in `webhook.routes.ts`
2. Add controller method in `webhook.controller.ts`
3. Implement service method in `notification.service.ts`

**Implementation**:

```typescript
// webhook.routes.ts
router.post(
  '/teacher-notification',
  verifyCoreApiSecret,
  webhookController.sendTeacherNotification
);

// webhook.controller.ts
export async function sendTeacherNotification(req: Request, res: Response) {
  const { groupId, anomalyType, severity, message } = req.body;
  
  const notification = await notificationService.sendTeacherNotification({
    groupId,
    anomalyType,
    severity,
    message,
  });
  
  res.json({ success: true, notificationId: notification.id });
}

// notification.service.ts
export async function sendTeacherNotification(params: {
  groupId: string;
  anomalyType: string;
  severity: string;
  message: string;
}) {
  // 1. Find group with course and lecturer
  const group = await prisma.group.findUnique({
    where: { id: params.groupId },
    include: {
      course: { include: { lecturer: true } },
      chatSpaces: true,
    },
  });
  
  if (!group?.course?.lecturer) {
    throw new Error('Group or lecturer not found');
  }
  
  // 2. Create notification record
  const notification = await prisma.notification.create({
    data: {
      userId: group.course.lecturer.id,
      type: 'TEACHER_ALERT',
      title: `Alert: ${params.anomalyType}`,
      message: params.message,
      severity: params.severity,
      metadata: {
        groupId: params.groupId,
        courseCode: group.course.code,
        anomalyType: params.anomalyType,
      },
      isRead: false,
    },
  });
  
  // 3. Send email if lecturer has email notifications enabled
  if (group.course.lecturer.emailNotificationEnabled) {
    await emailService.sendTeacherAlert({
      to: group.course.lecturer.email,
      courseName: group.course.name,
      groupName: group.name,
      anomalyType: params.anomalyType,
      message: params.message,
    });
  }
  
  return notification;
}
```

**Security**: Protected by `verifyCoreApiSecret` middleware (same as other webhooks).

### Bug 2: Engagement Data Not Persisted to ChatLog

**Root Cause**: Socket handler in `socket/index.ts` receives `orchestrationResult` with `analytics` dict but only extracts top-level fields:
```typescript
const chatLog = new ChatLog({
  // ... basic fields
  qualityScore: orchestrationResult.quality_score,
  interventionType: orchestrationResult.intervention_type,
  // Missing: engagement data from orchestrationResult.analytics
});
```

**Fix Strategy**: Extract `analytics` dict and map to `IEngagementAnalysis` interface:

```typescript
// socket/index.ts - handleAIQuestion() around line 1225
const chatLog = new ChatLog({
  // ... existing fields
  qualityScore: orchestrationResult.quality_score,
  interventionType: orchestrationResult.intervention_type,
  
  // Add engagement data
  engagement: orchestrationResult.analytics ? {
    engagementType: orchestrationResult.analytics.engagement_type,
    isHigherOrder: orchestrationResult.analytics.is_higher_order,
    lexicalVariety: orchestrationResult.analytics.lexical_variety,
    hotIndicators: orchestrationResult.analytics.hot_indicators || [],
    confidence: orchestrationResult.analytics.confidence || 0.8,
  } : undefined,
});
```

**Data Mapping** (Python → TypeScript):
- `engagement_type` → `engagementType` (snake_case → camelCase)
- `is_higher_order` → `isHigherOrder`
- `lexical_variety` → `lexicalVariety`
- `hot_indicators` → `hotIndicators`
- `confidence` → `confidence` (if present, default 0.8)

**Validation**: Ensure `engagementType` is one of: 'cognitive', 'behavioral', 'emotional'.

## Testing Strategy

### Webhook Endpoint
1. **Unit Test**: Mock notification service, verify endpoint returns 200 with notification ID
2. **Integration Test**: 
   - Call endpoint with valid CORE_API_SECRET
   - Verify notification created in database
   - Verify email sent (mock email service)
   - Verify lecturer receives notification

### Engagement Persistence
1. **Unit Test**: Mock orchestration result with analytics dict, verify ChatLog saved with engagement field populated
2. **Integration Test**:
   - Send message through socket
   - Query ChatLog directly
   - Verify `engagement` field populated with correct values
   - Call `chatAnalyticsService.getGroupAnalytics()` and verify engagement data included in aggregation

## Rollout
- Single PR, merge to main
- No migration needed (ChatLog.engagement field already defined, just optional)
- No breaking changes (webhook addition, engagement field optional)
- Monitor logs for webhook failures (existing retry logic in AI Engine)

## Monitoring
- **Webhook Success Rate**: Track `POST /api/webhooks/teacher-notification` success/failure
- **Engagement Data Coverage**: Query ChatLog to verify % of messages with engagement field populated
- **Analytics Accuracy**: Compare group analytics before/after fix to verify engagement data improves quality scores
