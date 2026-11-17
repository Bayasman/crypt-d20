import { jest } from '@jest/globals';
import { Archer, Demiurge, Mage, Player, Warrior, play, simulateBattle } from '../src/index.js';

afterEach(() => jest.restoreAllMocks());

test('бой прекращается при единственном выжившем и сохраняет порядок исходного списка', () => {
  const players = [new Warrior(0, 'Воин'), new Player(3, 'Выбывший'), new Archer(1, 'Лучник')];
  players[1].takeDamage(100);
  players[2].takeDamage(75);
  const random = jest.fn(() => 0.3);
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});

  const battle = simulateBattle(players, { random });
  expect(battle).toMatchObject({ winner: 0, rounds: 1 });
  expect(battle.initial.map(({ name, life, position }) => [name, life, position])).toEqual([
    ['Воин', 120, 0], ['Выбывший', 0, 3], ['Лучник', 5, 1],
  ]);
  expect(battle.turns).toHaveLength(1);
  const [turn] = battle.turns;
  expect(turn).toMatchObject({
    round: 1, actor: 0, target: 2, from: 0, to: 1, pushed: true, result: 'hit',
    roll: 0.3, power: 28, damage: 5, manaSpent: 0,
  });
  expect(turn.after[2]).toMatchObject({ name: 'Лучник', life: 0, position: 2, dead: true });
  expect(turn.after[0].weapon.durability).toBe(496);
  expect(random).toHaveBeenCalledTimes(4);
  expect(log).not.toHaveBeenCalled();

  players[0].weapon.takeDamage(20);
  expect(battle.initial[0].weapon.durability).toBe(500);
  expect(turn.after[0].weapon.durability).toBe(496);
});

test('журнал хранит бросок базового урона демиурга и отдельно фактический расход маны мага', () => {
  const players = [new Demiurge(0, 'Демиург'), new Mage(2, 'Маг')];
  const random = jest.fn(() => 0)
    .mockReturnValueOnce(0.2).mockReturnValueOnce(0.38).mockReturnValueOnce(0.49);
  const battle = simulateBattle(players, { random, roundLimit: 1 });
  const [strike, reply] = battle.turns;
  expect(strike).toMatchObject({
    actor: 0, target: 1, from: 0, to: 1, pushed: false, roll: 0.38, power: 12,
    damage: 6, manaSpent: 12, result: 'hit',
  });
  expect(strike.after[1]).toMatchObject({ life: 64, maxLife: 70, magic: 88, maxMagic: 100 });
  expect(reply.after[0].life).toBeLessThan(strike.after[0].life);
  expect(battle.initial[0].weapon).toEqual({
    name: 'Посох Бури', range: 3, durability: 300, initDurability: 300,
  });
  expect(random).toHaveBeenCalledTimes(9);
});

test('убитый до своего хода боец больше не действует и не выбирается как цель', () => {
  const players = [new Warrior(0, 'Воин'), new Archer(1, 'Лучник'), new Mage(4, 'Маг')];
  players[1].takeDamage(79);
  const { turns } = simulateBattle(players, { random: () => 0.3, roundLimit: 1 });
  expect(turns.map(({ actor, target }) => [actor, target])).toEqual([[0, 1], [2, 0]]);
  expect(turns[0].after[1].dead).toBe(true);
});

test('лимит раундов завершает затянувшийся бой без победителя', () => {
  const players = [new Player(0, 'Первый'), new Player(1, 'Второй')];
  const { rounds, winner, turns } = simulateBattle(players, { random: () => 0.99, roundLimit: 2 });
  expect(rounds).toBe(2);
  expect(winner).toBeNull();
  expect(turns.map(({ round, actor, result, pushed }) => [round, actor, result, pushed])).toEqual([
    [1, 0, 'blocked', true], [1, 1, 'blocked', true],
    [2, 0, 'blocked', true], [2, 1, 'blocked', true],
  ]);
  expect(players.map(player => player.life)).toEqual([100, 100]);
});

test('нет ходов без противника, а единственный живой игрок уже победил', () => {
  const survivor = new Player(4, 'Последний');
  const random = jest.fn();
  expect(simulateBattle([], { random })).toEqual({ initial: [], turns: [], winner: null, rounds: 0 });
  expect(simulateBattle([survivor], { random })).toMatchObject({ turns: [], winner: 0, rounds: 0 });
  expect(random).not.toHaveBeenCalled();
});

test('play выводит ход боя и объявляет победителя в консоли', () => {
  jest.spyOn(Math, 'random').mockReturnValue(0.3);
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const winner = new Warrior(0, 'Воин');
  const loser = new Archer(1, 'Лучник');
  loser.takeDamage(79);
  expect(play([winner, loser])).toBe(winner);
  expect(log).toHaveBeenCalledWith('Воин: позиция 0 → 1.');
  expect(log).toHaveBeenCalledWith('Лучник отскакивает вправо на позицию 2.');
  expect(log).toHaveBeenLastCalledWith('Победитель: Воин.');
  expect(play([])).toBeNull();
  expect(log).toHaveBeenLastCalledWith('Бой завершился без победителя.');
});
