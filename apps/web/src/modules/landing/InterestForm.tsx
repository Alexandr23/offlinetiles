import { useMemo, useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { landingTokens } from './landing.tokens';
import {
  FEATURE_OPTIONS,
  INTENDED_USE_OPTIONS,
  readLeadQueryDefaults,
  submitLeadToTally,
  WILLINGNESS_OPTIONS,
} from './tally';

const Root = styled.section`
  padding: 72px 24px 96px;
  background: linear-gradient(180deg, transparent, rgba(59, 130, 246, 0.06));
`;

const Inner = styled.div`
  max-width: 640px;
  margin: 0 auto;
  text-align: center;
`;

const Eyebrow = styled.p`
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${landingTokens.accent};
`;

const Title = styled.h2`
  margin: 0 0 10px;
  font-size: clamp(24px, 3vw, 32px);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: ${landingTokens.text};
`;

const Lead = styled.p`
  margin: 0 0 28px;
  color: ${landingTokens.textSecondary};
  font-size: 15px;
  line-height: 1.55;
`;

const Form = styled.form`
  display: grid;
  gap: 16px;
  text-align: left;
`;

const Field = styled.label`
  display: grid;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: ${landingTokens.textSecondary};
`;

const Hint = styled.span`
  font-weight: 400;
  color: ${landingTokens.textMuted};
`;

const Input = styled.input`
  height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid ${landingTokens.glassBorder};
  background: rgba(15, 23, 42, 0.65);
  color: ${landingTokens.text};
  font-size: 14px;
  outline: none;
  transition: border-color 160ms ease;
  &::placeholder {
    color: ${landingTokens.textMuted};
  }
  &:focus {
    border-color: ${landingTokens.accent};
  }
  &[aria-invalid='true'] {
    border-color: #f87171;
  }
`;

const Select = styled.select`
  height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid ${landingTokens.glassBorder};
  background: rgba(15, 23, 42, 0.65);
  color: ${landingTokens.text};
  font-size: 14px;
  outline: none;
  &:focus {
    border-color: ${landingTokens.accent};
  }
  &[aria-invalid='true'] {
    border-color: #f87171;
  }
`;

const TextArea = styled.textarea`
  min-height: 96px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid ${landingTokens.glassBorder};
  background: rgba(15, 23, 42, 0.65);
  color: ${landingTokens.text};
  font-size: 14px;
  resize: vertical;
  outline: none;
  font-family: inherit;
  &:focus {
    border-color: ${landingTokens.accent};
  }
`;

const OptionGrid = styled.div`
  display: grid;
  gap: 8px;
  @media (min-width: 560px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const CheckOption = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid ${landingTokens.glassBorder};
  background: rgba(15, 23, 42, 0.45);
  color: ${landingTokens.textSecondary};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  input {
    accent-color: ${landingTokens.accent};
  }
  &:has(input:checked) {
    border-color: rgba(59, 130, 246, 0.55);
    color: ${landingTokens.text};
    background: ${landingTokens.accentMuted};
  }
`;

const Consent = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: ${landingTokens.textSecondary};
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  cursor: pointer;
  input {
    margin-top: 2px;
    accent-color: ${landingTokens.accent};
  }
`;

const Segment = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
`;

const SegBtn = styled.button<{ $active?: boolean }>`
  height: 40px;
  border-radius: 10px;
  border: 1px solid ${({ $active }) => ($active ? landingTokens.accent : landingTokens.glassBorder)};
  background: ${({ $active }) => ($active ? landingTokens.accentMuted : 'rgba(15, 23, 42, 0.45)')};
  color: ${({ $active }) => ($active ? landingTokens.text : landingTokens.textSecondary)};
  font-size: 13px;
  font-weight: 600;
`;

const Submit = styled.button`
  height: 46px;
  margin-top: 4px;
  border-radius: 12px;
  border: 0;
  background: ${landingTokens.accent};
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  transition: background 160ms ease;
  &:hover:not(:disabled) {
    background: ${landingTokens.accentHover};
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const ErrorText = styled.p`
  margin: 0;
  color: #f87171;
  font-size: 13px;
`;

const Success = styled.div`
  padding: 28px 24px;
  border-radius: ${landingTokens.radius};
  border: 1px solid ${landingTokens.glassBorder};
  background: ${landingTokens.glass};
  backdrop-filter: blur(12px);
  color: ${landingTokens.text};
  font-size: 15px;
  line-height: 1.5;
  strong {
    display: block;
    margin-bottom: 6px;
    font-size: 18px;
  }
  span {
    color: ${landingTokens.textSecondary};
  }
`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function InterestForm() {
  const defaults = useMemo(() => readLeadQueryDefaults(), []);
  const [email, setEmail] = useState('');
  const [intendedUseId, setIntendedUseId] = useState('');
  const [featureIds, setFeatureIds] = useState<string[]>([]);
  const [willingnessId, setWillingnessId] = useState('');
  const [feedback, setFeedback] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const emailInvalid = touched && !EMAIL_RE.test(email.trim());
  const useInvalid = touched && !intendedUseId;

  const toggleFeature = (id: string) => {
    setFeatureIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!EMAIL_RE.test(email.trim()) || !intendedUseId) return;

    setSubmitting(true);
    try {
      const result = await submitLeadToTally({
        email: email.trim(),
        intendedUseId,
        featureIds,
        willingnessId,
        feedback,
        marketingConsent,
        generationId: defaults.generationId,
        source: defaults.source ?? 'landing',
        utmSource: defaults.utmSource,
        utmCampaign: defaults.utmCampaign,
      });
      window.dispatchEvent(
        new CustomEvent('offlinetiles:interest', {
          detail: { email: email.trim(), intendedUseId, submissionId: result.submissionId },
        }),
      );
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'interest_submit', { form: 'tally', submission_id: result.submissionId });
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Root id="interest">
      <Inner>
        <Eyebrow>Stay in the loop</Eyebrow>
        <Title>Interested in OfflineTiles?</Title>
        <Lead>Tell us what you are building. We will follow up from offlinetiles.com with early access notes.</Lead>
        {done ? (
          <Success>
            <strong>Thanks — we got it.</strong>
            <span>We will reach out at {email} soon.</span>
          </Success>
        ) : (
          <Form onSubmit={onSubmit} noValidate>
            <Field>
              Email *
              <Input
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                aria-invalid={emailInvalid || undefined}
                onChange={(e) => setEmail(e.target.value)}
              />
              {emailInvalid && <ErrorText>Enter a valid email address.</ErrorText>}
            </Field>

            <Field>
              Intended use *
              <Select
                required
                value={intendedUseId}
                aria-invalid={useInvalid || undefined}
                onChange={(e) => setIntendedUseId(e.target.value)}
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
              {useInvalid && <ErrorText>Please choose an intended use.</ErrorText>}
            </Field>

            <Field as="div">
              Interested features <Hint>(optional)</Hint>
              <OptionGrid>
                {FEATURE_OPTIONS.map((o) => (
                  <CheckOption key={o.id}>
                    <input type="checkbox" checked={featureIds.includes(o.id)} onChange={() => toggleFeature(o.id)} />
                    {o.label}
                  </CheckOption>
                ))}
              </OptionGrid>
            </Field>

            <Field as="div">
              Willingness to pay <Hint>(optional)</Hint>
              <Segment role="radiogroup" aria-label="Willingness to pay">
                {WILLINGNESS_OPTIONS.map((o) => (
                  <SegBtn
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={willingnessId === o.id}
                    $active={willingnessId === o.id}
                    onClick={() => setWillingnessId((cur) => (cur === o.id ? '' : o.id))}
                  >
                    {o.label}
                  </SegBtn>
                ))}
              </Segment>
            </Field>

            <Field>
              Feedback <Hint>(optional)</Hint>
              <TextArea
                placeholder="Anything else you'd like to share?"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </Field>

            <Consent>
              <input type="checkbox" checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} />
              <span>I agree to receive marketing communications</span>
            </Consent>

            {error && <ErrorText>{error}</ErrorText>}

            <Submit type="submit" disabled={submitting}>
              {submitting ? 'Sending…' : 'Submit interest'}
            </Submit>
          </Form>
        )}
      </Inner>
    </Root>
  );
}
