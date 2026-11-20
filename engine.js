// 우리집 식단 엔진: 브라우저와 Node(깃허브 자동 발송) 둘 다에서 쓰는 계산 코드
function makeEngine(DATA, getPeople) {
  const { ING, PANTRY, ITEMS, VIDS } = DATA;
  const byId = Object.fromEntries(ITEMS.map(d => [d.id, d]));
  const MAINS = ITEMS.filter(d => d.role === 'main');
  const DAY = ['일', '월', '화', '수', '목', '금', '토'];
  const SLOTS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const SLOT_NAME = { A: '고기 메인', B: '두부·계란·어묵', C: '해산물', D: '고기 국물요리', E: '별미 한 그릇', F: '냉장고 털기' };
  const FAMILY = { chadol: '된장', doenjang: '된장', kimchijjigae: '김치', chamchikimchi: '김치', budae: '김치', kimchibap: '김치', dakbokkeum: '닭', jjimdak: '닭', dakgalbi: '닭', teriyaki: '닭' };
  const EGGY = ['gyeranguk', 'gyeranjjim', 'gyeranmari'];
  const NOODLE = ['kalguksu', 'myeongran', 'janchi', 'bibimguksu', 'tteokbokki'];
  const CAT_ORDER = ['정육', '수산', '두부·계란·가공', '채소', '면·떡·건어물·소스', '냉장 상비'];
  const EPOCH_MS = Date.UTC(2026, 0, 4); // 2026-01-04 일요일
  const OUT_MENUS = [['샤브샤브', '채소 많이, 국물 담백'], ['쌀국수', '가볍고 따뜻하게'], ['회덮밥·초밥', '단백질 듬뿍'], ['순대국·돼지국밥', '든든한 국밥'], ['포케·샐러드볼', '채소 보충'], ['돈가스·우동', '무난한 메뉴'], ['짬뽕·탕수육', '기분 내는 날'], ['김밥·떡볶이', '분식 세트'], ['치킨', '샐러드 하나 추가하기'], ['피자·파스타', '외식 느낌']];
  const F = () => (getPeople ? getPeople() : 2) / 2;

  // y,m,d(달력 날짜) 기준 주 번호. 시간대 영향 없이 계산
  function weekIndexYMD(y, m, d) { const t = Date.UTC(y, m, d); const dow = new Date(t).getUTCDay(); return Math.round((t - dow * 86400000 - EPOCH_MS) / 86400000 / 7); }
  function weekStartYMD(i) { const t = new Date(EPOCH_MS + i * 7 * 86400000); return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() }; }
  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const life = k => ING[k][5];
  function pw(k) { const l = life(k); let w = l <= 3 ? 3 : l <= 7 ? 2 : 1; if (ING[k][2] === '정육' || ING[k][2] === '수산') w += 1; return w; }
  const round = q => Math.round(q * 100) / 100;
  const newPool = inv => Object.assign({}, inv || {});
  function newState(inv) { return { pool: newPool(inv), invLeft: newPool(inv), buys: {}, fromInv: {} }; }
  function consume(st, item) {
    if (!item) return;
    for (const [k, q0] of Object.entries(item.ing)) {
      const q = q0 * F();
      const avail = Math.max(0, st.invLeft[k] || 0);
      const useInv = Math.min(q, avail);
      if (useInv > 0) { st.invLeft[k] -= useInv; st.fromInv[k] = (st.fromInv[k] || 0) + useInv; }
      let have = st.pool[k] || 0;
      if (have >= q * 0.75 - 1e-9) { st.pool[k] = Math.max(0, have - q); continue; } // 조금 모자라면 있는 만큼 쓰기
      const pack = ING[k][3]; const n = Math.ceil((q - have) / pack - 1e-9);
      st.buys[k] = (st.buys[k] || 0) + n; have += n * pack; st.pool[k] = have - q;
    }
  }
  function score(item, st) {
    let s = 0, miss = 0;
    for (const [k, q0] of Object.entries(item.ing)) { const q = q0 * F(); const h = st.pool[k] || 0; if (h >= q * 0.75 - 1e-9) s += pw(k); else { if (h > 0) s += pw(k) * 0.5; miss++; } }
    return s - 0.6 * miss;
  }
  let GEN_I = 0;
  function pickRanked(cands, st, last, r, top) {
    const arr = cands.map(d => ({ d, s: score(d, st) + Math.min(8, GEN_I - (last[d.id] ?? -999)) * 0.25, l: (last[d.id] ?? -999), x: r() }));
    arr.sort((a, b) => (b.s - a.s) || (a.l - b.l) || (a.x - b.x));
    const t = arr.slice(0, top || 3);
    return t.length ? t[Math.floor(r() * t.length)].d : null;
  }
  const extrasFor = main => (main.type === 'main' || main.type === 'bowl') ? 'soup' : (main.type === 'jjigae' ? 'mini' : null);

  function genWeek(i, inv, last, prevMains, keep) {
    GEN_I = i;
    const r = rng(i * 7919 + 12345 + (keep && keep.seed || 0));
    let best = null;
    for (let attempt = 0; attempt < 150; attempt++) {
      const relax = attempt > 100;
      const st = newState(inv); const picks = []; let ok = true;
      for (let si = 0; si < SLOTS.length; si++) {
        const s = SLOTS[si];
        if (keep && keep.mains && keep.mains[si]) { picks.push(keep.mains[si]); consume(st, byId[keep.mains[si]]); continue; }
        let c = MAINS.filter(d => d.slots.includes(s) && !picks.includes(d.id) && (relax || (!prevMains.includes(d.id) && !((last[d.id] ?? -999) >= i - 3))));
        if (picks.some(id => FAMILY[id])) { const fams = picks.map(id => FAMILY[id]).filter(Boolean); c = c.filter(d => !FAMILY[d.id] || !fams.includes(FAMILY[d.id])); }
        if (s === 'D' && picks[0]) c = c.filter(d => d.protein !== byId[picks[0]].protein);
        if (picks.filter(id => byId[id].protein === '돼지').length >= 2) c = c.filter(d => d.protein !== '돼지');
        if (picks.some(id => NOODLE.includes(id))) c = c.filter(d => !NOODLE.includes(d.id));
        if (!c.length) { ok = false; break; }
        const d = pickRanked(c, st, last, r, 3); picks.push(d.id); consume(st, d);
      }
      if (!ok) continue;
      const sp = picks.map(id => byId[id].spicy);
      let three = false; for (let k = 0; k + 2 < sp.length; k++) if (sp[k] && sp[k + 1] && sp[k + 2]) three = true;
      if (!relax && (sp.reduce((a, b) => a + b, 0) > 3 || three)) continue;
      best = { picks, st }; break;
    }
    if (!best) { const picks = ['jeyuk', 'doenjang', 'godeungeo', 'muguk', 'curry', 'kimchibap']; const st = newState(inv); picks.forEach(id => consume(st, byId[id])); best = { picks, st }; }
    const { picks, st } = best;
    const used = new Set(picks);
    const recent = id => (last[id] ?? -999) >= i - 1;
    const s1c = ITEMS.filter(d => d.role === 'side1' && !recent(d.id) && !(d.id === 'musaengchae' && used.has('suyuk')));
    const sides = [];
    for (let n = 0; n < 2; n++) { const d = pickRanked(s1c.filter(x => !sides.includes(x.id)), st, last, r, 2); sides.push(d.id); consume(st, d); }
    const d2 = pickRanked(ITEMS.filter(d => d.role === 'side2' && !recent(d.id)), st, last, r, 2); sides.push(d2.id); consume(st, d2);
    const extras = {}; const usedEx = [];
    for (const id of picks) {
      const role = extrasFor(byId[id]); if (!role) continue;
      const eggUsed = usedEx.some(x => EGGY.includes(x)) || picks.includes('eggfriedrice');
      const d = pickRanked(ITEMS.filter(x => x.role === role && !usedEx.includes(x.id) && !(eggUsed && EGGY.includes(x.id))), st, last, r, 2) || pickRanked(ITEMS.filter(x => x.role === role && !usedEx.includes(x.id)), st, last, r, 2);
      extras[id] = d.id; usedEx.push(d.id); consume(st, d);
    }
    const slotOf = {}; picks.forEach((id, k) => slotOf[id] = SLOTS[k]);
    const pos = (keep && keep.pos) || {};
    const fPick = picks[5];
    const free = picks.filter(id => !(id in pos));
    const order = free.filter(id => id !== fPick).map((id, k) => ({ id, k, l: Math.min(...Object.keys(byId[id].ing).map(life)) })).sort((a, b) => (a.l - b.l) || (a.k - b.k)).map(x => x.id);
    if (free.includes(fPick)) order.push(fPick);
    const mains = new Array(6).fill(null); for (const id in pos) mains[pos[id]] = id;
    let j = 0; for (let k = 0; k < 6; k++) if (!mains[k]) mains[k] = order[j++];
    return { mains, slotOf, extras, sides, inv: newPool(inv), v: 2 };
  }
  function simulate(rec) {
    const st = newState(rec.inv);
    consume(st, byId[rec.sides[0]]); consume(st, byId[rec.sides[1]]);
    rec.mains.forEach((id, k) => { consume(st, byId[id]); if (rec.extras[id]) consume(st, byId[rec.extras[id]]); if (k === 2) consume(st, byId[rec.sides[2]]); });
    return st;
  }
  function carry(pool) {
    const out = {};
    for (const k in pool) {
      const q = pool[k]; if (q <= 1e-6) continue; const pack = ING[k][3];
      if (q < pack * 0.25) continue;
      const frozen = ING[k][2] === '정육' || ING[k][2] === '수산';
      if (life(k) >= 7 || frozen) out[k] = round(q);
    }
    return out;
  }
  function lastFrom(weeks, upto, start) { const last = {}; for (let k = start; k < upto; k++) { const r = weeks[k]; if (!r) continue; [...r.mains, ...r.sides, ...Object.values(r.extras)].forEach(id => last[id] = k); } return last; }
  // weeks: {주번호: 기록}. start 주부터 target 주까지 빈 주를 채운다(앞 주의 남는 재료를 이월)
  function ensureWeeks(weeks, start, target, firstInv) {
    for (let k = start; k <= target; k++) {
      if (weeks[k]) continue;
      const prev = weeks[k - 1];
      const inv = (k > start && prev) ? carry(simulate(prev).pool) : (firstInv || {});
      weeks[k] = genWeek(k, inv, lastFrom(weeks, k, start), prev ? prev.mains : []);
    }
    return weeks[target];
  }
  // 요일별 배치: 외식 요일 빼고 메인 순서대로
  function days(rec, outday) {
    const out = []; let si = 0;
    for (let d = 0; d < 7; d++) { if (d === outday) out.push({ d, out: true }); else { out.push({ d, slot: si, id: rec.mains[si] }); si++; } }
    return out;
  }
  function sidesForDay(rec, si, type) {
    const s = rec.sides; const set = si < 2 ? [s[0], s[1]] : si < 4 ? [s[2], s[0]] : [s[2], s[1]];
    return (type === 'bowl' || type === 'bowl0') ? [set[0]] : set;
  }
  function qtyStr(k, q) { const u = ING[k][1]; if (u === 'g') return (q < 100 ? Math.ceil(q / 10) * 10 : Math.ceil(q / 50) * 50) + 'g'; const x = Math.ceil(q * 2 - 1e-9) / 2; if (x <= 0.5) return '1/2' + u; return (Number.isInteger(x) ? x : x.toFixed(1)) + u; }
  const shortName = n => n.split(' + ')[0].replace(/\(.*\)/, '');
  return { ING, PANTRY, ITEMS, VIDS, byId, MAINS, DAY, SLOTS, SLOT_NAME, CAT_ORDER, OUT_MENUS, EGGY, weekIndexYMD, weekStartYMD, newState, consume, score, extrasFor, genWeek, simulate, carry, ensureWeeks, lastFrom, days, sidesForDay, qtyStr, shortName, round };
}
if (typeof module !== 'undefined') module.exports = { makeEngine };
