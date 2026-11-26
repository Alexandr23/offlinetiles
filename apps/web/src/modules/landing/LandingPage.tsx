import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { selectIsSignedIn, useAuthStore } from '@/modules/auth/auth.store';
import { HeroMap } from './HeroMap';
import { landingTokens } from './landing.tokens';

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Page = styled.div`
  min-height: 100%;
  background:
    radial-gradient(ellipse 80% 50% at 50% -10%, rgba(59, 130, 246, 0.16), transparent 55%),
    radial-gradient(ellipse 40% 30% at 90% 20%, rgba(14, 165, 233, 0.08), transparent 50%),
    ${landingTokens.bg};
  color: ${landingTokens.text};
  font-family: 'Plus Jakarta Sans', var(--font-sans);
`;

const Nav = styled.header`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  background: linear-gradient(180deg, rgba(11, 18, 32, 0.55), transparent);
`;

const Brand = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: ${landingTokens.text} !important;
  font-weight: 700;
  font-size: 16px;
  letter-spacing: -0.02em;
  text-decoration: none !important;
  svg {
    color: ${landingTokens.accent};
  }
`;

const NavLinks = styled.nav`
  display: none;
  align-items: center;
  gap: 22px;
  @media (min-width: 900px) {
    display: flex;
  }
  a {
    color: ${landingTokens.textSecondary} !important;
    font-size: 13.5px;
    font-weight: 500;
    text-decoration: none !important;
    transition: color 160ms ease;
    &:hover {
      color: ${landingTokens.text} !important;
    }
  }
`;

const NavActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const GhostLink = styled(Link)`
  display: none;
  color: ${landingTokens.textSecondary} !important;
  font-size: 13.5px;
  font-weight: 500;
  text-decoration: none !important;
  @media (min-width: 640px) {
    display: inline;
  }
`;

const CtaLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  background: ${landingTokens.accent};
  color: #fff !important;
  font-size: 13.5px;
  font-weight: 600;
  text-decoration: none !important;
  transition: background 160ms ease;
  &:hover {
    background: ${landingTokens.accentHover};
  }
`;

const Hero = styled.section`
  position: relative;
  height: 100dvh;
  min-height: 640px;
  overflow: hidden;
  background: #050a14;
`;

const HeroScrim = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(11, 18, 32, 0.82) 0%, rgba(11, 18, 32, 0.45) 38%, rgba(11, 18, 32, 0.08) 62%, transparent 78%),
    linear-gradient(180deg, rgba(11, 18, 32, 0.35) 0%, transparent 28%, transparent 72%, rgba(11, 18, 32, 0.55) 100%);
`;

const HeroCopy = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: min(520px, 92vw);
  padding: 96px 24px 48px 28px;
  pointer-events: none;
  animation: ${fadeUp} 560ms cubic-bezier(0.2, 0, 0, 1);
  @media (min-width: 900px) {
    padding-left: 48px;
    max-width: 560px;
  }
  @media (max-width: 720px) {
    justify-content: flex-start;
    padding-top: 88px;
    max-width: 100%;
  }
`;

const Eyebrow = styled.p`
  margin: 0 0 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${landingTokens.accent};
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.35);
`;

const Headline = styled.h1`
  margin: 0 0 16px;
  font-size: clamp(34px, 5vw, 56px);
  line-height: 1.05;
  letter-spacing: -0.04em;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 2px 24px rgba(0, 0, 0, 0.35);
  em {
    font-style: normal;
    color: ${landingTokens.accent};
  }
`;

const Support = styled.p`
  margin: 0 0 22px;
  max-width: 36ch;
  color: rgba(226, 232, 240, 0.88);
  font-size: clamp(15px, 1.6vw, 17px);
  line-height: 1.5;
  text-shadow: 0 1px 16px rgba(0, 0, 0, 0.4);
`;

const CtaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  pointer-events: auto;
`;

const PrimaryBtn = styled(Link)`
  display: inline-flex;
  align-items: center;
  height: 44px;
  padding: 0 18px;
  border-radius: 12px;
  background: ${landingTokens.accent};
  color: #fff !important;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none !important;
  transition: background 160ms ease;
  &:hover {
    background: ${landingTokens.accentHover};
  }
