'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('tech-demos/render-gallery/render-gallery.html');
const script = read('tech-demos/render-gallery/render-gallery.js');
const css = read('tech-demos/render-gallery/render-gallery.css');
const messages = read('tech-demos/demo-i18n.js');

assert.match(html, /js\/render\/visual_catalog\.js\?v=/, 'Render Gallery loads the production visual catalog');
assert.match(script, /Game\.content\.finalize\(\{ strict: true \}\)/);
assert.match(script, /Game\.visualCatalog\.snapshot/);
assert.match(script, /item\.motion/);
assert.match(script, /previewTime \+= dt/);
assert.match(script, /paintMotionPreviews\(previewTime\)/);
assert.match(script, /Game\.assets\.resolveMotion\(item\.spriteId/);
assert.match(script, /Game\.fx\.preview/);
assert.match(script, /Game\.particles\.preview/);
assert.match(script, /Game\.render\.drawBubblePreview/);
assert.match(script, /categoryIds\(\)/);
assert.match(script, /IntersectionObserver/);
assert.match(script, /animatedCardButtons/);
assert.match(script, /renderPreviewWindow\(\)/);
assert.match(script, /openPreviewPopup\(\)/);
assert.match(script, /renderCompareWall\(\)/);
assert.match(script, /MAX_COMPARE\s*=\s*4/);
assert.match(script, /applyStageSettings\(\)/);
assert.match(script, /previewTime \+= dt \* previewSpeed/);
assert.match(script, /preview-scrubber/);
assert.match(script, /guides:\s*previewGuides/);
assert.match(script, /coverage-cell/);
assert.match(script, /reduced-motion/);
assert.match(script, /history\.replaceState/);
assert.match(css, /overflow-x:\s*hidden/);
assert.match(css, /\.gallery-layout/);
assert.match(css, /\.inspector\s*\{/);
assert.match(css, /\.preview-toolbar/);
assert.match(css, /\.compare-wall/);
assert.match(css, /\.preview-stage\.backdrop-night/);
for (const id of ['preview-window', 'preview-stage', 'preview-canvas', 'preview-reset', 'preview-popout', 'preview-scale', 'preview-speed', 'preview-backdrop', 'preview-grid', 'preview-guides', 'preview-scrubber', 'preview-step-back', 'preview-step-forward', 'compare-add', 'compare-clear', 'compare-count', 'compare-wall', 'region-select', 'category-select', 'category-tabs', 'search-input', 'motion-select', 'direction-select', 'reduced-motion', 'gallery', 'inspector-content']) {
  assert.match(html, new RegExp(`id="${id}"`), `Render Gallery exposes #${id}`);
}
for (const stale of ['stage-grid', 'stage-panel', 'stage-wrap', 'stage-overlay', 'seed-input', 'runtime-status', 'visual.stageAria', 'visual.mapNote']) {
  assert.doesNotMatch(html + script + css, new RegExp(stale.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Render Gallery removed stale map surface: ${stale}`);
}
for (const staleRuntime of ['systems/terrain', 'systems/terrain_v3', 'systems/terrain_v4', 'systems/world', 'systems/weather', 'render/terrain', 'render/exploration', 'render/weather', 'render/hazards']) {
  assert.doesNotMatch(html, new RegExp(staleRuntime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Render Gallery does not load unused map runtime: ${staleRuntime}`);
}
for (const stale of ['drawThemePreview', 'stageInterval', 'stagePaintCount', 'parseSeed', 'hex32', 'Game.terrain.generate', 'Game.terrain.mount']) {
  assert.doesNotMatch(script, new RegExp(stale.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Render Gallery removed stale map logic: ${stale}`);
}
for (const key of ['visual.title', 'visual.subtitle', 'visual.categoryTabsHint', 'visual.native', 'visual.derived', 'visual.fallback', 'visual.hurt', 'visual.defeat', 'visual.previewMode', 'visual.previewProduction', 'visual.previewAdapted', 'visual.previewCatalog', 'visual.previewWindow', 'visual.previewPopout', 'visual.previewScale', 'visual.previewBackdrop', 'visual.previewSpeed', 'visual.previewGrid', 'visual.previewGuides', 'visual.timeline', 'visual.timeReadout', 'visual.compareAdd', 'visual.compareClear', 'visual.compareTitle', 'visual.compareHint', 'visual.compareCount', 'visual.controlsAria', 'hub.visual.title', 'hub.visual.desc']) {
  assert.ok((messages.match(new RegExp("'" + key.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&') + "'\\s*:", 'g')) || []).length >= 2,
    `${key} is bilingual`);
}
assert.match(read('tech-demos/index.html'), /render-gallery\/render-gallery\.html/);
console.log('Render Gallery static contract OK.');
