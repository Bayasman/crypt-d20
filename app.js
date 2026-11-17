import { Archer, Crossbowman, Demiurge, Dwarf, Mage, Warrior, simulateBattle } from './src/index.js';

const roster = [
  { type: Warrior, name: 'Рунар', sprite: 'warrior', start: 1, ability: 'При здоровье ниже половины удачный защитный бросок позволяет принять урон на ману, пока она есть.' },
  { type: Mage, name: 'Мира', sprite: 'mage', start: 4, ability: 'При запасе маны выше половины принимает половину урона и тратит 12 маны.' },
  { type: Archer, name: 'Тис', sprite: 'archer', start: 7, ability: 'Чем дальше цель в пределах дальности оружия, тем сильнее выстрел.' },
  { type: Dwarf, name: 'Кремень', sprite: 'dwarf', start: 12, ability: 'Удача может вдвое ослабить каждый шестой пропущенный удар. Гном также умеет защищаться маной.' },
  { type: Demiurge, name: 'Искра', sprite: 'demiurge', start: 15, ability: 'Пока есть мана, дополнительная проверка удачи может усилить урон в полтора раза. Защита работает как у мага.' },
  { type: Crossbowman, name: 'Шпиль', sprite: 'crossbowman', start: 18, ability: 'Длинный лук достаёт дальше обычного. Сила выстрела растёт с расстоянием в пределах дальности.' },
];
const buildRoster = () => roster.map(({ type, name, start }) => new type(start, name));
const preview = simulateBattle(buildRoster(), { roundLimit: 0 }).initial;
const ru = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const format = (value) => value === Infinity ? '∞' : ru.format(value);
const chance = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
const art = (index) => `./assets/${roster[index].sprite}.svg`;
const node = (id) => document.getElementById(id);
const field = node('field');
const ruler = node('ruler');
const log = node('log');
const fieldDie = node('field-die');
const seek = node('seek');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const phases = { approach: 350, impact: 525 };
const cards = [];

let battle;
let scene;
let cursor = 0;
let stage = 'rest';
let rate = 1;
let playing = false;
let timer;
let deadline = 0;
let remaining = 0;
let effects = [];
let domain = [1, 18];
let measuredWidth = 0;
let measuredHeight = 0;
let audio;
let soundOn = false;
let tone;

const frameAt = (count) => count ? battle.turns[count - 1].after : (battle?.initial ?? preview);

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function phaseResult(turn) {
  const results = { 'out-of-range': 'Вне дальности', blocked: 'Блок', dodged: 'Уклонение' };
  if (turn.result !== 'hit') return results[turn.result];
  if (turn.damage === 0 && turn.manaSpent > 0) return `Защита маной · −${format(turn.manaSpent)} маны`;
  const life = `−${format(turn.damage)} здоровья`;
  return turn.manaSpent > 0 ? `${life} · −${format(turn.manaSpent)} маны` : life;
}

function note(turn) {
  const result = phaseResult(turn);
  const target = turn.after[turn.target];
  if (target.dead) return `${result} · выбыл`;
  return turn.pushed ? `${result} · отскок на ${target.position}` : result;
}

function motion(el, frames, duration, options = {}) {
  if (motionPreference.matches || !el) return;
  const effect = el.animate(frames, { duration, easing: 'ease-out', ...options });
  effect.playbackRate = rate;
  effects.push(effect);
}

function clearEffects() {
  for (const effect of effects) effect.cancel();
  effects = [];
}

// The six display rows are fixed. Only x encodes a position in the battle.
const displayRows = [0, 3, 5, 1, 4, 2];

function fieldGeometry() {
  const width = field.clientWidth;
  const height = field.clientHeight;
  const size = parseFloat(getComputedStyle(field).getPropertyValue('--sprite-size'));
  const padding = (size + 16) / 2 + 9;
  const [left, right] = domain;
  return {
    width, height,
    x: (position) => Math.round(padding + (width - 2 * padding) * (position - left) / (right - left)),
    y: (index) => Math.round((displayRows[index] + .5) * height / displayRows.length),
  };
}

