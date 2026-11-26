import { describe, expect, it } from 'vitest';
import { FEATURES, SITE, STEPS, USE_CASES } from './landing.content';
import { escapeHtml, renderHeadTags, renderJsonLd, renderLlmsTxt, renderStaticLanding } from './landing.static';

const everyTitle = [
  ...FEATURES.map((f) => f.title),
  ...STEPS.items.map((s) => s.title),
  ...USE_CASES.items.map((u) => u.title),
];

describe('landing static renderers', () => {
  it('escapes HTML', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;');
  });

  it('renders every feature and step into the no-JS fallback', () => {
    const html = renderStaticLanding();
    for (const title of everyTitle) expect(html).toContain(escapeHtml(title));
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).toContain(`href="${SITE.editorPath}"`);
  });

  it('emits head tags Vite can serialize safely', () => {
    const tags = renderHeadTags();
    const attr = (name: string) =>
      tags.find((t) => t.attrs?.name === name || t.attrs?.property === name)?.attrs?.content;
    expect(tags[0]).toEqual({ tag: 'title', children: escapeHtml(SITE.title) });
    expect(attr('description')).toBe(SITE.description);
    expect(attr('og:image')).toBe(`${SITE.url}${SITE.ogImage}`);
    expect(tags.find((t) => t.attrs?.rel === 'canonical')?.attrs?.href).toBe(`${SITE.url}/`);
    // Vite quotes attribute values without escaping them.
    for (const tag of tags) for (const value of Object.values(tag.attrs ?? {})) expect(value).not.toContain('"');
  });

  it('emits valid JSON-LD that cannot break out of its script tag', () => {
    const json = renderJsonLd();
    expect(json).not.toContain('<');
    const graph = JSON.parse(json)['@graph'] as Array<Record<string, unknown>>;
    expect(graph.map((node) => node['@type'])).toEqual(['WebSite', 'WebApplication', 'HowTo', 'ItemList']);
    expect(graph[2]!.step).toHaveLength(STEPS.items.length);
    expect(graph[3]!.itemListElement).toHaveLength(USE_CASES.items.length);
    expect(`${SITE.title} ${SITE.description} ${SITE.ogImageAlt}`.toLowerCase()).not.toContain('openstreetmap');
  });

  it('renders llms.txt as ASCII Markdown with the summary and links', () => {
    const txt = renderLlmsTxt();
    expect(txt.startsWith(`# ${SITE.name}\n\n> ${SITE.description}\n`)).toBe(true);
    for (const title of everyTitle) expect(txt).toContain(title);
    expect(txt).toContain(`](${SITE.url}${SITE.editorPath})`);
    expect(txt).toMatch(/^[\n\x20-\x7e]*$/);
  });
});
