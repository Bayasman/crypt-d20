import { jest } from '@jest/globals';
import {
  Arm, Archer, Axe, Bow, Crossbowman, Demiurge, Dwarf, Knife, LongBow, Mage, Player,
  Staff, StormStaff, Sword, Warrior,
} from '../src/index.js';

test.each([
  [Player, Player, 'Игрок', Arm, [100, 20, 1, 10, 5, 10]],
  [Warrior, Player, 'Воин', Sword, [120, 20, 2, 10, 5, 10]],
  [Archer, Player, 'Лучник', Bow, [80, 35, 1, 5, 10, 10]],
  [Mage, Player, 'Маг', Staff, [70, 100, 1, 5, 8, 10]],
  [Dwarf, Warrior, 'Гном', Axe, [130, 20, 2, 15, 5, 20]],
  [Crossbowman, Archer, 'Арбалетчик', LongBow, [85, 35, 1, 8, 20, 15]],
  [Demiurge, Mage, 'Демиург', StormStaff, [80, 120, 1, 6, 8, 12]],
])('%p использует характеристики своего класса и отдельное оружие', (Class, Parent, description, Weapon, stats) => {
  const player = new Class(10, 'Боец');
  const { life, magic, speed, attack, agility, luck } = player;
  expect(player).toBeInstanceOf(Parent);
  expect(player).toMatchObject({ name: 'Боец', position: 10, description, maxLife: life, maxMagic: magic });
  expect(player.weapon).toBeInstanceOf(Weapon);
  expect(player.weapon).not.toBe(new Class(10, 'Другой').weapon);
  expect([life, magic, speed, attack, agility, luck]).toEqual(stats);
});

test('удача и обычный урон используют один бросок, атака вне дальности не бросает кубик', () => {
  const player = new Player(10, 'Человек-паук');
  const random = jest.fn(() => 0.45);
  expect(player.getLuck(random)).toBe(0.55);
  expect(player.getDamage(1, random)).toBeCloseTo(6.05);
  expect(player.getDamage(2, random)).toBe(0);
  expect(random).toHaveBeenCalledTimes(2);
  player.takeDamage(10);
  expect(player.life).toBe(90);
  expect(player.isDead()).toBe(false);
  player.takeDamage(91);
  expect(player.life).toBe(0);
  expect(player.isDead()).toBe(true);
});

test('лучник и арбалетчик сильнее бьют на большей дистанции в пределах дальности', () => {
  const archer = new Archer(0, 'Лучник');
  const crossbowman = new Crossbowman(0, 'Арбалетчик');
  const random = jest.fn(() => 0.5);
  expect(archer.getDamage(1, random)).toBeCloseTo(3);
  expect(archer.getDamage(3, random)).toBeCloseTo(9);
  expect(archer.getDamage(4, random)).toBe(0);
  expect(crossbowman.getDamage(4, random)).toBeCloseTo(14.95);
  expect(random).toHaveBeenCalledTimes(3);
});

test('воин перенаправляет удар в оставшуюся ману только ниже половины здоровья при удаче > 0.8', () => {
  const warrior = new Warrior(0, 'Алёша Попович');
  const random = jest.fn().mockReturnValueOnce(0.7).mockReturnValueOnce(0.71);
  warrior.takeDamage(60, random);
  warrior.takeDamage(1, random);
  expect(warrior).toMatchObject({ life: 59, magic: 20 });
  expect(random).not.toHaveBeenCalled();
  warrior.takeDamage(5, random);
  expect(warrior).toMatchObject({ life: 54, magic: 20 });
  warrior.takeDamage(30, random);
  expect(warrior).toMatchObject({ life: 54, magic: 0 });
  warrior.takeDamage(1, random);
  expect(warrior).toMatchObject({ life: 53, magic: 0 });
  expect(random).toHaveBeenCalledTimes(2);
});

test('щит мага поглощает половину входящего урона, пока осталось больше половины маны', () => {
  const mage = new Mage(10, 'Гендальф');
  for (const damage of [50, 20, 10, 20, 20]) mage.takeDamage(damage);
  expect(mage).toMatchObject({ life: 10, magic: 40 });
  mage.takeDamage(10);
  expect(mage).toMatchObject({ life: 0, magic: 40 });

  const demiurge = new Demiurge(0, 'Демиург');
  demiurge.magic = 60;
  demiurge.takeDamage(10);
  expect(demiurge).toMatchObject({ life: 70, magic: 60 });
});

test('гном проверяет удачу только на каждом шестом полученном ударе', () => {
  const dwarf = new Dwarf(0, 'Гном');
  const random = jest.fn().mockReturnValueOnce(0.31).mockReturnValueOnce(0.3);
  for (let hit = 0; hit < 6; hit += 1) dwarf.takeDamage(2, random);
  expect(dwarf.life).toBe(119);
  for (let hit = 0; hit < 6; hit += 1) dwarf.takeDamage(2, random);
  expect(dwarf.life).toBe(107);
  expect(random).toHaveBeenCalledTimes(2);
});

