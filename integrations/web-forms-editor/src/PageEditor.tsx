// SPDX-License-Identifier: Apache-2.0
import { useState, useSyncExternalStore } from 'react';
import { Puck, Render, type Config, type Data } from '@puckeditor/core';
import { DraftSession, type DocumentEnvelope, type DocumentStore } from './documents.js';

/** Register application-owned blocks here. Never render untrusted raw HTML or executable source. */
export const pageConfig: Config = {
  components: {
    Heading: {
      fields: { text: { type: 'text' }, level: { type: 'select', options: [{ label: 'Heading 2', value: 'h2' }, { label: 'Heading 3', value: 'h3' }] } },
      defaultProps: { text: 'Section title', level: 'h2' },
      render: ({ text, level }) => level === 'h3' ? <h3>{text}</h3> : <h2>{text}</h2>,
    },
    Paragraph: {
      fields: { text: { type: 'textarea' } }, defaultProps: { text: 'Add your content.' },
      render: ({ text }) => <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>,
    },
    CallToAction: {
      fields: { label: { type: 'text' }, href: { type: 'text' } }, defaultProps: { label: 'Learn more', href: '/' },
      render: ({ label, href }) => <a className="genlib-action" href={safePageHref(href)}>{label}</a>,
    },
  },
};

export function safePageHref(value: unknown): string {
  if (typeof value !== 'string' || /[\u0000-\u0020\\]/u.test(value)) return '#';
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : '#'; } catch { return '#'; }
}

export function parsePageData(value: unknown, registeredTypes = Object.keys(pageConfig.components)): Data {
  if (!value || typeof value !== 'object' || !('content' in value) || !Array.isArray(value.content) || value.content.length > 1_000 ||
      !('root' in value) || !value.root || typeof value.root !== 'object' || Array.isArray(value.root)) throw new Error('Invalid page document.');
  const ids = new Set<string>();
  // This starter uses a flat block schema. Add a recursive validator with custom slot/nested blocks.
  for (const block of value.content) {
    if (!block || !registeredTypes.includes(block.type) || !block.props || typeof block.props.id !== 'string' || ids.has(block.props.id)) throw new Error('Unknown block or duplicate block identifier.');
    ids.add(block.props.id);
    for (const property of ['text', 'label', 'href', 'level']) if (property in block.props && typeof block.props[property] !== 'string') throw new Error('Block fields must be strings.');
  }
  return structuredClone(value) as Data;
}

export function PageEditor({ initial, store, config = pageConfig, publish }: {
  initial: DocumentEnvelope<Data>;
  store: DocumentStore<Data>;
  config?: Config;
  /** The server must check publication rights and revision; this callback is explicit. */
  publish?: (saved: DocumentEnvelope<Data>) => Promise<void>;
}) {
  const [session] = useState(() => new DraftSession(initial, store));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [publishing, setPublishing] = useState(false), [message, setMessage] = useState('');
  return <section className="genlib-editor" aria-label="Page editor" aria-busy={state.saving || publishing}>
    <div className="genlib-toolbar">
      <button type="button" disabled={!state.dirty || state.saving || publishing} onClick={() => { session.save().then(() => setMessage('Draft saved.'), () => setMessage('')); }}>Save draft</button>
      <span role="status">{state.saving ? 'Saving…' : state.dirty ? 'Unsaved changes' : message || 'Saved'}</span>
    </div>
    {state.error && <p role="alert">{state.error.message}</p>}
    <Puck config={config} data={state.document.data} onChange={data => session.edit(data)}
      permissions={{ publish: !!publish && !publishing && !state.saving }}
      onPublish={publish ? async data => {
        if (publishing || session.getSnapshot().saving) return;
        setPublishing(true); session.edit(data);
        try { const saved = await session.save(); await publish(saved); setMessage('Published saved revision.'); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'Publication failed.'); }
        finally { setPublishing(false); }
      } : undefined} />
  </section>;
}

export function PublishedPage({ data, config = pageConfig }: { data: Data; config?: Config }) { return <Render config={config} data={data} />; }
