# contracts/compatibility (v0 Freeze)

> **v0 Freeze (2026-05-09):** Compatibility contracts and fixtures in this directory are frozen
> at Contract v0. The accepted-send non-ACK boundary and ACK-safe receipt types are locked.

## Terminal evidence ACK boundary

- [Terminal evidence ACK boundary](./terminal-evidence-ack-boundary.md) defines accepted-send/provider message-id evidence as non-ACK and requires manual or current-session-visible receipt proof before terminal ACK eligibility.
- Fixture: `fixtures/terminal-evidence/accepted-send-non-ack.json`
- Check: `node test/conformance/check-terminal-evidence-ack-boundary.mjs`
