import { Arm, Axe, Bow, Knife, LongBow, Staff, StormStaff, Sword, Weapon } from '../src/index.js';

test.each([
  [Arm, Weapon, 'Рука', 1, Infinity, 1],
  [Bow, Weapon, 'Лук', 10, 200, 3],
  [Sword, Weapon, 'Меч', 25, 500, 1],
  [Knife, Weapon, 'Нож', 5, 300, 1],
  [Staff, Weapon, 'Посох', 8, 300, 2],
  [LongBow, Bow, 'Длинный лук', 15, 200, 4],
  [Axe, Sword, 'Секира', 27, 800, 1],
  [StormStaff, Staff, 'Посох Бури', 10, 300, 3],
])('%p наследует характеристики от %p', (Class, Parent, name, attack, durability, range) => {
  const weapon = new Class();
  expect(weapon).toBeInstanceOf(Parent);
  expect(weapon).toEqual({ name, attack, durability, initDurability: durability, range });
});

test('ровно 30% прочности дают полный урон, износ ниже порога ослабляет оружие', () => {
  const weapon = new Weapon('Старый меч', 20, 10, 1);
  weapon.takeDamage(7);
  expect(weapon.durability).toBe(3);
  expect(weapon.getDamage()).toBe(20);
  weapon.takeDamage(1);
  expect(weapon.getDamage()).toBe(10);
  expect(weapon.isBroken()).toBe(false);
  weapon.takeDamage(50);
  expect(weapon.durability).toBe(0);
  expect(weapon.getDamage()).toBe(0);
  expect(weapon.isBroken()).toBe(true);
});

test('голые руки не изнашиваются', () => {
  const arm = new Arm();
  arm.takeDamage(20);
  expect(arm.durability).toBe(Infinity);
  expect(arm.getDamage()).toBe(1);
  expect(arm.isBroken()).toBe(false);
});
