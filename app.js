// 우리집 식단표 화면
const MEM = {};
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? (k in MEM ? MEM[k] : d) : JSON.parse(v); } catch (e) { return k in MEM ? MEM[k] : d; } }, set(k, v) { MEM[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }, del(k) { delete MEM[k]; try { localStorage.removeItem(k); } catch (e) { } } };
let OFFICIAL = null; // 깃허브에 올라간 공식 식단(plan.json). 텔레그램 알림도 이걸 기준으로 보낸다
function people() { return +LS.get('mp3-people', OFFICIAL ? OFFICIAL.settings.people : 2); }
function outDay() { return +LS.get('mp3-outday', OFFICIAL ? OFFICIAL.settings.outday : 0); }
const E = makeEngine(DATA, people);
const { ING, PANTRY, byId, MAINS, DAY, SLOTS, SLOT_NAME, CAT_ORDER, OUT_MENUS, EGGY } = E;
const LIGHT = ['고구마', '두유', '그릭요거트', '바나나', '견과류', '옥수수', '통밀식빵'];
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = new Date();
let currentWeek = E.weekIndexYMD(today.getFullYear(), today.getMonth(), today.getDate());
function startWeek() {
  if (OFFICIAL) return OFFICIAL.start;
  let s = LS.get('mp3-start', null);
  if (s == null) { s = currentWeek + (today.getDay() >= 4 ? 1 : 0); LS.set('mp3-start', s); }
  return s;
}
function activeWeek() { return Math.max(currentWeek, startWeek()); }
function weekDate(i, d) { const w = E.weekStartYMD(i); return new Date(w.y, w.m, w.d + (d || 0)); }
function edited(i) { return LS.get('mp3-rec-' + i, null); }
function getRec(i) {
  const s = startWeek();
  if (edited(i)) return edited(i);
  if (OFFICIAL && OFFICIAL.weeks[i]) return OFFICIAL.weeks[i];
  const weeks = {};
  if (i < s) { return E.ensureWeeks(weeks, i, i, {}); }
  for (let k = s; k <= i; k++) { const r = edited(k) || (OFFICIAL && OFFICIAL.weeks[k]); if (r) weeks[k] = r; }
  return E.ensureWeeks(weeks, s, i, {});
}
function saveRec(i, rec) { LS.set('mp3-rec-' + i, rec); }

let view = currentWeek;
const fmtDate = d => (d.getMonth() + 1) + '.' + d.getDate();
function fmtViews(v) { if (!v) return ''; if (v >= 10000) return Math.round(v / 10000).toLocaleString() + '만회'; return v.toLocaleString() + '회'; }
function fmtDur(s) { if (!s) return ''; if (s <= 90) return s + '초'; return Math.round(s / 60) + '분'; }
const qtyStr = E.qtyStr, shortName = E.shortName;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2000); }
function ytLink(id, label) { return id && DATA.VIDS[id] ? '<a href="https://www.youtube.com/watch?v=' + id + '" target="_blank" rel="noopener">' + (label || '영상') + '</a>' : ''; }
function videoBlock(id, label) { const v = DATA.VIDS[id]; if (!v) return ''; return '<a class="thumb" href="https://www.youtube.com/watch?v=' + id + '" target="_blank" rel="noopener"><img loading="lazy" src="https://i.ytimg.com/vi/' + id + '/mqdefault.jpg" alt=""><span class="vt"><b>' + label + '</b>' + esc(v.t) + '<em>' + esc(v.ch) + ' · 조회수 ' + fmtViews(v.v) + ' · ' + fmtDur(v.d) + '</em></span></a>'; }
function layout(i, rec) { const od = outDay(); return { ws: weekDate(i), days: E.days(rec, od).map(x => Object.assign(x, { date: weekDate(i, x.d) })) }; }

