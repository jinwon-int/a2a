# Worker Registration and Read-Model Assumptions

Worker registration data must remain stable and public-safe across the monorepo import. This file names the assumptions expected by broker read models and worker-facing tooling.

## Worker registration fields

- `workerName`: stable public-safe identifier, not a host name or private path.
- `capabilities`: coarse labels such as `docs`, `contracts`, `repo-inspection`, or `tests`.
- `policyVersion`: safety policy version understood by the worker.
- `lastSeenAt`: timestamp used for liveness display only; not proof of terminal delivery.
- `currentTaskId`: optional task reference for in-progress visibility.

## Stable read-model assumptions

- Read models may show queued, claimed, running, and terminal tasks without exposing private infrastructure details.
- Read models must distinguish provider-send status from terminal Done/Block/PR evidence.
- Read models must not infer terminal ACK from Telegram/provider delivery responses.
- Worker names and capability labels are safe to publish only after a public-readiness scan confirms they contain no private topology or credentials.

## Import notes

During sanitized/squash imports, preserve public-safe names and capability labels, but re-disposition any private host names, local paths, provider IDs, and secret-shaped values before they enter this repository.
