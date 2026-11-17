import { Arm, Axe, Bow, Knife, LongBow, Staff, StormStaff, Sword } from './weapons.js';

export class Player {
  constructor(position, name, {
    life = 100, magic = 20, speed = 1, attack = 10, agility = 5, luck = 10,
    description = 'Игрок', weapon = Arm,
  } = {}) {
    Object.assign(this, {
      life, maxLife: life, magic, maxMagic: magic, speed, attack, agility, luck,
      description, weapon: new weapon(), position, name,
    });
  }

  getLuck(random = Math.random) {
    return (random() * 100 + this.luck) / 100;
  }

  getDamage(distance, random = Math.random) {
    if (distance > this.weapon.range) return 0;
    return (this.attack + this.weapon.getDamage()) * this.getLuck(random) / distance;
  }

  takeDamage(damage) {
    this.life = Math.max(0, this.life - damage);
  }

  isDead() {
    return this.life === 0;
  }

  moveLeft(distance) {
    this.position -= Math.min(Math.abs(distance), this.speed);
  }

  moveRight(distance) {
    this.position += Math.min(Math.abs(distance), this.speed);
  }

  move(distance) {
    if (distance < 0) this.moveLeft(distance);
    else this.moveRight(distance);
  }

  isAttackBlocked(random = Math.random) {
    return this.getLuck(random) > (100 - this.luck) / 100;
  }

  dodged(random = Math.random) {
    return this.getLuck(random) > (100 - this.agility - this.speed * 3) / 100;
  }

  takeAttack(damage, random = Math.random) {
    if (this.isAttackBlocked(random)) {
      this.weapon.takeDamage(damage);
      this.checkWeapon();
      return 'blocked';
    }
    if (this.dodged(random)) return 'dodged';
    this.takeDamage(damage, random);
    return 'hit';
  }

  checkWeapon() {
    if (this.weapon.isBroken() && !(this.weapon instanceof Arm)) {
      this.weapon = this.weapon instanceof Knife ? new Arm() : new Knife();
    }
  }

  tryAttack(enemy, random = Math.random) {
    const separation = Math.abs(this.position - enemy.position);
    const distance = separation || 1;
    if (distance > this.weapon.range) {
      return { pushed: false, result: 'out-of-range', roll: null, power: 0, damage: 0, manaSpent: 0 };
    }

    this.weapon.takeDamage(10 * this.getLuck(random));
    let roll = null;
    let power = this.getDamage(distance, () => {
      const value = random();
      // Первый бросок в getDamage определяет базовый урон, даже у демиурга.
      roll ??= value;
      return value;
    });

    const pushed = separation === 0;
    if (pushed) {
      enemy.position += 1;
      power *= 2;
    }
    const { life, magic } = enemy;
    const result = enemy.takeAttack(power, random);
    this.checkWeapon();
    return { pushed, result, roll, power, damage: life - enemy.life, manaSpent: magic - enemy.magic };
  }

  chooseEnemy(players) {
    let weakest;
    for (const player of players) {
      if (player !== this && !player.isDead() && (!weakest || player.life < weakest.life)) {
        weakest = player;
      }
    }
    return weakest;
  }

  moveToEnemy(enemy) {
    this.move(enemy.position - this.position);
  }

  turn(players, { random = Math.random, log = console.log } = {}) {
    const target = this.chooseEnemy(players);
    if (!target) return null;

    const from = this.position;
    this.moveToEnemy(target);
    const to = this.position;
    const attack = this.tryAttack(target, random);
    if (log) {
      if (from !== to) log(`${this.name}: позиция ${from} → ${to}.`);
      if (attack.pushed) log(`${target.name} отскакивает вправо на позицию ${target.position}.`);
      const messages = {
        'out-of-range': 'цель вне досягаемости',
        blocked: 'цель блокирует удар оружием',
        dodged: 'цель уклоняется',
        hit: `потеря здоровья: ${attack.damage.toFixed(1)}, маны: ${attack.manaSpent.toFixed(1)}`,
      };
      log(`${this.name} → ${target.name}: ${messages[attack.result]}.`);
    }
    return { target, from, to, ...attack };
  }
}

export class Warrior extends Player {
  constructor(position, name, stats = {}) {
    super(position, name, { life: 120, speed: 2, description: 'Воин', weapon: Sword, ...stats });
  }

  takeDamage(damage, random = Math.random) {
    if (this.life < this.maxLife / 2 && this.magic > 0 && this.getLuck(random) > 0.8) {
      this.magic = Math.max(0, this.magic - damage);
    } else {
      super.takeDamage(damage);
    }
  }
}

export class Archer extends Player {
  constructor(position, name, stats = {}) {
    super(position, name, {
      life: 80, magic: 35, attack: 5, agility: 10, description: 'Лучник', weapon: Bow, ...stats,
    });
  }

  getDamage(distance, random = Math.random) {
    if (distance > this.weapon.range) return 0;
    return (this.attack + this.weapon.getDamage()) * this.getLuck(random) * distance / this.weapon.range;
  }
}

export class Mage extends Player {
  constructor(position, name, stats = {}) {
    super(position, name, {
      life: 70, magic: 100, attack: 5, agility: 8, description: 'Маг', weapon: Staff, ...stats,
    });
  }

  takeDamage(damage) {
    if (this.magic > this.maxMagic / 2) {
      this.magic -= 12;
      super.takeDamage(damage / 2);
    } else {
      super.takeDamage(damage);
    }
  }
}

export class Dwarf extends Warrior {
  #hitsTaken = 0;

  constructor(position, name) {
    super(position, name, { life: 130, attack: 15, luck: 20, description: 'Гном', weapon: Axe });
  }

  takeDamage(damage, random = Math.random) {
    this.#hitsTaken += 1;
    const reduced = this.#hitsTaken % 6 === 0 && this.getLuck(random) > 0.5;
    super.takeDamage(reduced ? damage / 2 : damage, random);
  }
}

export class Crossbowman extends Archer {
  constructor(position, name) {
    super(position, name, {
      life: 85, attack: 8, agility: 20, luck: 15, description: 'Арбалетчик', weapon: LongBow,
    });
  }
}

export class Demiurge extends Mage {
  constructor(position, name) {
    super(position, name, {
      life: 80, magic: 120, attack: 6, luck: 12, description: 'Демиург', weapon: StormStaff,
    });
  }

  getDamage(distance, random = Math.random) {
    if (distance > this.weapon.range) return 0;
    const damage = super.getDamage(distance, random);
    return this.magic > 0 && this.getLuck(random) > 0.6 ? damage * 1.5 : damage;
  }
}
