/* ============================================================
 * sprites/palettes.js — 共享像素调色板（16-bit 观感的统一色域）
 * 精灵文件从这里取共享色，保证全游戏色调一致。
 * ============================================================ */
(function () {
  'use strict';
  var Game = window.Game;

  Game.PAL = {
    // 皮肤
    skin: '#f2c088', skinShade: '#cf9a64', skinDark: '#a87246',
    // 头发
    hairBrown: '#8a5a2e', hairBrownDark: '#66401f',
    // 眼睛
    eye: '#20222e',
    // 布料
    blue: '#3f6fb0', blueDark: '#2b4f84', blueLight: '#6b9ad4',
    red: '#c04848', redDark: '#8a2f2f',
    green: '#4f9a48', greenDark: '#377032',
    purple: '#8a56c0', purpleDark: '#5f3a8a',
    // 皮革 / 木头
    leather: '#8a5a32', leatherDark: '#66401f',
    wood: '#7a5230', woodDark: '#59391f',
    // 金属
    metal: '#c8cdd8', metalDark: '#8b93aa', metalLight: '#eef1f6',
    gold: '#e8c058', goldDark: '#b08a2e',
    // 骨 / 白
    bone: '#e8e4d0', boneShade: '#bab48f',
    white: '#f4f4f4',
    // 自然
    grass: '#4f9a48', slime: '#5fc858', slimeDark: '#3d9038', slimeLight: '#9ae890',
    // 火焰
    fire1: '#f8e060', fire2: '#f09030', fire3: '#d04818', fireDark: '#902808',
    // 冰
    ice: '#a8e0f0', iceDark: '#5aa8cc', iceDeep: '#2f6f96',
    // 暗黑系
    shadow: '#3a3350', shadowDark: '#241f38',
    voidP: '#6a3a9a', voidDark: '#43245f',
    // 石头
    stone: '#9a9aa6', stoneDark: '#6b6b7a', stoneLight: '#c4c4ce'
  };
})();
