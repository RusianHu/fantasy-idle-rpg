/* ============================================================
 * core/audio.js — AudioManager 占位模块（本期不发声）
 * 完整签名的空实现：内部仅 console.debug 记录调用，验证触发点。
 * 未来补音频时：在 manifest 注册 (ID -> 文件路径) 并替换内部实现，
 * 事件挂接与触发点无需任何改动。
 * 注意移动端自动播放策略：AudioContext 必须在用户首次交互后
 * 初始化/恢复（见下方 TODO 注释）。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;

  var manifest = {}; // 音频资产清单：id -> 文件路径（本期为空）

  var A = Game.audio = {
    muted: { sfx: false, bgm: false },
    currentBgm: null,

    registerManifest: function (map) {
      for (var k in map) manifest[k] = map[k];
    },

    playSfx: function (id) {
      if (A.muted.sfx) return;
      // TODO(音频)：Web Audio 程序化合成短音效（打击/金币/升级）+ CC0 素材
      console.debug('[Audio] sfx:', id, manifest[id] || '(未注册)');
    },

    playBgm: function (id) {
      if (A.currentBgm === id) return;
      A.currentBgm = id;
      if (A.muted.bgm) return;
      console.debug('[Audio] bgm:', id, manifest[id] || '(未注册)');
    },

    stopBgm: function () {
      if (A.currentBgm) console.debug('[Audio] bgm stop:', A.currentBgm);
      A.currentBgm = null;
    },

    setMuted: function (kind, flag) {
      A.muted[kind] = !!flag;
      if (kind === 'bgm' && flag) console.debug('[Audio] bgm muted');
    },

    /** 事件总线挂接：全部触发点在此一次埋到位 */
    init: function () {
      var bus = Game.bus;
      bus.on('monster:killed', function (p) { A.playSfx(p && p.boss ? 'sfx_boss_die' : 'sfx_kill'); });
      bus.on('combat:hit', function (p) { A.playSfx(p && p.crit ? 'sfx_crit' : 'sfx_hit'); });
      bus.on('player:levelup', function () { A.playSfx('sfx_levelup'); });
      bus.on('item:dropped', function () { A.playSfx('sfx_drop'); });
      bus.on('item:equipped', function () { A.playSfx('sfx_equip'); });
      bus.on('gold:changed', function (p) { if (p && p.delta > 0) A.playSfx('sfx_gold'); });
      bus.on('potion:used', function () { A.playSfx('sfx_potion'); });
      bus.on('player:death', function () { A.playSfx('sfx_death'); });
      bus.on('region:travelStart', function () { A.playSfx('sfx_region_depart'); });
      bus.on('region:arrived', function () { A.playSfx('sfx_region_arrive'); });
      bus.on('player:reviveStart', function () { A.playSfx('sfx_soul_return'); });
      bus.on('player:revived', function () { A.playSfx('sfx_revive'); });
      bus.on('achievement:unlocked', function () { A.playSfx('sfx_achievement'); });
      bus.on('shop:bought', function () { A.playSfx('sfx_buy'); });
      bus.on('skill:upgraded', function () { A.playSfx('sfx_skillup'); });
      bus.on('boss:spawned', function () { A.playBgm('bgm_boss'); });
      bus.on('boss:defeated', function () { A.playBgm('bgm_field'); });
      bus.on('boss:failed', function () { A.playBgm('bgm_field'); });
      bus.on('game:completed', function () {
        A.playSfx('sfx_final_victory');
        A.playBgm('bgm_ending');
      });
      bus.on('game:continued', function () { A.playBgm('bgm_field'); });
      bus.on('rest:start', function () { A.playBgm('bgm_campfire'); });
      bus.on('rest:end', function () { A.playBgm('bgm_field'); });
      bus.on('region:changed', function () { if (!A.currentBgm || A.currentBgm === 'bgm_field') A.playBgm('bgm_field'); });
      // TODO(音频)：首次用户交互时 new AudioContext() 并 resume()
    }
  };
})();
