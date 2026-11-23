import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import styled, { keyframes } from 'styled-components';
import { ApiError } from '@/shared/api/client';
import { Button } from '@/shared/components/Button';
import { IconButton } from '@/shared/components/IconButton';
import { IconClear, IconUser } from '@/shared/components/Icons';
import { Input } from '@/shared/components/Input';
import { useAuthStore } from './auth.store';

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(12px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
`;

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(79, 209, 255, 0.12), transparent 55%),
    rgba(5, 8, 12, 0.78);
  backdrop-filter: blur(10px) saturate(1.2);
  -webkit-backdrop-filter: blur(10px) saturate(1.2);
  animation: ${fadeIn} 180ms var(--easing-standard);
`;

const Card = styled.div`
  width: min(380px, 100%);
  border-radius: 16px;
  border: 1px solid rgba(148, 176, 204, 0.18);
  background: linear-gradient(165deg, rgba(28, 38, 52, 0.97) 0%, rgba(14, 19, 26, 0.98) 100%);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.05) inset,
    0 24px 64px rgba(0, 0, 0, 0.55);
  animation: ${slideUp} 220ms var(--easing-emphasized);
  overflow: hidden;
`;

const Head = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 20px 0;
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const Avatar = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--color-accent-muted);
  color: var(--color-accent);
  border: 1px solid rgba(79, 209, 255, 0.25);
`;

const Titles = styled.div`
  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.02em;
    color: var(--color-text-primary);
  }
  p {
    margin: 2px 0 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 20px 20px;
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 5px;
  span {
    font-size: 9px;
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }
`;

const ErrorBox = styled.div`
  padding: 8px 10px;
  border-radius: var(--radius-md);
  background: var(--color-danger-muted);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  line-height: 1.4;
`;

const Hint = styled.p`
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  line-height: 1.45;
`;

const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
`;

const InputLg = styled(Input)`
  height: 36px;
  padding: 0 12px;
  font-size: var(--font-size-md);
  border-radius: 8px;
  background: rgba(9, 12, 17, 0.65);
`;

export function LoginModal() {
  const open = useAuthStore((s) => s.loginOpen);
  const setLoginOpen = useAuthStore((s) => s.setLoginOpen);
  const login = useAuthStore((s) => s.login);
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const loginRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoginValue('');
    setPassword('');
    setError(null);
    setSubmitting(false);
    const t = window.setTimeout(() => loginRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) setLoginOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, submitting, setLoginOpen]);

  if (!open) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(loginValue.trim(), password);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <Backdrop onMouseDown={(e) => e.target === e.currentTarget && !submitting && setLoginOpen(false)}>
      <Card role="dialog" aria-modal="true" aria-labelledby="login-title">
        <Head>
          <Brand>
            <Avatar>
              <IconUser size={18} />
            </Avatar>
            <Titles>
              <h2 id="login-title">Sign in</h2>
              <p>Optional — guests can generate without an account</p>
            </Titles>
          </Brand>
          <IconButton label="Close" size="sm" disabled={submitting} onClick={() => setLoginOpen(false)}>
            <IconClear />
          </IconButton>
        </Head>

        <Form onSubmit={onSubmit}>
          <Field>
            <span>Login</span>
            <InputLg
              ref={loginRef}
              autoComplete="username"
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              placeholder="admin"
              required
              disabled={submitting}
            />
          </Field>
          <Field>
            <span>Password</span>
            <InputLg
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              disabled={submitting}
            />
          </Field>

          {error && <ErrorBox>{error}</ErrorBox>}

          <Actions>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              block
              loading={submitting}
              disabled={!loginValue.trim() || !password}
            >
              Sign in
            </Button>
            <Hint>No public sign-up. Dedicated accounts are issued by an administrator.</Hint>
          </Actions>
        </Form>
      </Card>
    </Backdrop>,
    document.body,
  );
}
