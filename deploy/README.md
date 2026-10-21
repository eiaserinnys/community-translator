# 커뮤니티 번역 서버 배포

이 디렉토리가 배포 자산의 정본입니다. eiaserinnys 호스트의 haniel·nginx 파일은 여기서 복사해 쓰며, 별도의 정본이 되지 않습니다.

## 계약

- haniel 리포: `community-translator`
- haniel 서비스: `community-translator-server`
- 런타임: `/opt/node/24/bin/node`
- loopback: `127.0.0.1:3119`
- 외부 주소: `https://translator.eiaserinnys.me`
- 공유 환경변수: `/home/eias/services/community-translator/shared/server/.env`
- 공유 용어집: `/home/eias/services/community-translator/shared/glossary.yaml`

`TRANSLATOR_BEARER_TOKEN`은 `POST /translate`의 유일한 경계입니다. 이 값을 git, PR, 명령 인자, 로그, 보고서 어디에도 남기지 마십시오.

번역은 서버가 `codex exec --ephemeral`로 수행하며, 인증은 `/home/eias/.codex/auth.json`의 ChatGPT OAuth 세션을 씁니다. 따라서 이 서비스에는 번역용 API 키가 없습니다. 오히려 그 반대로, 빌드 훅과 서버가 자식 프로세스 환경에서 `OPENAI_API_KEY`·`ANTHROPIC_API_KEY`를 제거합니다. 이 키가 codex에 전달되면 과금 경로가 조용히 바뀝니다.

## 1. 사전 점검

```bash
node deploy/scripts/verify-deployment.mjs
node --test deploy/scripts/verify-deployment.test.mjs
bash -n deploy/haniel/build-community-translator.sh
ss -ltnp 'sport = :3119'
getent ahostsv4 translator.eiaserinnys.me
```

포트 `3119`는 `community-translator-server`만 점유해야 합니다(clipper가 `3118`을 씁니다). 인증서를 요청하기 전에 DNS가 의도한 호스트를 가리키는지 확인하십시오.

체크아웃 밖에 롤백 디렉토리를 만들고 현재 haniel YAML과 nginx 사이트 파일을 파일 모드를 보존해 복사해 두십시오.

`auto_apply: false`를 유지하십시오. 머지와 배포는 분리된 결정이어야 하며, 머지만으로 서비스가 재시작되면 안 됩니다.

## 2. 공유 환경과 용어집

공유 디렉토리를 모드 `700`으로 만듭니다. `deploy/haniel/server.env.example`을 `/home/eias/services/community-translator/shared/server/.env`로 설치하고 모드 `600`으로 둡니다. 기존 파일이 있으면 키 집합만 비교하고 값은 보존하십시오.

베어러 토큰은 비공개 터미널에서 `openssl rand -hex 32`로 만들어 모드 `600` 파일에 직접 입력합니다. 이미 설치된 확장이 있으면 토큰을 바꾸지 마십시오. 바꾸면 그 확장들이 전부 인증에 실패합니다.

용어집은 `eb_lore`의 `content/glossary.yaml`을 공유 경로로 복사합니다.

```bash
install -m 644 /home/eias/seosoyoung-workspace/.projects/eb_lore/content/glossary.yaml \
  /home/eias/services/community-translator/shared/glossary.yaml
```

서버는 기동 시 `glossary entries loaded: N`을 로그에 남깁니다. 파일이 없어도 서버는 뜨지만 고유명사 표기가 흔들립니다. 로그의 `N`이 0이 아닌지 확인하십시오.

## 3. haniel 등록

**이 호스트의 haniel에는 MCP 표면이 없습니다.** `haniel.yaml`의 `mcp.enabled`와 `dashboard.enabled`가 둘 다 `false`이고, MCP 포트에 LISTEN하는 프로세스가 없습니다. `haniel_update_repo_config`·`haniel_update_service_config`·`haniel_pull` 같은 MCP 도구는 여기서 쓸 수 없습니다. resident haniel은 폴링 중 `haniel.yaml`을 다시 읽지도 않으므로, 설정 파일만 고쳐 두는 것도 반영되지 않습니다.

살아 있는 제어 표면은 haniel-orch의 REST 하나입니다.

```
POST http://127.0.0.1:9300/api/orch/service-command
Authorization: Bearer <AUTH_BEARER_TOKEN>
```

토큰은 haniel-orch의 env 파일(`production-staging/config/haniel-orch.env`, 모드 600)에 `AUTH_BEARER_TOKEN`으로 들어 있습니다. 파일에서 읽어 환경변수로 넘기고, 값을 명령 인자나 로그에 남기지 마십시오.

`action`은 `start`·`restart`·`stop`·`reload`·`reload-config`·`register-service`·`register-repo` 중 하나입니다. **최초 등록은 `register-service` 한 번이 전부입니다** — 이 한 호출이 리포와 서비스 설정을 기록하고, 리포를 clone하고, 리포 `post_pull`과 서비스 `post_pull`(빌드 훅)을 돌리고, 그 서비스만 기동합니다. 다른 서비스는 건드리지 않습니다.

```json
{
  "node_id": "eiaserinnys",
  "service_name": "community-translator-server",
  "action": "register-service",
  "payload": {
    "repo": "community-translator",
    "repo_config": { "...": "yaml.example의 repos.community-translator 객체 그대로" },
    "service_config": { "...": "yaml.example의 services.community-translator-server 객체 그대로" }
  }
}
```

