# A2A Ecosystem Guide

> **한국어 / English** — A2A 4개 저장소의 역할과 관계를 설명합니다.

## 한눈에 보기

```
┌─────────────────────────────────────────────────────────┐
│                    a2a-plane (이슈 허브)                  │
│   워크플로우 이슈 트래킹 · 라운드 플래닝 · 로드맵          │
│   https://github.com/jinwon-int/a2a-plane               │
└─────────────────────────────────────────────────────────┘
                             │
               작업을 생성하고 결과를 수집
                             │
┌────────────────────────────┼────────────────────────────┐
│                  a2a-broker (핵심 런타임)                  │
│   Task lifecycle · Worker 등록 · GitHub evidence         │
│   https://github.com/jinwon-int/a2a-broker              │
├─────────────────────────────────────────────────────────┤
│            a2a-docker-runner (격리 실행기)                 │
│   Docker 기반 패치 러너 · 아티팩트 수집 · PR/Block 증거      │
│   https://github.com/jinwon-int/a2a-docker-runner       │
├─────────────────────────────────────────────────────────┤
│           openclaw-plugin-a2a (OpenClaw 어댑터)            │
│   OpenClaw ↔ A2A 브로커 통합 플러그인                       │
│   https://github.com/jinwon-int/openclaw-plugin-a2a     │
└─────────────────────────────────────────────────────────┘
```

## 각 저장소의 역할

### a2a-plane — 작업 허브

- **사용 대상**: A2A를 도입하려는 운영자/팀 리더
- A2A 워크플로우의 이슈 기반 플래닝 및 로드맵
- 작업 지시(dispatch), 라운드 트래킹, closeout 증거 수집
- **코드 런타임이 아닌, 이슈 트래커 + 검증 도구**

### a2a-broker — 핵심 런타임

- **사용 대상**: A2A를 직접 설치해서 운영하려는 사용자
- Task 생성·조회·취소 API
- Worker 등록 및 상태 관리
- GitHub 이슈/PR 기반 evidence 연동
- OpenClaw Gateway와의 SSE 브리지

### a2a-docker-runner — 워커 실행기

- **사용 대상**: A2A 워커 노드를 운영하려는 사용자
- Docker 컨테이너로 격리된 GitHub 패치 작업 실행
- PR 생성, 아티팩트 수집, 결과 보고 자동화
- 보안 스캔 및 증거 수집 포함

### openclaw-plugin-a2a — OpenClaw 플러그인

- **사용 대상**: OpenClaw Gateway 사용자
- OpenClaw Gateway ↔ A2A Broker 간 프로토콜 어댑터
- Task 요청/상태/취소 매핑
- 모니터링 브리지

## 시작하기

### 운영자 (A2A 도입)

1. [a2a-plane](https://github.com/jinwon-int/a2a-plane) → 이슈 기반으로 작업 지시
2. [a2a-broker](https://github.com/jinwon-int/a2a-broker) → 브로커 설치 및 실행
3. [a2a-docker-runner](https://github.com/jinwon-int/a2a-docker-runner) → 워커 노드 설정
4. (선택) [openclaw-plugin-a2a](https://github.com/jinwon-int/openclaw-plugin-a2a) → OpenClaw 통합

### 기여자

- 각 저장소의 `CONTRIBUTING.md` 참조
- 이슈는 [a2a-plane](https://github.com/jinwon-int/a2a-plane)에 먼저 등록

## 로드맵

> [!NOTE]
> 현재 4개 저장소 체제는 개발 라운드에 최적화되어 있습니다.
> 사용자 경험 개선을 위해 **모노레포 통합**을 검토 중입니다.
> 상세: [a2a-plane#239](https://github.com/jinwon-int/a2a-plane/issues/239)

## 라이선스

각 저장소의 LICENSE 파일을 참조하세요.