test('демиург отдельно проверяет усиление при положительной мане и доступной цели', () => {
  const demiurge = new Demiurge(0, 'Демиург');
  const random = jest.fn()
    .mockReturnValueOnce(0.38).mockReturnValueOnce(0.48)
    .mockReturnValueOnce(0.38).mockReturnValueOnce(0.49)
    .mockReturnValueOnce(0.38);
  expect(demiurge.getDamage(2, random)).toBeCloseTo(4);
  expect(demiurge.getDamage(2, random)).toBeCloseTo(6);
  expect(demiurge.getDamage(4, random)).toBe(0);
  demiurge.magic = 0;
  expect(demiurge.getDamage(2, random)).toBeCloseTo(4);
  expect(random).toHaveBeenCalledTimes(5);
});

test('движение ограничено скоростью и не перескакивает через цель', () => {
  const warrior = new Warrior(6, 'Алёша Попович');
  const target = new Mage(8, 'Маг');
  warrior.moveLeft(5);
  expect(warrior.position).toBe(4);
  warrior.moveRight(2);
  warrior.moveRight(1);
  expect(warrior.position).toBe(7);
  warrior.moveToEnemy(target);
  expect(warrior.position).toBe(8);
  warrior.move(-5);
  expect(warrior.position).toBe(6);
});

test('защита проверяет блок перед уклонением и изнашивает только оружие блокирующего', () => {
  const defender = new Warrior(0, 'Воин');
  const random = jest.fn()
    .mockReturnValueOnce(0.81)
    .mockReturnValueOnce(0.8).mockReturnValueOnce(0.8)
    .mockReturnValueOnce(0.1).mockReturnValueOnce(0.79);
  expect(defender.takeAttack(20, random)).toBe('blocked');
  expect(random).toHaveBeenCalledTimes(1);
  expect(defender.weapon.durability).toBe(480);
  expect(defender.takeAttack(20, random)).toBe('dodged');
  expect(defender.life).toBe(120);
  expect(defender.takeAttack(20, random)).toBe('hit');
  expect(defender.life).toBe(100);
  expect(defender.weapon.durability).toBe(480);
});

test('оружие блокирующего меняется на нож, затем на руки', () => {
  const defender = new Mage(0, 'Маг');
  defender.takeAttack(301, () => 0.9);
  expect(defender.weapon).toBeInstanceOf(Knife);
  defender.weapon.takeDamage(300);
  defender.checkWeapon();
  expect(defender.weapon).toBeInstanceOf(Arm);
  defender.checkWeapon();
  expect(defender.weapon).toBeInstanceOf(Arm);
  expect(defender.life).toBe(70);
});

test('атака вне дальности ничего не меняет, а сближение удваивает урон и отталкивает', () => {
  const attacker = new Warrior(0, 'Алёша Попович');
  const target = new Archer(2, 'Леголас');
  const random = jest.fn()
    .mockReturnValueOnce(0.1).mockReturnValueOnce(0.3).mockReturnValueOnce(0).mockReturnValueOnce(0)
    .mockReturnValueOnce(0.1).mockReturnValueOnce(0.3).mockReturnValueOnce(0).mockReturnValueOnce(0);
  expect(attacker.tryAttack(target, random)).toMatchObject({ result: 'out-of-range', roll: null });
  expect(attacker.weapon.durability).toBe(500);
  expect(random).not.toHaveBeenCalled();
  attacker.moveRight(1);
  expect(attacker.tryAttack(target, random)).toMatchObject({ result: 'hit', roll: 0.3, damage: 14, pushed: false });
  expect(target).toMatchObject({ life: 66, position: 2 });
  attacker.moveRight(1);
  expect(attacker.tryAttack(target, random)).toMatchObject({ result: 'hit', roll: 0.3, damage: 28, pushed: true });
  expect(target).toMatchObject({ life: 38, position: 3 });
  expect(attacker.weapon.durability).toBe(496);
  expect(random).toHaveBeenCalledTimes(8);
});

test('износ применяется перед расчётом силы удара, сломанное оружие заменяется после атаки', () => {
  const attacker = new Warrior(0, 'Воин');
  const defender = new Player(1, 'Игрок');
  attacker.weapon.takeDamage(350);
  expect(attacker.tryAttack(defender, () => 0.1).power).toBeCloseTo(4.5);
  expect(attacker.weapon.durability).toBe(148);
  attacker.weapon.takeDamage(147);
  expect(attacker.tryAttack(defender, () => 0.1).power).toBeCloseTo(2);
  expect(attacker.weapon).toBeInstanceOf(Knife);
  expect(attacker.weapon.durability).toBe(300);
});

test('цель выбирается по наименьшему здоровью среди других живых игроков', () => {
  const player = new Player(0, 'Игрок');
  const warrior = new Warrior(3, 'Воин');
  const mage = new Mage(-3, 'Маг');
  const dead = new Archer(1, 'Лучник');
  dead.takeDamage(100);
  expect(player.chooseEnemy([dead, player, warrior, mage])).toBe(mage);
  expect(player.turn([player, dead])).toBeNull();
});
