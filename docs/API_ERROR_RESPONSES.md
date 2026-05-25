# API Error Response Format

All API endpoints return consistent error responses following this structure:

## Error Response Schema

```typescript
{
  status: number;        // HTTP status code (400, 401, 403, 404, 500, etc.)
  message: string;       // Human-readable error message
  errors?: Array<{       // Optional: validation errors (for 400 Bad Request)
    field: string;       // Field name that failed validation
    message: string;     // Specific validation error message
  }>;
  requestId?: string;    // Optional: unique request ID for tracing
}
```

## Examples

### Validation Error (400)

```json
{
  "status": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    },
    {
      "field": "password",
      "message": "Password must be at least 8 characters"
    }
  ],
  "requestId": "req_abc123"
}
```

### Authentication Error (401)

```json
{
  "status": 401,
  "message": "Invalid credentials"
}
```

### Authorization Error (403)

```json
{
  "status": 403,
  "message": "Admin access required"
}
```

### Not Found (404)

```json
{
  "status": 404,
  "message": "Course not found"
}
```

### Server Error (500)

```json
{
  "status": 500,
  "message": "Internal server error",
  "requestId": "req_xyz789"
}
```

## Implementation

Error responses are generated using the centralized error handler in `src/middleware/errorHandler.ts`:

```typescript
import { errorHandler } from './middleware/errorHandler';

app.use(errorHandler);
```

For validation errors, use Zod schemas and the validation middleware:

```typescript
import { validateRequest } from './middleware/validation';
import { createCourseSchema } from './schemas/course.schema';

router.post('/courses', validateRequest(createCourseSchema), createCourse);
```

## Client-Side Handling

When consuming the API, check the `status` field and handle errors appropriately:

```typescript
try {
  const response = await fetch('/api/courses', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const error = await response.json();
    
    if (error.status === 400 && error.errors) {
      // Handle validation errors
      error.errors.forEach(({ field, message }) => {
        showFieldError(field, message);
      });
    } else {
      // Handle general errors
      showErrorMessage(error.message);
    }
  }
} catch (err) {
  // Handle network errors
  showErrorMessage('Network error occurred');
}
```

## Best Practices

1. Always return the correct HTTP status code
2. Provide clear, actionable error messages
3. Include field-level errors for validation failures
4. Use `requestId` for server errors to aid debugging
5. Never expose sensitive information (stack traces, DB errors) in production
6. Log detailed errors server-side for troubleshooting