function renderField(animate = false) {
  const { frame, turn, movement, impact } = scene;
  const geometry = fieldGeometry();
  const { width, height, x, y } = geometry;
  measuredWidth = width;
  measuredHeight = height;
  const tokens = new Map();

  for (const [index, fighter] of frame.entries()) {
    const { position, life, name, description, dead } = fighter;
    const side = index === turn?.actor ? 'actor' : index === turn?.target ? 'target' : '';
    if (dead && !(impact && side === 'target')) continue;

    const token = element('div', 'unit');
    token.dataset.index = index;
    token.dataset.position = position;
    token.classList.toggle('out', dead);
    if (side) token.dataset.side = side;
    const opponent = side === 'actor' ? turn?.target : side === 'target' ? turn?.actor : undefined;
    if (opponent === undefined ? position > (domain[0] + domain[1]) / 2 : frame[opponent].position < position) {
      token.dataset.facing = 'left';
    }
    token.style.left = `${x(position)}px`;
    token.style.top = `${y(index)}px`;
    token.setAttribute('role', 'img');
    token.setAttribute('aria-label', `${name}, ${description}. Позиция ${position}, здоровье ${format(life)}${side === 'actor' ? ', ходит' : side === 'target' ? ', цель' : ''}.`);
    const sprite = element('img', 'unit-sprite');
    sprite.src = art(index);
    sprite.alt = '';
    const health = element('span', 'unit-life', format(life));
    health.setAttribute('aria-hidden', 'true');
    token.append(sprite, health);
    if (impact && side === 'target' && turn.result !== 'out-of-range') {
      token.dataset.result = turn.result;
      const badges = { blocked: 'Блок', dodged: 'Уклон' };
      const badge = dead ? 'Выбыл' : (badges[turn.result] ?? (turn.damage ? `−${format(turn.damage)}` : 'Щит'));
      const mark = element('span', 'unit-mark', badge);
      mark.setAttribute('aria-hidden', 'true');
      token.append(mark);
    }
    tokens.set(index, token);
  }
  field.replaceChildren(...tokens.values());

  const ticks = [];
  const [left, right] = domain;
  const step = Math.max(1, Math.ceil((right - left) / Math.max(6, Math.floor(width / 22))));
  for (let position = left; position <= right; position += step) {
    const tick = element('span', '', position);
    tick.style.left = `${x(position)}px`;
    ticks.push(tick);
  }
  ruler.replaceChildren(...ticks);

  if (!animate || motionPreference.matches) return;
  if (movement) {
    const shift = x(movement.from) - x(frame[movement.index].position);
    motion(tokens.get(movement.index), [{ translate: `${shift}px 0` }, { translate: '0 0' }],
      impact ? 185 : 280, impact ? { delay: 75, fill: 'backwards' } : undefined);
  }
  if (impact && turn.result !== 'out-of-range') animateImpact(tokens, geometry, movement);
}

function animateImpact(tokens, { x, y }, movement) {
  const { turn, frame } = scene;
  const actor = tokens.get(turn.actor);
  const target = tokens.get(turn.target);
  const targetSprite = target.querySelector('.unit-sprite');
  const targetPosition = movement?.from ?? frame[turn.target].position;
  const delta = x(targetPosition) - x(frame[turn.actor].position);
  const direction = Math.sign(delta) || 1;
  const lunge = delta === 0
    ? `0 ${3 * Math.sign(y(turn.target) - y(turn.actor))}px`
    : `${Math.min(11, Math.abs(delta) / 2) * direction}px 0`;
  motion(actor, [
    { translate: '0 0' },
    { translate: lunge, offset: .37 },
    { translate: '0 0' },
  ], 225, { easing: 'ease-in-out' });
  if (!movement) {
    const recoil = turn.result === 'dodged' ? 7 : 4;
    motion(target, [
      { translate: '0 0' },
      { translate: `${recoil * direction}px 0`, offset: .35 },
      { translate: '0 0' },
    ], 195, { delay: 76 });
  }
  const reaction = frame[turn.target].dead
    ? [{ opacity: 1 }, { opacity: .38 }]
    : turn.result === 'hit'
      ? [{ filter: 'brightness(1.85)' }, { filter: 'brightness(1)' }]
      : [{ opacity: .63 }, { opacity: 1 }];
  motion(targetSprite, reaction, frame[turn.target].dead ? 335 : 178, { delay: 76 });

  const spark = element('span', 'impact-spark');
  spark.dataset.result = turn.result;
  spark.setAttribute('aria-hidden', 'true');
  spark.style.left = `${x(targetPosition)}px`;
  spark.style.top = `${y(turn.target) - 5}px`;
  field.append(spark);
  motion(spark, [
    { opacity: 0, transform: 'translate(-50%, -50%) scale(.65)' },
    { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: .27 },
    { opacity: 0, transform: 'translate(-50%, -57%) scale(1.28)' },
  ], 220, { delay: 66 });
}

