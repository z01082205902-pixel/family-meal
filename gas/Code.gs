// 우리집 식단 텔레그램 봇 (대화 담당). 메뉴 계산은 깃허브 family-meal 저장소의 data.js / engine.js / messages.js 를 그대로 가져다 쓴다.
// 스크립트 속성: BOT_TOKEN, CHAT_ID, GH_TOKEN
var OWNER = 'z01082205902-pixel', REPO = 'family-meal';
var RAW = 'https://raw.githubusercontent.com/' + OWNER + '/' + REPO + '/main/';
var SITE = 'https://z01082205902-pixel.github.io/family-meal/';
var BOTNAME = 'backsacook_bot';

function P_() { return PropertiesService.getScriptProperties(); }

function tg_(method, body) {
  var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + P_().getProperty('BOT_TOKEN') + '/' + method, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true
  });
  return JSON.parse(r.getContentText());
}

function code_() {
  var c = CacheService.getScriptCache();
  var parts = ['data.js', 'engine.js', 'scripts/messages.js'];
  var src = '';
  parts.forEach(function (p) {
    var key = 'src_' + p;
    var s = c.get(key);
    if (!s) { s = UrlFetchApp.fetch(RAW + p + '?t=' + Date.now()).getContentText('UTF-8'); try { c.put(key, s, 600); } catch (e) { } }
    src += s + '\n';
  });
  return new Function(src + '\nreturn {DATA: DATA, makeEngine: makeEngine, makeMessages: makeMessages};')();
}

