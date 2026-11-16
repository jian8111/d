// 署名: PRO2H(hadcockulloa@gmail.com)
// Original G-major folk score (G3..D5); absolute seconds are shared by voice and ink.
// Pinyin finals are reduced to their sung vowel/rime classes: iao→ao, ian→an, etc.
// Retain the real labiodental onset f in 翻, in addition to the other onset classes.
const RIME_CLASS = {
  a: "a", o: "o", e: "e", i: "i", u: "u", v: "u",
  ai: "ai", ei: "ei", ao: "ao", ou: "ou", an: "an", en: "en",
  ang: "ang", eng: "eng", ong: "ong", er: "er",
  ia: "a", ie: "e", iao: "ao", iu: "ou", ian: "an", in: "en",
  iang: "ang", ing: "eng", iong: "ong", ua: "a", uo: "o",
  uai: "ai", ui: "ei", uan: "an", un: "en", uang: "ang", ueng: "eng",
  ue: "e", ve: "e", van: "an", vn: "en",
};

function phoneme(pinyin) {
  const onset = pinyin.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxzcsryw])/u)?.[0] ?? "";
  const final = pinyin.slice(onset.length);
  const vowel = RIME_CLASS[final];
  if (!vowel) throw new Error(`Unscored pinyin final: ${pinyin}`);
  return { vowel, onset };
}

const roundT = (t) => Math.round(t * 1e6) / 1e6;

function makeCue(id, section, startT, endT, score) {
  const { text, pinyin, notes, ornament, anchorZone = "top" } = score;
  const letters = Array.from(text).filter((ch) => !/\s/u.test(ch));
  const syllables = pinyin.split(/\s+/u);
  if (letters.length !== syllables.length || letters.length !== notes.length) {
    throw new Error(`Cue ${id}: character / pinyin / melody count mismatch`);
  }
  // A short breath at each written space, a held phrase cadence and a longer final.
  const phraseEnds = new Set();
  let count = 0;
  for (const ch of text) {
    if (/\s/u.test(ch)) phraseEnds.add(count - 1);
    else count += 1;
  }
  const weights = letters.map((_, i) => i === letters.length - 1 ? 1.9 : phraseEnds.has(i) ? 1.35 : 1);
  const breathWeight = 0.28;
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) + phraseEnds.size * breathWeight;
  const unit = (endT - startT) / totalWeight;
  let cursor = startT;
  const chars = letters.map((ch, i) => {
    const t0 = roundT(cursor);
    cursor += weights[i] * unit;
    const t1 = i === letters.length - 1 ? endT : roundT(cursor);
    if (phraseEnds.has(i)) cursor += breathWeight * unit;
    const midi = notes[i];
    if (!Number.isInteger(midi) || midi < 55 || midi > 74 || ![0, 2, 4, 6, 7, 9, 11].includes(midi % 12)) {
      throw new Error(`Cue ${id}: pitch ${midi} is outside the G-major score`);
    }
    return { ch, t0, t1, midi, ...phoneme(syllables[i]) };
  });
  return { id, section, text, startT, endT, ornament, anchorZone, chars };
}

const VERSE1 = [
  {
    text: "穿过了沙漠 又绕过了神庙",
    pinyin: "chuan guo le sha mo you rao guo le shen miao",
    notes: [62, 62, 64, 62, 59, 60, 62, 64, 62, 59, 55],
    ornament: "route_arc", anchorZone: "top",
  },
  {
    text: "山洞的墙上 谁拿石头在敲",
    pinyin: "shan dong de qiang shang shui na shi tou zai qiao",
    notes: [59, 60, 62, 64, 62, 59, 60, 62, 59, 57, 55],
    ornament: "chisel_sparks", anchorZone: "upper_mid",
  },
  {
    text: "画一只大嘴鸟", pinyin: "hua yi zhi da zui niao",
    notes: [62, 64, 67, 64, 62, 59],
    ornament: "vermilion_seal", anchorZone: "mid",
  },
  {
    text: "它长着小短腿 却踩着踏板跑",
    pinyin: "ta zhang zhe xiao duan tui que cai zhe ta ban pao",
    notes: [59, 59, 60, 62, 64, 62, 60, 62, 64, 67, 64, 62],
    ornament: "beak_caliper", anchorZone: "top",
  },
  {
    text: "连车铃都在叫", pinyin: "lian che ling dou zai jiao",
    notes: [62, 67, 64, 62, 59, 55],
    ornament: "bell_ripples", anchorZone: "upper_mid",
  },
  {
    text: "从古时候的壁画 一路骑到今朝",
    pinyin: "cong gu shi hou de bi hua yi lu qi dao jin zhao",
    notes: [55, 59, 62, 62, 64, 67, 64, 62, 64, 67, 69, 67, 62],
    ornament: "history_slash", anchorZone: "top",
  },
  {
    text: "换了多少颜料 姿势还没变掉",
    pinyin: "huan le duo shao yan liao zi shi hai mei bian diao",
    notes: [59, 60, 62, 64, 62, 59, 60, 62, 64, 62, 57, 55],
    ornament: "speed_lines", anchorZone: "top",
  },
];