function renderCards(frame, turn) {
  for (const [index, fighter] of frame.entries()) {
    const card = cards[index];
    card.classList.toggle('out', fighter.dead);
    if (index === turn?.actor) card.dataset.side = 'actor';
    else if (index === turn?.target) card.dataset.side = 'target';
    else delete card.dataset.side;
    card.querySelector('.life').textContent = `${format(fighter.life)} / ${fighter.maxLife}`;
    card.querySelector('.meter i').style.width = `${100 * fighter.life / fighter.maxLife}%`;
    card.querySelector('.mana').textContent = `Мана ${format(fighter.magic)}`;
    card.querySelector('.weapon').textContent = fighter.dead ? 'Выбыл' : fighter.weapon.name;
  }
  node('survivors').textContent = `${frame.filter(({ dead }) => !dead).length} из ${frame.length} в строю`;
}

function placeFieldDie() {
  const box = field.getBoundingClientRect();
  const viewport = window.visualViewport;
  const top = Math.max(box.top, viewport?.offsetTop ?? 0);
  const bottom = Math.min(box.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight));
  if (bottom - top < 95) return false;
  fieldDie.style.top = `${Math.round((top + bottom) / 2 - box.top)}px`;
  return true;
}

function renderRoll(turn, animate) {
  const rolled = turn?.roll !== undefined && turn.roll !== null;
  const face = rolled ? Math.min(20, 1 + Math.floor(turn.roll * 20)) : '–';
  node('die-value').textContent = face;
  const miniDie = node('mini-die');
  node('mini-die-value').textContent = face;
  miniDie.setAttribute('aria-label', rolled ? `Грань d20: ${face}` : 'Броска нет');
  node('roll-title').textContent = rolled ? `${preview[turn.actor].name} · d20: ${face}` : turn ? 'Броска нет' : 'Кости ждут';
  node('roll-detail').textContent = rolled
    ? `Случайное число ${chance.format(turn.roll)} · сила ${format(turn.power)}`
    : turn ? 'Цель за пределами дальности.' : 'Грань d20 показывает диапазон броска.';
  fieldDie.hidden = true;
  if (!rolled || !animate || motionPreference.matches || !placeFieldDie()) return;

  fieldDie.hidden = false;
  node('field-die-value').textContent = face;
  motion(fieldDie.querySelector('.die'), [
    { opacity: 0, transform: 'translate(-22px, 6px) rotate(-55deg)' },
    { opacity: 1, transform: 'translate(-11px, -25px) rotate(85deg)', offset: .22 },
    { opacity: 1, transform: 'translate(3px, -12px) rotate(287deg)', offset: .49 },
    { opacity: 1, transform: 'translate(0, 1px) rotate(360deg)', offset: .66 },
    { opacity: 1, transform: 'translate(0, -4px) rotate(360deg)', offset: .75 },
    { opacity: 1, transform: 'translate(0, 0) rotate(360deg)', offset: .91 },
    { opacity: 0, transform: 'translate(0, 0) rotate(360deg)' },
  ], 435, { easing: 'linear' });
}

