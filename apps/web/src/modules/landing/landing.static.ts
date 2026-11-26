import {
  ATTRIBUTION,
  CLOSING,
  CONTACT,
  FEATURES,
  FEATURES_SECTION,
  HERO,
  SITE,
  SPECS,
  STEPS,
  USE_CASES,
} from './landing.content';

/**
 * Build-time renderers for everything that must exist without running the app's JavaScript:
 * head tags, structured data, a semantic HTML fallback and /llms.txt. Pure string functions,
 * wired into the build by the `landing-static` plugin in vite.config.ts.
 */

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]!);

const abs = (path: string) => new URL(path, SITE.url).toString();
const editorUrl = abs(SITE.editorPath);
const headline = HERO.headline.join(' ');

export interface HeadTag {
  tag: 'title' | 'meta' | 'link' | 'script';
  attrs?: Record<string, string>;
  children?: string;
}

/** Title, description, canonical, Open Graph, Twitter card and JSON-LD. */
export function renderHeadTags(): HeadTag[] {
  const meta = (key: 'name' | 'property', id: string, content: string): HeadTag => ({
    tag: 'meta',
    attrs: { [key]: id, content },
  });
  return [
    { tag: 'title', children: escapeHtml(SITE.title) },
    meta('name', 'description', SITE.description),
    meta('name', 'theme-color', SITE.themeColor),
    { tag: 'link', attrs: { rel: 'canonical', href: abs('/') } },
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', SITE.name),
    meta('property', 'og:url', abs('/')),
    meta('property', 'og:title', SITE.title),
    meta('property', 'og:description', SITE.description),
    meta('property', 'og:image', abs(SITE.ogImage)),
    meta('property', 'og:image:width', '1200'),
    meta('property', 'og:image:height', '630'),
    meta('property', 'og:image:alt', SITE.ogImageAlt),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', SITE.title),
    meta('name', 'twitter:description', SITE.description),
    meta('name', 'twitter:image', abs(SITE.ogImage)),
    meta('name', 'twitter:image:alt', SITE.ogImageAlt),
    { tag: 'script', attrs: { type: 'application/ld+json' }, children: renderJsonLd() },
  ];
}

/** schema.org graph. `<` is escaped so the JSON can never close its own script tag. */
export function renderJsonLd(): string {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${abs('/')}#website`,
        url: abs('/'),
        name: SITE.name,
        description: SITE.description,
        inLanguage: 'en',
      },
      {
        '@type': 'WebApplication',
        '@id': `${abs('/')}#app`,
        name: SITE.name,
        url: editorUrl,
        description: SITE.description,
        image: abs(SITE.ogImage),
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript and WebGL.',
        featureList: FEATURES.map((f) => (f.body ? `${f.title}: ${f.body}` : f.title)),
      },
      {
        '@type': 'HowTo',
        '@id': `${abs('/')}#how-it-works`,
        name: `How to make an offline map with ${SITE.name}`,
        step: STEPS.items.map((s, i) => ({
          '@type': 'HowToStep',
          position: i + 1,
          name: s.title,
          text: s.body,
          url: editorUrl,
        })),
      },
      {
        '@type': 'ItemList',
        '@id': `${abs('/')}#use-cases`,
        name: `${USE_CASES.headline} ${USE_CASES.headlineAccent}`,
        itemListElement: USE_CASES.items.map((u, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: u.title,
          description: u.body,
          image: abs(u.image),
        })),
      },
    ],
  };
  return JSON.stringify(graph).replace(/</g, '\\u003c');
}

/**
 * Plain semantic version of the landing page, placed inside #root. React replaces it on mount;
 * it is what no-JS visitors, raw-HTML crawlers and agents read.
 */
export function renderStaticLanding(): string {
  const e = escapeHtml;
  const li = (title: string, body?: string) => `<li><h3>${e(title)}</h3>${body ? `<p>${e(body)}</p>` : ''}</li>`;
  return [
    '<main class="static-landing">',
    `<h1>${e(headline)}</h1>`,
    `<p>${e(HERO.body)}</p>`,
    `<p><a href="${e(SITE.editorPath)}">${e(HERO.primaryCta)}</a></p>`,
    `<h2>${e(`${STEPS.headline} ${STEPS.headlineAccent}`)}</h2>`,
    `<ol>${STEPS.items.map((s) => li(s.title, s.body)).join('')}</ol>`,
    `<h2>${e(`${FEATURES_SECTION.headline} ${FEATURES_SECTION.headlineAccent}`)}</h2>`,
    `<ul>${FEATURES.map((f) => li(f.title, f.body)).join('')}</ul>`,
    `<h2>${e(`${USE_CASES.headline} ${USE_CASES.headlineAccent}`)}</h2>`,
    `<ul>${USE_CASES.items
      .map((u) => `<li><img src="${e(u.image)}" alt="${e(u.alt)}" /><h3>${e(u.title)}</h3><p>${e(u.body)}</p></li>`)
      .join('')}</ul>`,
    `<p><a href="${e(SITE.editorPath)}">${e(CLOSING.cta)}</a></p>`,
    `<h2>${e(CONTACT.kicker)}</h2>`,
    `<p><a href="mailto:${e(CONTACT.email)}">${e(CONTACT.email)}</a> · ${e(CONTACT.location)}</p>`,
    `<p><a href="${e(ATTRIBUTION.href)}">${e(ATTRIBUTION.text)}</a></p>`,
    '</main>',
  ].join('');
}

/**
 * /llms.txt — the page as Markdown for language models (https://llmstxt.org).
 * ASCII only: nginx serves .txt without a charset, so anything else could be mis-decoded.
 */
export function renderLlmsTxt(): string {
  const lines = [
    `# ${SITE.name}`,
    '',
    `> ${SITE.description}`,
    '',
    `${SITE.name} is a web app. ${HERO.body} The editor needs a browser with JavaScript and WebGL.`,
    '',
    `**${STEPS.kicker}**`,
    '',
    ...STEPS.items.map((s, i) => `${i + 1}. ${s.title}: ${s.body}`),
    '',
    `**${FEATURES_SECTION.headline} ${FEATURES_SECTION.headlineAccent}**`,
    '',
    ...FEATURES.map((f) => (f.body ? `- ${f.title}: ${f.body}` : `- ${f.title}`)),
    '',
    `**${USE_CASES.headline} ${USE_CASES.headlineAccent}**`,
    '',
    ...USE_CASES.items.map((u) => `- ${u.title}: ${u.body}`),
    '',
    '**Output**',
    '',
    ...SPECS.map((s) => `- ${s.label}: ${s.value}`),
    '',
    '## Links',
    '',
    `- [Editor](${editorUrl}): Select an area, style the map and generate MBTiles.`,
    `- [Home](${abs('/')}): Overview of features and steps.`,
    `- [Contact](mailto:${CONTACT.email}): ${CONTACT.location}.`,
    `- [OpenStreetMap copyright](${ATTRIBUTION.href}): Map data comes from OpenStreetMap contributors.`,
    '',
  ];
  return lines.join('\n');
}
