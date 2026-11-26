import {
  FEATURE_OPTIONS,
  INTENDED_USE_OPTIONS,
  WILLINGNESS_OPTIONS,
  type CreateInterestRequest,
} from '@map-exporter/contracts';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { api } from '@/shared/api/endpoints';
import { EMAIL_RE, readLeadQueryDefaults } from './interest';
import { landingTokens as t } from './landing.tokens';

const ERROR = '#ff6b81';
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
/** Size of the cut top-right corner, the same as the cards above. */
const CUT = '22px';
/** Every field, tag and button is this tall, with the same small cut corner. */
const CONTROL_HEIGHT = '40px';
const CONTROL_CUT = '10px';
const cutCorner = css`
  clip-path: polygon(0 0, calc(100% - ${CONTROL_CUT}) 0, 100% ${CONTROL_CUT}, 100% 100%, 0 100%);
`;

const reveal = keyframes`
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: none; }
`;

/** A solid panel with a cut corner and a glowing accent line along its top edge. */
const panel = css`
  position: relative;
  background: linear-gradient(180deg, #111b2a 0%, #0b121c 100%);
  box-shadow: inset 0 0 0 1px ${t.line};
  clip-path: polygon(0 0, calc(100% - ${CUT}) 0, 100% ${CUT}, 100% 100%, 0 100%);
  text-transform: none;
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 48px;
    height: 3px;
    background: ${t.accent};
    box-shadow: 0 0 14px ${t.accent};
    transition: width 360ms ${EASE};
  }
  &:focus-within::before {
    width: calc(100% - ${CUT});
  }
`;

const Form = styled.form`
  ${panel}
  display: grid;
  gap: 16px;
  padding: 28px 24px 22px;
  letter-spacing: 0.02em;
  @media (max-width: 520px) {
    padding: 24px 18px 18px;
  }
`;

const Row = styled.div`
  display: grid;
  gap: 16px;
  @media (min-width: 560px) {
    grid-template-columns: minmax(0, 1fr) auto;
  }
`;

const Field = styled.label`
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 0;
  color: ${t.textSecondary};
  font: 500 11px ${t.fontMono};
  letter-spacing: 0.14em;
  text-transform: uppercase;
`;

const Hint = styled.span`
  color: ${t.textMuted};
`;

const control = css`
  ${cutCorner}
  width: 100%;
  border: 0;
  border-bottom: 1px solid ${t.lineStrong};
  border-radius: 0;
  background: rgba(79, 209, 255, 0.04);
  color: ${t.text};
  font: 400 14px ${t.fontDisplay};
  letter-spacing: 0.02em;
  outline: none;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
  &::placeholder {
    color: ${t.textMuted};
  }
  &:hover {
    background: rgba(79, 209, 255, 0.07);
  }
  &:focus-visible {
    border-bottom-color: ${t.accent};
    background: rgba(79, 209, 255, 0.09);
    box-shadow: inset 3px 0 0 ${t.accent};
  }
  &[aria-invalid='true'] {
    border-bottom-color: ${ERROR};
    box-shadow: inset 3px 0 0 ${ERROR};
  }
`;

const Input = styled.input`
  ${control}
  height: ${CONTROL_HEIGHT};
  padding: 0 14px;
`;

const CHEVRON = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1.5l5 5 5-5' fill='none' stroke='${t.accent}' stroke-width='2'/></svg>`,
)}")`;

const Select = styled.select`
  ${control}
  height: ${CONTROL_HEIGHT};
  padding: 0 38px 0 14px;
  appearance: none;
  color-scheme: dark;
  background-image: ${CHEVRON};
  background-repeat: no-repeat;
  background-position: right 14px center;
  cursor: pointer;
  &:invalid {
    color: ${t.textMuted};
  }
  option {
    background: #0b121c;
    color: ${t.text};
  }
`;

