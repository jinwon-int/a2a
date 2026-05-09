# contracts/compatibility

## Terminal evidence ACK boundary

- [Terminal evidence ACK boundary](./terminal-evidence-ack-boundary.md) defines accepted-send/provider message-id evidence as non-ACK and requires manual or current-session-visible receipt proof before terminal ACK eligibility.
- Fixture: `fixtures/terminal-evidence/accepted-send-non-ack.json`
- Check: `node test/conformance/check-terminal-evidence-ack-boundary.mjs`