`;

const SecondaryBtn = styled.a`
  display: inline-flex;
  align-items: center;
  height: 44px;
  padding: 0 18px;
  border-radius: 12px;
  border: 1px solid rgba(248, 250, 252, 0.28);
  background: rgba(15, 23, 42, 0.4);
  color: #fff !important;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none !important;
  backdrop-filter: blur(10px);
`;

const Section = styled.section`
  max-width: ${landingTokens.maxWidth};
  margin: 0 auto;
  padding: 64px 24px;
`;

const SectionHead = styled.div`
  max-width: 540px;
  margin-bottom: 32px;
  h2 {
    margin: 0 0 8px;
    font-size: clamp(22px, 2.6vw, 28px);
    letter-spacing: -0.025em;
    font-weight: 700;
  }
  p {
    margin: 0;
    color: ${landingTokens.textSecondary};
    font-size: 15px;
    line-height: 1.5;
  }
`;

const FeatureGrid = styled.div`
  display: grid;
  gap: 14px;
  @media (min-width: 720px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (min-width: 980px) {
    grid-template-columns: repeat(4, 1fr);
  }
`;

const FeatureCard = styled.article`
  overflow: hidden;
  border-radius: ${landingTokens.radiusSm};
  background: rgba(17, 24, 39, 0.72);
  border: 1px solid ${landingTokens.glassBorder};
  transition:
    transform 220ms cubic-bezier(0.2, 0, 0, 1),
    border-color 220ms ease;
  &:hover {
    transform: translateY(-3px);
    border-color: rgba(59, 130, 246, 0.35);
  }
`;

const CardMedia = styled.div`
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: #0f172a;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 420ms cubic-bezier(0.2, 0, 0, 1);
  }
  ${FeatureCard}:hover & img {
    transform: scale(1.04);
  }
`;

const CardBody = styled.div`
  padding: 16px 18px 18px;
  h3 {
    margin: 0 0 6px;
    font-size: 15px;
    font-weight: 600;
  }
  p {
    margin: 0;
    color: ${landingTokens.textSecondary};
    font-size: 13.5px;
    line-height: 1.45;
  }
`;

const PreviewShell = styled.div`
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr) 200px;
  gap: 0;
  min-height: 340px;
  border-radius: ${landingTokens.radius};
  overflow: hidden;
  border: 1px solid ${landingTokens.glassBorder};
  background: #0f172a;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const PreviewSide = styled.div`
  padding: 16px;
  background: rgba(15, 23, 42, 0.92);
  border-right: 1px solid ${landingTokens.glassBorder};
  &:last-child {
    border-right: 0;
    border-left: 1px solid ${landingTokens.glassBorder};
  }
  @media (max-width: 860px) {
    border-right: 0;
    border-bottom: 1px solid ${landingTokens.glassBorder};
    &:last-child {
      border-left: 0;
      border-bottom: 0;
      border-top: 1px solid ${landingTokens.glassBorder};
    }
  }
  h4 {
    margin: 0 0 12px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${landingTokens.textMuted};
  }
`;

const PresetGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
`;

const PresetThumb = styled.div<{ $bg: string; $active?: boolean }>`
  aspect-ratio: 1.35;
  border-radius: 8px;
  background: ${({ $bg }) => $bg};
  border: 1.5px solid ${({ $active }) => ($active ? landingTokens.accent : 'transparent')};
  display: grid;
  place-items: end start;
  padding: 6px;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
`;

const PreviewMap = styled.div`
  position: relative;
  min-height: 280px;
  background:
    radial-gradient(circle at 30% 40%, rgba(59, 130, 246, 0.18), transparent 42%),
    radial-gradient(circle at 70% 55%, rgba(14, 165, 233, 0.12), transparent 38%),
    linear-gradient(160deg, #0b1220 0%, #111827 45%, #0f172a 100%);
  overflow: hidden;
  &::before {
    content: '';
    position: absolute;
    inset: 18% 12% 22% 18%;
    border: 1.5px solid rgba(59, 130, 246, 0.55);
    border-radius: 40% 60% 45% 55% / 55% 40% 60% 45%;
    background: rgba(59, 130, 246, 0.08);
    box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.4);
  }
  &::after {
    content: 'Dark · Style preview';
    position: absolute;
    left: 14px;
    bottom: 14px;
    padding: 6px 10px;
    border-radius: 8px;
    background: ${landingTokens.glass};
    border: 1px solid ${landingTokens.glassBorder};
    backdrop-filter: blur(8px);
    font-size: 11px;
    color: ${landingTokens.textSecondary};
  }
`;

