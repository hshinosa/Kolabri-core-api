# Validation Patterns Guide

This guide documents validation schema patterns used across the Kolabri Core API. All validation uses Zod for type-safe schema definition and runtime validation.

## Core Principles

1. **Boundary limits**: All inputs have explicit min/max constraints
2. **Type safety**: Schemas generate TypeScript types automatically
3. **Sanitization**: Trim strings, normalize formats
4. **Clear errors**: Provide actionable validation messages
5. **Reusable schemas**: Extract common patterns into shared schemas

## Common Schema Patterns

### String Validation

```typescript
import { z } from 'zod';

// Basic string with length limits
const nameSchema = z
    .string()
    .trim()
    .min(3, 'Name must be at least 3 characters')
    .max(255, 'Name must be less than 255 characters');

// Optional string with max length
const descriptionSchema = z
    .string()
    .trim()
    .max(1000, 'Description must be less than 1000 characters')
    .optional();

// Regex pattern validation
const courseCodeSchema = z
    .string()
    .trim()
    .min(1, 'Course code is required')
    .max(10, 'Course code must be less than or equal to 10 characters')
    .regex(/^[A-Za-z0-9]+$/, 'Course code must be alphanumeric')
    .transform((value) => value.toUpperCase());

// Email validation
const emailSchema = z
    .string()
    .trim()
    .email('Invalid email format')
    .max(255, 'Email must be less than 255 characters');
```

### Numeric Validation

```typescript
// Integer with range
const ageSchema = z
    .number()
    .int('Age must be an integer')
    .min(0, 'Age cannot be negative')
    .max(150, 'Invalid age');

// Coerce string to number (for query params)
const pageSchema = z.coerce.number().int().min(1).default(1);

// Pagination limit with boundary
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);
```

### Array Validation

```typescript
// Array with size limits
const courseIdsSchema = z
    .array(z.string().uuid('Invalid course id'))
    .min(1, 'Select at least one course')
    .max(1000, 'Maximum 1000 courses allowed');

// Array of objects
const membersSchema = z
    .array(z.object({
        userId: z.string().uuid(),
        role: z.enum(['member', 'moderator'])
    }))
    .min(1, 'At least one member required')
    .max(100, 'Maximum 100 members per operation');
```

### Enum Validation

```typescript
// Fixed set of values
const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

const roleSchema = z.enum(['student', 'lecturer', 'admin']);

const statusSchema = z.enum(['active', 'archived', 'deleted']);
```

### UUID Validation

```typescript
// Single UUID
const userIdSchema = z.string().uuid('Invalid user id');

// Optional UUID
const ownerIdSchema = z.string().uuid('Invalid owner id').optional();
```

### Object Validation

```typescript
// Query parameters with defaults
const listQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().optional(),
    sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Create input
const createSchema = z.object({
    name: z.string().trim().min(3).max(255),
    description: z.string().trim().max(1000).optional(),
    ownerId: z.string().uuid(),
});

// Update input (at least one field required)
const updateSchema = z
    .object({
        name: z.string().trim().min(3).max(255).optional(),
        description: z.string().trim().max(1000).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field must be provided',
    });
```

## Boundary Limits Reference

| Input Type | Limit | Rationale |
|------------|-------|-----------|
| Pagination limit | 1-100 | Prevent excessive DB queries |
| Course code | 1-10 chars | Standard academic codes |
| Names (course, group) | 3-255 chars | Reasonable name length |
| Descriptions | 0-1000 chars | Brief context |
| Message content | 1-10000 chars | Chat message size |
| Bulk operations | 1-1000 items | Prevent timeout/memory issues |
| Array members | 1-100 items | Reasonable batch size |

## Usage in Routes

### Apply validation middleware

```typescript
import { validateRequest } from '../middleware/validation';
import { createCourseSchema } from '../validators/course-admin.validator';

router.post('/courses', 
    validateRequest(createCourseSchema), 
    createCourse
);
```

### Query parameter validation

```typescript
router.get('/courses',
    validateRequest(listCoursesQuerySchema, 'query'),
    listCourses
);
```

### Type inference

```typescript
import { z } from 'zod';

export const createCourseSchema = z.object({
    code: z.string(),
    name: z.string(),
});

// Auto-generate TypeScript type
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

// Use in controller
async function createCourse(req: Request, res: Response) {
    const data: CreateCourseInput = req.body; // Type-safe
    // ...
}
```

## Testing Validation

```typescript
import { describe, it, expect } from 'vitest';
import { createCourseSchema } from './course-admin.validator';

describe('Course Validation', () => {
    it('should accept valid input', () => {
        const result = createCourseSchema.safeParse({
            code: 'CS101',
            name: 'Introduction to Computer Science',
            ownerId: '123e4567-e89b-12d3-a456-426614174000'
        });
        expect(result.success).toBe(true);
    });

    it('should reject course code > 10 chars', () => {
        const result = createCourseSchema.safeParse({
            code: 'VERYLONGCODE123',
            name: 'Test Course',
            ownerId: '123e4567-e89b-12d3-a456-426614174000'
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toContain('10 characters');
        }
    });
});
```

## Best Practices

1. **Always trim strings** to prevent whitespace issues
2. **Set explicit max lengths** for all string fields
3. **Use coerce for query params** since they arrive as strings
4. **Provide clear error messages** that guide users
5. **Test boundary conditions** (min, max, edge cases)
6. **Extract reusable schemas** for common patterns (email, UUID, etc.)
7. **Use enums** for fixed value sets instead of string literals
8. **Add defaults** for optional query parameters
9. **Validate array sizes** to prevent DoS attacks
10. **Generate types** from schemas using `z.infer<>`

## Security Considerations

- **Prevent injection**: Use regex patterns for codes/identifiers
- **Limit input size**: Set max lengths to prevent buffer attacks
- **Validate UUIDs**: Ensure proper format for database lookups
- **Bound arrays**: Limit bulk operations to prevent resource exhaustion
- **Sanitize output**: Use DOMPurify for user-generated content (see [Sanitization Guide](../../Kolabri-client-app/docs/sanitization-guide.md))

## Related Documentation

- [API Error Response Format](./API_ERROR_RESPONSES.md)
- [Validation Middleware](../src/middleware/validation.ts)
- [Boundary Validation Tests](../src/validators/boundary-validation.test.ts)
