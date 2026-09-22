# Community Translator

Discord · Reddit · X의 영어 커뮤니티를 한국어로 읽고, 한국어로 쓴 초안을 영어로 확인한 뒤 직접 보내는 크롬 확장과 번역 서버.

- **영어 아래 한국어** — 화면에 보이는 영어 메시지 아래에 한국어 번역이 붙습니다. 원문은 그대로 남고, 긴 번역은 접힙니다.
- **보내기 전에 영어 미리보기** — 작성창의 한국어 초안을 영어로 바꿔 보여줍니다. 말투를 고르고, 영어로 바꾸고, 한국어로 되돌릴 수 있습니다. **전송은 언제나 사용자가 직접 합니다.**
- 번역은 직접 운영하는 서버에서만 이루어집니다. 외부 번역 서비스에 문장이 전달되지 않습니다.

## 설치

1. [Releases](https://github.com/eiaserinnys/community-translator/releases)에서 최신 `community-translator-v*.zip`을 내려받습니다.
2. 압축을 풉니다. 풀린 폴더 안에 `manifest.json`이 바로 보여야 합니다.
3. 크롬 주소창에 `chrome://extensions`를 엽니다.
4. 오른쪽 위 **개발자 모드**를 켭니다.
5. **압축해제된 확장 프로그램을 로드합니다**를 누르고 2번에서 풀린 폴더를 고릅니다.
6. 툴바의 확장 아이콘을 누르면 설정 화면이 열립니다. **서버 주소**와 **서버 토큰**을 입력하고 저장합니다.
   - 저장할 때 크롬이 그 주소에 대한 접근 권한을 묻습니다. 허용해야 번역이 동작합니다.
   - 확장은 설치 시점에 아무 사이트 접근 권한도 요구하지 않습니다. 승인하는 것은 입력한 서버 주소 하나뿐입니다.
7. 번역할 커뮤니티(Discord · Reddit · X)를 켭니다. 기본값은 전부 꺼져 있습니다.

설정에서 자동 미리보기, 기본 영어 말투, 번역 보관 기간(보관 안 함 / 7일 / 30일)을 바꿀 수 있습니다. 캐시에는 원문·주소·사용자 정보를 저장하지 않고 식별용 해시와 번역문만 저장합니다.

## 구성

| 위치 | 역할 |
|---|---|
| `apps/extension` | 크롬 확장 (WXT, MV3, TypeScript) |
| `apps/server` | 번역 서버 (Fastify) |
| `packages/contracts` | `openapi.yaml` 단일 정본과 여기서 생성한 타입 |
| `deploy/` | haniel 서비스·nginx·환경변수 예시와 배포 검증 |

확장과 서버는 `packages/contracts/openapi.yaml`에서 생성한 같은 타입을 공유합니다. 계약을 고쳤으면 `pnpm contracts:generate`를 돌려 생성 결과를 함께 커밋하십시오. CI의 `pnpm contracts:check`가 이 둘이 어긋나면 실패합니다.

## 번역 서버

`POST /translate`는 베어러 토큰으로 보호되고, `GET /health`는 공개입니다. 번역은 ChatGPT OAuth로 로그인한 codex CLI를 `codex exec --ephemeral --json`으로 띄워 수행하며, 요청 문장에 등장하는 엠버 앤 블레이드 용어집 항목만 프롬프트에 주입합니다.

모델·추론 강도·동시 실행 상한·대기열·타임아웃·용어집 경로는 전부 환경변수입니다. 기본값은 `apps/server/.env.example`에 있습니다.

> **추론 강도에 `max`는 없습니다.** codex 0.153.4가 받는 값은 `minimal | low | medium | high | xhigh`뿐이고, 최댓값은 `xhigh`입니다. `model_reasoning_effort="max"`는 CLI가 거부해 모든 요청이 실패합니다.

## 개발

Node 24.18.0 / pnpm 11.15.0.

```bash
pnpm install
pnpm check     # contracts:check → lint → typecheck → test → build
```

확장만 빌드하려면:

```bash
pnpm --filter "@community-translator/extension..." run build
```

산출물은 `apps/extension/.output/chrome-mv3`이며, 그대로 **압축해제된 확장 프로그램 로드**로 올릴 수 있습니다.

`v*` 태그를 푸시하면 CI가 확장을 빌드해 `community-translator-<tag>.zip`을 GitHub Release에 첨부합니다.

배포 절차는 `deploy/README.md`에 있습니다.