const LayerList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
`;

const LayerRow = styled.li<{ $on?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: ${landingTokens.textSecondary};
  span {
    width: 32px;
    height: 18px;
    border-radius: 999px;
    background: ${({ $on }) => ($on ? landingTokens.accent : 'rgba(51, 65, 85, 0.9)')};
    position: relative;
    &::after {
      content: '';
      position: absolute;
      top: 2px;
      left: ${({ $on }) => ($on ? '16px' : '2px')};
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #fff;
    }
  }
`;

const Steps = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 14px;
  counter-reset: step;
  @media (min-width: 860px) {
    grid-template-columns: repeat(4, 1fr);
  }
`;

const Step = styled.li`
  position: relative;
  overflow: hidden;
  border-radius: ${landingTokens.radiusSm};
  background: rgba(17, 24, 39, 0.72);
  border: 1px solid ${landingTokens.glassBorder};
  counter-increment: step;
  transition:
    transform 220ms cubic-bezier(0.2, 0, 0, 1),
    border-color 220ms ease;
  &:hover {
    transform: translateY(-3px);
    border-color: rgba(59, 130, 246, 0.35);
  }
`;

const StepMedia = styled.div`
  position: relative;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  background: #0f172a;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 420ms cubic-bezier(0.2, 0, 0, 1);
  }
  ${Step}:hover & img {
    transform: scale(1.04);
  }
  &::after {
    content: counter(step);
    position: absolute;
    left: 12px;
    top: 12px;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(15, 23, 42, 0.78);
    border: 1px solid rgba(59, 130, 246, 0.45);
    color: ${landingTokens.accent};
    font-size: 12px;
    font-weight: 700;
    backdrop-filter: blur(8px);
  }
`;

const StepBody = styled.div`
  padding: 14px 16px 16px;
  h3 {
    margin: 0 0 6px;
    font-size: 15px;
  }
  p {
    margin: 0;
    color: ${landingTokens.textSecondary};
    font-size: 13px;
    line-height: 1.45;
  }
`;

const UseCaseGrid = styled.div`
  display: grid;
  gap: 12px;
  @media (min-width: 720px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (min-width: 980px) {
    grid-template-columns: repeat(5, 1fr);
  }
`;

const UseCase = styled.article`
  position: relative;
  overflow: hidden;
  min-height: 220px;
  border-radius: ${landingTokens.radiusSm};
  border: 1px solid ${landingTokens.glassBorder};
  background: #0f172a;
  transition:
    transform 220ms cubic-bezier(0.2, 0, 0, 1),
    border-color 220ms ease;
  &:hover {
    transform: translateY(-3px);
    border-color: rgba(59, 130, 246, 0.35);
  }
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 420ms cubic-bezier(0.2, 0, 0, 1);
  }
  &:hover img {
    transform: scale(1.05);
  }
`;

const UseCaseBody = styled.div`
  position: absolute;
  inset: auto 0 0 0;
  padding: 48px 14px 14px;
  background: linear-gradient(180deg, transparent, rgba(11, 18, 32, 0.92) 55%);
  h3 {
    margin: 0 0 4px;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
  }
  p {
    margin: 0;
    color: ${landingTokens.textSecondary};
    font-size: 12.5px;
    line-height: 1.4;
  }
`;

const Footer = styled.footer`
  padding: 28px 24px 40px;
  border-top: 1px solid ${landingTokens.glassBorder};
  text-align: center;
  color: ${landingTokens.textMuted};
  font-size: 12.5px;
  a {
    color: ${landingTokens.textSecondary} !important;
  }