function render() {
  const i = view; const rec = getRec(i); const st = E.simulate(rec);
  const { ws, days } = layout(i, rec);
  const we = weekDate(i, 6);
  const tag = (i === startWeek() && i > currentWeek) ? '다음 주 (첫 장보기 주)' : i === currentWeek ? '이번 주' : (i === currentWeek + 1 ? '다음 주' : (i < currentWeek ? '지난 주' : ''));
  $('range').textContent = tag + '  ' + ws.getFullYear() + '.' + fmtDate(ws) + '(일) ~ ' + fmtDate(we) + '(토) · ' + people() + '인 기준';
  ['prevW', 'thisW', 'nextW'].forEach(b => $(b).classList.remove('on'));
  if (i === activeWeek()) $('thisW').classList.add('on'); else if (i > activeWeek()) $('nextW').classList.add('on'); else $('prevW').classList.add('on');
  $('editNote').style.display = (OFFICIAL && edited(i)) ? 'block' : 'none';
  renderFridge(i, rec);
  const done = LS.get('mp3-done-' + i, {});
  const todayKey = today.toDateString();
  const cookDays = days.filter(x => !x.out);
  const batch2Day = cookDays[2] ? cookDays[2].d : 3;
  const outRot = OUT_MENUS.map((m, k) => OUT_MENUS[(k + i * 3) % OUT_MENUS.length]).slice(0, 3);
  const sideB1 = rec.sides.slice(0, 2).map(id => byId[id]); const sideB2 = byId[rec.sides[2]];
  const batch1Html = '<div class="batch"><b>반찬 만드는 날</b> 장 보고 와서 밑반찬 2가지 (약 ' + (sideB1[0].time + sideB1[1].time) + '분)<br>' + sideB1.map(s => esc(s.name) + ' ' + ytLink(s.vid, '영상') + ' <span style="color:var(--sub);font-size:12px">냉장 ' + s.keep + '</span>').join('<br>') + '</div>';
  const batch2Html = '<div class="batch"><b>반찬 추가하는 날</b> 금방 하는 밑반찬 1가지 (약 ' + sideB2.time + '분)<br>' + esc(sideB2.name) + ' ' + ytLink(sideB2.vid, '영상') + ' <span style="color:var(--sub);font-size:12px">냉장 ' + sideB2.keep + '</span></div>';
  const prots = [...new Set(rec.mains.map(id => byId[id].protein))];
  $('summary').innerHTML = '메인 <b>' + rec.mains.length + '가지</b> + 밑반찬 <b>3가지</b> + 외식·배달 1번 · 단백질 ' + prots.join(', ') + ' · 냉장고 재료 <b>' + Object.keys(st.fromInv).length + '가지</b> 활용 · 새로 살 것 <b>' + Object.keys(st.buys).length + '가지</b>';
  let h = '';
  for (const day of days) {
    const isToday = day.date.toDateString() === todayKey;
    const head = '<div class="chead"><span class="day">' + DAY[day.d] + '요일<small>' + fmtDate(day.date) + '</small>' + (isToday ? '<span class="todaytag">오늘</span>' : '') + '</span><span class="slot">' + (day.out ? '쉬는 날' : SLOT_NAME[(rec.slotOf && rec.slotOf[day.id]) || byId[day.id].slots[0]]) + '</span></div>';
    if (day.out) {
      h += '<div class="card out' + (isToday ? ' today' : '') + '">' + head + '<div class="dish">외식 · 배달 데이</div><div class="info"><p>배달앱 켜기 전에 이 중 하나로 정해두세요. 이번 주 추천:</p><ul>' + outRot.map(m => '<li><b>' + m[0] + '</b> <span style="color:var(--sub)">' + m[1] + '</span></li>').join('') + '</ul></div>' + (day.d === 0 ? batch1Html : '') + (day.d === batch2Day ? batch2Html : '') + '<div style="height:12px"></div></div>';
      continue;
    }
    const d = byId[day.id]; const si = day.slot; const isDone = !!done[day.id];
    const ex = rec.extras[d.id] ? byId[rec.extras[d.id]] : null;
    const sides = E.sidesForDay(rec, si, d.type).map(id => byId[id]);
    const fr = Object.keys(d.ing).filter(k => rec.inv[k]);
    let links = '';
    if (d.sid && DATA.VIDS[d.sid]) links += '<a href="https://www.youtube.com/shorts/' + d.sid + '" target="_blank" rel="noopener">1분 쇼츠 · ' + fmtViews(DATA.VIDS[d.sid].v) + '</a>';
    if (d.extra && DATA.VIDS[d.extra.vid]) links += '<a href="https://www.youtube.com/watch?v=' + d.extra.vid + '" target="_blank" rel="noopener">' + d.extra.label + ' 영상 · ' + fmtViews(DATA.VIDS[d.extra.vid].v) + '</a>';
    let rows = '<div class="trow"><span class="lb">메인</span><span class="nm">' + esc(d.name) + '</span></div>';
    if (ex) rows += '<div class="trow"><span class="lb">' + (ex.role === 'soup' ? '국' : '곁들이') + '</span><span class="nm">' + esc(ex.name) + ' <span style="color:var(--sub);font-size:12px">' + ex.time + '분</span>' + ytLink(ex.vid, '영상') + '</span></div>';
    else if (d.type === 'heavy') rows += '<div class="trow"><span class="lb">국물</span><span class="nm" style="color:var(--sub)">메인이 국물 넉넉한 요리라 따로 안 끓여요</span></div>';
    rows += '<div class="trow"><span class="lb">밑반찬</span><span class="nm">' + sides.map(s => esc(s.name)).join(', ') + ' <span class="mk">만들어 둔 것</span></span></div>';
    rows += '<div class="trow"><span class="lb">기본</span><span class="nm">김치' + (d.type === 'bowl0' ? ' (면·양식 날은 김치나 피클만)' : ', 김') + '</span></div>';
    const total = d.time + (ex ? ex.time : 0);
    const ingAll = [d, ex].filter(Boolean).map(x => esc(shortName(x.name)) + ': ' + Object.entries(x.ing).map(([k, q]) => ING[k][0].replace(/\(.*\)/, '') + ' ' + qtyStr(k, q * people() / 2)).join(', ')).join('<br>');
    const pAll = [...new Set([d, ex].filter(Boolean).flatMap(x => x.p))].map(k => PANTRY[k]).join(', ');
    h += '<div class="card' + (isToday ? ' today' : '') + (isDone ? ' done' : '') + '">' + head +
      '<img class="photo" loading="lazy" src="' + (d.photo || ('img/' + d.id + '.jpg')) + '" alt="" onerror="this.remove()">' +
      '<div class="dish">' + esc(d.name) + '</div>' +
      '<div class="meta"><span>한 상 약 ' + total + '분</span><span>' + (d.lv === 1 ? '왕초보 OK' : '보통') + '</span>' + (d.spicy ? '<span class="hot">매콤</span>' : '<span>안 매움</span>') + '<span>' + d.protein + '</span>' + (fr.length ? '<span class="fr">냉장고 털기: ' + fr.map(k => ING[k][0].replace(/\(.*\)/, '')).join(', ') + '</span>' : '') + '</div>' +
      videoBlock(d.vid, '메인 따라 할 영상') + (links ? '<div class="links">' + links + '</div>' : '') +
      '<div class="table"><div class="tt">오늘 한 상</div>' + rows + '</div>' +
      (day.d === 0 ? batch1Html : '') + (day.d === batch2Day ? batch2Html : '') +
      '<div class="info"><p><span class="k">2끼로 나눠 먹으면</span>' + esc(d.second) + '</p><p><span class="k">초보 팁</span>' + esc(d.tip) + (ex ? ' / ' + esc(ex.name) + ': ' + esc(ex.tip) : '') + '</p></div>' +
      '<details class="ings"><summary>재료·양념 보기</summary>' + ingAll + '<br>양념: ' + esc(pAll) + '</details>' +
      '<div class="cfoot"><button data-act="done" data-id="' + d.id + '">' + (isDone ? '먹었어요 취소' : '먹었어요') + '</button><button data-act="swap" data-s="' + si + '">다른 메뉴로</button></div></div>';
  }
  $('grid').innerHTML = h;
  renderShop(i, rec, st, days);
}

