# Socket.IO Payload Sanitization

## ADDED Requirements

### Requirement: Socket.IO message content MUST be sanitized

Message content received via Socket.IO `send_message` SHALL be HTML-sanitized before persistence and broadcast. The sanitization MUST strip script tags, event handlers, and unsafe URI schemes.

#### Scenario: Script tag injection

- Given a user emits `send_message` with content containing `<script>alert(1)</script>`
- When the server processes the payload
- Then the persisted message content MUST NOT contain the script tag
- And the broadcast event MUST NOT contain the script tag
- And the response to the sender MUST contain the sanitized version

#### Scenario: javascript: URL in markdown

- Given a user sends a message with `[click](javascript:alert(1))`
- When the server sanitizes
- Then the resulting content MUST have the `javascript:` URL stripped or replaced with a safe placeholder

#### Scenario: Length enforcement

- Given a user sends a message with content >10,000 characters
- When the server validates
- Then the message MUST be rejected with `error: invalid_payload`
- And no DB write MUST occur

### Requirement: Attachment metadata MUST be validated

Attachment URLs and filenames received via Socket.IO SHALL be validated. URLs MUST match `https?://` scheme. Filenames MUST exclude path separators and HTML special characters.

#### Scenario: Path traversal in attachment name

- Given an attachment name containing `../etc/passwd`
- When the server processes the attachment
- Then path separators MUST be stripped from the stored name
- And the stored filename MUST be safe to display in HTML