// Both choruses use precisely the same lyrics, syllabification and melodic motif.
const CHORUS = [
  {
    text: "那只骑单车的鹈鹕 嘴巴比车把还长",
    pinyin: "na zhi qi dan che de ti hu zui ba bi che ba hai chang",
    notes: [67, 67, 69, 71, 69, 67, 64, 62, 64, 67, 69, 71, 69, 67, 62],
    ornament: "beak_caliper", anchorZone: "top",
  },
  {
    text: "在纸上跑在墙上晃 一骑就是六千趟",
    pinyin: "zai zhi shang pao zai qiang shang huang yi qi jiu shi liu qian tang",
    notes: [67, 67, 69, 71, 72, 71, 69, 67, 64, 67, 69, 67, 64, 62, 67],
    ornament: "route_arc", anchorZone: "top",
  },
  {
    text: "叮叮当 叮叮当", pinyin: "ding ding dang ding ding dang",
    notes: [74, 71, 67, 72, 69, 62],
    ornament: "bell_ripples", anchorZone: "mid",
  },
  {
    text: "它真的真的骑得好", pinyin: "ta zhen de zhen de qi de hao",
    notes: [64, 67, 67, 69, 67, 64, 62, 59],
    ornament: "speed_lines", anchorZone: "upper_mid",
  },
  {
    text: "那只大嘴鹈鹕微微笑", pinyin: "na zhi da zui ti hu wei wei xiao",
    notes: [67, 69, 71, 69, 67, 64, 62, 64, 67],
    ornament: "smile_arc", anchorZone: "top",
  },
  {
    text: "两个轮子不摔跤", pinyin: "liang ge lun zi bu shuai jiao",
    notes: [64, 67, 69, 67, 64, 62, 59],
    ornament: "speed_lines", anchorZone: "upper_mid",
  },
  {
    text: "铁匠的锤子还在敲", pinyin: "tie jiang de chui zi hai zai qiao",
    notes: [62, 62, 64, 67, 64, 62, 59, 55],
    ornament: "chisel_sparks", anchorZone: "top",
  },
  {
    text: "六千年人类画了多少稿", pinyin: "liu qian nian ren lei hua le duo shao gao",
    notes: [59, 62, 67, 69, 71, 69, 67, 64, 62, 64],
    ornament: "history_slash", anchorZone: "top",
  },
  {
    text: "单车还在往前跑", pinyin: "dan che hai zai wang qian pao",
    notes: [67, 64, 62, 59, 57, 59, 55],
    ornament: "speed_lines", anchorZone: "upper_mid",
  },
];

const VERSE2 = [
  {
    text: "翻过了水墨 又钻进了电脑",
    pinyin: "fan guo le shui mo you zuan jin le dian nao",
    notes: [62, 62, 64, 62, 59, 60, 62, 64, 62, 59, 55],
    ornament: "route_arc", anchorZone: "top",
  },
  {
    text: "街边的画家 盯着屏幕傻笑",
    pinyin: "jie bian de hua jia ding zhe ping mu sha xiao",
    notes: [59, 60, 62, 64, 62, 59, 60, 62, 59, 57, 55],
    ornament: "smile_arc", anchorZone: "upper_mid",
  },
  {
    text: "这只鸟真奇妙", pinyin: "zhe zhi niao zhen qi miao",
    notes: [62, 64, 67, 64, 62, 59],
    ornament: "vermilion_seal", anchorZone: "mid",
  },
  {
    text: "它不用吃小鱼 也不用睡午觉",
    pinyin: "ta bu yong chi xiao yu ye bu yong shui wu jiao",
    notes: [59, 59, 60, 62, 64, 62, 60, 62, 64, 67, 64, 62],
    ornament: "beak_caliper", anchorZone: "top",
  },
  {
    text: "只管把车蹬好", pinyin: "zhi guan ba che deng hao",
    notes: [62, 67, 64, 62, 59, 55],
    ornament: "speed_lines", anchorZone: "upper_mid",
  },
  {
    text: "全世界的画笔 都在追着它跑",
    pinyin: "quan shi jie de hua bi dou zai zhui zhe ta pao",
    notes: [55, 59, 62, 64, 67, 64, 62, 64, 67, 69, 67, 62],
    ornament: "history_slash", anchorZone: "top",
  },
  {
    text: "画了六千年了 还是那么时髦",
    pinyin: "hua le liu qian nian le hai shi na me shi mao",
    notes: [59, 60, 62, 64, 62, 59, 60, 62, 64, 62, 57, 55],
    ornament: "vermilion_seal", anchorZone: "top",
  },
];

