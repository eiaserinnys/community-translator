# 커뮤니티 번역 서버 배포

이 디렉토리가 배포 자산의 정본입니다. eiaserinnys 호스트의 haniel·nginx 파일은 여기서 복사해 쓰며, 별도의 정본이 되지 않습니다.

## 계약

- haniel 리포: `community-translator`
- haniel 서비스: `community-translator-server`
- 런타임: `/home/eias/.nvm/versions/node/v24.18.0/bin/node`
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

PR 머지 후, `deploy/haniel/community-translator.yaml.example`의 리포 객체 전체를 `haniel_update_repo_config`에, 서비스 객체 전체를 `haniel_update_service_config`에 전달합니다. 관련 없는 리포와 서비스는 보존하십시오. 그다음 `community-translator` 리포에 대해 `haniel_pull`을 호출합니다. 이 명시적 pull이 빌드 훅을 돌리고 `community-translator-server`만 재시작합니다.

빌드 훅이 깨지면 서비스가 아예 뜨지 않고 재시도도 없습니다. 로그에 폴링만 반복되면 빌드 실패를 의심하십시오.

확인:

```bash
ss -ltnp 'sport = :3119'
readlink -f /proc/$(ss -ltnp 'sport = :3119' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)/exe
curl --fail --silent --show-error http://127.0.0.1:3119/health
```

실행 파일은 설정한 Node 24.18.0 바이너리여야 합니다. 인증 없는 `POST /translate`는 `401`이어야 합니다.

## 4. DNS, 인증서, nginx

`translator.eiaserinnys.me` A 레코드를 먼저 만듭니다. `deploy/nginx/translator.eiaserinnys.me.http.conf`를 사이트로 설치하고 `nginx -t` 후 reload합니다. 이 부트스트랩은 ACME와 `/health`만 노출하며, 번역 엔드포인트는 평문 HTTP로 열리지 않습니다.

DNS가 해석되면 사이트를 건드리지 않고 인증서만 발급합니다.

```bash
certbot certonly --webroot -w /var/www/html -d translator.eiaserinnys.me \
  --non-interactive --agree-tos --email eiaserinnys@gmail.com
```

`deploy/nginx/translator.eiaserinnys.me.tls.conf`로 교체하고 `nginx -t` 후 reload합니다. 443 리스너에 프로토콜 옵션을 추가하지 마십시오. 이 소켓은 호스트의 다른 사이트와 공유합니다.

`proxy_read_timeout`은 300초입니다. `xhigh` 추론은 분 단위가 걸릴 수 있어, 이 값이 짧으면 번역이 아직 생성 중인데 확장에는 실패로 보입니다.

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
