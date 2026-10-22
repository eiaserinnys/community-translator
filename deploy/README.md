# Community Translator 배포

이 디렉토리는 번역 서버의 배포 예시와 검사 코드를 담습니다. 호스트에서 사용하는 서비스 관리자와 웹 서버 설정에 예시를 맞춰 복사합니다.

## 서비스 설정

- 리포지토리: `community-translator`
- 서비스: `community-translator-server`
- Node.js: `/opt/node/24/bin/node`
- 로컬 주소: `127.0.0.1:3119`
- 외부 주소 예시: `https://translator.example.com`
- 환경 파일: `/srv/community-translator/shared/server/.env`
- 용어집 파일: `/srv/community-translator/shared/glossary.yaml`

`TRANSLATOR_BEARER_TOKEN`은 `POST /translate`를 보호합니다. 이 값은 git, PR, 명령 인자, 로그, 보고서에 남기지 마십시오.

서버는 서비스 계정의 인증 세션으로 설정된 Codex CLI를 실행합니다. 번역 API 키는 필요하지 않습니다. 빌드 훅과 서버는 자식 프로세스 환경에서 `OPENAI_API_KEY`와 `ANTHROPIC_API_KEY`를 제거해 다른 과금 경로로 실행되는 일을 막습니다.

## 1. 배포 자산 확인

리포지토리 루트에서 다음 검사를 실행합니다.

```bash
node deploy/scripts/verify-deployment.mjs
node --test deploy/scripts/verify-deployment.test.mjs
bash -n deploy/haniel/build-community-translator.sh
ss -ltnp 'sport = :3119'
getent ahostsv4 translator.example.com
```

이 서비스에 포트 `3119`를 사용할 수 있는지 확인하고 DNS 레코드가 의도한 호스트를 가리키는지 확인합니다. 배포 전에 체크아웃 바깥에 롤백 디렉토리를 만들고 현재 서비스와 nginx 설정을 권한을 보존해 복사합니다.

리포지토리 설정에서 `auto_apply: false`를 유지합니다. 머지와 배포는 별도로 결정합니다.

## 2. 환경과 용어집 설정

`/srv/community-translator/shared`를 만들고 권한을 `700`으로 설정합니다. `deploy/haniel/server.env.example`을 `/srv/community-translator/shared/server/.env`에 복사하고 권한을 `600`으로 설정합니다. 기존 파일이 있으면 변수 이름만 비교하고 값은 보존합니다.

비공개 터미널에서 `openssl rand -hex 32`로 베어러 토큰을 만들고 권한 `600`인 파일에 직접 입력합니다. 이미 설치된 확장이 있다면 동시에 갱신하지 않는 한 토큰을 바꾸지 마십시오.

용어집을 `/srv/community-translator/shared/glossary.yaml`에 둡니다. 예를 들면 다음과 같습니다.

```bash
install -m 644 /path/to/glossary.yaml \
  /srv/community-translator/shared/glossary.yaml
```

서버는 시작할 때 `glossary entries loaded: N`을 로그에 남깁니다. `N`이 0보다 큰지 확인합니다. 용어집이 없어도 서비스는 시작하지만 고유명사 번역이 일관되지 않을 수 있습니다.

## 3. 서비스 등록

서비스 관리자에 `community-translator` 리포지토리와 `community-translator-server` 서비스를 등록합니다. 예시 설정은 `deploy/haniel/community-translator.yaml.example`에 있습니다. 예시의 저장소와 서비스 항목을 해당 설정 필드에 복사합니다.

서비스 관리자는 상대 리포지토리 경로를 관리자 설정 파일의 위치를 기준으로 계산합니다. `path`와 `cwd`를 절대 경로 `/srv/haniel/services/community-translator`로 설정합니다. `post_pull`은 `/srv/haniel/services/community-translator/deploy/haniel/build-community-translator.sh`를 가리켜야 합니다.

