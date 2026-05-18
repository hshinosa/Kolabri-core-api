## ADDED Requirements

### Requirement: All controller errors go through errorHandler middleware
Semua error di controller MUST diteruskan ke `next(error)` atau `next(ApiError.xxx())`. Tidak boleh ada response error manual (`res.status(xxx).json(...)`) di controller.

#### Scenario: Unexpected error in controller
- **WHEN** controller mengalami unexpected error
- **THEN** error diteruskan ke `next(error)` dan dihandle oleh `errorHandler` middleware

#### Scenario: Business rule violation in controller
- **WHEN** business rule dilanggar
- **THEN** controller memanggil `next(ApiError.badRequest(...))` atau error type yang sesuai

### Requirement: No empty catch blocks
Tidak boleh ada empty catch block `catch(e) {}` di controller. The system MUST enforce: No empty catch blocks.

#### Scenario: Caught error must be forwarded
- **WHEN** error di-catch di controller
- **THEN** error MUST diteruskan ke `next(error)` atau di-log minimal
