// 깃허브 액션에서 실행: node scripts/send.mjs weekly|daily|sample
import fs from 'node:fs';
import vm from 'node:vm';

const MODE = process.argv[2] || 'daily';
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;
const SITE = process.env.SITE_URL || 'https://z01082205902-pixel.github.io/family-meal/';
if (!TOKEN || !CHAT) { console.error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 비밀값이 없어요'); process.exit(1); }

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync('data.js', 'utf8') + '\n' + fs.readFileSync('engine.js', 'utf8') + '\n' + fs.readFileSync('scripts/messages.js', 'utf8') +
  '\nthis.DATA = DATA; this.makeEngine = makeEngine; this.makeMessages = makeMessages;', ctx);

const plan = JSON.parse(fs.readFileSync('plan.json', 'utf8'));
const E = ctx.makeEngine(ctx.DATA, () => plan.settings.people);
const M = ctx.makeMessages(E, plan, SITE);

// 한국 시간 기준 오늘
const now = new Date(Date.now() + 9 * 3600 * 1000);
const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate(), dow = now.getUTCDay();
const wi = E.weekIndexYMD(y, m, d);

async function tg(method, body) {
  const r = await fetch('https://api.telegram.org/bot' + TOKEN + '/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ chat_id: CHAT, parse_mode: 'HTML' }, body)) });
  const j = await r.json();
  if (!j.ok) throw new Error(method + ' 실패: ' + JSON.stringify(j));
  return j;
}
async function sendDaily(msg) {
  if (msg.photo) {
    try { await tg('sendPhoto', { photo: msg.photo, caption: msg.caption }); }
    catch (e) { console.error(e.message); await tg('sendMessage', { text: msg.caption, disable_web_page_preview: true }); }
  }
  await tg('sendMessage', { text: msg.text, disable_web_page_preview: true });
}
function save() { fs.writeFileSync('plan.json', JSON.stringify(plan, null, 1) + '\n'); }

if (MODE === 'weekly') {
  let target = dow === 0 ? wi : (dow >= 4 ? wi + 1 : wi);
  target = Math.max(target, plan.start);
  E.ensureWeeks(plan.weeks, plan.start, target, plan.fridge || {});
  save();
  const label = target === wi ? '이번 주' : '다음 주';
  await tg('sendMessage', { text: M.weekly(target, label), disable_web_page_preview: false });
  await tg('sendMessage', { text: M.shopping(target), disable_web_page_preview: true });
  console.log('주간 식단 + 장보기 목록 보냄', target);
} else if (MODE === 'daily') {
  if (wi < plan.start) { console.log('아직 시작 전 주예요', wi, plan.start); process.exit(0); }
  E.ensureWeeks(plan.weeks, plan.start, wi, plan.fridge || {});
  save();
  await sendDaily(M.daily(wi, dow));
  console.log('오늘의 메뉴 보냄', wi, dow);
} else if (MODE === 'shopping') {
  let target = dow === 0 ? wi : (dow >= 4 ? wi + 1 : wi);
  target = Math.max(target, plan.start);
  E.ensureWeeks(plan.weeks, plan.start, target, plan.fridge || {});
  save();
  await tg('sendMessage', { text: M.shopping(target), disable_web_page_preview: true });
  console.log('장보기 목록 보냄', target);
} else if (MODE === 'sample') {
  // 첫 주 월요일 메뉴를 미리보기로 보냄
  const target = Math.max(wi, plan.start);
  E.ensureWeeks(plan.weeks, plan.start, target, plan.fridge || {});
  save();
  const first = E.days(plan.weeks[target], plan.settings.outday).find(x => !x.out);
  await sendDaily(M.daily(target, first.d, '[미리보기: ' + E.DAY[first.d] + '요일 10시에 이렇게 와요]\n'));
  console.log('미리보기 보냄');
}
