# Security Specification: AI Transformation Protocol

## Data Invariants
1. **Ownership**: All data (conversations, reports) must belong to the user who created it and cannot be re-assigned.
2. **Conversation Access**: Users can only see and modify their own chat sessions.
3. **Report Dependency**: A report cannot exist without a valid Conversation ID that also belongs to the user.
4. **Terminal State**: Once a report is 'closed', only the status can be toggled by the owner (or specific fields if needed), but identity fields (userId, conversationId) are immutable.
5. **Validation**: All strings and arrays must be bounded in size to prevent resource exhaustion attacks.

## The "Dirty Dozen" Payloads

1. **Identity Spoofing (Create)**: Attempting to create a report with a different `userId`.
2. **Identity Spoofing (Update)**: Attempting to change the `userId` of an existing report.
3. **Orphaned Report**: Creating a report with a `conversationId` that doesn't exist or belongs to another user.
4. **Shadow Field Injection**: Adding an `isAdmin: true` field to a report or conversation.
5. **State Shortcut**: Setting a conversation status to 'closed' without a valid process.
6. **Value Poisoning (String)**: Injecting a 2MB string into `resumenEjecutivo`.
7. **Value Poisoning (Array)**: Injecting 10,000 items into the `messages` list.
8. **Path ID Poisoning**: Using a 2KB string as a `reportId`.
9. **PII Leakage**: Authenticated user 'B' trying to list all reports (should only see their own).
10. **Timestamp Spoofing**: Setting `createdAt` to a date in the future or past instead of `request.time`.
11. **Relational Sync Bypass**: Updating a report without updating the conversation (if sync is expected).
12. **Method Escalation**: Using a client-side update to modify fields that should only be set during report generation (e.g., `sector`, `role` in the report content).

## Test Runner (Logic Overview)
The testing strategy will involve verifying that every operation:
- Checks `request.auth != null`.
- Validates identity against `request.auth.uid`.
- Enforces strict schema using `affectedKeys().hasOnly()`.
- Validates the existence and ownership of related documents using `get()`.
