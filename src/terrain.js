const SECTION_LENGTH = 360;
const DESCENT = 0.2;
// 高度与切线共同定义连续雪坡：谷底蓄速、上坡抬升、坡唇起飞、陡降落地。
const KNOTS = [
  [0, 0, 0], [45, -3, -0.15], [90, -10, 0], [125, -1, 0.78],
  [154, 14, 0.3], [164, 16, 0.04], [174, 12, -1.1],
  [206, -20, -0.55], [250, -24, 0.06], [300, -8, 0.33], [360, 0, 0],
];
const SECTIONS = [
  { scale: 1, label: '飞跃脊线', kind: 'ridge' },
  { scale: 1.25, label: '凌空雪崖', kind: 'cliff' },
  { scale: 0.8, label: '风蚀波谷', kind: 'valley' },
  { scale: 1.5, label: '天际大飞坡', kind: 'summit' },
];

function sample(distance, order) {
  const section = Math.floor(distance / SECTION_LENGTH);
  const local = distance - section * SECTION_LENGTH;
  const scale = SECTIONS[((section % SECTIONS.length) + SECTIONS.length) % SECTIONS.length].scale;
  let index = 0;
  while (index < KNOTS.length - 2 && local > KNOTS[index + 1][0]) index++;
  const [a, ah, am] = KNOTS[index];
  const [b, bh, bm] = KNOTS[index + 1];
  const length = b - a;
  const t = (local - a) / length;
  if (order === 1) {
    return scale * ((6 * t * t - 6 * t) * ah + (3 * t * t - 4 * t + 1) * length * am
      + (-6 * t * t + 6 * t) * bh + (3 * t * t - 2 * t) * length * bm) / length;
  }
  if (order === 2) {
    return scale * ((12 * t - 6) * ah + (6 * t - 4) * length * am
      + (-12 * t + 6) * bh + (6 * t - 2) * length * bm) / (length * length);
  }
  return scale * ((2 * t ** 3 - 3 * t * t + 1) * ah + (t ** 3 - 2 * t * t + t) * length * am
    + (-2 * t ** 3 + 3 * t * t) * bh + (t ** 3 - t * t) * length * bm);
}

export function terrainHeight(distance) {
  return -distance * DESCENT + sample(distance, 0) + Math.sin(distance * 0.055) * 0.35;
}

export function terrainSlope(distance) {
  return -DESCENT + sample(distance, 1) + Math.cos(distance * 0.055) * 0.01925;
}

export function terrainCurvature(distance) {
  return sample(distance, 2) - Math.sin(distance * 0.055) * 0.00105875;
}

export function terrainFeature(distance) {
  let section = Math.floor(distance / SECTION_LENGTH);
  if (distance > section * SECTION_LENGTH + 164) section++;
  const feature = SECTIONS[((section % SECTIONS.length) + SECTIONS.length) % SECTIONS.length];
  const crestDistance = section * SECTION_LENGTH + 160;
  return {
    label: feature.label,
    kind: feature.kind,
    crestDistance,
    nextCrestDistance: Math.max(0, crestDistance - distance),
    dropHeight: Math.round(terrainHeight(crestDistance) - terrainHeight(section * SECTION_LENGTH + 230)),
    slope: terrainSlope(distance),
  };
}