function renderFridge(i, rec) {
  const editable = i === activeWeek();
  $('fridgeWeek').textContent = editable ? '(이번 장보기 주 시작 기준)' : (i > activeWeek() ? '(다음 주 시작 예상: 이번 주 남는 재료)' : '(그 주 시작 기준)');
  const keys = Object.keys(rec.inv);
  $('fridgeNote').textContent = editable ? '여기 있는 재료를 먼저 쓰는 메뉴로 식단을 짜요. 지난주에 남은 재료는 자동으로 들어와요. 실제와 다르면 고치고 「냉장고 기준으로 식단 다시 짜기」를 누르세요.' + (OFFICIAL ? ' (여기서 고친 건 이 기기에서만 바뀌어요. 텔레그램 알림까지 바꾸려면 Aside에 말해주세요)' : '') : '미리보기라 고칠 수 없어요.';
  $('fridgeChips').innerHTML = keys.length ? keys.map(k => '<span class="chip">' + esc(ING[k][0].replace(/\(.*\)/, '')) + ' <b>' + qtyStr(k, rec.inv[k]) + '</b>' + (editable ? '<button data-fr="' + k + '">다 썼어요</button>' : '') + '</span>').join('') : '<span class="empty">비어 있어요. 지금 냉장고에 있는 고기·채소·두부 같은 재료를 추가해 주세요.</span>';
  $('addrow').style.display = editable ? 'flex' : 'none';
}