const TextArea = styled.textarea`
  ${control}
  height: 72px;
  padding: 10px 14px;
  resize: none;
  line-height: 1.45;
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

/** A checkbox or radio drawn as a tag with a little square that fills in; the real input sits on top of it. */
const Chip = styled.label`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: ${CONTROL_HEIGHT};
  padding: 0 14px 0 12px;
  background: rgba(148, 176, 204, 0.07);
  color: ${t.textSecondary};
  font: 500 12px ${t.fontDisplay};
  letter-spacing: 0.03em;
  text-transform: none;
  cursor: pointer;
  ${cutCorner}
  transition:
    background 160ms ease,
    color 160ms ease;
  &::before {
    content: '';
    width: 8px;
    height: 8px;
    border: 1px solid ${t.lineStrong};
    transition:
      background 160ms ease,
      border-color 160ms ease,
      box-shadow 160ms ease;
  }
  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    margin: 0;
    cursor: pointer;
  }
  &:hover {
    background: rgba(79, 209, 255, 0.12);
    color: ${t.text};
  }
  &:has(input:checked) {
    background: ${t.accentMuted};
    color: ${t.text};
    &::before {
      border-color: ${t.accent};
      background: ${t.accent};
      box-shadow: 0 0 8px ${t.accent};
    }
  }
  &:has(input:focus-visible) {
    /* Inside the tag: the cut corner would clip an outline drawn outside it. */
    outline: 2px solid ${t.accent};
    outline-offset: -2px;
  }
`;

const Reveal = styled.div`
  animation: ${reveal} 240ms ${EASE} both;
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Foot = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 20px;
`;

/** A switch: a track with a square knob that slides over and lights up. */
const Toggle = styled.label`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: ${t.textSecondary};
  font: 400 13px ${t.fontDisplay};
  letter-spacing: 0.02em;
  text-transform: none;
  cursor: pointer;
  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    margin: 0;
    cursor: pointer;
  }
  &::before {
    content: '';
    flex: none;
    width: 36px;
    height: 20px;
    background: rgba(148, 176, 204, 0.12);
    box-shadow: inset 0 0 0 1px ${t.lineStrong};
    transition:
      background 180ms ease,
      box-shadow 180ms ease;
  }
  &::after {
    content: '';
    position: absolute;
    top: 4px;
    left: 4px;
    width: 12px;
    height: 12px;
    background: ${t.textMuted};
    transition:
      transform 220ms ${EASE},
      background 180ms ease,
      box-shadow 180ms ease;
  }
  &:has(input:checked) {
    color: ${t.text};
    &::before {
      background: ${t.accentMuted};
      box-shadow: inset 0 0 0 1px ${t.accent};
    }
    &::after {
      transform: translateX(16px);
      background: ${t.accent};
      box-shadow: 0 0 10px ${t.accent};
    }
  }
  &:has(input:focus-visible) {
    outline: 2px solid ${t.accent};
    outline-offset: 4px;
  }
`;

const Arrow = styled.span`
  transition: transform 160ms ${EASE};
`;

const Submit = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: ${CONTROL_HEIGHT};
  padding: 0 26px;
  border: 0;
  background: ${t.accent};
  color: ${t.onAccent};
  font: 700 13px ${t.fontMono};
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  ${cutCorner}
  transition:
    background 140ms ease,
    transform 140ms ease;
  &:hover:not(:disabled) {
    background: ${t.accentHover};
    ${Arrow} {
      transform: translateX(4px);
    }
  }
  &:active:not(:disabled) {
    transform: translateY(1px);
  }
  &:focus-visible {
    outline: 2px solid ${t.text};
    outline-offset: -4px;
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const ErrorText = styled.p`
  margin: 0;
  color: ${ERROR};
  font: 400 12px ${t.fontDisplay};
  letter-spacing: 0.02em;
  text-transform: none;