function playSound(result) {
  if (!soundOn || audio?.state !== 'running' || result === 'out-of-range') return;
  stopSound();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const start = audio.currentTime;
  const pitches = { hit: [225, 104], blocked: [620, 405], dodged: [375, 240] };
  const [high, low] = pitches[result];
  oscillator.type = result === 'blocked' ? 'sine' : 'triangle';
  oscillator.frequency.setValueAtTime(high, start);
  oscillator.frequency.exponentialRampToValueAtTime(low, start + .12);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(.095, start + .015);
  gain.gain.exponentialRampToValueAtTime(.0001, start + .14);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.addEventListener('ended', () => {
    oscillator.disconnect();
    gain.disconnect();
    if (tone === oscillator) tone = undefined;
  }, { once: true });
  oscillator.start();
  oscillator.stop(start + .15);
  tone = oscillator;
}

function stopSound() {
  if (!tone) return;
  tone.stop();
  tone = undefined;
}

function renderLog() {
  const items = [];
  for (let i = cursor - 1; i >= Math.max(0, cursor - 4); i--) {
    const turn = battle.turns[i];
    const item = element('li');
    const number = element('span', 'log-number', String(i + 1).padStart(2, '0'));
    const copy = element('span', 'log-copy');
    copy.append(element('strong', '', `${preview[turn.actor].name} → ${preview[turn.target].name}`),
      element('span', '', note(turn)));
    item.append(number, copy);
    items.push(item);
  }
  log.replaceChildren(...items);
  node('empty-log').hidden = items.length > 0;
}

function renderControls() {
  const total = battle?.turns.length ?? 0;
  const finished = battle && cursor === total && stage === 'rest';
  const label = !battle ? 'Начать бой' : playing ? 'Пауза' : finished ? 'Повторить бой' : 'Продолжить';
  node('play-label').textContent = label;
  node('play-symbol').textContent = playing ? 'Ⅱ' : finished ? '↻' : '▶';
  node('new-battle').hidden = !battle;
  node('prev').disabled = cursor === 0;
  node('next').disabled = cursor >= total;
  seek.disabled = total === 0;
  seek.max = total;
  seek.value = cursor;
  seek.setAttribute('aria-valuetext', `Ход ${cursor} из ${total}`);
  node('step-count').textContent = `${cursor} / ${total}`;
}

function show(frame, turn, { movement, impact = false, animate = false, status } = {}) {
  clearEffects();
  scene = { frame, turn, movement, impact };
  field.dataset.stage = stage;
  renderField(animate);
  renderCards(frame, turn);
  renderRoll(stage === 'approach' ? undefined : turn, animate);
  renderLog();
  node('round').textContent = turn ? `Раунд ${turn.round}` : 'До боя';
  node('battle-status').textContent = status ?? 'Бойцы готовы к первому ходу.';
  renderControls();
}

function statusFor(turn) {
  if (battle && cursor === battle.turns.length) {
    return battle.winner === null ? 'Ничья · достигнут предел раундов.' : `Победитель – ${preview[battle.winner].name}.`;
  }
  return turn ? `${preview[turn.actor].name} → ${preview[turn.target].name} · ${note(turn)}` : undefined;
}

function approach(turn) {
  const frame = frameAt(cursor).map((fighter, index) => index === turn.actor ? { ...fighter, position: turn.to } : fighter);
  stage = 'approach';
  remaining = phases.approach;
  show(frame, turn, {
    movement: { index: turn.actor, from: turn.from },
    animate: true,
    status: `${preview[turn.actor].name} сближается с целью · ${turn.from} → ${turn.to}`,
  });
}

function impact(turn) {
  const before = frameAt(cursor);
  cursor += 1;
  stage = 'impact';
  remaining = phases.impact;
  show(turn.after, turn, {
    movement: turn.pushed ? { index: turn.target, from: before[turn.target].position } : undefined,
    impact: true,
    animate: true,
    status: statusFor(turn),
  });
  playSound(turn.result);
}

function advance() {
  if (stage === 'approach') {
    impact(battle.turns[cursor]);
  } else if (cursor < battle.turns.length) {
    const turn = battle.turns[cursor];
    if (turn.from === turn.to) impact(turn);
    else approach(turn);
  } else {
    playing = false;
    stage = 'rest';
    const turn = battle.turns[cursor - 1];
    show(frameAt(cursor), turn, { status: statusFor(turn) });
  }
  if (playing) schedule();
}

