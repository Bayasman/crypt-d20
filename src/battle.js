const DEFAULT_ROUND_LIMIT = 250;

function runBattle(players, { random, roundLimit, log, onTurn }) {
  let living = players.filter(player => !player.isDead());
  let rounds = 0;

  while (living.length > 1 && rounds < roundLimit) {
    rounds += 1;
    for (const [actor, player] of players.entries()) {
      if (player.isDead()) continue;
      const { target, ...turn } = player.turn(living, { random, log });
      onTurn?.({ ...turn, round: rounds, actor, target: players.indexOf(target) });
      if (target.isDead()) {
        living = living.filter(player => player !== target);
        if (living.length === 1) break;
      }
    }
  }
  return { winner: living.length === 1 ? players.indexOf(living[0]) : null, rounds };
}

function snapshot(players) {
  return players.map(player => {
    const { name, description, life, maxLife, magic, maxMagic, position, speed, weapon } = player;
    const { name: weaponName, range, durability, initDurability } = weapon;
    return {
      name, description, life, maxLife, magic, maxMagic, position, dead: player.isDead(), speed,
      weapon: { name: weaponName, range, durability, initDurability },
    };
  });
}

export function simulateBattle(players, { random = Math.random, roundLimit = DEFAULT_ROUND_LIMIT } = {}) {
  const initial = snapshot(players);
  const turns = [];
  const outcome = runBattle(players, {
    random, roundLimit, log: null,
    onTurn: turn => turns.push({ ...turn, after: snapshot(players) }),
  });
  return { initial, turns, ...outcome };
}

export function play(players) {
  const { winner } = runBattle(players, {
    random: Math.random, roundLimit: DEFAULT_ROUND_LIMIT, log: message => console.log(message),
  });
  if (winner === null) {
    console.log('Бой завершился без победителя.');
    return null;
  }
  console.log(`Победитель: ${players[winner].name}.`);
  return players[winner];
}
