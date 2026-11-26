import {
  FEATURE_OPTIONS,
  INTENDED_USE_OPTIONS,
  WILLINGNESS_OPTIONS,
  type InterestSubmission,
} from '@map-exporter/contracts';
import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { toastError, useUiStore } from '@/modules/ui/ui.store';
import { api } from '@/shared/api/endpoints';
import { Button } from '@/shared/components/Button';
import { IconButton } from '@/shared/components/IconButton';
import { IconDownload, IconMail, IconTrash } from '@/shared/components/Icons';
import { SegmentedControl } from '@/shared/components/SegmentedControl';
import { formatDateTime, formatRelative } from '@/shared/utils/format';
import { interestToCsv, tallyOptions } from '../admin.stats';
import type { AdminViewProps } from '../admin.types';
import {
  Card,
  CardHead,
  CardHint,
  CardTitle,
  Count,
  Empty,
  Mono,
  Pill,
  RowActions,
  SearchField,
  Spacer,
  Tally,
  Toolbar,
  rise,
} from '../admin.ui';

type Filter = 'all' | 'email' | 'feedback';

const label = (options: readonly { id: string; label: string }[], id: string | null) =>
  options.find((o) => o.id === id)?.label ?? id ?? '—';

const csvLabel = (kind: 'use' | 'feature' | 'pay', id: string) =>
  label(kind === 'use' ? INTENDED_USE_OPTIONS : kind === 'feature' ? FEATURE_OPTIONS : WILLINGNESS_OPTIONS, id);

const PAY_COLORS: Record<string, string> = {
  yes: 'var(--color-success)',
  maybe: 'var(--color-warning)',
  no: 'rgba(148, 176, 204, 0.45)',
};

const Summary = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
`;

const PayBar = styled.div`
  display: flex;
  height: 12px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(148, 176, 204, 0.1);
  div {
    transition: width 700ms var(--easing-emphasized);
  }
`;

const PayLegend = styled.ul`
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }
  i {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }
  span:last-child {
    margin-left: auto;
  }
`;

const Big = styled.div`
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border-subtle);
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  strong {
    font-size: 22px;
    color: #f2f6fb;
    font-variant-numeric: tabular-nums;
  }
`;

const List = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 12px;
  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const Entry = styled.article<{ $i: number }>`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--color-border-subtle);
  background: rgba(9, 12, 17, 0.5);
  animation: ${rise} 360ms var(--easing-emphasized) both;
  animation-delay: ${({ $i }) => Math.min($i, 12) * 30}ms;
  transition: border-color var(--duration-fast) var(--easing-standard);
  &:hover {
    border-color: var(--color-border-strong);
  }
