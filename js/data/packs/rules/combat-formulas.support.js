(function () {
  'use strict';
  window.Game.contentSupport.register({
    id: 'authoring.combat-formulas',
    version: '1.0.0',
    requires: [],
    capabilities: ['authoring.write', 'rules.formula'],
    sourceFile: 'js/data/packs/rules/combat-formulas.support.js',
    install: function (capabilities) {
      var balance = {
        monster: {
          hpBase: 55, hpTierScale: 2.05, powerBase: 8, powerTierScale: 1.95,
          defenseBase: 3, defenseTierScale: 1.9, rewardExpBase: 12,
          rewardExpTierScale: 1.95, rewardGoldBase: 7, rewardGoldTierScale: 1.9
        },
        boss: { hp: 11, power: 0.9, defense: 2, exp: 18, gold: 14 }
      };
      capabilities.authoring.provideValue({
        id: 'balance.combat', version: 1, value: balance
      });
      capabilities.rules.registerFormula({
        id: 'core.damage.power-coefficient-v1',
        version: 1, deterministic: true,
        access: ['source.statBlock', 'target.statBlock'],
        fn: function (ctx, params) {
          var source = ctx.sourceStats || {};
          var power = Number(source[params.powerStat || 'physicalPower']) || 0;
          return power * (Number(params.coefficient) || 1) + (Number(params.flat) || 0);
        }
      });
      capabilities.rules.registerFormula({
        id: 'core.heal.power-coefficient-v1',
        version: 1, deterministic: true,
        access: ['source.statBlock'],
        fn: function (ctx, params) {
          var source = ctx.sourceStats || {};
          var power = Number(source[params.powerStat || 'healingPower']) || 0;
          return power * (Number(params.coefficient) || 1) + (Number(params.flat) || 0);
        }
      });
    }
  });
})();
