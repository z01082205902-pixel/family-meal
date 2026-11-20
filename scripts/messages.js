// 텔레그램 메시지 문구 만들기 (계산은 engine.js)
function makeMessages(E, plan, SITE) {
  const { byId, DAY, ING } = E;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const yt = (id, label) => id && E.VIDS[id] ? '<a href="https://www.youtube.com/watch?v=' + id + '">' + label + '</a>' : '';
  const md = (i, d) => { const w = E.weekStartYMD(i); const t = new Date(Date.UTC(w.y, w.m, w.d + d)); return (t.getUTCMonth() + 1) + '.' + t.getUTCDate(); };
  const outday = plan.settings.outday;

  function weekly(i, label) {
    const rec = plan.weeks[i]; const st = E.simulate(rec);
    const days = E.days(rec, outday);
    const cook = days.filter(x => !x.out); const b2 = cook[2] ? cook[2].d : 3;
    const L = [];
    L.push('<b>' + label + ' 우리집 식단표</b> (' + md(i, 0) + ' ~ ' + md(i, 6) + ')');
    L.push('');
    for (const x of days) {
      if (x.out) { L.push('<b>' + DAY[x.d] + '</b> 외식·배달 데이' + (x.d === 0 ? ' · 장 보고 밑반찬 만들기' : '')); continue; }
      const d = byId[x.id]; const ex = rec.extras[d.id] ? byId[rec.extras[d.id]] : null;
      L.push('<b>' + DAY[x.d] + '</b> ' + esc(d.name) + (ex ? ' + ' + esc(E.shortName(ex.name)) : ''));
    }
    L.push('');
    L.push('밑반찬: 일요일 ' + rec.sides.slice(0, 2).map(id => byId[id].name).join(', ') + ' / ' + DAY[b2] + '요일 ' + byId[rec.sides[2]].name);
    const buys = Object.keys(st.buys);
    L.push('장볼 것 ' + buys.length + '가지: ' + buys.map(k => ING[k][0].replace(/\(.*\)/, '')).join(', '));
    const fr = Object.keys(st.fromInv);
    if (fr.length) L.push('냉장고에서 먼저 쓰는 것: ' + fr.map(k => ING[k][0].replace(/\(.*\)/, '')).join(', '));
    L.push('');
    L.push('<a href="' + SITE + '">식단표 전체 보기 (요리 영상·장보기 목록)</a>');
    L.push('매일 오전 10시에 오늘의 메뉴를 보내드려요.');
    return L.join('\n');
  }

  // 반환: {photo, caption, text}
  function daily(i, dow, prefix) {
    const rec = plan.weeks[i];
    const days = E.days(rec, outday);
    const cook = days.filter(x => !x.out); const b2 = cook[2] ? cook[2].d : 3;
    const x = days.find(y => y.d === dow);
    const head = prefix || '';
    if (x.out) {
      const outRot = E.OUT_MENUS.map((m, k) => E.OUT_MENUS[(k + i * 3) % E.OUT_MENUS.length]).slice(0, 3);
      const L = [head + '<b>오늘은 외식·배달 데이예요</b>', '', '배달앱 켜기 전에 이 중에서 골라보세요.'];
      outRot.forEach(m => L.push('· ' + m[0] + ' (' + m[1] + ')'));
      if (dow === 0) {
        L.push(''); L.push('<b>오늘 할 일</b>: 장보기 + 이번 주 밑반찬 2가지 만들기');
        rec.sides.slice(0, 2).forEach(id => L.push('· ' + esc(byId[id].name) + ' ' + yt(byId[id].vid, '영상')));
      }
      L.push(''); L.push('<a href="' + SITE + '">이번 주 식단표</a>');
      return { text: L.join('\n') };
    }
    const d = byId[x.id]; const ex = rec.extras[d.id] ? byId[rec.extras[d.id]] : null;
    const sides = E.sidesForDay(rec, x.slot, d.type).map(id => byId[id]);
    const todo = dow === b2 ? byId[rec.sides[2]] : null;
    return dishMsg(d, ex, sides, todo, head);
  }
  function dishMsg(d, ex, sides, todo, head) {
    const caption = head + '<b>오늘의 메뉴는 「' + esc(d.name) + '」입니다</b>\n' + esc(d.desc || '') + '\n\n그림은 예시예요. 국·반찬은 아래 구성대로 차려요.';
    const L = [];
    L.push('<b>오늘 한 상</b>');
    L.push('· 메인: ' + esc(d.name));
    if (ex) L.push('· ' + (ex.role === 'soup' ? '국' : '곁들이') + ': ' + esc(ex.name) + ' (' + ex.time + '분)');
    if (sides.length) L.push('· 밑반찬: ' + sides.map(s => esc(s.name)).join(', ') + ' (만들어 둔 것)');
    L.push('· 김치' + (d.type === 'bowl0' ? '' : ', 김'));
    L.push('');
    L.push('한 상 약 ' + (d.time + (ex ? ex.time : 0)) + '분 · ' + (d.lv === 1 ? '왕초보 OK' : '보통 난이도') + ' · ' + (d.spicy ? '매콤' : '안 매움'));
    L.push('<b>초보 팁</b>: ' + esc(d.tip));
    if (ex) L.push('<b>' + esc(ex.name) + '</b>: ' + esc(ex.tip));
    L.push('<b>두 끼로 나눠 먹으면</b>: ' + esc(d.second));
    if (todo) { L.push(''); L.push('<b>오늘 할 일</b>: 밑반찬 「' + esc(todo.name) + '」 추가로 만들기 (' + todo.time + '분) ' + yt(todo.vid, '영상')); }
    L.push('');
    const links = [yt(d.vid, '메인 따라 하기 영상'), d.sid && E.VIDS[d.sid] ? '<a href="https://www.youtube.com/shorts/' + d.sid + '">1분 쇼츠</a>' : '', ex ? yt(ex.vid, esc(ex.name) + ' 영상') : ''].filter(Boolean);
    L.push(links.join(' · '));
    L.push('<a href="' + SITE + '">이번 주 식단표</a>');
    return { photo: SITE + 'img/' + d.id + '.jpg', caption, text: L.join('\n') };
  }

  // 시작 주간(정식 주 시작 전 며칠)
  function bridgeIntro() {
    const b = plan.bridge; const st = E.newState({}); const use = {};
    b.days.forEach(x => { [x.main, x.extra].filter(Boolean).forEach(id => { E.consume(st, byId[id]); for (const k of Object.keys(byId[id].ing)) { use[k] = use[k] || []; use[k].push(DAY[x.dow] + ' ' + E.shortName(byId[id].name)); } }); });
    const L = ['<b>오늘부터 우리집 식단 시작!</b>', '정식 주간 식단은 일요일부터예요. 그 전 ' + b.days.length + '일은 이렇게 먹어요.', ''];
    b.days.forEach(x => { const d = byId[x.main]; const ex = x.extra ? byId[x.extra] : null; L.push('<b>' + DAY[x.dow] + ' (' + x.date.slice(5).replace('-', '.') + ')</b> ' + esc(d.name) + (ex ? ' + ' + esc(E.shortName(ex.name)) : '') + ' · 김치, 김'); });
    L.push(''); L.push('<b>오늘 장볼 것</b> (' + b.days.length + '일치, ' + plan.settings.people + '인 기준)');
    for (const cat of E.CAT_ORDER) { const keys = Object.keys(st.buys).filter(k => ING[k][2] === cat); if (!keys.length) continue; L.push('<b>[' + cat + ']</b>'); keys.forEach(k => L.push('□ ' + esc(ING[k][0]) + ' <b>' + esc(ING[k][4]) + (st.buys[k] > 1 ? ' × ' + st.buys[k] : '') + '</b>  <i>(' + esc([...new Set(use[k])].join(', ')) + ')</i>')); }
    const pantry = [...new Set(b.days.flatMap(x => [x.main, x.extra].filter(Boolean).flatMap(id => byId[id].p)))].map(k => E.PANTRY[k]);
    L.push('<b>[양념 확인]</b> ' + esc(pantry.join(', ')));
    L.push('김치·김은 집에 있는 걸로 (없으면 같이 사기)');
    L.push(''); L.push('남는 두부·계란·양파·대파 등은 다음 주 식단에 먼저 써서, 일요일 장보기 목록이 그만큼 줄어요.');
    return L.join('\n');
  }
  function bridgeDaily(ymd, head) {
    const x = (plan.bridge && plan.bridge.days || []).find(y => y.date === ymd); if (!x) return null;
    return dishMsg(byId[x.main], x.extra ? byId[x.extra] : null, [], null, head || '');
  }
  // 장보기 목록 (파는 단위, 분류별)
  function shopping(i) {
    const rec = plan.weeks[i]; const st = E.simulate(rec);
    const days = E.days(rec, outday);
    const use = {}; const total = {}; const P = plan.settings.people / 2;
    const addUse = (item, label) => { for (const [k, q] of Object.entries(item.ing)) { use[k] = use[k] || []; if (!use[k].includes(label)) use[k].push(label); total[k] = (total[k] || 0) + q * P; } };
    rec.sides.forEach((id, k) => addUse(byId[id], (k < 2 ? '일' : '수') + ' ' + E.shortName(byId[id].name)));
    for (const x of days) { if (x.out) continue; const d = byId[x.id]; addUse(d, DAY[x.d] + ' ' + E.shortName(d.name)); if (rec.extras[d.id]) addUse(byId[rec.extras[d.id]], DAY[x.d] + ' ' + E.shortName(byId[rec.extras[d.id]].name)); }
    const L = ['<b>장보기 목록</b> (' + md(i, 0) + ' ~ ' + md(i, 6) + ', ' + plan.settings.people + '인 기준)', '파는 단위로 적었어요. 남는 양은 다음 주 식단에 먼저 써요.'];
    let n = 0;
    for (const cat of E.CAT_ORDER) {
      const keys = Object.keys(st.buys).filter(k => ING[k][2] === cat); if (!keys.length) continue;
      L.push(''); L.push('<b>[' + cat + ']</b>');
      for (const k of keys) { n++; const cnt = st.buys[k]; L.push('□ ' + esc(ING[k][0]) + ' <b>' + esc(ING[k][4]) + (cnt > 1 ? ' × ' + cnt : '') + '</b>  <i>(' + esc(use[k].slice(0, 3).join(', ')) + (use[k].length > 3 ? ' 외' : '') + ')</i>'); }
    }
    const fr = Object.keys(st.fromInv);
    if (fr.length) { L.push(''); L.push('<b>[냉장고에 있는 걸로 쓰는 것]</b>'); L.push(fr.map(k => esc(ING[k][0].replace(/\(.*\)/, '')) + ' ' + E.qtyStr(k, st.fromInv[k])).join(', ')); }
    const pantry = [...new Set([...rec.mains, ...rec.sides, ...Object.values(rec.extras)].flatMap(id => byId[id].p))].map(k => E.PANTRY[k]);
    L.push(''); L.push('<b>[양념 확인]</b> 떨어진 것만 사세요'); L.push(esc(pantry.join(', ')));
    L.push(''); L.push('총 ' + n + '가지 · 김치·김이 집에 있으면 빼세요');
    L.push('<a href="' + SITE + '">식단표에서 장보기 목록 보기</a>');
    return L.join('\n');
  }
  return { weekly, daily, shopping, bridgeIntro, bridgeDaily, dishMsg };
}
if (typeof module !== 'undefined') module.exports = { makeMessages };
