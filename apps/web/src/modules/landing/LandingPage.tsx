import { useEffect, useRef, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import styled, { createGlobalStyle, css, keyframes } from 'styled-components';
import { BackdropTrace } from './BackdropTrace';
import { CutDiagram } from './CutDiagram';
import { HeroMap } from './HeroMap';
import { InterestForm } from './InterestForm';
import { ATTRIBUTION, CONTACT, FEATURES, FEATURES_SECTION, HERO, SITE, STEPS, USE_CASES } from './landing.content';
import { TILE_BACKDROP } from './landing.backdrop';
import { landingTokens as t } from './landing.tokens';
import { Logo, LOGO_LABEL } from './Logo';
import { StepArt } from './StepArt';
import { SLIDE_ATTR, useSlides } from './useSlides';

const HEADER_HEIGHT = '64px';
const GUTTER = 'clamp(20px, 4vw, 48px)';
/** Screens where every slide fits, so the slide pager has room and is worth showing. */
const ROOMY = '(min-width: 980px) and (min-height: 720px)';
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * The landing is a slide show: every section fills the screen and the page snaps between them.
 * Set on the root because the viewport is the scroller. Slides taller than a small screen still
 * scroll normally inside themselves; useSlides adds one-gesture paging where they all fit.
 */
const SlideSnap = createGlobalStyle`
  html {
    scroll-snap-type: y mandatory;
  }
`;

const snap = css`
  scroll-snap-align: start;
  scroll-snap-stop: always;
`;

const slide = css`
  ${snap}
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100svh;
  padding: calc(${HEADER_HEIGHT} + 32px) ${GUTTER} 48px;
`;
const rise = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Page = styled.div`
  min-height: 100%;
  background: ${t.bg};
  isolation: isolate;
  /* Backdrop for the whole page, fixed to the screen: big tiles in the bottom-left corner,
     smaller and fainter towards the top-right. The slides scroll over it. */
  &::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: -1;
    background: ${TILE_BACKDROP} left bottom / cover no-repeat;
    pointer-events: none;
  }
  color: ${t.text};
  font-family: ${t.fontDisplay};
  font-feature-settings: normal;
  font-size: 14px;
  letter-spacing: 0.03em;
  text-transform: uppercase;

  a:focus-visible {
    outline: 2px solid ${t.accent};
    outline-offset: 3px;
  }
  ::selection {
    background: ${t.accent};
    color: ${t.onAccent};
  }
`;

const SkipLink = styled.a`
  position: fixed;
  top: 8px;
  left: 8px;
  z-index: 60;
  padding: 10px 14px;
  background: ${t.accent};
  color: ${t.onAccent};
  font: 700 12px ${t.fontMono};
  letter-spacing: 0.1em;
  transform: translateY(-200%);
  &:focus {
    transform: none;
  }
`;

/** Over the first slide the header is invisible; past it, it turns into a sticky glass bar with a border. */
const Header = styled.header<{ $solid: boolean }>`
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: ${HEADER_HEIGHT};
  padding: 0 ${GUTTER};
  background: ${({ $solid }) => ($solid ? t.glass : 'transparent')};
  /* Same width either way, so the header does not move when it changes. */
  border-bottom: 1px solid ${({ $solid }) => ($solid ? t.line : 'transparent')};
  backdrop-filter: blur(14px);
  transition:
    background 360ms ease,
    border-color 360ms ease;
`;

const Brand = styled(Link)`
  display: inline-flex;
  color: ${t.text};
  text-decoration: none;
`;

const Nav = styled.nav`
  display: none;
  gap: 32px;
  font: 500 12px ${t.fontMono};
  letter-spacing: 0.14em;
  @media (min-width: 760px) {
    display: flex;
    /* Centred on the header, independent of the brand and button widths. */
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
  a {
    color: ${t.textSecondary};
    text-decoration: none;
    transition: color 140ms ease;
    &:hover {
      color: ${t.text};
    }
  }
`;

const Arrow = styled.span`
  transition: transform 160ms cubic-bezier(0.2, 0, 0, 1);
`;

const button = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 48px;
  padding: 0 22px;
  border: 1px solid transparent;
  border-radius: ${t.radiusButton};
  font: 700 13px ${t.fontMono};
  letter-spacing: 0.12em;
  text-decoration: none;
  white-space: nowrap;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
  &:hover ${Arrow} {
    transform: translateX(4px);
  }
  &:active {
    transform: translateY(1px);
  }
`;

const PrimaryBtn = styled(Link)<{ $compact?: boolean }>`
  ${button}
  background: ${t.accent};
  color: ${t.onAccent};
  &:hover {
    background: ${t.accentHover};
  }
  ${({ $compact }) =>
    $compact &&
    css`
      height: 38px;
      padding: 0 16px;
      font-size: 12px;
    `}
`;

const SecondaryBtn = styled.a`
  ${button}
  border-color: ${t.lineStrong};
  background: ${t.glass};
  color: ${t.text};
  &:hover {
    border-color: ${t.accent};
    color: ${t.accent};
  }
`;

const Hero = styled.section`
  ${snap}
  display: flex;
  flex-direction: column;
  min-height: 100svh;
`;

const HeroStage = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  min-height: 540px;
  overflow: hidden;
  @media (max-width: 720px) {
    align-items: flex-start;
  }
`;

const HeroScrim = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(90deg, ${t.bg} 0%, rgba(7, 11, 18, 0.7) 30%, rgba(7, 11, 18, 0.1) 60%, transparent 78%),
    /* Under the header the map is fully faded, then it fades in gently below. */
    linear-gradient(180deg, ${t.bg} 0px, rgba(7, 11, 18, 0.9) ${HEADER_HEIGHT}, transparent 240px),
    linear-gradient(180deg, rgba(7, 11, 18, 0.5) 0%, transparent 30%, transparent 75%, ${t.bg} 100%);
  @media (max-width: 720px) {
    background: linear-gradient(180deg, ${t.bg} 0%, rgba(7, 11, 18, 0.82) 42%, transparent 64%, ${t.bg} 100%);
  }
`;

const HeroCopy = styled.div`
  position: relative;
  z-index: 2;
  padding: calc(${HEADER_HEIGHT} + 24px) ${GUTTER} 32px;
  animation: ${rise} 520ms cubic-bezier(0.2, 0, 0, 1) both;
`;

const Kicker = styled.p`
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 20px;
  color: ${t.accent};
  font: 500 12px ${t.fontMono};
  letter-spacing: 0.18em;
  &::before {
    content: '';
    width: 8px;
    height: 8px;
    background: currentColor;
  }
`;

const display = css`
  font-stretch: 125%;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 0.96;
  text-wrap: balance;
`;

const Headline = styled.h1`
  ${display}
  margin: 0;
  /* Sized to stay left of the map's subject: one line per sentence on phones, capped on desktop. */
  font-size: min(8.2vw, clamp(36px, 5vw, 64px));
  span {
    display: block;
    white-space: nowrap;
  }
  span:last-child {
    color: ${t.cut};
  }
`;

const Lead = styled.p`
  max-width: 46ch;
  margin: 24px 0 0;
  color: ${t.text};
  font-size: clamp(13px, 1.2vw, 15px);
  font-weight: 500;
  letter-spacing: 0.06em;
  line-height: 1.65;
`;

const CtaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 32px;
`;

const Slide = styled.section`
  ${slide}
`;

/** Slide content: centred column that rises into place the first time its slide shows. */
const SlideBody = styled.div<{ $seen: boolean }>`
  width: 100%;
  max-width: ${t.maxWidth};
  margin: 0 auto;
  opacity: ${({ $seen }) => ($seen ? 1 : 0)};
  transform: ${({ $seen }) => ($seen ? 'none' : 'translateY(20px)')};
  transition:
    opacity 600ms ${EASE},
    transform 600ms ${EASE};
`;

const Pager = styled.nav`
  position: fixed;
  top: 50%;
  right: 6px;
  z-index: 30;
  display: none;
  flex-direction: column;
  align-items: center;
  transform: translateY(-50%);
  color: ${t.textMuted};
  font: 500 10px ${t.fontMono};
  letter-spacing: 0.1em;
  @media ${ROOMY} {
    display: flex;
  }
  span:first-child {
    margin-bottom: 8px;
    color: ${t.accent};
  }
  span:last-child {
    margin-top: 8px;
  }
  a {
    padding: 5px 9px;
    &::before {
      content: '';
      display: block;
      width: 6px;
      height: 6px;
      background: ${t.lineStrong};
      transition:
        height 240ms ${EASE},
        background 240ms ease;
    }
    &:hover::before {
      background: ${t.text};
    }
    &[aria-current]::before {
      height: 24px;
      background: ${t.accent};
    }
  }
`;

const Title = styled.h2`
  ${display}
  margin: 0;
  font-size: clamp(30px, 4.6vw, 60px);
  em {
    font-style: normal;
    color: ${t.cut};
  }
`;

/** Tighter top and bottom padding: this slide has to fit a 720px-tall laptop screen. */
const FeaturesSlide = styled(Slide)`
  padding-top: calc(${HEADER_HEIGHT} + 16px);
  padding-bottom: 24px;
`;

/**
 * Header on top, then two columns on desktop: features 01 to 05 on the left and 06 (cutting-edge, with its diagram)
 * on the right. Both columns start on the same line, under the header.
 */
const FeaturesBody = styled(SlideBody)`
  display: grid;
  gap: 32px;
  @media (min-width: 940px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 56px;
    align-items: start;
  }
`;

const FeaturesHead = styled.div`
  @media (min-width: 940px) {
    grid-column: 1 / -1;
  }
`;

/** Slide header: a question in white, the short answer in pink. One line on desktop. */
const SlideTitle = styled(Title)`
  @media (min-width: 940px) {
    white-space: nowrap;
  }
`;

/** Two evenly balanced lines at any column width. */
const CutBody = styled.p`
  text-wrap: balance;
`;

/** A bit narrower than the column, with more air between the heading above and the diagram. */
const Figure = styled.figure`
  max-width: 85%;
  margin: 36px 0 0;
  padding: 0;
`;

const cellGrid = css`
  display: grid;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const FeatureList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  /* Side by side with feature 06: stretch to its height and share the extra room between the rows. */
  @media (min-width: 940px) {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    > li {
      flex: 1 0 auto;
      align-content: center;
    }
  }
`;

const featureRow = css`
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 4px;
  padding: 10px 4px;
  span {
    color: ${t.accent};
    font: 500 12px ${t.fontMono};
    letter-spacing: 0.16em;
    padding-top: 3px;
  }
  h3 {
    margin: 0;
    font-size: 17px;
    font-stretch: 112%;
    font-weight: 700;
    letter-spacing: 0.02em;
    line-height: 1.2;
  }
  p {
    margin: 8px 0 0;
    color: ${t.textSecondary};
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.05em;
    line-height: 1.6;
  }
`;

const FeatureRow = styled.li`
  ${featureRow}
`;

/** Feature 06: the same row as the others, with the diagram under its heading. */
const CutFeature = styled.div`
  ${featureRow}
`;

const StepList = styled.ol`
  ${cellGrid}
  margin-top: 40px;
  @media (min-width: 640px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (min-width: 980px) {
    grid-template-columns: repeat(4, 1fr);
  }
`;

/** Solid, so the card never fights the tile pattern behind it. */
const CARD_BG = `linear-gradient(180deg, #111b2a 0%, #0b121c 100%)`;
/**
 * Text laid over the bottom of a picture: a frosted layer that fades in from nothing at its top
 * edge, so there is no hard line between the picture and the text.
 */
const glass = css`
  position: relative;
  isolation: isolate;
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background: linear-gradient(
      to bottom,
      rgba(11, 18, 28, 0) 0%,
      rgba(11, 18, 28, 0.74) 40%,
      rgba(11, 18, 28, 0.92) 100%
    );
    backdrop-filter: blur(10px) saturate(1.15);
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 50%);
    mask-image: linear-gradient(to bottom, transparent 0%, #000 50%);
  }
`;

/** Size of the cut top-right corner. */
const CUT_CORNER = '22px';

/**
 * One numbered card, shared by the steps and the use cases: a solid panel with a cut corner, a
 * full-width picture on top, then the number, title and text. An accent line runs along the
 * top edge, short at rest and full width on hover, and the card lifts a little.
 */
const cell = css`
  position: relative;
  display: grid;
  align-content: start;
  padding: 0;
  overflow: hidden;
  background: ${CARD_BG};
  clip-path: polygon(0 0, calc(100% - ${CUT_CORNER}) 0, 100% ${CUT_CORNER}, 100% 100%, 0 100%);
  transition:
    transform 260ms ${EASE},
    background-color 260ms ${EASE};
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
    width: 48px;
    height: 3px;
    background: ${t.accent};
    box-shadow: 0 0 14px ${t.accent};
    transition: width 360ms ${EASE};
  }
  &:hover {
    transform: translateY(-4px);
    &::before {
      width: calc(100% - ${CUT_CORNER});
    }
  }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &:hover {
      transform: none;
    }
  }
  /* The picture runs edge to edge. */
  > svg {
    border: 0;
  }
  span {
    color: ${t.accent};
    font: 500 12px ${t.fontMono};
    letter-spacing: 0.16em;
  }
  h3 {
    margin: 10px 0;
    font-size: 19px;
    font-stretch: 112%;
    font-weight: 700;
    letter-spacing: 0.02em;
    line-height: 1.15;
  }
  p {
    margin: 0;
    color: ${t.textSecondary};
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.05em;
    line-height: 1.65;
  }
`;

const Step = styled.li`
  ${cell}
  /* The text starts over the bottom of the picture and fades in. */
  > div {
    ${glass}
    margin-top: -52px;
    padding: 52px 24px 24px;
  }
  /* Between phone and desktop the steps sit two by two, so the picture goes beside the text. */
  @media (min-width: 640px) and (max-width: 979px) {
    grid-template-columns: minmax(0, 4fr) minmax(0, 5fr);
    align-items: center;
    > div {
      margin-top: 0;
      padding: 20px 24px 24px;
      &::before {
        display: none;
      }
    }
  }
`;

const UseCaseList = styled.ol`
  ${cellGrid}
  margin-top: 40px;
  @media (min-width: 640px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (min-width: 980px) {
    grid-template-columns: repeat(5, 1fr);
  }
`;

/** The photo fills the whole card; the text sits over its lower part. */
const UseCase = styled.li`
  ${cell}
  /* A long title must not widen the column, or the photo grows with it. */
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: 1fr auto;
  align-content: stretch;
  aspect-ratio: 4 / 3;
  @media (min-width: 980px) {
    aspect-ratio: 2 / 3;
  }
  &:hover img {
    transform: scale(1.06);
  }
`;

const UseCasePhoto = styled.div`
  grid-area: 1 / 1 / 3 / 2;
  overflow: hidden;
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 20%;
    transition: transform 420ms cubic-bezier(0.2, 0, 0, 1);
  }
`;

const UseCaseText = styled.div`
  ${glass}
  grid-area: 2 / 1;
  display: grid;
  align-content: start;
  gap: 0;
  /* Same height in every card, so the titles line up. */
  min-height: 172px;
  padding: 34px 20px 20px;
  h3 {
    font-size: 17px;
    overflow-wrap: anywhere;
  }
`;

/** Tighter top and bottom padding: the form has to fit a 720px-tall laptop screen. */
const ContactSlide = styled(Slide)`
  padding-top: calc(${HEADER_HEIGHT} + 16px);
  padding-bottom: 20px;
`;

/** Pitch and contact details on the left, the form on the right; stacked on small screens. */
const ContactBody = styled(SlideBody)`
  display: grid;
  gap: 32px;
  @media (min-width: 940px) {
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    column-gap: 64px;
    align-items: start;
  }
`;

const ContactInfo = styled.div`
  min-width: 0;
`;

/** Slide header, on one line across the top like the other slides. */
const ContactHead = styled.div`
  @media (min-width: 940px) {
    grid-column: 1 / -1;
  }
`;

const ContactLead = styled(Lead)`
  margin-top: 0;
`;

const ContactList = styled.dl`
  display: grid;
  gap: 18px;
  margin: 32px 0 0;
  dt {
    color: ${t.accent};
    font: 500 11px ${t.fontMono};
    letter-spacing: 0.16em;
  }
  dd {
    margin: 6px 0 0;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.04em;
    overflow-wrap: anywhere;
  }
  a {
    color: ${t.text};
    text-decoration: none;
    border-bottom: 1px solid ${t.lineStrong};
    transition:
      color 140ms ease,
      border-color 140ms ease;
    &:hover {
      color: ${t.accent};
      border-color: ${t.accent};
    }
  }
`;

/** What used to be the page footer: it sits at the foot of the last slide, where it can be reached. */
const SlideFoot = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 32px;
  width: 100%;
  max-width: ${t.maxWidth};
  margin: 32px auto 0;
  padding-top: 16px;
  color: ${t.textMuted};
  font: 500 11px ${t.fontMono};
  letter-spacing: 0.12em;
  a {
    color: ${t.textSecondary};
    text-decoration: none;
    &:hover {
      color: ${t.text};
    }
  }
`;

const pad = (n: number) => String(n).padStart(2, '0');
/** The cutting-edge feature is the last entry in FEATURES: it sits on the right, the rest on the left. */
const MAIN_FEATURES = FEATURES.slice(0, -1);
const CUT_FEATURE = FEATURES.at(-1);
/** "Cutting-edge" with the edge picked out, if the copy still contains it. */
/** Slides in document order: anchor id + the name the pager announces. */
const SLIDES = [
  { id: 'top', label: 'Intro' },
  { id: 'how-it-works', label: STEPS.kicker },
  { id: 'features', label: FEATURES_SECTION.kicker },
  { id: 'use-cases', label: USE_CASES.kicker },
  { id: 'contact', label: CONTACT.kicker },
] as const;
type SlideId = (typeof SLIDES)[number]['id'];
const slideIndex = (id: SlideId) => SLIDES.findIndex((s) => s.id === id);
const slideProps = { [SLIDE_ATTR]: '' };

export function LandingPage() {
  const page = useRef<HTMLDivElement>(null);
  const { active, seen } = useSlides(page);
  const isSeen = (id: SlideId) => seen.has(slideIndex(id));

  /** Already on the landing, so the logo link scrolls back to the first slide instead of navigating. */
  const scrollToTop = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    document.body.dataset.scroll = 'auto';
    document.title = SITE.title;
    return () => {
      delete document.body.dataset.scroll;
    };
  }, []);

  return (
    <Page className="landing" ref={page}>
      <SlideSnap />
      <BackdropTrace />
      <SkipLink href="#main">Skip to content</SkipLink>

      <Header $solid={active > 0}>
        <Brand to="/" onClick={scrollToTop} aria-label={LOGO_LABEL}>
          <Logo />
        </Brand>
        <Nav aria-label="Primary">
          <a href="#how-it-works">{STEPS.kicker}</a>
          <a href="#features">Features</a>
          <a href="#use-cases">{USE_CASES.kicker}</a>
          <a href="#contact">{CONTACT.kicker}</a>
        </Nav>
        <PrimaryBtn to={SITE.editorPath} $compact>
          {HERO.primaryCta}
        </PrimaryBtn>
      </Header>

      <Pager aria-label="Slides">
        <span aria-hidden>{pad(active + 1)}</span>
        {SLIDES.map((s, i) => (
          <a key={s.id} href={`#${s.id}`} aria-label={s.label} aria-current={i === active ? 'true' : undefined} />
        ))}
        <span aria-hidden>{pad(SLIDES.length)}</span>
      </Pager>

      <main id="main">
        <Hero id="top" aria-labelledby="hero-title" {...slideProps}>
          <HeroStage>
            <HeroMap />
            <HeroScrim />
            <HeroCopy>
              <Headline id="hero-title">
                {HERO.headline.map((line) => (
                  <span key={line}>{line} </span>
                ))}
              </Headline>
              <Lead>{HERO.body}</Lead>
              <CtaRow>
                <PrimaryBtn to={SITE.editorPath}>
                  {HERO.primaryCta} <Arrow aria-hidden>→</Arrow>
                </PrimaryBtn>
                <SecondaryBtn href="#how-it-works">{HERO.secondaryCta}</SecondaryBtn>
              </CtaRow>
            </HeroCopy>
          </HeroStage>
        </Hero>

        <Slide id="how-it-works" aria-labelledby="steps-title" {...slideProps}>
          <SlideBody $seen={isSeen('how-it-works')}>
            <Kicker>{STEPS.kicker}</Kicker>
            <SlideTitle id="steps-title">
              {STEPS.headline} <em>{STEPS.headlineAccent}</em>
            </SlideTitle>
            <StepList>
              {STEPS.items.map((s, i) => (
                <Step key={s.title}>
                  <StepArt step={i} playing={active === slideIndex('how-it-works')} />
                  <div>
                    <span aria-hidden>{pad(i + 1)}</span>
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                  </div>
                </Step>
              ))}
            </StepList>
          </SlideBody>
        </Slide>

        <FeaturesSlide id="features" aria-labelledby="features-title" {...slideProps}>
          <FeaturesBody $seen={isSeen('features')}>
            <FeaturesHead>
              <Kicker>{FEATURES_SECTION.kicker}</Kicker>
              <SlideTitle id="features-title">
                {FEATURES_SECTION.headline} <em>{FEATURES_SECTION.headlineAccent}</em>
              </SlideTitle>
            </FeaturesHead>
            <FeatureList>
              {MAIN_FEATURES.map((f, i) => (
                <FeatureRow key={f.title}>
                  <span aria-hidden>{pad(i + 1)}</span>
                  <div>
                    <h3>{f.title}</h3>
                    <p>{f.body}</p>
                  </div>
                </FeatureRow>
              ))}
            </FeatureList>
            {CUT_FEATURE && (
              <CutFeature>
                <span aria-hidden>{pad(FEATURES.length)}</span>
                <div>
                  <h3>{CUT_FEATURE.title}</h3>
                  {CUT_FEATURE.body && <CutBody>{CUT_FEATURE.body}</CutBody>}
                  <Figure>
                    <CutDiagram />
                  </Figure>
                </div>
              </CutFeature>
            )}
          </FeaturesBody>
        </FeaturesSlide>

        <Slide id="use-cases" aria-labelledby="use-cases-title" {...slideProps}>
          <SlideBody $seen={isSeen('use-cases')}>
            <Kicker>{USE_CASES.kicker}</Kicker>
            <SlideTitle id="use-cases-title">
              {USE_CASES.headline} <em>{USE_CASES.headlineAccent}</em>
            </SlideTitle>
            <UseCaseList>
              {USE_CASES.items.map((u, i) => (
                <UseCase key={u.title}>
                  <UseCasePhoto>
                    <img src={u.image} alt={u.alt} loading="lazy" decoding="async" />
                  </UseCasePhoto>
                  <UseCaseText>
                    <span aria-hidden>{pad(i + 1)}</span>
                    <h3>{u.title}</h3>
                    <p>{u.body}</p>
                  </UseCaseText>
                </UseCase>
              ))}
            </UseCaseList>
          </SlideBody>
        </Slide>

        <ContactSlide id="contact" aria-labelledby="contact-title" {...slideProps}>
          <ContactBody $seen={isSeen('contact')}>
            <ContactHead>
              <Kicker>{CONTACT.kicker}</Kicker>
              <SlideTitle id="contact-title">
                {CONTACT.headline} <em>{CONTACT.headlineAccent}</em>
              </SlideTitle>
            </ContactHead>
            <ContactInfo>
              <ContactLead>{CONTACT.body}</ContactLead>
              <ContactList>
                <div>
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
                  </dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{CONTACT.location}</dd>
                </div>
              </ContactList>
            </ContactInfo>
            <InterestForm />
          </ContactBody>
          <SlideFoot>
            <Link to="/" onClick={scrollToTop} aria-label={LOGO_LABEL}>
              <Logo size={20} />
            </Link>
            <a href={ATTRIBUTION.href} rel="noopener">
              {ATTRIBUTION.text}
            </a>
          </SlideFoot>
        </ContactSlide>
      </main>
    </Page>
  );
}
