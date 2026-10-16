const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const localRequire = name => name.startsWith('.')
    ? load(path.join(path.dirname(file), name + '.tsx'))
    : require(name);
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
  return module.exports;
}
const { resolveVideoSource, resolveIdeaVideoSource, getGoogleDriveVideo } = load('lib/video.ts');
const Preview = load('components/video-preview.tsx').default;
const DesignPreview = load('components/design-preview.tsx').default;
const id = '1Example_Video-File123';
const driveLink = 'https://drive.google.com/file/d/' + id + '/view?usp=sharing';

test('Drive share, preview, account-scoped and older link formats use the Drive player', () => {
  for (const link of [
    driveLink, 'drive.google.com/file/d/' + id + '/view',
    'https://drive.google.com/file/d/' + id + '/preview',
    'https://drive.google.com/open?id=' + id,
    'https://drive.google.com/uc?export=download&id=' + id,
    'https://drive.google.com/file/u/0/d/' + id + '/view',
    'https://drive.google.com/u/1/file/d/' + id + '/view'
  ]) {
    const parsed = resolveVideoSource(link);
    assert.equal(parsed.type, 'google-drive', link);
    assert.equal(parsed.fileId, id);
    assert.equal(parsed.embedUrl, 'https://drive.google.com/file/d/' + id + '/preview');
  }
});
test('Drive resource keys survive in both preview and Open in Drive links', () => {
  const parsed = getGoogleDriveVideo(driveLink + '&resourcekey=0-secret_example-key');
  assert.equal(new URL(parsed.embedUrl).searchParams.get('resourcekey'), '0-secret_example-key');
  assert.equal(new URL(parsed.openUrl).searchParams.get('resourcekey'), '0-secret_example-key');
  assert.equal(new URL(parsed.embedUrl).searchParams.has('usp'), false);
});
test('Source automatically becomes a Drive preview without rewriting existing option videos', () => {
  assert.equal(resolveIdeaVideoSource('', '', driveLink).type, 'google-drive');
  assert.equal(resolveIdeaVideoSource('https://youtu.be/abcdef12345', '', driveLink).type, 'youtube');
  assert.equal(resolveIdeaVideoSource('', 'https://example.test/video.mp4', driveLink).type, 'direct');
  assert.equal(resolveIdeaVideoSource('  ', undefined, '  ' + driveLink + '  ').type, 'google-drive');
  assert.equal(resolveIdeaVideoSource('', '', 'Pinterest').type, 'none');
  assert.equal(resolveIdeaVideoSource('', '', 'https://example.test/article').type, 'none');
  assert.equal(resolveIdeaVideoSource('', '', '').type, 'none'); // Clearing Source removes its preview.
});
test('Invalid Drive folders and unsafe URLs never become Drive embeds or source videos', () => {
  for (const link of [
    'https://drive.google.com/drive/folders/' + id,
    'https://drive.google.com/file/d/../view',
    'https://drive.google.com/file/d/bad%22id/view',
    'https://drive.google.com.evil.test/file/d/' + id + '/view',
    'https://drive.google.com@evil.test/file/d/' + id + '/view',
    'javascript:alert(1)', 'data:text/html,attack', 'not a URL'
  ]) {
    assert.equal(getGoogleDriveVideo(link), null, link);
    assert.equal(resolveIdeaVideoSource('', '', link).type, 'none', link);
  }
  assert.equal(resolveVideoSource('javascript:alert(1)').type, 'none');
  assert.equal(resolveVideoSource('https://drive.google.com/drive/folders/' + id).type, 'none');
});
test('YouTube and direct video playback continue working', () => {
  for (const link of ['https://www.youtube.com/watch?v=abcdef12345', 'https://youtu.be/abcdef12345', 'https://youtube.com/shorts/abcdef12345'])
    assert.equal(resolveVideoSource(link).type, 'youtube');
  assert.deepEqual(resolveVideoSource('https://example.test/video.mp4'), { type: 'direct', url: 'https://example.test/video.mp4' });
});
test('Drive uses an iframe, supports portrait sizing, and direct files keep native video controls', () => {
  const html = renderToStaticMarkup(React.createElement(Preview, { source: resolveVideoSource(driveLink), title: 'Visit', story: true }));
  assert.match(html, /<iframe/); assert.doesNotMatch(html, /<video/);
  assert.match(html, /\/preview/); assert.match(html, /Google Drive video/);
  assert.match(html, /aspect-\[9\/16\]/); assert.match(html, /allowFullScreen/);
  const native = renderToStaticMarkup(React.createElement(Preview, { source: resolveVideoSource('https://example.test/v.webm'), title: 'Video', story: false }));
  assert.match(native, /<video/); assert.match(native, /controls/);
});

test('Design image is shown first without loading an attached video player', () => {
  for (const link of [driveLink, 'https://youtu.be/abcdef12345', 'https://example.test/v.mp4']) {
    const html = renderToStaticMarkup(React.createElement(DesignPreview, {
      source: resolveVideoSource(link), title: 'Thanksgiving', image: '/design.webp', alt: 'Option 1', story: false
    }));
    assert.match(html, /<img/);
    assert.match(html, /src="\/design.webp"/);
    assert.match(html, /aria-label="Play video"/);
    assert.doesNotMatch(html, /<iframe|<video/);
  }
});

test('Image-only options have no play button and portrait images retain their sizing', () => {
  const html = renderToStaticMarkup(React.createElement(DesignPreview, {
    source: { type: 'none' }, title: 'Visit', image: '/poster.webp', alt: 'Portrait option', story: true
  }));
  assert.match(html, /<img/); assert.match(html, /max-h-\[760px\]/);
  assert.doesNotMatch(html, /Play video|<iframe|<video/);
});