const OUTRO = [
  { text: "叮叮当 铁锤敲", pinyin: "ding ding dang tie chui qiao", notes: [67, 64, 62, 59, 62, 55], ornament: "chisel_sparks", anchorZone: "mid" },
  { text: "木吉他 轻轻扫", pinyin: "mu ji ta qing qing sao", notes: [59, 62, 64, 62, 59, 57], ornament: "route_arc", anchorZone: "mid" },
  { text: "六千年 还没到", pinyin: "liu qian nian hai mei dao", notes: [62, 64, 67, 64, 62, 59], ornament: "vermilion_seal", anchorZone: "mid" },
  { text: "那只鸟 还在跑", pinyin: "na zhi niao hai zai pao", notes: [62, 59, 57, 59, 57, 55], ornament: "speed_lines", anchorZone: "mid" },
];

export const LYRICS_CUES = [
  makeCue(1, "verse1", 15.71, 20.22, VERSE1[0]),
  makeCue(2, "verse1", 20.30, 24.25, VERSE1[1]),
  makeCue(3, "verse1", 24.40, 26.65, VERSE1[2]),
  makeCue(4, "verse1", 26.82, 31.90, VERSE1[3]),
  makeCue(5, "verse1", 32.02, 34.26, VERSE1[4]),
  makeCue(6, "verse1", 34.40, 38.90, VERSE1[5]),
  makeCue(7, "verse1", 39.05, 43.00, VERSE1[6]),
  makeCue(8, "chorus1", 43.12, 48.76, CHORUS[0]),
  makeCue(9, "chorus1", 48.86, 54.50, CHORUS[1]),
  makeCue(10, "chorus1", 54.62, 57.44, CHORUS[2]),
  makeCue(11, "chorus1", 57.56, 60.38, CHORUS[3]),
  makeCue(12, "chorus1", 60.50, 64.44, CHORUS[4]),
  makeCue(13, "chorus1", 64.56, 67.38, CHORUS[5]),
  makeCue(14, "chorus1", 67.50, 70.88, CHORUS[6]),
  makeCue(15, "chorus1", 71.00, 75.50, CHORUS[7]),
  makeCue(16, "chorus1", 75.62, 78.44, CHORUS[8]),
  makeCue(17, "verse2", 79.00, 83.51, VERSE2[0]),
  makeCue(18, "verse2", 83.63, 87.58, VERSE2[1]),
  makeCue(19, "verse2", 87.70, 89.95, VERSE2[2]),
  makeCue(20, "verse2", 90.07, 95.15, VERSE2[3]),
  makeCue(21, "verse2", 95.27, 97.52, VERSE2[4]),
  makeCue(22, "verse2", 97.64, 102.15, VERSE2[5]),
  makeCue(23, "verse2", 102.27, 106.22, VERSE2[6]),
  makeCue(24, "chorus2", 106.34, 111.98, CHORUS[0]),
  makeCue(25, "chorus2", 112.10, 117.74, CHORUS[1]),
  makeCue(26, "chorus2", 117.86, 120.68, CHORUS[2]),
  makeCue(27, "chorus2", 120.80, 123.62, CHORUS[3]),
  makeCue(28, "chorus2", 123.74, 127.68, CHORUS[4]),
  makeCue(29, "chorus2", 127.80, 130.62, CHORUS[5]),
  makeCue(30, "chorus2", 130.74, 134.12, CHORUS[6]),
  makeCue(31, "chorus2", 134.24, 138.74, CHORUS[7]),
  makeCue(32, "chorus2", 138.86, 141.68, CHORUS[8]),
  makeCue(33, "outro", 145.06, 149.00, OUTRO[0]),
  makeCue(34, "outro", 149.28, 153.22, OUTRO[1]),
  makeCue(35, "outro", 153.50, 157.44, OUTRO[2]),
  makeCue(36, "outro", 157.72, 161.65, OUTRO[3]),
];
