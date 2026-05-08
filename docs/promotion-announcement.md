# Promotion Announcement Draft

A2A is still an alpha, feedback-welcome project. Use this copy only after the public-readiness gates in [`docs/public-readiness.md`](./public-readiness.md) are closed and an operator explicitly approves repository visibility. Do not post announcements from task automation.

## Short Korean copy

A2A는 OpenClaw 작업을 브로커와 워커로 안전하게 나누어 실행하고, `Done` / `Block` / PR 링크 같은 터미널 증거를 모으는 알파 단계의 실험입니다. 아직 프로덕션용이 아니며, 피드백과 사용 사례 제안을 환영합니다. 공개 전에는 보안/히스토리 스캔과 운영자 승인 게이트를 반드시 통과합니다.

## Short English copy

A2A is an alpha experiment for routing OpenClaw tasks through a broker/worker flow and collecting terminal evidence such as `Done`, `Block`, or PR links. It is not production-ready yet, and feedback on the design, docs, and safety boundaries is welcome. Public visibility still requires clean readiness evidence and explicit operator approval.

## Repository surface recommendations

These are GitHub repository settings, not code changes. Apply them only through an approved repository-settings action:

- **Description:** `Alpha broker/worker task flow for OpenClaw A2A experiments with terminal evidence collection.`
- **Homepage:** leave blank until a public documentation site exists.
- **Topics:** `a2a`, `openclaw`, `broker`, `worker`, `task-runner`, `alpha`, `agent-tools`.

## Announcement safety checklist

Before any announcement is posted:

- Keep the tone alpha/feedback-welcome; do not imply production readiness.
- Confirm `docs/public-readiness.md` no longer records a NO-GO state.
- Confirm external secret/history scanner evidence is clean or explicitly dispositioned.
- Confirm repository visibility approval is separate from any execution step.
- Do not include private endpoints, host paths, provider IDs, tokens, raw transcripts, or production evidence.