`;

const EntryHead = styled.header`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  > div {
    flex: 1;
    min-width: 0;
  }
  a,
  b {
    display: block;
    font-weight: var(--font-weight-medium);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  b {
    color: var(--color-text-muted);
    font-style: italic;
    font-weight: var(--font-weight-regular);
  }
`;

const Tags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Quote = styled.blockquote`
  margin: 0;
  padding: 8px 12px;
  border-left: 2px solid var(--color-selection);
  border-radius: 0 8px 8px 0;
  background: rgba(255, 133, 179, 0.06);
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const EntryFoot = styled.footer`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: auto;
`;

export function ContactsView({ data, setData }: AdminViewProps) {
  const { interest, interestTotal } = data;
  const pushToast = useUiStore((s) => s.pushToast);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const uses = useMemo(() => tallyOptions(INTENDED_USE_OPTIONS, interest.map((r) => r.intendedUse)), [interest]);
  const features = useMemo(() => tallyOptions(FEATURE_OPTIONS, interest.map((r) => r.features)), [interest]);
  const pay = useMemo(() => tallyOptions(WILLINGNESS_OPTIONS, interest.map((r) => r.willingness)), [interest]);
  const payTotal = pay.reduce((n, p) => n + p.count, 0);
  const withEmail = interest.filter((r) => r.email).length;
  const withFeedback = interest.filter((r) => r.feedback).length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return interest.filter((r) => {
      if (filter === 'email' && !r.email) return false;
      if (filter === 'feedback' && !r.feedback) return false;
      if (!q) return true;
      return [r.email, r.feedback, r.source, r.utmSource, r.utmCampaign, label(INTENDED_USE_OPTIONS, r.intendedUse)].some((v) =>
        v?.toLowerCase().includes(q),
      );
    });
  }, [interest, filter, query]);

  const remove = async (row: InterestSubmission) => {
    if (!window.confirm(`Delete the submission from ${row.email ?? 'an anonymous visitor'}?`)) return;
    try {
      await api.admin.deleteInterest(row.id);
      setData((d) => ({
        ...d,
        interest: d.interest.filter((r) => r.id !== row.id),
        interestTotal: Math.max(0, d.interestTotal - 1),
      }));
    } catch (e) {
      toastError('Could not delete submission', e);
    }
  };

  const exportCsv = () => {
    const blob = new Blob([interestToCsv(rows, csvLabel)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contact-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyEmails = () => {
    const emails = rows.filter((r) => r.email && r.marketingConsent).map((r) => r.email);
    void navigator.clipboard
      ?.writeText(emails.join(', '))
      .then(() => pushToast({ tone: 'success', title: `${emails.length} emails copied` }, 2500));
  };

  return (
    <>
      <Summary>
        <Card>
          <CardHead>
            <CardTitle>Intended use</CardTitle>
          </CardHead>
          <Tally items={uses} color="#4fd1ff" />
        </Card>
        <Card $delay={60}>
          <CardHead>
            <CardTitle>Features wanted</CardTitle>
          </CardHead>
          <Tally items={[...features].sort((a, b) => b.count - a.count)} color="#8b9cff" />
        </Card>
        <Card $delay={120}>
          <CardHead>
            <div>
              <CardTitle>Willing to pay</CardTitle>
              <CardHint>{payTotal} of {interest.length} answered</CardHint>
            </div>
          </CardHead>
          <PayBar>
            {pay.map((p) => (
              <div key={p.id} style={{ width: payTotal ? `${(p.count / payTotal) * 100}%` : 0, background: PAY_COLORS[p.id] }} />
            ))}
          </PayBar>
          <PayLegend>
            {pay.map((p) => (
              <li key={p.id}>
                <i style={{ background: PAY_COLORS[p.id] }} />
                <span>{p.label}</span>
                <Mono>
                  {p.count}
                  {payTotal > 0 && ` · ${Math.round((p.count / payTotal) * 100)}%`}
                </Mono>
              </li>
            ))}
          </PayLegend>
          <Big>
            <strong>{interest.filter((r) => r.marketingConsent).length}</strong> opted in to product updates
          </Big>
        </Card>
      </Summary>

      <Card $delay={160}>
        <CardHead>
          <div>
            <CardTitle>
              Submissions <Count>{interestTotal}</Count>
            </CardTitle>
            <CardHint>
              From the Contact us form on the landing page, newest first.
              {interestTotal > interest.length && ` Showing the latest ${interest.length}.`}
            </CardHint>
          </div>
        </CardHead>
        <Toolbar>
          <SegmentedControl
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `All ${interest.length}` },
              { value: 'email', label: `With email ${withEmail}` },
              { value: 'feedback', label: `With feedback ${withFeedback}` },
            ]}
            aria-label="Filter submissions"
          />
          <SearchField value={query} onChange={setQuery} placeholder="Search email, feedback, source…" />
          <Spacer />
          <Button size="sm" variant="ghost" icon={<IconMail />} onClick={copyEmails} disabled={!rows.some((r) => r.email && r.marketingConsent)}>
            Copy opted-in emails
          </Button>
          <Button size="sm" variant="secondary" icon={<IconDownload />} onClick={exportCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
        </Toolbar>

        {rows.length === 0 ? (
          <Empty>
            <strong>{interest.length === 0 ? 'No submissions yet' : 'Nothing matches'}</strong>
            {interest.length === 0 ? 'Responses from the landing page will appear here.' : 'Try a different filter or search.'}
          </Empty>
        ) : (
          <List>
            {rows.map((r, i) => (
              <Entry key={r.id} $i={i}>
                <EntryHead>
                  <div>
                    {r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : <b>Anonymous visitor</b>}
                    <Mono title={formatDateTime(r.createdAt)}>{formatRelative(r.createdAt)}</Mono>
                  </div>
                  {r.marketingConsent && <Pill $tone="success">Wants updates</Pill>}
                  <RowActions>
                    <IconButton label="Delete" tone="danger" size="sm" onClick={() => void remove(r)}>
                      <IconTrash />
                    </IconButton>
                  </RowActions>
                </EntryHead>
                <Tags>
                  <Pill $tone="accent">{label(INTENDED_USE_OPTIONS, r.intendedUse)}</Pill>
                  {r.willingness && (
                    <Pill $tone={r.willingness === 'yes' ? 'success' : r.willingness === 'maybe' ? 'warning' : 'muted'}>
                      Pay: {label(WILLINGNESS_OPTIONS, r.willingness)}
                    </Pill>
                  )}
                  {r.features.map((f) => (
                    <Pill key={f} $tone="info">
                      {label(FEATURE_OPTIONS, f)}
                    </Pill>
                  ))}
                </Tags>
                {r.feedback && <Quote>{r.feedback}</Quote>}
                {(r.source || r.utmSource || r.utmCampaign || r.generationId) && (
                  <EntryFoot>
                    {r.source && <Mono>src: {r.source}</Mono>}
                    {r.utmSource && <Mono>utm: {r.utmSource}</Mono>}
                    {r.utmCampaign && <Mono>campaign: {r.utmCampaign}</Mono>}
                    {r.generationId && <Mono>job: {r.generationId.slice(0, 8)}</Mono>}
                  </EntryFoot>
                )}
              </Entry>
            ))}
          </List>
        )}
      </Card>
    </>
  );
}