`;

const Done = styled.div`
  ${panel}
  display: grid;
  align-content: center;
  gap: 10px;
  padding: 40px 28px;
  strong {
    color: ${t.accent};
    font: 700 13px ${t.fontMono};
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  span {
    color: ${t.textSecondary};
    font-size: 15px;
    line-height: 1.5;
    letter-spacing: 0.02em;
  }
`;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type IntendedUse = (typeof INTENDED_USE_OPTIONS)[number]['id'];
type Feature = (typeof FEATURE_OPTIONS)[number]['id'];
type Willingness = (typeof WILLINGNESS_OPTIONS)[number]['id'];

/**
 * The interest form. Submissions are stored in our database and read from the admin dashboard.
 * An email is only asked for when the visitor opts in to updates.
 */
export function InterestForm() {
  const defaults = useMemo(() => readLeadQueryDefaults(), []);
  const [intendedUse, setIntendedUse] = useState<IntendedUse | ''>('');
  const [features, setFeatures] = useState<Feature[]>([]);
  const [willingness, setWillingness] = useState<Willingness | ''>('');
  const [feedback, setFeedback] = useState('');
  const [wantsUpdates, setWantsUpdates] = useState(false);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<{ email: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const emailShown = useRef(false);

  // Move to the email field when it appears, so the visitor can type straight away.
  useEffect(() => {
    if (wantsUpdates && !emailShown.current) emailRef.current?.focus();
    emailShown.current = wantsUpdates;
  }, [wantsUpdates]);

  const useInvalid = touched && !intendedUse;
  const emailInvalid = touched && wantsUpdates && !EMAIL_RE.test(email.trim());

  const toggleFeature = (id: Feature) =>
    setFeatures((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!intendedUse || (wantsUpdates && !EMAIL_RE.test(email.trim()))) return;

    const body: CreateInterestRequest = {
      email: wantsUpdates ? email.trim() : undefined,
      intendedUse,
      features,
      willingness: willingness || undefined,
      feedback: feedback.trim() || undefined,
      marketingConsent: wantsUpdates,
      ...defaults,
    };
    setSubmitting(true);
    try {
      const { id } = await api.interest.submit(body);
      window.dispatchEvent(new CustomEvent('offlinetiles:interest', { detail: { intendedUse, id } }));
      if (typeof window.gtag === 'function')
        window.gtag('event', 'interest_submit', { form: 'site', submission_id: id });
      setSent({ email: body.email ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <Done role="status">
        <strong>Thanks, we got it</strong>
        <span>
          {sent.email ? `We will reach out at ${sent.email} soon.` : 'Your answers help us decide what to build next.'}
        </span>
      </Done>
    );
  }

  return (
    <Form onSubmit={onSubmit} noValidate aria-label="Contact form">
      <Row>
        <Field>
          Intended use *
          <Select
            required
            value={intendedUse}
            aria-invalid={useInvalid || undefined}
            onChange={(e) => setIntendedUse(e.target.value as IntendedUse)}
          >
            <option value="" disabled>
              Select one…
            </option>
            {INTENDED_USE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
          {useInvalid && <ErrorText>Choose an intended use.</ErrorText>}
        </Field>

        <Field as="div">
          <span>
            Willing to pay <Hint>(optional)</Hint>
          </span>
          <Chips role="radiogroup" aria-label="Willing to pay">
            {WILLINGNESS_OPTIONS.map((o) => (
              <Chip key={o.id}>
                <input
                  type="radio"
                  name="willingness"
                  checked={willingness === o.id}
                  // Radios cannot be unchecked; clicking the chosen one again clears the answer.
                  onChange={() => setWillingness(o.id)}
                  onClick={() => willingness === o.id && setWillingness('')}
                />
                {o.label}
              </Chip>
            ))}
          </Chips>
        </Field>
      </Row>

      <Field as="div">
        <span>
          Interested in <Hint>(optional)</Hint>
        </span>
        <Chips role="group" aria-label="Interested in">
          {FEATURE_OPTIONS.map((o) => (
            <Chip key={o.id}>
              <input type="checkbox" checked={features.includes(o.id)} onChange={() => toggleFeature(o.id)} />
              {o.label}
            </Chip>
          ))}
        </Chips>
      </Field>

      <Field>
        <span>
          Feedback <Hint>(optional)</Hint>
        </span>
        <TextArea
          placeholder="Anything else you'd like to share?"
          maxLength={2000}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      </Field>

      {wantsUpdates && (
        <Reveal>
          <Field>
            Your email *
            <Input
              ref={emailRef}
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              maxLength={254}
              aria-invalid={emailInvalid || undefined}
              onChange={(e) => setEmail(e.target.value)}
            />
            {emailInvalid && <ErrorText>Enter a valid email address.</ErrorText>}
          </Field>
        </Reveal>
      )}

      {error && <ErrorText role="alert">{error}</ErrorText>}

      <Foot>
        <Toggle>
          <input type="checkbox" checked={wantsUpdates} onChange={(e) => setWantsUpdates(e.target.checked)} />
          Keep me updated by email
        </Toggle>
        <Submit type="submit" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send'} <Arrow aria-hidden>→</Arrow>
        </Submit>
      </Foot>
    </Form>
  );
}