`;

function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 12h18M12 4v16" stroke="currentColor" strokeWidth="1.25" opacity="0.45" />
      <path d="M7 15.5l3.5-4.5 2.5 2.5 3.5-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const FEATURES = [
  {
    title: 'Any region',
    body: 'Select a city, country or custom area — from small to global.',
    image: '/landing/feature-any-region.jpg',
  },
  {
    title: 'Your style',
    body: 'Choose a preset or fully customize colors, layers and labels.',
    image: '/landing/feature-your-style.jpg',
  },
  {
    title: 'Offline maps',
    body: 'Generate vector (MBTiles) or raster maps for use in your apps and devices.',
    image: '/landing/feature-offline.jpg',
  },
  {
    title: 'Built for professionals',
    body: 'Fast, reliable and scalable. Ideal for developers, GIS, research and business.',
    image: '/landing/feature-pro.jpg',
  },
];

const STEPS = [
  {
    title: 'Select area',
    body: 'Draw a polygon or rectangle around the region you need.',
    image: '/landing/step-select.jpg',
  },
  {
    title: 'Style',
    body: 'Start from a preset, then tune colors, labels, and layers.',
    image: '/landing/step-style.jpg',
  },
  {
    title: 'Generate',
    body: 'Choose vector or raster MBTiles and queue the generation.',
    image: '/landing/step-generate.jpg',
  },
  {
    title: 'Use offline',
    body: 'Download tiles and use them in apps, devices, and field kits.',
    image: '/landing/step-offline.jpg',
  },
];

const PRESETS = [
  { label: 'Dark', bg: 'linear-gradient(135deg,#0f172a,#1e293b)', active: true },
  { label: 'Light', bg: 'linear-gradient(135deg,#e2e8f0,#94a3b8)' },
  { label: 'Minimal', bg: 'linear-gradient(135deg,#111827,#374151)' },
  { label: 'Navigation', bg: 'linear-gradient(135deg,#1e3a5f,#3b82f6)' },
  { label: 'Monochrome', bg: 'linear-gradient(135deg,#171717,#737373)' },
  { label: 'High Contrast', bg: 'linear-gradient(135deg,#000,#fff)' },
];

const LAYERS = [
  { name: 'Roads', on: true },
  { name: 'Buildings', on: true },
  { name: 'Labels', on: true },
  { name: 'POIs', on: true },
  { name: 'Parks', on: true },
  { name: 'Water', on: true },
  { name: 'Boundaries', on: false },
];

const USE_CASES = [
  { title: 'Mobile apps', body: 'Travel, outdoor, navigation.', image: '/landing/usecase-mobile.jpg' },
  { title: 'Field work', body: 'Surveying, research, logistics.', image: '/landing/usecase-field.jpg' },
  { title: 'Business', body: 'Delivery, sales, operations.', image: '/landing/usecase-business.jpg' },
  { title: 'Developers', body: 'Integrate into your apps.', image: '/landing/usecase-devs.jpg' },
  { title: 'Education', body: 'Teaching and study.', image: '/landing/usecase-edu.jpg' },
];

export function LandingPage() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const signedIn = useAuthStore(selectIsSignedIn);

  useEffect(() => {
    document.body.dataset.scroll = 'auto';
    document.title = 'OfflineTiles — Custom offline maps from OpenStreetMap';
    void hydrate();
    return () => {
      delete document.body.dataset.scroll;
    };
  }, [hydrate]);

  return (
    <Page className="landing">
      <Hero id="try">
        <HeroMap />
        <HeroScrim />
        <Nav>
          <Brand to="/">
            <LogoMark />
            OfflineTiles
          </Brand>
          <NavLinks aria-label="Primary">
            <a href="#features">Features</a>
            <a href="#use-cases">Use cases</a>
            <a href="#pricing">Pricing</a>
            <a href="#docs">Documentation</a>
            <a href="#faq">FAQ</a>
          </NavLinks>
          <NavActions>
            {!signedIn && <GhostLink to="/editor">Sign in</GhostLink>}
            <CtaLink to="/editor">Get started →</CtaLink>
          </NavActions>
        </Nav>
        <HeroCopy>
          <Eyebrow>Open source data. Your maps.</Eyebrow>
          <Headline>
            Offline maps for <em>any place on Earth</em>
          </Headline>
          <Support>Select an area, pick a style, generate vector or raster MBTiles — ready to use with zero connectivity.</Support>
          <CtaRow>
            <PrimaryBtn to="/editor">Open full editor →</PrimaryBtn>
            <SecondaryBtn href="#features">See how it works</SecondaryBtn>
          </CtaRow>
        </HeroCopy>
      </Hero>

      <Section id="features">
        <SectionHead>
          <h2>Everything you need for offline maps</h2>
          <p>From select area to styled MBTiles — built for teams that ship maps.</p>
        </SectionHead>
        <FeatureGrid>
          {FEATURES.map((f) => (
            <FeatureCard key={f.title}>
              <CardMedia>
                <img src={f.image} alt="" loading="lazy" decoding="async" />
              </CardMedia>
              <CardBody>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </CardBody>
            </FeatureCard>
          ))}
        </FeatureGrid>
      </Section>

      <Section>
        <SectionHead>
          <h2>Editor preview</h2>
          <p>Pick a preset, toggle layers, and refine the look before you generate.</p>
        </SectionHead>
        <PreviewShell aria-hidden>
          <PreviewSide>
            <h4>Style</h4>
            <PresetGrid>
              {PRESETS.map((p) => (
                <PresetThumb key={p.label} $bg={p.bg} $active={p.active}>
                  {p.label}
                </PresetThumb>
              ))}
            </PresetGrid>
          </PreviewSide>
          <PreviewMap />
          <PreviewSide>
            <h4>Map layers</h4>
            <LayerList>
              {LAYERS.map((l) => (
                <LayerRow key={l.name} $on={l.on}>
                  {l.name}
                  <span aria-hidden />
                </LayerRow>
              ))}
            </LayerList>
          </PreviewSide>
        </PreviewShell>
      </Section>

      <Section id="how-it-works">
        <SectionHead>
          <h2>How it works</h2>
          <p>Select area, style, generate — then use the tiles offline.</p>
        </SectionHead>
        <Steps>
          {STEPS.map((s) => (
            <Step key={s.title}>
              <StepMedia>
                <img src={s.image} alt="" loading="lazy" decoding="async" />
              </StepMedia>
              <StepBody>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </StepBody>
            </Step>
          ))}
        </Steps>
      </Section>

      <Section id="use-cases">
        <SectionHead>
          <h2>Use cases</h2>
          <p>Built for product, GIS, and ops teams that cannot rely on connectivity.</p>
        </SectionHead>
        <UseCaseGrid>
          {USE_CASES.map((u) => (
            <UseCase key={u.title}>
              <img src={u.image} alt="" loading="lazy" decoding="async" />
              <UseCaseBody>
                <h3>{u.title}</h3>
                <p>{u.body}</p>
              </UseCaseBody>
            </UseCase>
          ))}
        </UseCaseGrid>
      </Section>

      <Section id="pricing">
        <SectionHead>
          <h2>Pricing</h2>
          <p>Self-host today. Managed plans coming soon.</p>
        </SectionHead>
      </Section>

      <Section id="docs">
        <SectionHead>
          <h2>Documentation</h2>
          <p>
            Open the <Link to="/editor">full editor</Link> to explore presets, generation options, and queue history. API docs ship with the repo.
          </p>
        </SectionHead>
      </Section>

      <Section id="faq">
        <SectionHead>
          <h2>FAQ</h2>
          <p>
            <strong style={{ color: landingTokens.text }}>Vector or raster?</strong> Vector MBTiles stay sharp at every zoom; raster is ideal for fixed-style basemaps.
            <br />
            <br />
            <strong style={{ color: landingTokens.text }}>Is the data offline?</strong> Yes — once generated, tiles work without a network.
          </p>
        </SectionHead>
      </Section>

      <Footer>
        <a href="https://offlinetiles.com">offlinetiles.com</a>
        {' · '}
        OpenStreetMap data © OpenStreetMap contributors · <Link to="/editor">Open editor</Link>
      </Footer>
    </Page>
  );
}