등록한 뒤 포트 `3119`가 열렸는지 확인하고 서비스 상태를 확인합니다.

```bash
ss -ltnp 'sport = :3119'
curl --fail --silent --show-error http://127.0.0.1:3119/health
```

프로세스가 설정된 Node.js 24 바이너리를 사용하는지 확인합니다. 베어러 토큰이 없는 `POST /translate` 요청은 `401`을 반환해야 합니다.

## 4. DNS, 인증서, nginx 설정

`translator.example.com`의 A 레코드를 만듭니다. `203.0.113.10`은 문서에 쓰는 예시 주소이므로 호스트의 실제 공인 주소로 바꿉니다. DNS 제공자가 프록시 기능을 제공하면 현재 리버스 프록시와 인증서 설정에 맞는 옵션을 선택합니다.

`deploy/nginx/translator.example.com.http.conf`를 HTTP 사이트 설정으로 설치한 뒤 `nginx -t`를 실행하고 nginx를 다시 불러옵니다. 이 설정은 ACME 확인 경로와 `/health`를 노출합니다. 평문 HTTP로 번역 경로를 열지는 않습니다.

DNS가 해석되면 실행 중인 사이트 설정을 바꾸지 않고 인증서를 발급합니다. 호스트에 ACME 계정이 여러 개 있으면 기존 인증서가 사용하는 계정을 선택합니다. 예를 들어 다른 사이트의 갱신 설정에서 계정을 읽습니다.

```bash
ACME_ACCOUNT=$(sudo sed -n 's/^account = //p' /etc/letsencrypt/renewal/other.example.com.conf)

sudo certbot certonly --webroot -w /var/www/html -d translator.example.com \
  --account "$ACME_ACCOUNT" \
  --non-interactive --agree-tos --email admin@example.com
```

`deploy/nginx/translator.example.com.tls.conf`를 설치하고 `nginx -t` 통과 뒤 nginx를 다시 불러옵니다. 다른 사이트와 공유하는 443 리스너 설정은 유지합니다. `proxy_read_timeout`은 300초이며 번역이 수 분 걸릴 때 연결이 먼저 끊기지 않도록 합니다.

인증서 갱신 타이머가 갱신 뒤 nginx reload 훅을 실행하도록 설정합니다. 훅이 없으면 nginx가 만료된 인증서를 계속 제공할 수 있습니다.

## 5. 서비스 확인

1. `https://translator.example.com/health`가 `{"status":"ok"}`를 반환합니다.
2. 토큰이 없거나 잘못된 토큰으로 보낸 `POST /translate` 요청이 `401`을 반환합니다.
3. 올바른 토큰으로 짧은 영어 문장을 한국어로 번역합니다.
4. 용어집 고유명사가 든 문장이 설정한 표기로 번역되고 `glossaryTerms`가 0보다 큰지 확인합니다.
5. `target: "EN-US"`로 보낸 한국어 초안이 영어로 번역됩니다.

인증된 CLI의 사용량 한도에 도달하면 번역이 할당량 오류와 함께 `503`을 반환할 수 있습니다. CLI 계정 사용량을 확인하고 한도를 사용할 수 있을 때 다시 시도합니다.

curl 인자에 베어러 토큰을 직접 쓰지 마십시오. 보호된 환경변수나 데이터 파일을 사용합니다.

## 롤백

1. 이전 nginx 사이트 설정을 복원하고 `nginx -t`를 실행한 뒤 nginx를 다시 불러옵니다.
2. 서비스 관리자에서 이전 서비스 설정과 리포지토리 리비전을 복원합니다. 포트 `3119`와 `/health`를 확인합니다.
3. 자격증명 교체를 의도한 경우가 아니라면 `/srv/community-translator/shared/server/.env`를 그대로 둡니다.

외부 경로에만 문제가 있으면 로컬 서비스를 유지하고 nginx 설정만 복원합니다.
