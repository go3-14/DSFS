import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { decryptFilename } from '@voidshare/shared';
import { downloadFile, uploadFile } from './transfer.js';
import './styles.css';

function fileIdFromPath(): string | null {
  const match = window.location.pathname.match(/^\/download\/([a-f0-9]{32})$/i);
  return match?.[1] ?? null;
}

function App() {
  const fileId = fileIdFromPath();
  return <Shell>{fileId ? <DownloadView fileId={fileId} /> : <UploadView />}</Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="VoidShare home"><span className="brand-mark">V</span>voidshare</a>
        <span className="topbar-note">private by default</span>
      </header>
      {children}
      <footer className="footer">The key stays with you. The server only sees encrypted bytes.</footer>
    </main>
  );
}

function UploadView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<{ fileId: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shareLink = useMemo(() => result ? `${window.location.origin}/download/${result.fileId}#${result.secret}` : '', [result]);

  const choose = (next: File | undefined) => {
    setError(null);
    setResult(null);
    if (!next) return;
    if (next.size > 200 * 1024 * 1024) { setError('That file is larger than the 200 MB limit.'); return; }
    setFile(next);
  };
  const onInput = (event: ChangeEvent<HTMLInputElement>) => choose(event.target.files?.[0]);
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0]); };

  const upload = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try { setResult(await uploadFile(file)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The upload could not be completed.'); }
    finally { setBusy(false); }
  };

  return (
    <section className="hero-grid">
      <div className="intro">
        <p className="kicker"><span className="pulse" /> encrypted file transfer</p>
        <h1>Send a file<br /><em>without leaving a copy.</em></h1>
        <p className="lede">Pick a file. VoidShare encrypts it in your browser and gives you a link whose secret never travels with the request.</p>
        <div className="trust-line"><span>client-side encryption</span><span>no account</span><span>24 hour expiry</span></div>
      </div>
      <div className="panel upload-panel">
        {!result ? <>
          <div className={`dropzone ${dragging ? 'is-dragging' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }}>
            <input ref={inputRef} type="file" onChange={onInput} hidden />
            <span className="drop-icon">＋</span>
            <strong>{file ? file.name : 'Drop a file here'}</strong>
            <span>{file ? formatBytes(file.size) : 'or choose one from your device'}</span>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary-button" disabled={!file || busy} onClick={upload}>{busy ? 'Encrypting and sending…' : 'Create private link'}</button>
          <p className="fine-print">Your browser encrypts the file before any upload begins.</p>
        </> : <SuccessCard link={shareLink} onReset={() => { setResult(null); setFile(null); }} />}
      </div>
    </section>
  );
}

function SuccessCard({ link, onReset }: { link: string; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
  return <div className="success-card"><div className="success-icon">✓</div><p className="kicker">ready to share</p><h2>Your private link is ready.</h2><p className="muted">Anyone with this link can download the file once. The secret is kept in the fragment.</p><div className="link-box"><span>{link.replace(/#.*$/, '')}<b>#secret</b></span><button onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button></div><button className="quiet-button" onClick={onReset}>Send another file</button></div>;
}

function DownloadView({ fileId }: { fileId: string }) {
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const start = async () => {
    const secret = window.location.hash.slice(1);
    if (!/^[a-f0-9]{64}$/i.test(secret)) { setStatus('error'); setMessage('This link is missing its private key.'); return; }
    setStatus('busy'); setMessage('Checking the link and rebuilding your file…');
    try {
      const result = await downloadFile(fileId, secret);
      const name = result.encryptedFileName ? await decryptFilename(result.encryptedFileName, secret) : 'voidshare-download';
      const blob = new Blob([result.bytes as unknown as BlobPart]);
      const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = name; anchor.click(); URL.revokeObjectURL(anchor.href);
      setStatus('done'); setMessage('The file is ready in your downloads.');
    } catch (cause) { setStatus('error'); setMessage(cause instanceof Error ? cause.message : 'The download could not be completed.'); }
  };
  return <section className="download-stage"><div className="download-card"><span className={`download-glyph ${status}`}>{status === 'done' ? '✓' : status === 'error' ? '!' : '↓'}</span><p className="kicker">private download</p><h1>{status === 'done' ? 'Download complete.' : 'A file is waiting.'}</h1><p className="lede">Your browser will decrypt the file locally. The secret never leaves this page.</p>{message && <p className={status === 'error' ? 'error' : 'status'} role={status === 'error' ? 'alert' : 'status'}>{message}</p>}<button className="primary-button" disabled={status === 'busy' || status === 'done'} onClick={start}>{status === 'busy' ? 'Decrypting…' : status === 'done' ? 'Saved to device' : 'Download securely'}</button></div></section>;
}

function formatBytes(bytes: number): string { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }

export default App;

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('VoidShare root element is missing');
const hotModule = (import.meta as ImportMeta & { hot?: { data: { root?: Root } } }).hot;
const root = hotModule?.data.root ?? createRoot(rootElement);
if (hotModule) hotModule.data.root = root;
root.render(<App />);