function schedule() {
  deadline = performance.now() + remaining / rate;
  timer = setTimeout(() => {
    remaining = 0;
    advance();
  }, remaining / rate);
}

function pause() {
  if (!playing) return;
  clearTimeout(timer);
  stopSound();
  remaining = Math.max(0, (deadline - performance.now()) * rate);
  playing = false;
  for (const effect of effects) if (effect.playState === 'running') effect.pause();
  renderControls();
}

function resume() {
  playing = true;
  if (stage === 'rest') {
    advance();
    return;
  }
  for (const effect of effects) if (effect.playState === 'paused') effect.play();
  renderControls();
  schedule();
}

function setCursor(count) {
  pause();
  cursor = count;
  stage = 'rest';
  remaining = 0;
  const turn = cursor ? battle.turns[cursor - 1] : undefined;
  show(frameAt(cursor), turn, { status: statusFor(turn) });
}

function newBattle() {
  pause();
  battle = simulateBattle(buildRoster());
  domain = [...battle.turns, { after: battle.initial }].reduce(([min, max], { after }) => [
    Math.min(min, ...after.map(({ position }) => position)),
    Math.max(max, ...after.map(({ position }) => position)),
  ], [1, 18]);
  setCursor(0);
  resume();
}

function showCharacter(index) {
  pause();
  const { name, description, life, maxLife, magic, maxMagic, position, speed, weapon } = scene.frame[index];
  node('character-name').textContent = name;
  node('character-class').textContent = description;
  node('character-art').src = art(index);
  node('character-ability').textContent = roster[index].ability;
  const values = [
    ['Здоровье', `${format(life)} / ${maxLife}`], ['Мана', `${format(magic)} / ${maxMagic}`],
    ['Позиция', position], ['Скорость', speed], ['Оружие', weapon.name],
    ['Дальность', weapon.range], ['Прочность', `${format(weapon.durability)} / ${format(weapon.initDurability)}`],
  ];
  node('character-stats').replaceChildren(...values.flatMap(([label, value]) => [element('dt', '', label), element('dd', '', value)]));
  node('character').showModal();
}

for (const [index, fighter] of preview.entries()) {
  const card = node('card-template').content.firstElementChild.cloneNode(true);
  card.querySelector('img').src = art(index);
  card.querySelector('.card-name').textContent = fighter.name;
  card.querySelector('.card-class').textContent = fighter.description;
  card.addEventListener('click', () => showCharacter(index));
  cards.push(card);
}
node('roster').replaceChildren(...cards);
node('toggle').addEventListener('click', () => {
  if (!battle) newBattle();
  else if (playing) pause();
  else {
    if (cursor === battle.turns.length && stage === 'rest') setCursor(0);
    resume();
  }
});
node('new-battle').addEventListener('click', newBattle);
node('prev').addEventListener('click', () => setCursor(cursor - 1));
node('next').addEventListener('click', () => setCursor(cursor + 1));
seek.addEventListener('input', () => setCursor(seek.valueAsNumber));
node('speed').addEventListener('change', (event) => {
  const wasPlaying = playing;
  if (wasPlaying) pause();
  rate = Number(event.target.value);
  for (const effect of effects) effect.playbackRate = rate;
  if (wasPlaying) resume();
});
node('sound').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  soundOn = !soundOn;
  button.setAttribute('aria-pressed', String(soundOn));
  if (!soundOn) {
    stopSound();
    return;
  }
  try {
    audio ??= new AudioContext();
    await audio.resume();
  } catch {
    soundOn = false;
    button.setAttribute('aria-pressed', 'false');
  }
});
node('show-rules').addEventListener('click', () => {
  pause();
  node('rules').showModal();
});
motionPreference.addEventListener('change', () => {
  if (motionPreference.matches) {
    clearEffects();
    fieldDie.hidden = true;
  }
});
new ResizeObserver(() => {
  if (field.clientWidth !== measuredWidth || field.clientHeight !== measuredHeight) {
    renderField();
    if (!fieldDie.hidden) fieldDie.hidden = !placeFieldDie();
  }
}).observe(field);

show(preview);