function renderShop(i, rec, st, days) {
  const need = {};
  const addUse = (item, label) => { for (const k of Object.keys(item.ing)) { need[k] = need[k] || []; if (!need[k].includes(label)) need[k].push(label); } };
  rec.sides.forEach((id, k) => addUse(byId[id], (k < 2 ? '일' : '수') + ' ' + shortName(byId[id].name)));
  for (const day of days) { if (day.out) continue; const d = byId[day.id]; addUse(d, DAY[day.d] + ' ' + shortName(d.name)); if (rec.extras[d.id]) addUse(byId[rec.extras[d.id]], DAY[day.d] + ' ' + shortName(byId[rec.extras[d.id]].name)); }
  const totalNeed = {};
  const add = item => { for (const [k, q] of Object.entries(item.ing)) totalNeed[k] = (totalNeed[k] || 0) + q * people() / 2; };
  rec.sides.forEach(id => add(byId[id])); rec.mains.forEach(id => { add(byId[id]); if (rec.extras[id]) add(byId[rec.extras[id]]); });
  const editable = i === activeWeek();
  let h = '';
  for (const cat of CAT_ORDER) {
    const keys = Object.keys(st.buys).filter(k => ING[k][2] === cat); if (!keys.length) continue;
    h += '<div class="cat"><h3>' + cat + '</h3>';
    for (const k of keys) {
      const n = st.buys[k]; const left = st.pool[k] || 0; const fromF = st.fromInv[k] || 0;
      h += '<div class="item"><span class="nm">' + esc(ING[k][0]) + '<span class="use">' + esc((need[k] || []).join(', ')) + '</span><span class="use">필요 ' + qtyStr(k, totalNeed[k]) + (fromF ? ' (냉장고 ' + qtyStr(k, fromF) + ' 먼저 사용)' : '') + (left > ING[k][3] * 0.15 ? ' · 남는 양 ' + qtyStr(k, left) : '') + '</span></span><span class="q">' + esc(ING[k][4]) + (n > 1 ? ' × ' + n : '') + '</span>' + (editable ? '<button data-have="' + k + '">집에 있어요</button>' : '') + '</div>';
    }
    h += '</div>';
  }
  $('shoplist').innerHTML = h || '<p class="empty">살 게 없어요. 냉장고 재료로 다 돼요.</p>';
  const ff = Object.keys(st.fromInv);
  $('fromFridge').innerHTML = ff.length ? '<ul>' + ff.map(k => '<li>' + esc(ING[k][0].replace(/\(.*\)/, '')) + ' ' + qtyStr(k, st.fromInv[k]) + ' <span style="color:var(--sub);font-size:12px">' + esc((need[k] || []).slice(0, 3).join(', ')) + '</span></li>').join('') + '</ul>' : '<p class="empty">냉장고 칸에 재료를 넣으면 여기서 먼저 써요.</p>';
  const c = E.carry(st.pool);
  const drop = Object.keys(st.pool).filter(k => st.pool[k] > ING[k][3] * 0.15 && !c[k]);
  $('leftover').innerHTML = (Object.keys(c).length ? '<ul>' + Object.keys(c).map(k => '<li>' + esc(ING[k][0].replace(/\(.*\)/, '')) + ' ' + qtyStr(k, c[k]) + ((ING[k][2] === '정육' || ING[k][2] === '수산') ? ' <span style="color:var(--gold);font-size:12px">냉동 보관</span>' : '') + '</li>').join('') + '</ul>' : '<p class="empty">거의 안 남아요.</p>') + (drop.length ? '<p style="font-size:12.5px;color:var(--warn);margin:6px 0 0">이번 주 안에 꼭 쓰기: ' + drop.map(k => ING[k][0].replace(/\(.*\)/, '') + ' ' + qtyStr(k, st.pool[k])).join(', ') + ' (토요일 냉장고 털이 메뉴에 넣어주세요)</p>' : '');
  const usedP = [...new Set([...rec.mains, ...rec.sides, ...Object.values(rec.extras)].flatMap(id => byId[id].p))];
  const outP = LS.get('mp3-pantry-out', {});
  $('pantry').innerHTML = usedP.map(k => '<button data-p="' + k + '" class="' + (outP[k] ? 'outp' : '') + '">' + PANTRY[k] + (outP[k] ? ' · 떨어짐' : '') + '</button>').join('');
  const lt = LS.get('mp3-light-' + i, {});
  $('light').innerHTML = LIGHT.map(n => '<label><input type="checkbox" data-light="' + n + '"' + (lt[n] ? ' checked' : '') + '> ' + n + '</label>').join('');
  $('shopnote').textContent = '일요일에 한 번에 장보는 기준이에요 (' + people() + '인분). 마트·쿠팡에서 파는 단위로 적었고, 남는 양은 반찬·국·다음 주 식단에 먼저 써요. 살 것 ' + Object.keys(st.buys).length + '가지.';
  const ws = weekDate(i), we = weekDate(i, 6);
  let t = '[식단 장보기] ' + ws.getFullYear() + '.' + fmtDate(ws) + '(일) ~ ' + fmtDate(we) + '(토) · ' + people() + '인 기준\n';
  t += '메뉴: ' + days.filter(x => !x.out).map(x => DAY[x.d] + ' ' + shortName(byId[x.id].name) + (rec.extras[x.id] ? '+' + shortName(byId[rec.extras[x.id]].name) : '')).join(' / ') + '\n';
  t += '밑반찬: 일 ' + rec.sides.slice(0, 2).map(id => byId[id].name).join(', ') + ' / 수 ' + byId[rec.sides[2]].name + '\n';
  for (const cat of CAT_ORDER) { const keys = Object.keys(st.buys).filter(k => ING[k][2] === cat); if (!keys.length) continue; t += '\n■ ' + cat + '\n' + keys.map(k => '- ' + ING[k][0] + ' ' + ING[k][4] + (st.buys[k] > 1 ? ' × ' + st.buys[k] : '') + ' (필요 ' + qtyStr(k, totalNeed[k]) + ')').join('\n') + '\n'; }
  const outList = usedP.filter(k => outP[k]);
  if (outList.length) t += '\n■ 떨어진 양념\n' + outList.map(k => '- ' + PANTRY[k]).join('\n') + '\n';
  const lsel = LIGHT.filter(n => lt[n]); if (lsel.length) t += '\n■ 가벼운 한 끼용\n' + lsel.map(n => '- ' + n).join('\n') + '\n';
  if (ff.length) t += '\n(냉장고에 있어서 안 사는 것: ' + ff.map(k => ING[k][0].replace(/\(.*\)/, '')).join(', ') + ')\n';
  $('copyText').value = t;
}