`payload.service_config`가 없으면 400입니다. 같은 이름의 서비스가 이미 있으면 `Service already exists`로 거부하므로, 등록이 끝난 뒤 설정만 고쳤다면 `reload-config`로 재독을, 기동 제어만 필요하면 `restart`를 쓰십시오.

이 API는 fire-and-forget입니다. `{"command_id": ..., "status": "sent"}`를 즉시 돌려주고 orch는 30초 뒤 타임아웃 result를 브로드캐스트하지만, 노드는 그 뒤로도 계속 실행합니다. 빌드는 30초보다 오래 걸리므로 이 타임아웃을 실패로 읽지 마십시오. 진행은 haniel 로그와 포트로 확인합니다.

빌드 훅이 깨지면 서비스가 아예 뜨지 않고 재시도도 없습니다. 로그에 폴링만 반복되면 빌드 실패를 의심하십시오.

확인:

```bash
ss -ltnp 'sport = :3119'
readlink -f /proc/$(ss -ltnp 'sport = :3119' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)/exe
curl --fail --silent --show-error http://127.0.0.1:3119/health
```

실행 파일은 설정한 Node 24.18.0 바이너리여야 합니다. 인증 없는 `POST /translate`는 `401`이어야 합니다.

## 4. DNS, 인증서, nginx

`translator.eiaserinnys.me` A 레코드를 먼저 만듭니다. `eiaserinnys.me`는 Cloudflare에 있고 **와일드카드 A 레코드가 없으므로** 서브도메인마다 레코드를 직접 만들어야 합니다. 값은 이 호스트의 공인 IP(`62.83.18.43`), TTL 300, 그리고 **`proxied=false`**(DNS only)입니다. zone DNS 편집 권한이 있는 토큰은 `/etc/letsencrypt/credentials/cloudflare-eiaserinnys-me.ini`(root, 모드 600)에 있습니다.

**프록시는 반드시 꺼야 합니다.** Cloudflare 무료 플랜의 프록시는 응답을 100초에서 끊는데, 이 사이트의 `proxy_read_timeout`은 300초이고 `xhigh` 추론은 분 단위가 걸립니다. 프록시를 켜면 100초에서 잘린 응답이 확장에 오류로 도착합니다.

`deploy/nginx/translator.eiaserinnys.me.http.conf`를 사이트로 설치하고 `nginx -t` 후 reload합니다. 이 부트스트랩은 ACME와 `/health`만 노출하며, 번역 엔드포인트는 평문 HTTP로 열리지 않습니다.

DNS가 해석되면 사이트를 건드리지 않고 인증서만 발급합니다. 이 호스트에는 ACME 계정이 둘 있어 `--account` 없이는 대화형 선택에서 멈춥니다. 앱 서브도메인들이 공통으로 쓰는 계정은 `1e32f450`으로 시작합니다. 전체 id는 이미 발급된 사이트의 renewal conf에서 그대로 가져오십시오.

```bash
ACME_ACCOUNT=$(sudo sed -n 's/^account = //p' /etc/letsencrypt/renewal/clipper.eiaserinnys.me.conf)

sudo certbot certonly --webroot -w /var/www/html -d translator.eiaserinnys.me \
  --account "$ACME_ACCOUNT" \
  --non-interactive --agree-tos --email eiaserinnys@gmail.com
```

`deploy/nginx/translator.eiaserinnys.me.tls.conf`로 교체하고 `nginx -t` 후 reload합니다. 443 리스너에 프로토콜 옵션을 추가하지 마십시오. 이 소켓은 호스트의 다른 사이트와 공유합니다.

`proxy_read_timeout`은 300초입니다. `xhigh` 추론은 분 단위가 걸릴 수 있어, 이 값이 짧으면 번역이 아직 생성 중인데 확장에는 실패로 보입니다.

갱신은 `certbot.timer`가 하고, 갱신된 인증서를 nginx에 물리는 일은 호스트 전역 훅 `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`(`nginx -t && systemctl reload nginx`)가 합니다. 이 훅이 없으면 갱신은 되는데 nginx가 만료된 인증서를 계속 물고 있습니다.

## 5. 라이브 확인

1. `https://translator.eiaserinnys.me/health`가 `{"status":"ok"}`;
2. 토큰 없는 `POST /translate`가 `401`, 잘못된 토큰도 `401`;
3. 올바른 토큰으로 짧은 영어 한 문장이 한국어로 번역;
4. EB 고유명사가 든 문장이 용어집 표기대로 번역(응답의 `glossaryTerms`가 0이 아님);
5. 한국어 초안이 `target: "EN-US"`로 영어 번역.

codex 사용량 한도가 소진된 상태면 3~5는 `503` `translation_quota_exhausted`를 돌려주고, 확장은 그 사유를 인라인에 그대로 보여줍니다. 이는 서버 결함이 아니라 계정 한도이며, 한도가 리셋된 뒤 다시 확인하십시오.

curl 인자에 베어러를 직접 넣지 마십시오. 환경변수나 `--data @file`을 쓰십시오.

## 롤백

역순으로 되돌립니다.

1. 이전 nginx 사이트를 복원하고 `nginx -t` 후 reload;
2. 이전 haniel YAML과 이전 리비전을 haniel을 통해 복원한 뒤 포트 `3119`와 `/health` 확인;
3. `/home/eias/services/community-translator/shared/server/.env`는 의도적 자격증명 교체가 아니면 그대로 둡니다.

공개 라우팅만 문제라면 loopback 서비스는 살려둔 채 nginx만 되돌리십시오.