function ghGet_() {
  var r = UrlFetchApp.fetch('https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/plan.json?ref=main', {
    headers: { Authorization: 'Bearer ' + P_().getProperty('GH_TOKEN'), Accept: 'application/vnd.github+json' }, muteHttpExceptions: true
  });
  var j = JSON.parse(r.getContentText());
  var text = Utilities.newBlob(Utilities.base64Decode(j.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
  return { plan: JSON.parse(text), sha: j.sha };
}

function ghPut_(plan, sha, msg) {
  var body = { message: msg, content: Utilities.base64Encode(JSON.stringify(plan, null, 1) + '\n', Utilities.Charset.UTF_8), sha: sha, branch: 'main' };
  var r = UrlFetchApp.fetch('https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/plan.json', {
    method: 'put', contentType: 'application/json', payload: JSON.stringify(body),
    headers: { Authorization: 'Bearer ' + P_().getProperty('GH_TOKEN'), Accept: 'application/vnd.github+json' }, muteHttpExceptions: true
  });
  if (r.getResponseCode() >= 300) throw new Error('깃허브 저장 실패 ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 200));
}

// 한국 시간 날짜
function kst_(addDays) {
  var t = new Date(Date.now() + 9 * 3600 * 1000 + (addDays || 0) * 86400000);
  var y = t.getUTCFullYear(), m = t.getUTCMonth(), d = t.getUTCDate();
  return { y: y, m: m, d: d, dow: t.getUTCDay(), ymd: y + '-' + ('0' + (m + 1)).slice(-2) + '-' + ('0' + d).slice(-2) };
}

function ctx_(L) {
  var c = L.code, plan = L.plan;
  var E = c.makeEngine(c.DATA, function () { return plan.settings.people; });
  var M = c.makeMessages(E, plan, SITE);
  return { E: E, M: M, plan: plan, sha: L.sha };
}
function load_() { var g = ghGet_(); return ctx_({ code: code_(), plan: g.plan, sha: g.sha }); }

// 날짜 → 그날 위치. 'b2026-11-20' 또는 '46.3'
function where_(C, day) {
  var b = C.plan.bridge;
  if (b) for (var k = 0; k < b.days.length; k++) if (b.days[k].date === day.ymd) return 'b' + day.ymd;
  var wi = C.E.weekIndexYMD(day.y, day.m, day.d);
  if (wi < C.plan.start) return null;
  C.E.ensureWeeks(C.plan.weeks, C.plan.start, wi, C.plan.fridge || {});
  return wi + '.' + day.dow;
}
function ymdOf_(C, ctx) {
  if (ctx.charAt(0) === 'b') return ctx.slice(1);
  var p = ctx.split('.'); var w = C.E.weekStartYMD(+p[0]); var t = new Date(Date.UTC(w.y, w.m, w.d + (+p[1])));
  return t.getUTCFullYear() + '-' + ('0' + (t.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + t.getUTCDate()).slice(-2);
}

function sendMenu_(C, ctx, head) {
  var msg;
  if (!ctx) { tg_('sendMessage', { chat_id: C.chat, text: '그날은 아직 식단이 없어요.' }); return; }
  if (ctx.charAt(0) === 'b') msg = C.M.bridgeDaily(ctx.slice(1), head);
  else { var p = ctx.split('.'); msg = C.M.daily(+p[0], +p[1], head); }
  if (!msg) { tg_('sendMessage', { chat_id: C.chat, text: '그날 메뉴를 못 찾았어요.' }); return; }
  if (msg.photo) {
    var r = tg_('sendPhoto', { chat_id: C.chat, photo: msg.photo, caption: msg.caption, parse_mode: 'HTML' });
    if (!r.ok) tg_('sendMessage', { chat_id: C.chat, text: msg.caption, parse_mode: 'HTML' });
  }
  var kb = msg.photo ? { inline_keyboard: [[{ text: '다른 메뉴로 바꾸기', callback_data: 'alt|' + ctx }]] } : undefined;
  tg_('sendMessage', { chat_id: C.chat, text: msg.text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
}

// 이미 산 재료(+ 냉장고) 안에서 그날 대신 먹을 수 있는 메뉴 찾기
function avail_(C, ctx) {
  var E = C.E, byId = E.byId, F = C.plan.settings.people / 2, st, today, others = [];
  if (ctx.charAt(0) === 'b') {
    var days = C.plan.bridge.days; st = E.newState({});
    days.forEach(function (x) { [x.main, x.extra].filter(Boolean).forEach(function (id) { E.consume(st, byId[id]); }); });
    var me = days.filter(function (x) { return x.date === ctx.slice(1); })[0];
    today = [me.main, me.extra].filter(Boolean);
    days.forEach(function (x) { if (x.date > me.date) others.push({ key: 'b' + x.date, id: x.main, label: E.DAY[x.dow] + '요일' }); });
  } else {
    var p = ctx.split('.'), wi = +p[0], dow = +p[1], rec = C.plan.weeks[wi];
    st = E.simulate(rec);
    var ds = E.days(rec, C.plan.settings.outday), x = ds.filter(function (y) { return y.d === dow; })[0];
    if (!x || x.out) return null;
    today = [x.id, rec.extras[x.id]].filter(Boolean);
    var now = kst_(0), nowWi = E.weekIndexYMD(now.y, now.m, now.d);
    ds.forEach(function (y) { if (!y.out && y.d > dow && !(wi === nowWi && y.d < now.dow)) others.push({ key: wi + '.' + y.d, id: y.id, label: E.DAY[y.d] + '요일' }); });
  }
  var av = {}; for (var k in st.pool) av[k] = st.pool[k];
  today.forEach(function (id) { var it = byId[id]; for (var k in it.ing) av[k] = (av[k] || 0) + it.ing[k] * F; });
  return { av: av, today: today, others: others, F: F };
}
function feasible_(C, item, av, F) {
  for (var k in item.ing) {
    if (C.E.ING[k][2] === '냉장 상비') continue; // 김치·김은 집에 있다고 봄
    if ((av[k] || 0) < item.ing[k] * F * 0.75 - 1e-9) return false;
  }
  return true;
}
function alternatives_(C, ctx) {
  var A = avail_(C, ctx); if (!A) return null;
  var E = C.E, byId = E.byId;
  var used = {};
  if (C.plan.bridge) C.plan.bridge.days.forEach(function (x) { used[x.main] = 1; });
  if (ctx.charAt(0) === 'b' && C.plan.weeks[C.plan.start]) C.plan.weeks[C.plan.start].mains.forEach(function (id) { used[id] = 1; });
  if (ctx.charAt(0) !== 'b') C.plan.weeks[+ctx.split('.')[0]].mains.forEach(function (id) { used[id] = 1; });
  var st = { pool: A.av, invLeft: {}, buys: {}, fromInv: {} };
  var NOOD2 = ['kalguksu', 'myeongran', 'janchi', 'bibimguksu', 'tteokbokki'];
  var curNood = (function () { var id = curName_(C, ctx); return null; })();
  var hasN = Object.keys(used).some(function (id) { return NOOD2.indexOf(id) >= 0 && E.byId[id].name !== curName_(C, ctx); });
  var cands = E.MAINS.filter(function (d) { return !used[d.id] && !(hasN && NOOD2.indexOf(d.id) >= 0) && feasible_(C, d, A.av, A.F); })
    .map(function (d) { return { d: d, s: E.score(d, st) }; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 3);
  var opts = cands.map(function (c) {
    var rest = {}; for (var k in A.av) rest[k] = A.av[k];
    for (var k2 in c.d.ing) rest[k2] = (rest[k2] || 0) - c.d.ing[k2] * A.F;
    var role = E.extrasFor(c.d), ex = null;
    if (role) {
      var eggMain = (c.d.ing.egg || 0) >= 2 || c.d.id === 'eggfriedrice';
      var st2 = { pool: rest, invLeft: {}, buys: {}, fromInv: {} };
      var ok = E.ITEMS.filter(function (x) { return x.role === role && feasible_(C, x, rest, A.F) && !(eggMain && E.EGGY.indexOf(x.id) >= 0); })
        .sort(function (a, b) { return E.score(b, st2) - E.score(a, st2); });
      if (ok.length) ex = ok[0];
    }
    return { type: 'n', id: c.d.id, ex: ex ? ex.id : '', label: c.d.name + (ex ? ' + ' + E.shortName(ex.name) : '') };
  });
  A.others.slice(0, 2).forEach(function (o) { opts.push({ type: 's', key: o.key, label: o.label + ' 메뉴(' + E.shortName(byId[o.id].name) + ')랑 바꾸기' }); });
  return opts;
}

function curName_(C, ctx) {
  if (ctx.charAt(0) === 'b') return C.E.byId[C.plan.bridge.days.filter(function (x) { return x.date === ctx.slice(1); })[0].main].name;
  var p = ctx.split('.'), rec = C.plan.weeks[+p[0]];
  var x = C.E.days(rec, C.plan.settings.outday).filter(function (y) { return y.d === +p[1]; })[0];
  return x && !x.out ? C.E.byId[rec.mains[x.slot]].name : null;
}
// 바꾸기 전에 먼저 묻기: 이미 산 재료로? 장을 더 봐도 되는 다른 메뉴?
function askMode_(C, ctx) {
  if (!ctx) { tg_('sendMessage', { chat_id: C.chat, text: '그날은 아직 식단이 없어요.' }); return; }
  var nm = curName_(C, ctx);
  if (!nm) { tg_('sendMessage', { chat_id: C.chat, text: '그날은 외식·배달 데이예요. 먹고 싶은 거 드세요!' }); return; }
  tg_('sendMessage', { chat_id: C.chat, parse_mode: 'HTML', text: '「' + nm + '」 대신 뭘로 바꿀까요?',
    reply_markup: { inline_keyboard: [[{ text: '이미 산 재료로 만들 수 있는 메뉴', callback_data: 'am|' + ctx }], [{ text: '장을 조금 더 봐도 되니 다른 메뉴', callback_data: 'an|' + ctx }], [{ text: '그냥 원래대로 먹을게요', callback_data: 'x|' }]] } });
}
// 장을 더 봐야 하는 다른 메뉴: 추가로 살 게 적은 순
function missing_(C, item, av, F) {
  var out = [];
  for (var k in item.ing) { if (C.E.ING[k][2] === '냉장 상비') continue; if ((av[k] || 0) < item.ing[k] * F * 0.75 - 1e-9) out.push(k); }
  return out;
}
function proposeNew_(C, ctx) {
  var A = avail_(C, ctx); if (!A) { tg_('sendMessage', { chat_id: C.chat, text: '그날은 외식·배달 데이예요.' }); return; }
  var E = C.E, used = {};
  if (C.plan.bridge) C.plan.bridge.days.forEach(function (x) { used[x.main] = 1; });
  if (ctx.charAt(0) === 'b' && C.plan.weeks[C.plan.start]) C.plan.weeks[C.plan.start].mains.forEach(function (id) { used[id] = 1; });
  if (ctx.charAt(0) !== 'b') C.plan.weeks[+ctx.split('.')[0]].mains.forEach(function (id) { used[id] = 1; });
  var st = { pool: A.av, invLeft: {}, buys: {}, fromInv: {} };
  var FAM = { chadol: '된장', doenjang: '된장', kimchijjigae: '김치', chamchikimchi: '김치', budae: '김치', kimchibap: '김치', dakbokkeum: '닭', jjimdak: '닭', dakgalbi: '닭', teriyaki: '닭', godeungeo: '고등어', godeungeojorim: '고등어', janchi: '국수', bibimguksu: '국수' };
  var curId = null; if (ctx.charAt(0) === 'b') curId = C.plan.bridge.days.filter(function (x) { return x.date === ctx.slice(1); })[0].main; else { var pp = ctx.split('.'), rr = C.plan.weeks[+pp[0]]; var xx = E.days(rr, C.plan.settings.outday).filter(function (y) { return y.d === +pp[1]; })[0]; curId = rr.mains[xx.slot]; }
  var cur = E.byId[curId];
  var NOOD = ['kalguksu', 'myeongran', 'janchi', 'bibimguksu', 'tteokbokki'];
  var hasNoodle = Object.keys(used).some(function (id) { return NOOD.indexOf(id) >= 0 && id !== cur.id; });
  var list = E.MAINS.filter(function (d) { return !used[d.id] && !(hasNoodle && NOOD.indexOf(d.id) >= 0) && d.protein !== cur.protein && !(FAM[d.id] && FAM[d.id] === FAM[cur.id]); }).map(function (d) { var miss = missing_(C, d, A.av, A.F); return { d: d, miss: miss, s: E.score(d, st) }; })
    .filter(function (x) { return x.miss.length > 0; })
    .sort(function (a, b) { return (a.miss.length - b.miss.length) || (b.s - a.s); });
  var pick = [], prots = {};
  list.forEach(function (x) { if (pick.length < 4 && !prots[x.d.protein]) { pick.push(x); prots[x.d.protein] = 1; } });
  list.forEach(function (x) { if (pick.length < 4 && pick.indexOf(x) < 0) pick.push(x); });
  if (!pick.length) { tg_('sendMessage', { chat_id: C.chat, text: '바꿀 메뉴를 못 찾았어요.' }); return; }
  var kb = pick.map(function (x) {
    var role = E.extrasFor(x.d), ex = '';
    if (role) { var r = E.ITEMS.filter(function (it) { return it.role === role && missing_(C, it, A.av, A.F).length === 0 && !(((x.d.ing.egg || 0) >= 2) && E.EGGY.indexOf(it.id) >= 0); }); if (r.length) ex = r[0].id; }
    var names = x.miss.map(function (k) { return E.ING[k][0].replace(/\(.*\)/, ''); });
    return [{ text: E.shortName(x.d.name) + ' (+' + names.slice(0, 3).join('·') + (names.length > 3 ? ' 외' : '') + ')', callback_data: 'N|' + ctx + '|' + x.d.id + '|' + ex }];
  });
  kb.push([{ text: '역시 이미 산 재료로 할래요', callback_data: 'am|' + ctx }]);
  tg_('sendMessage', { chat_id: C.chat, parse_mode: 'HTML', text: '장을 조금 더 보면 이런 메뉴도 돼요.\n<i>괄호 안이 추가로 살 재료예요. 고르면 살 것 목록을 보내드려요.</i>', reply_markup: { inline_keyboard: kb } });
}
function proposeAlt_(C, ctx) {
  if (!ctx) { tg_('sendMessage', { chat_id: C.chat, text: '그날은 아직 식단이 없어요.' }); return; }
  var opts = alternatives_(C, ctx);
  if (opts === null) { tg_('sendMessage', { chat_id: C.chat, text: '그날은 외식·배달 데이예요. 먹고 싶은 거 드세요!' }); return; }
  if (!opts.length) { tg_('sendMessage', { chat_id: C.chat, text: '이미 산 재료로 바꿀 수 있는 메뉴가 없어요. 냉장고 털이 볶음밥은 어떠세요?' }); return; }
  var curId = ctx.charAt(0) === 'b' ? C.plan.bridge.days.filter(function (x) { return x.date === ctx.slice(1); })[0].main : C.plan.weeks[+ctx.split('.')[0]].mains[C.E.days(C.plan.weeks[+ctx.split('.')[0]], C.plan.settings.outday).filter(function (y) { return y.d === +ctx.split('.')[1]; })[0].slot];
  var kb = opts.map(function (o) { return [{ text: o.label, callback_data: o.type === 'n' ? ('n|' + ctx + '|' + o.id + '|' + o.ex) : ('s|' + ctx + '|' + o.key) }]; });
  kb.push([{ text: '그냥 원래대로 먹을게요', callback_data: 'x|' }]);
  tg_('sendMessage', { chat_id: C.chat, parse_mode: 'HTML', text: '「' + C.E.byId[curId].name + '」 대신 이렇게 바꿀 수 있어요.\n<i>이미 산 재료(+김치·김)만으로 되는 메뉴예요.</i>', reply_markup: { inline_keyboard: kb } });
}

function applyChange_(C, data) {
  var p = data.split('|'), ctx = p[1], E = C.E, byId = E.byId, plan = C.plan;
  var oldName, newName;
  if (ctx.charAt(0) === 'b') {
    var days = plan.bridge.days, me = days.filter(function (x) { return x.date === ctx.slice(1); })[0];
    oldName = byId[me.main].name;
    if (p[0] === 'n') { me.main = p[2]; me.extra = p[3] || null; }
    else { var other = days.filter(function (x) { return x.date === p[2].slice(1); })[0]; var t1 = me.main, t2 = me.extra; me.main = other.main; me.extra = other.extra; other.main = t1; other.extra = t2; }
    newName = byId[me.main].name;
    // 시작 주간에서 남는 재료 → 첫 주 냉장고
    var st = E.newState({}); days.forEach(function (x) { [x.main, x.extra].filter(Boolean).forEach(function (id) { E.consume(st, byId[id]); }); });
    var left = {}; for (var k in st.pool) if (st.pool[k] > 1e-6) left[k] = Math.round(st.pool[k] * 100) / 100;
    if (plan.weeks[plan.start]) plan.weeks[plan.start].inv = left;
  } else {
    var q = ctx.split('.'), wi = +q[0], dow = +q[1], rec = plan.weeks[wi];
    var ds = E.days(rec, plan.settings.outday), x = ds.filter(function (y) { return y.d === dow; })[0];
    var cur = rec.mains[x.slot]; oldName = byId[cur].name;
    if (p[0] === 'n') {
      var slot = (rec.slotOf && rec.slotOf[cur]) || byId[cur].slots[0];
      delete rec.extras[cur]; rec.mains[x.slot] = p[2];
      rec.slotOf = rec.slotOf || {}; delete rec.slotOf[cur]; rec.slotOf[p[2]] = slot;
      if (p[3]) rec.extras[p[2]] = p[3];
    } else {
      var q2 = p[2].split('.'), y2 = ds.filter(function (y) { return y.d === +q2[1]; })[0];
      var tmp = rec.mains[x.slot]; rec.mains[x.slot] = rec.mains[y2.slot]; rec.mains[y2.slot] = tmp;
    }
    newName = byId[rec.mains[x.slot]].name;
  }
  ghPut_(plan, C.sha, '텔레그램에서 메뉴 변경: ' + oldName + ' → ' + newName);
  return { oldName: oldName, newName: newName };
}

function help_(C) {
  tg_('sendMessage', {
    chat_id: C.chat, parse_mode: 'HTML', text: '<b>이렇게 말해보세요</b>\n· 오늘 메뉴 / 내일 메뉴\n· 오늘 메뉴 별로야, 다른 거 먹고 싶어 (이미 산 재료로 할지, 장을 더 볼지 물어봐요)\n· 내일 거 바꿔줘\n· 장보기 목록\n· 이번 주 식단\n\n<a href="' + SITE + '">식단표 전체 보기</a>',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: '오늘 메뉴', callback_data: 'td|' }, { text: '내일 메뉴', callback_data: 'tm|' }], [{ text: '오늘 메뉴 바꾸기', callback_data: 'alt|' }, { text: '장보기 목록', callback_data: 'sh|' }]] }
  });
}
function shopping_(C) {
  var n = kst_(0), wi = C.E.weekIndexYMD(n.y, n.m, n.d);
  var target = Math.max(n.dow >= 4 ? wi + 1 : wi, C.plan.start);
  C.E.ensureWeeks(C.plan.weeks, C.plan.start, target, C.plan.fridge || {});
  tg_('sendMessage', { chat_id: C.chat, text: C.M.shopping(target), parse_mode: 'HTML', disable_web_page_preview: true });
}
function weekly_(C) {
  var n = kst_(0), wi = C.E.weekIndexYMD(n.y, n.m, n.d);
  var target = Math.max(n.dow >= 4 && n.dow !== 0 ? wi + 1 : wi, C.plan.start);
  C.E.ensureWeeks(C.plan.weeks, C.plan.start, target, C.plan.fridge || {});
  tg_('sendMessage', { chat_id: C.chat, text: C.M.weekly(target, target === wi ? '이번 주' : '다음 주'), parse_mode: 'HTML' });
}

function handleText_(C, text) {
  var t = text.replace(new RegExp('@' + BOTNAME, 'ig'), '').replace(/\s+/g, ' ').trim();
  var tomorrow = /내일/.test(t);
  var day = kst_(tomorrow ? 1 : 0);
  if (/^\/start|^\/help|도움|뭐 ?할 ?수|사용법|명령/.test(t) || t === '') return help_(C);
  if (/다른|바꿔|바꾸|별로|싫|딴 ?거|말고|질려|안 ?땡|땡기|다른 ?거/.test(t)) {
    var w = where_(C, day);
    if (/있는 ?재료|산 ?재료|냉장고|사 ?둔|사놓은|산 ?거/.test(t)) return proposeAlt_(C, w);
    if (/장 ?(더|또)|더 ?사|새로 ?사|사도 ?돼|사러|추가로/.test(t)) return proposeNew_(C, w);
    return askMode_(C, w);
  }
  if (/장 ?보|장보기|살 ?거|쇼핑|사야/.test(t)) return shopping_(C);
  if (/이번 ?주|식단표|일주일|주간/.test(t)) return weekly_(C);
  if (/오늘|내일|메뉴|뭐 ?먹|저녁|점심/.test(t)) return sendMenu_(C, where_(C, day), tomorrow ? '<b>[내일 메뉴]</b>\n' : '');
  return help_(C);
}

function doPost(e) {
  try {
    var u = JSON.parse(e.postData.contents);
    var cache = CacheService.getScriptCache();
    if (cache.get('u' + u.update_id)) return;
    cache.put('u' + u.update_id, '1', 3600);
    var allowed = String(P_().getProperty('CHAT_ID'));
    var members = JSON.parse(P_().getProperty('MEMBERS') || '[]');
    if (u.callback_query) {
      var q = u.callback_query, chatId = String(q.message.chat.id);
      if (chatId !== allowed && members.indexOf(String(q.from.id)) < 0) return;
      tg_('answerCallbackQuery', { callback_query_id: q.id });
      var C = load_(); C.chat = chatId; var d = q.data;
      if (d === 'x|') { tg_('sendMessage', { chat_id: chatId, text: '좋아요, 원래 메뉴대로 가요!' }); return; }
      if (d === 'td|') return sendMenu_(C, where_(C, kst_(0)), '');
      if (d === 'tm|') return sendMenu_(C, where_(C, kst_(1)), '<b>[내일 메뉴]</b>\n');
      if (d === 'sh|') return shopping_(C);
      if (d.indexOf('alt|') === 0) return askMode_(C, d.slice(4) || where_(C, kst_(0)));
      if (d.indexOf('am|') === 0) return proposeAlt_(C, d.slice(3));
      if (d.indexOf('an|') === 0) return proposeNew_(C, d.slice(3));
      if (d.charAt(0) === 'n' || d.charAt(0) === 's' || d.charAt(0) === 'N') {
        var ctx = d.split('|')[1], buyTxt = '';
        if (d.charAt(0) === 'N') {
          var A0 = avail_(C, ctx), it = C.E.byId[d.split('|')[2]], exId = d.split('|')[3];
          var miss = missing_(C, it, A0.av, A0.F);
          if (exId) { var rest = {}; for (var k0 in A0.av) rest[k0] = A0.av[k0]; missing_(C, C.E.byId[exId], rest, A0.F).forEach(function (k) { if (miss.indexOf(k) < 0) miss.push(k); }); }
          buyTxt = '\n<b>추가로 살 것</b>\n' + miss.map(function (k) { return '□ ' + C.E.ING[k][0] + ' ' + C.E.ING[k][4]; }).join('\n') + '\n';
          d = 'n' + d.slice(1);
        }
        var r = applyChange_(C, d);
        var C2 = ctx_({ code: code_(), plan: C.plan, sha: '' }); C2.chat = chatId;
        sendMenu_(C2, ctx, '<b>바꿨어요!</b> ' + r.oldName + ' → ' + r.newName + '\n');
        if (buyTxt) tg_('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: buyTxt.trim() });
        return;
      }
      return;
    }
    var m = u.message; if (!m || !m.text) return;
    var chat = String(m.chat.id);
    if (chat === allowed && m.from && members.indexOf(String(m.from.id)) < 0) { members.push(String(m.from.id)); P_().setProperty('MEMBERS', JSON.stringify(members)); }
    if (chat !== allowed && !(m.chat.type === 'private' && members.indexOf(String(m.from.id)) >= 0)) return;
    var C3 = load_(); C3.chat = chat;
    handleText_(C3, m.text);
  } catch (err) {
    try { var ch = P_().getProperty('CHAT_ID'); tg_('sendMessage', { chat_id: ch, text: '앗, 처리하다 오류가 났어요: ' + String(err).slice(0, 300) }); } catch (e2) { }
  }
}

function doGet() { return ContentService.createTextOutput('ok'); }

// 편집기에서 한 번 실행: 텔레그램 웹훅 연결 (WEBAPP_URL 속성 필요)
function setWebhook() {
  var url = P_().getProperty('WEBAPP_URL');
  Logger.log(JSON.stringify(tg_('setWebhook', { url: url, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true })));
}
// 편집기에서 실행해 보는 테스트
function testLoad() { var C = load_(); Logger.log(Object.keys(C.plan.weeks).join(',') + ' ' + C.E.MAINS.length); }