document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const i = view;
  if (b.dataset.act === 'done') { const d = LS.get('mp3-done-' + i, {}); d[b.dataset.id] = !d[b.dataset.id]; LS.set('mp3-done-' + i, d); render(); }
  if (b.dataset.act === 'swap') {
    const si = +b.dataset.s; const rec = JSON.parse(JSON.stringify(getRec(i))); const cur = byId[rec.mains[si]]; const slot = (rec.slotOf && rec.slotOf[cur.id]) || cur.slots[0];
    const st = E.newState(rec.inv); rec.mains.filter((x, k) => k !== si).forEach(id => E.consume(st, byId[id]));
    const c = MAINS.filter(d => d.slots.includes(slot) && !rec.mains.includes(d.id));
    if (!c.length) { toast('바꿀 메뉴가 없어요'); return; }
    const ranked = c.map(d => ({ d, s: E.score(d, st) })).sort((a, b) => b.s - a.s);
    const n = LS.get('mp3-swapn-' + i, 0) + 1; LS.set('mp3-swapn-' + i, n);
    const pick = ranked[(n - 1) % Math.min(4, ranked.length)].d;
    delete rec.extras[cur.id]; rec.mains[si] = pick.id; rec.slotOf = rec.slotOf || {}; delete rec.slotOf[cur.id]; rec.slotOf[pick.id] = slot;
    const role = E.extrasFor(pick);
    if (role) { const st2 = E.simulate(rec); const usedEx = Object.values(rec.extras); const eggU = usedEx.some(x => EGGY.includes(x)); const cand = DATA.ITEMS.filter(x => x.role === role && !usedEx.includes(x.id) && !(eggU && EGGY.includes(x.id))); const best = cand.map(d => ({ d, s: E.score(d, st2) })).sort((a, b) => b.s - a.s)[0]; if (best) rec.extras[pick.id] = best.d.id; }
    saveRec(i, rec); render(); toast(pick.name + '(으)로 바꿨어요. 장보기 목록도 바뀌었어요');
  }
  if (b.dataset.fr) { const rec = JSON.parse(JSON.stringify(getRec(i))); delete rec.inv[b.dataset.fr]; saveRec(i, rec); render(); toast('냉장고에서 뺐어요'); }
  if (b.dataset.have) { const k = b.dataset.have; const rec = JSON.parse(JSON.stringify(getRec(i))); const st = E.simulate(rec); rec.inv[k] = E.round((rec.inv[k] || 0) + st.buys[k] * ING[k][3] - (st.pool[k] || 0)); saveRec(i, rec); render(); toast(ING[k][0] + ' 냉장고로 옮겼어요'); }
  if (b.dataset.p) { const o = LS.get('mp3-pantry-out', {}); o[b.dataset.p] = !o[b.dataset.p]; if (!o[b.dataset.p]) delete o[b.dataset.p]; LS.set('mp3-pantry-out', o); render(); }
});
document.addEventListener('change', e => { const el = e.target; const i = view; if (el.dataset.light) { const l = LS.get('mp3-light-' + i, {}); if (el.checked) l[el.dataset.light] = true; else delete l[el.dataset.light]; LS.set('mp3-light-' + i, l); render(); } });
function setup() {
  $('addSel').innerHTML = '<option value="">재료 고르기</option>' + CAT_ORDER.map(cat => '<optgroup label="' + cat + '">' + Object.keys(ING).filter(k => ING[k][2] === cat).map(k => '<option value="' + k + '">' + esc(ING[k][0]) + '</option>').join('') + '</optgroup>').join('');
  $('addSel').onchange = () => { const k = $('addSel').value; $('addUnit').textContent = k ? ING[k][1] + ' (파는 단위 ' + ING[k][4] + ')' : ''; if (k) $('addQty').value = ING[k][3]; };
  $('addB').onclick = () => { const k = $('addSel').value; const q = parseFloat($('addQty').value); if (!k || !(q > 0)) { toast('재료와 양을 넣어주세요'); return; } const rec = JSON.parse(JSON.stringify(getRec(view))); rec.inv[k] = E.round((rec.inv[k] || 0) + q); saveRec(view, rec); $('addSel').value = ''; $('addQty').value = ''; $('addUnit').textContent = ''; render(); toast('냉장고에 넣었어요. 식단에 반영하려면 「다시 짜기」를 눌러주세요'); };
  $('replanB').onclick = () => {
    const i = view; const old = getRec(i); const done = LS.get('mp3-done-' + i, {});
    const keep = { mains: new Array(6).fill(null), pos: {}, seed: Math.floor(Math.random() * 1e6) };
    old.mains.forEach((id, k) => { if (done[id]) { const s = (old.slotOf && old.slotOf[id]) || byId[id].slots[0]; keep.mains[SLOTS.indexOf(s)] = id; keep.pos[id] = k; } });
    const weeks = {}; const s = startWeek(); for (let k = s; k < i; k++) { const r = edited(k) || (OFFICIAL && OFFICIAL.weeks[k]); if (r) weeks[k] = r; }
    const prev = i > s ? getRec(i - 1) : null;
    const rec = E.genWeek(i, old.inv, E.lastFrom(weeks, i, s), prev ? prev.mains : [], keep);
    if (Object.values(done).some(Boolean)) rec.sides = old.sides;
    saveRec(i, rec); render(); toast('냉장고 재료를 먼저 쓰도록 다시 짰어요');
  };
  $('resetB').onclick = () => { LS.del('mp3-rec-' + view); render(); toast('원래 식단으로 돌렸어요'); };
  $('prevW').onclick = () => { view = Math.min(view, activeWeek()) - 1; render(); };
  $('thisW').onclick = () => { view = activeWeek(); render(); };
  $('nextW').onclick = () => { view = activeWeek() + 1; render(); };
  $('printB').onclick = () => window.print();
  $('copyB').onclick = async () => { const t = $('copyText'); try { await navigator.clipboard.writeText(t.value); } catch (e) { t.select(); document.execCommand('copy'); } toast('복사했어요. Aside 채팅에 붙여넣으세요'); };
  $('outday').innerHTML = DAY.map((d, k) => '<option value="' + k + '">' + d + '요일</option>').join('');
  $('outday').value = outDay(); $('people').value = people();
  $('outday').onchange = e => { LS.set('mp3-outday', +e.target.value); render(); };
  $('people').onchange = e => { LS.set('mp3-people', +e.target.value); render(); };
  view = activeWeek();
  const q = new URLSearchParams(location.search).get('w'); if (q === 'next') view = activeWeek() + 1;
  render();
  setInterval(() => { const n = new Date(); const w = E.weekIndexYMD(n.getFullYear(), n.getMonth(), n.getDate()); if (w !== currentWeek) { currentWeek = w; view = activeWeek(); render(); } }, 60 * 60 * 1000);
}
(async () => {
  if (location.protocol.startsWith('http')) { try { const r = await fetch('plan.json?t=' + Date.now()); if (r.ok) OFFICIAL = await r.json(); } catch (e) { } }
  if (OFFICIAL && OFFICIAL.customItems) OFFICIAL.customItems.forEach(it => { byId[it.id] = it; if (it.vid && it.vinfo) DATA.VIDS[it.vid] = it.vinfo; });
  setup();
  try { showBridge(); } catch (e) { }
})();
function showBridge() {
  const b = OFFICIAL && OFFICIAL.bridge; if (!b) return;
  const last = b.days[b.days.length - 1].date; const t = new Date(); const ymd = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  if (ymd > last) return;
  const box = document.createElement('div'); box.className = 'box';
  box.innerHTML = '<h2 style="margin:0 0 6px;font-size:18px">시작 주간 (정식 식단은 일요일부터)</h2>' + b.days.map(x => { const d = byId[x.main]; const ex = x.extra ? byId[x.extra] : null; return '<div style="display:flex;gap:10px;align-items:center;margin:8px 0' + (x.date === ymd ? ';font-weight:700' : '') + '"><img src="' + (d.photo || ('img/' + d.id + '.jpg')) + '" style="width:96px;height:72px;object-fit:cover;border-radius:10px"><div>' + DAY[x.dow] + '요일 ' + x.date.slice(5).replace('-', '.') + (x.date === ymd ? ' <span class="todaytag">오늘</span>' : '') + '<br>' + esc(d.name) + (ex ? ' + ' + esc(ex.name) : '') + ' · 김치, 김<br>' + ytLink(d.vid, '메인 영상') + (ex ? ' · ' + ytLink(ex.vid, esc(shortName(ex.name)) + ' 영상') : '') + '</div></div>'; }).join('');
  const s = document.getElementById('summary'); s.parentNode.insertBefore(box, s);
}
