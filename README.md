# Community Translator

Discord, Reddit, X의 영어 메시지를 한국어로 읽고 한국어 초안을 영어로 미리 확인하는 크롬 확장과 번역 서버입니다.

## 주요 기능

- 영어 메시지 아래에 한국어 번역을 표시합니다. 원문은 그대로 볼 수 있고 긴 번역은 접을 수 있습니다.
- 한국어 초안을 영어로 바꾸어 전송 전에 확인할 수 있습니다. 말투를 고르거나 영어 문장을 한국어로 되돌릴 수 있습니다. 전송은 사용자가 직접 합니다.
- 번역 서버 주소를 설정해 사용할 커뮤니티 사이트를 선택할 수 있습니다.
- 번역 보관 기능을 켜고 보관 기간을 설정할 수 있습니다.

## 크롬 확장 설치

1. [GitHub Releases](../../releases)에서 최신 `community-translator-v*.zip`을 내려받습니다.
2. 압축을 풉니다. 풀린 폴더 바로 아래에 `manifest.json`이 있어야 합니다.
3. 크롬에서 `chrome://extensions`를 엽니다.
4. 오른쪽 위에서 **개발자 모드**를 켭니다.
5. **압축해제된 확장 프로그램을 로드합니다**를 누르고 압축을 푼 폴더를 선택합니다.
6. 툴바에서 확장 아이콘을 열고 번역 서버 주소와 베어러 토큰을 입력한 뒤 저장합니다.
   - 크롬이 입력한 서버 주소에 대한 접근 권한을 묻습니다. 허용해야 번역을 사용할 수 있습니다.
   - 설치할 때는 사이트 접근 권한을 요청하지 않습니다. 설정한 서버 주소에 대해서만 권한을 요청합니다.
7. 번역할 커뮤니티 사이트를 켭니다. 기본값은 모두 꺼져 있습니다.

설정에서 자동 미리보기, 기본 영어 말투, 번역 보관 기간을 바꿀 수 있습니다. 보관 기간은 사용 안 함, 7일, 30일 중에서 고릅니다. 캐시에는 원문이나 페이지 주소, 사용자 정보를 저장하지 않고 식별용 해시와 번역문만 저장합니다.

## 저장소 구성

| 경로 | 역할 |
|-|-|
| `apps/extension` | WXT, Manifest V3, TypeScript로 만든 크롬 확장 |
| `apps/server` | Fastify 기반 번역 서버 |
| `packages/contracts` | 확장과 서버가 공유하는 OpenAPI 정본과 생성 타입 |
| `deploy/` | 서비스, 환경변수, nginx 설정 예시와 배포 검사 |

확장과 서버는 `packages/contracts/openapi.yaml`에서 만든 타입을 공유합니다. 계약을 변경한 뒤 `pnpm contracts:generate`를 실행하고 생성 파일을 함께 커밋합니다. `pnpm contracts:check`로 서로 어긋난 부분을 확인할 수 있습니다.

## 번역 서버 설정

`POST /translate`에는 베어러 토큰이 필요합니다. `GET /health`는 공개 경로입니다. 서버는 설정된 번역 CLI를 자식 프로세스로 실행하고, 요청 문장에 실제로 등장한 용어집 항목만 프롬프트에 추가합니다.

다음 환경변수를 서버에 설정합니다. 예시 값은 `apps/server/.env.example`에 있습니다.

| 환경변수 | 설명 | 예시 |
|-|-|-|
| `HOST` | 서버가 요청을 받는 주소 | `127.0.0.1` |
| `PORT` | 서버 포트 | `3119` |
| `TRANSLATOR_BEARER_TOKEN` | 번역 요청 인증값 | 배포 시 비공개 값 설정 |
| `TRANSLATOR_CODEX_MODEL` | 번역에 사용할 모델 | `gpt-5.6-luna` |
| `TRANSLATOR_CODEX_REASONING_EFFORT` | 추론 강도 | `xhigh` |
| `TRANSLATOR_CODEX_CONCURRENCY` | 동시에 실행할 번역 프로세스 수 | `2` |
| `TRANSLATOR_CODEX_QUEUE_LIMIT` | 대기 가능한 최대 요청 수 | `32` |
| `TRANSLATOR_CODEX_TIMEOUT_MS` | 요청 제한 시간, 밀리초 | `120000` |
| `TRANSLATOR_GLOSSARY_FILE` | 용어집 YAML 파일 경로 | `/srv/community-translator/shared/glossary.yaml` |

용어집은 `items` 목록으로 작성합니다. 각 항목은 영어와 한국어 이름, 별칭, 호칭을 포함할 수 있습니다.

```yaml
items:
  - name:
      en: Alden Vale
      kr: 알덴 베일
      ja: アルデン
    epithet:
      en: The Wanderer of Dawn
      kr: 새벽의 방랑자
    aliases:
      - en: Rowan
        kr: 로완
```

## 개발 및 빌드

Node.js 24.18 이상 24.x 버전과 pnpm 11.15.0을 사용합니다.

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
```

`pnpm check`는 계약, 린트, 타입, 테스트, 빌드를 확인합니다. 확장만 빌드하려면 다음 명령을 실행합니다.

```bash
pnpm --filter "@community-translator/extension..." run build
```

확장 빌드 결과는 `apps/extension/.output/chrome-mv3`에 생성되며 압축해제된 확장으로 불러올 수 있습니다. `v*` 태그를 푸시하면 CI가 확장을 빌드하고 `community-translator-<tag>.zip`을 GitHub Release에 첨부합니다.

배포 방법은 `deploy/README.md`를 참고하십시오.
