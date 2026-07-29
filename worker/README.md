# FuelMap 프록시 워커

오피넷·카카오 REST 키를 서버에만 두기 위한 Cloudflare Worker.
`index.html` 은 이 워커의 두 엔드포인트만 호출하며, 키를 전혀 갖고 있지 않다.

| 엔드포인트 | 용도 |
| --- | --- |
| `GET /api/gas?x=&y=&radius=&prodcd=` | 오피넷 `aroundAll` (KATEC 좌표, 반경 최대 5000m) |
| `GET /api/places?query=&x=&y=&radius=&page=&size=` | 카카오 로컬 키워드 검색 (반경 최대 20000m) |

이전의 `?url=<임의 URL>` 중계 방식은 누구나 임의 호스트로 요청을 보낼 수 있는
오픈 프록시였다. 이 워커는 그 경로를 제공하지 않고, 위 두 경로 외에는 404 를 준다.

## 배포

```sh
cd worker
npx wrangler secret put OPINET_KEY    # 오피넷 인증키
npx wrangler secret put KAKAO_REST    # 카카오 REST API 키
npx wrangler deploy
```

`wrangler.toml` 의 `ALLOWED_ORIGINS` 를 페이지를 서비스하는 오리진으로 맞춘다.
비워 두면 모든 오리진을 허용하므로 운영에서는 반드시 지정할 것.

## 배포 순서

**워커를 먼저 배포한 뒤 페이지를 올려야 한다.** 페이지가 먼저 올라가면 아직 새
엔드포인트가 없는 워커에 요청이 가서 검색이 404 로 실패한다.

## 키 재발급

기존 키(`F260418102`, `fccb7a0e34d796a0dd19e96dd2ff767f`)는 이미 공개 저장소의
커밋 이력에 남아 있다. 워커로 옮기는 것만으로는 회수되지 않으므로 **양쪽 모두
재발급한 뒤** 위 시크릿에 새 값을 넣는다.

## 카카오맵 JavaScript 키는 예외

`index.html` 의 `<script src="//dapi.kakao.com/v2/maps/sdk.js?appkey=...">` 에 있는
appkey 는 JavaScript 키로, 브라우저에 노출되는 것이 정상이다. 카카오 개발자 콘솔의
**플랫폼 > Web > 사이트 도메인**에 배포 도메인을 등록해 다른 도메인에서 쓰지 못하게
막는 것으로 보호한다.
