/**
 * FuelMap 프록시 워커 (Cloudflare Workers)
 *
 * 오피넷·카카오 REST 키를 서버에만 보관하고 클라이언트에는 노출하지 않는다.
 * 임의 URL 을 중계하던 이전 `?url=` 방식을 대체하며, 정해진 두 엔드포인트만 받는다.
 *
 *   GET /api/gas?x=&y=&radius=&prodcd=      → 오피넷 aroundAll XML
 *   GET /api/places?query=&x=&y=&radius=&page=&size=  → 카카오 로컬 키워드 검색 JSON
 *
 * 배포:
 *   cd worker
 *   npx wrangler secret put OPINET_KEY
 *   npx wrangler secret put KAKAO_REST
 *   npx wrangler deploy
 */

/* 오피넷 제품 코드 화이트리스트 (휘발유/경유/LPG/고급휘발유/실내등유) */
const PROD_CODES = new Set(['B027', 'D047', 'C004', 'B034', 'K015']);

/* 오피넷 aroundAll 반경 상한 */
const GAS_MAX_RADIUS = 5000;
/* 카카오 로컬 검색 반경 상한 */
const PLACE_MAX_RADIUS = 20000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get('Origin') || '', env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, cors);

    try {
      if (url.pathname === '/api/gas') return await gas(url, env, cors);
      if (url.pathname === '/api/places') return await places(url, env, cors);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 502, cors);
    }
    return json({ error: 'not found' }, 404, cors);
  }
};

/* ── 오피넷: 반경 내 주유소 ── */
async function gas(url, env, cors) {
  if (!env.OPINET_KEY) return json({ error: 'OPINET_KEY not configured' }, 500, cors);

  const x = int(url.searchParams.get('x'), 0, 10000000);
  const y = int(url.searchParams.get('y'), 0, 10000000);
  const radius = int(url.searchParams.get('radius'), 1, GAS_MAX_RADIUS);
  const prodcd = url.searchParams.get('prodcd') || 'B027';

  if (x === null || y === null || radius === null) return json({ error: 'invalid x/y/radius' }, 400, cors);
  if (!PROD_CODES.has(prodcd)) return json({ error: 'invalid prodcd' }, 400, cors);

  const target = 'https://www.opinet.co.kr/api/aroundAll.do'
    + '?code=' + encodeURIComponent(env.OPINET_KEY)
    + '&x=' + x + '&y=' + y + '&radius=' + radius
    + '&prodcd=' + prodcd + '&sort=1&out=xml';

  const res = await fetch(target);
  return new Response(await res.text(), {
    status: res.status,
    headers: { ...cors, 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
  });
}

/* ── 카카오: 장소 키워드 검색 (전기/급속/수소 충전소) ── */
async function places(url, env, cors) {
  if (!env.KAKAO_REST) return json({ error: 'KAKAO_REST not configured' }, 500, cors);

  const query = (url.searchParams.get('query') || '').trim().slice(0, 60);
  const x = float(url.searchParams.get('x'), 124, 132); // 경도
  const y = float(url.searchParams.get('y'), 33, 39);   // 위도
  const radius = int(url.searchParams.get('radius'), 1, PLACE_MAX_RADIUS);
  const page = int(url.searchParams.get('page'), 1, 3);
  const size = int(url.searchParams.get('size'), 1, 15);

  if (!query) return json({ error: 'query required' }, 400, cors);
  if (x === null || y === null || radius === null || page === null || size === null) {
    return json({ error: 'invalid params' }, 400, cors);
  }

  const target = 'https://dapi.kakao.com/v2/local/search/keyword.json'
    + '?query=' + encodeURIComponent(query)
    + '&x=' + x + '&y=' + y + '&radius=' + radius
    + '&sort=distance&page=' + page + '&size=' + size;

  const res = await fetch(target, { headers: { Authorization: 'KakaoAK ' + env.KAKAO_REST } });
  return new Response(await res.text(), {
    status: res.status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
  });
}

/* ── 유틸 ── */
function int(v, min, max) {
  if (v === null || v === '' || !/^-?\d+$/.test(v)) return null;
  const n = parseInt(v, 10);
  return n >= min && n <= max ? n : null;
}
function float(v, min, max) {
  const n = Number(v);
  return v !== null && v !== '' && isFinite(n) && n >= min && n <= max ? n : null;
}
function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }
  });
}
/* ALLOWED_ORIGINS 가 비어 있으면 모든 오리진을 허용한다 (개발용) */
function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.length === 0 || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? (origin || '*') : 'null',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
