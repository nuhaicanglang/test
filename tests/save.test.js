import test from "node:test";
import assert from "node:assert/strict";

const api = await import("../src/save.js").catch(() => null);

function storageFor(raw = null) {
  let value = raw;
  return {
    getItem(key) {
      assert.equal(key, "powder-save-v1");
      return value;
    },
    setItem(key, next) {
      assert.equal(key, "powder-save-v1");
      value = next;
    },
  };
}

test("新存档提供独立默认对象", () => {
  assert.ok(
    api?.readSave && api?.writeSave && api?.bankRun && api?.canUseSkin,
    "存档模块应导出约定 API",
  );
  const save = api.readSave(storageFor());
  assert.deepEqual(save, {
    bestDistance: 0,
    bestScore: 0,
    totalCoins: 0,
    runs: 0,
    skin: "orange",
    sound: true,
    quality: "ultra",
    motion: true,
    startTime: "dawn",
    openBestDistance: 0,
    openBestScore: 0,
  });
  assert.notEqual(save, api.DEFAULT_SAVE);
  save.totalCoins = 999;
  assert.equal(api.readSave(storageFor()).totalCoins, 0);
});

test("损坏 JSON、非对象和禁用存储安全返回默认存档", () => {
  assert.ok(api);
  for (const raw of ["{坏数据", "null", "[]", "12", "true"]) {
    assert.deepEqual(api.readSave(storageFor(raw)), api.DEFAULT_SAVE);
  }
  const deniedStorage = {
    getItem() {
      throw new Error("SecurityError");
    },
  };
  assert.deepEqual(api.readSave(deniedStorage), api.DEFAULT_SAVE);
  assert.deepEqual(api.readSave(null), api.DEFAULT_SAVE);
});

test("异常数值、设置和额外字段被规范化", () => {
  assert.ok(api);
  const save = api.readSave(
    storageFor(
      JSON.stringify({
        bestDistance: -4,
        bestScore: "999",
        totalCoins: 123.9,
        runs: null,
        skin: "mystery",
        sound: "yes",
        quality: "extreme",
        surprise: "不能写进存档",
      }),
    ),
  );
  assert.deepEqual(save, { ...api.DEFAULT_SAVE, totalCoins: 123 });
  const extreme = api.readSave(
    storageFor('{"bestDistance":1e400,"totalCoins":1e100,"runs":-1}'),
  );
  assert.equal(extreme.bestDistance, 0);
  assert.equal(extreme.totalCoins, Number.MAX_SAFE_INTEGER);
  assert.equal(extreme.runs, 0);
});

test("加载保留合法设置并拒绝使用未解锁皮肤", () => {
  assert.ok(api);
  const unlocked = api.readSave(
    storageFor(
      JSON.stringify({
        totalCoins: 100,
        skin: "blue",
        sound: false,
        quality: "low",
      }),
    ),
  );
  assert.equal(unlocked.skin, "blue");
  assert.equal(unlocked.sound, false);
  assert.equal(unlocked.quality, "low");
  const locked = api.readSave(
    storageFor(JSON.stringify({ totalCoins: 299, skin: "violet" })),
  );
  assert.equal(locked.skin, "orange");
});

test("皮肤按照累计金币阈值解锁，未知皮肤永不解锁", () => {
  assert.ok(api);
  assert.equal(api.canUseSkin("orange", 0), true);
  assert.equal(api.canUseSkin("blue", 99), false);
  assert.equal(api.canUseSkin("blue", 100), true);
  assert.equal(api.canUseSkin("violet", 299), false);
  assert.equal(api.canUseSkin("violet", 300), true);
  assert.equal(api.canUseSkin("mystery", 9999), false);
  assert.equal(api.canUseSkin("blue", Infinity), false);
  assert.equal(api.canUseSkin("blue", "100"), false);
});

test("正常写入使用约定键且能完整往返读取", () => {
  assert.ok(api);
  const storage = storageFor();
  const save = {
    ...api.DEFAULT_SAVE,
    totalCoins: 300,
    skin: "violet",
    sound: false,
    bestScore: 900,
  };
  assert.equal(api.writeSave(save, storage), true);
  assert.deepEqual(api.readSave(storage), save);
});

test("写入失败返回 false，写入成功前规范异常输入", () => {
  assert.ok(api);
  assert.equal(
    api.writeSave(api.DEFAULT_SAVE, {
      setItem() {
        throw new Error("QuotaExceededError");
      },
    }),
    false,
  );
  assert.equal(api.writeSave(api.DEFAULT_SAVE, null), false);
  const storage = storageFor();
  assert.equal(
    api.writeSave(
      { totalCoins: -9, skin: "blue", bestScore: Number.NaN },
      storage,
    ),
    true,
  );
  assert.deepEqual(api.readSave(storage), api.DEFAULT_SAVE);
});

test("结算累计金币和场次、更新整数纪录并保留原对象", () => {
  assert.ok(api);
  const original = {
    ...api.DEFAULT_SAVE,
    totalCoins: 95,
    runs: 2,
    bestDistance: 600,
    bestScore: 1200,
  };
  const next = api.bankRun(original, {
    coins: 12.9,
    distance: 850.8,
    score: 1000.2,
  });
  assert.deepEqual(next, {
    ...original,
    totalCoins: 107,
    runs: 3,
    bestDistance: 850,
  });
  assert.equal(original.totalCoins, 95);
  assert.equal(original.runs, 2);
  assert.notEqual(next, original);
  const record = api.bankRun(next, { coins: 0, distance: 100, score: 1800.9 });
  assert.equal(record.bestScore, 1800);
  assert.equal(record.bestDistance, 850);
});

test("结算异常局数据不污染账户且加法不超过安全整数", () => {
  assert.ok(api);
  const save = api.bankRun(
    {
      ...api.DEFAULT_SAVE,
      totalCoins: Number.MAX_SAFE_INTEGER,
      runs: Number.MAX_SAFE_INTEGER,
    },
    {
      coins: 10,
      distance: Infinity,
      score: -100,
    },
  );
  assert.equal(save.totalCoins, Number.MAX_SAFE_INTEGER);
  assert.equal(save.runs, Number.MAX_SAFE_INTEGER);
  assert.equal(save.bestDistance, 0);
  assert.equal(save.bestScore, 0);
  assert.deepEqual(api.bankRun(null, null), { ...api.DEFAULT_SAVE, runs: 1 });
});

test("全局 localStorage 属性访问被禁用时读写均不抛异常", () => {
  assert.ok(api);
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    assert.deepEqual(api.readSave(), api.DEFAULT_SAVE);
    assert.equal(api.writeSave(api.DEFAULT_SAVE), false);
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  }
});
