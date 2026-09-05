const STORAGE_KEY = 'powder-save-v1';
const SKIN_COSTS = Object.freeze({ orange: 0, blue: 100, violet: 300 });

export const DEFAULT_SAVE = Object.freeze({
  bestDistance: 0,
  bestScore: 0,
  totalCoins: 0,
  runs: 0,
  skin: 'orange',
  sound: true,
  quality: 'high',
});

function safeInteger(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value)));
}

export function canUseSkin(id, totalCoins) {
  return Object.hasOwn(SKIN_COSTS, id) && safeInteger(totalCoins) >= SKIN_COSTS[id];
}

function normalizeSave(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const totalCoins = safeInteger(input.totalCoins);
  return {
    bestDistance: safeInteger(input.bestDistance),
    bestScore: safeInteger(input.bestScore),
    totalCoins,
    runs: safeInteger(input.runs),
    skin: canUseSkin(input.skin, totalCoins) ? input.skin : 'orange',
    sound: typeof input.sound === 'boolean' ? input.sound : true,
    quality: ['low', 'medium', 'high'].includes(input.quality) ? input.quality : 'high',
  };
}

export function readSave(storage) {
  try {
    // 部分浏览器连读取 localStorage 属性都会抛异常，因此在保护范围内获取。
    const target = storage === undefined ? globalThis.localStorage : storage;
    const raw = target?.getItem(STORAGE_KEY);
    return raw ? normalizeSave(JSON.parse(raw)) : { ...DEFAULT_SAVE };
  } catch {
    return { ...DEFAULT_SAVE };
  }
}

export function writeSave(save, storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    if (!target || typeof target.setItem !== 'function') return false;
    target.setItem(STORAGE_KEY, JSON.stringify(normalizeSave(save)));
    return true;
  } catch {
    return false;
  }
}

export function bankRun(save, state) {
  const current = normalizeSave(save);
  const result = state && typeof state === 'object' ? state : {};
  // 每次结算返回新对象；同一局只结算一次由游戏流程控制。
  return {
    ...current,
    totalCoins: safeInteger(current.totalCoins + safeInteger(result.coins)),
    runs: safeInteger(current.runs + 1),
    bestDistance: Math.max(current.bestDistance, safeInteger(result.distance)),
    bestScore: Math.max(current.bestScore, safeInteger(result.score)),
  };
}
