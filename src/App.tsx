import { useRef, useState } from 'react';
import { SOLAR } from './solar';

const BACKEND = 'http://127.0.0.1:3000';
const PROJECT = 'demo';

type Msg = { role: string; text: string };
type Tab = 'chat' | 'preview' | 'files' | 'profile';

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ display: 'block', flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: SOLAR[name] ?? '' }}
    />
  );
}

// Isotipo provisorio (rayo naranja) hasta tener el oficial de la org.
function Isotype({ size = 28 }: { size?: number }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: 8, background: '#ff6a00',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="#fff">
        <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" />
      </svg>
    </span>
  );
}

// Avatar de Ray (foto de perfil) con respaldo a inicial.
function Avatar({ size = 34, big = false }: { size?: number; big?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={big ? 'avatar big' : 'avatar'}>R</span>;
  return (
    <img
      src="/avatar.jpg"
      alt="Ray"
      width={size}
      height={size}
      className={big ? 'avatarimg big' : 'avatarimg'}
      onError={() => setFailed(true)}
    />
  );
}

function randomId() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Resaltado estilo VS Code Dark+ (por extensión, con sangría intacta).
// Un solo pase por línea: cada token se pinta una vez y nada se reprocesa.
const JS_KEYWORDS = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'new', 'class', 'import', 'from', 'export', 'default', 'true', 'false', 'null', 'undefined', 'this', 'typeof', 'await', 'async'];

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightTag(tag: string): string {
  // Separa nombre y atributos ANTES de insertar spans: si no, el regex de
  // atributos reescribe el class="tok-tag" recién insertado y rompe el HTML.
  const m = tag.match(/^(&lt;\/?)([a-zA-Z][\w-]*)([\s\S]*?)(&gt;)$/);
  if (!m) return tag;
  const [, open, name, rest, close] = m;
  const attrs = rest.replace(/([a-zA-Z-]+)(=)("[^"]*")/g, '<span class="tok-attr">$1</span>$2<span class="tok-str">$3</span>');
  return `${open}<span class="tok-tag">${name}</span>${attrs}${close}`;
}

function highlightLine(line: string, mode: string): string {
  const s = esc(line);
  const com = String.raw`&lt;!--[\s\S]*?--&gt;|\/\*[\s\S]*?\*\/|\/\/.*`;
  const str = String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'`;
  const tag = String.raw`&lt;\/?[a-zA-Z][\w-]*[^&]*?&gt;`;
  const kw = `\\b(${JS_KEYWORDS.join('|')})\\b`;
  const fn = String.raw`[a-zA-Z_$][\w$]*(?=\()`;
  const num = String.raw`\b\d+(?:\.\d+)?\b`;
  const prop = String.raw`[a-zA-Z-]+(?=:)`;
  let pattern: string;
  if (mode === 'css') pattern = `(?<com>${com})|(?<str>${str})|(?<prop>${prop})|(?<num>${num})`;
  else if (mode === 'js') pattern = `(?<com>${com})|(?<str>${str})|(?<kw>${kw})|(?<fn>${fn})|(?<num>${num})`;
  else if (mode === 'html') pattern = `(?<com>${com})|(?<str>${str})|(?<tag>${tag})|(?<kw>${kw})|(?<fn>${fn})|(?<num>${num})`;
  else pattern = `(?<com>${com})|(?<str>${str})|(?<num>${num})`;
  return s.replace(new RegExp(pattern, 'g'), (...args) => {
    const g = args[args.length - 1] as Record<string, string | undefined>;
    if (g.com) return `<span class="tok-com">${g.com}</span>`;
    if (g.str) return `<span class="tok-str">${g.str}</span>`;
    if (g.tag) return highlightTag(g.tag);
    if (g.prop) return `<span class="tok-attr">${g.prop}</span>`;
    if (g.kw) return `<span class="tok-kw">${g.kw}</span>`;
    if (g.fn) return `<span class="tok-fn">${g.fn}</span>`;
    if (g.num) return `<span class="tok-num">${g.num}</span>`;
    return '';
  });
}

// En .html, el bloque <style> se pinta como CSS y <script> como JS.
function highlightFile(code: string, ext: string): string[] {
  const lines = code.split('\n');
  let mode = ext;
  return lines.map((line) => {
    const closing = line.includes('</style>') || line.includes('</script>');
    const out = highlightLine(line, closing ? ext : mode);
    if (line.includes('<style') && !closing) mode = 'css';
    else if (line.includes('<script') && !closing) mode = 'js';
    else if (closing) mode = ext;
    return out;
  });
}

function extOf(file: string) {
  if (file.endsWith('.html')) return 'html';
  if (file.endsWith('.css')) return 'css';
  if (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.tsx')) return 'js';
  if (file.endsWith('.json')) return 'json';
  return 'txt';
}

function fileIcon(file: string) {
  const ext = extOf(file);
  if (ext === 'html' || ext === 'css' || ext === 'js') return 'codeSlash';
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/.test(file)) return 'gallery';
  return 'fileText';
}

export default function App() {
  const [tab, setTab] = useState<Tab>('chat');
  const [menuOpen, setMenuOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState('demo');
  const [apiKey, setApiKey] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewId] = useState(randomId);
  const [previewKey, setPreviewKey] = useState(0);
  const [replyTo, setReplyTo] = useState('');
  const [copied, setCopied] = useState(-1);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const displayUrl = `pyrofast.link/app/${previewId}`;

  async function loadCode(path: string) {
    if (!path) return;
    const res = await fetch(`${BACKEND}/projects/${PROJECT}/code?path=${encodeURIComponent(path)}`);
    setCode(await res.text());
  }

  async function send() {
    if (!prompt.trim() || busy) return;
    const body = replyTo ? `Respondiendo a "${replyTo}": ${prompt}` : prompt;
    setPrompt('');
    setReplyTo('');
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', text: body }]);
    try {
      const res = await fetch(`${BACKEND}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: apiKey || undefined,
          project: PROJECT,
          messages: [{ role: 'user', content: body }],
        }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages((m) => [...m, { role: 'assistant', text: 'Error: ' + data.error }]);
      } else {
        for (const msg of data.messages ?? []) {
          if (msg.role === 'assistant' && msg.content) {
            setMessages((m) => [...m, { role: 'assistant', text: msg.content }]);
          }
        }
        const list: string[] = data.files ?? [];
        if (list.length) {
          setFiles(list);
          setSelectedFile(list[0]);
          await loadCode(list[0]);
        }
        setPreviewKey(Date.now());
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', text: 'Error: no llegué al backend. ¿Está corriendo en el puerto 3000?' }]);
    }
    setBusy(false);
  }

  function newChat() {
    setMessages([]);
    setFiles([]);
    setSelectedFile('');
    setCode('');
    setMenuOpen(false);
    setTab('chat');
  }

  async function copyMsg(i: number, text: string) {
    try { await navigator.clipboard.writeText(text); } catch { /* portapapeles no disponible */ }
    setCopied(i);
    setTimeout(() => setCopied(-1), 1500);
  }

  function sharePreview() {
    const url = 'https://' + displayUrl;
    if (navigator.share) navigator.share({ url }).catch(() => {});
    else navigator.clipboard?.writeText(url).catch(() => {});
  }

  const highlighted = highlightFile(code, extOf(selectedFile));

  return (
    <div className="shell">
      <header className="topbar">
        <button aria-label="Abrir menú" className="iconbtn" onClick={() => setMenuOpen(true)}>
          <Icon name="navMenu" size={24} />
        </button>
        <div className="brand">
          <Isotype />
          <b>Pyrofast</b>
        </div>
        <button aria-label="Nuevo chat" className="iconbtn" onClick={newChat}>
          <Icon name="add" size={24} />
        </button>
      </header>

      {menuOpen && (
        <div className="drawerwrap">
          <div className="scrim" onClick={() => setMenuOpen(false)} />
          <aside className="drawer">
            <div className="drawerhead">
              <div className="brand"><Isotype size={24} /><b>Pyrofast</b></div>
              <button aria-label="Cerrar menú" className="iconbtn" onClick={() => setMenuOpen(false)}>
                <Icon name="close" size={22} />
              </button>
            </div>
            <button className="newchatbtn" onClick={newChat}>
              <Icon name="add" size={20} /> Nuevo chat
            </button>
            <div className="drawerlabel">Chats</div>
            <div className="chatitem active">
              <Icon name="callChat" size={20} />
              <span>{files.length ? 'App de tareas' : 'Nuevo chat'}</span>
            </div>
            <div className="drawerfoot">
              <button className="drawerrow" onClick={() => { setMenuOpen(false); setTab('profile'); }}>
                <Avatar size={34} />
                <span><b>Ray</b><small>BYOK · sin llave guardada</small></span>
              </button>
              <button className="drawerrow" onClick={() => { setMenuOpen(false); setTab('profile'); }}>
                <Icon name="navSettings" size={22} />
                <span>Ajustes</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      <main className="view">
        {tab === 'chat' && (
          <>
            <div className="msgs">
              {messages.length === 0 && (
                <div className="empty">
                  <Isotype size={48} />
                  <h2>¿Qué app quieres crear?</h2>
                  <p>Descríbela y Pyrofast la construye. Con Demo no necesitas llave.</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'msg user' : 'msg assistant'}>
                  <div className="bubble">{m.text}</div>
                  <div className="msgactions">
                    <button aria-label="Copiar" onClick={() => copyMsg(i, m.text)}>
                      <Icon name="copy" size={17} />
                      <span>{copied === i ? '¡Copiado!' : 'Copiar'}</span>
                    </button>
                    {m.role === 'user' && (
                      <button aria-label="Editar" onClick={() => setPrompt(m.text)}>
                        <Icon name="pen" size={17} /><span>Editar</span>
                      </button>
                    )}
                    <button aria-label="Responder" onClick={() => setReplyTo(m.text)}>
                      <Icon name="cornerDownRight" size={17} /><span>Responder</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="providerline">
              {provider === 'demo' ? 'Demo (sin llave)' : provider} ·{' '}
              <button onClick={() => setTab('profile')}>cambiar</button>
            </div>
            {replyTo && (
              <div className="replybar">
                <span>Respondiendo a: “{replyTo.slice(0, 40)}…”</span>
                <button aria-label="Quitar respuesta" onClick={() => setReplyTo('')}>✕</button>
              </div>
            )}
            <div className="composer">
              <button aria-label="Adjuntar" className="iconbtn"><Icon name="add" size={22} /></button>
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Pide tu app..."
                onKeyDown={(e) => e.key === 'Enter' && send()}
              />
              <button aria-label="Enviar" className="sendbtn" onClick={send} disabled={busy}>
                <Icon name="arrowRightUp" size={20} />
              </button>
            </div>
          </>
        )}

        {tab === 'preview' && (
          <div className="browser">
            <div className="chrome">
              <button aria-label="Atrás" className="iconbtn sm" onClick={() => iframeRef.current?.contentWindow?.history.back()}>
                <Icon name="chevronLeft" size={20} />
              </button>
              <button aria-label="Recargar" className="iconbtn sm" onClick={() => setPreviewKey(Date.now())}>
                <Icon name="history" size={20} />
              </button>
              <div className="urlbar">
                <Icon name="lock" size={14} />
                <span>{displayUrl}</span>
              </div>
              <button aria-label="Compartir" className="iconbtn sm" onClick={sharePreview}>
                <Icon name="share" size={20} />
              </button>
            </div>
            {files.length ? (
              <iframe
                ref={iframeRef}
                title="preview"
                key={previewKey}
                src={`${BACKEND}/preview/${PROJECT}/index.html`}
              />
            ) : (
              <div className="empty">
                <Icon name="globe" size={44} />
                <h2>Sin preview todavía</h2>
                <p>El preview de tu app aparece aquí cuando el agente la crea.</p>
              </div>
            )}
          </div>
        )}

        {tab === 'files' && (
          <div className="filesview">
            <div className="explorer">
              <div className="explorerlabel">Archivos</div>
              {files.map((f) => (
                <button
                  key={f}
                  className={selectedFile === f ? 'filerow active' : 'filerow'}
                  onClick={async () => { setSelectedFile(f); await loadCode(f); }}
                >
                  <Icon name={fileIcon(f)} size={19} />
                  <span>{f}</span>
                  <small>{extOf(f)}</small>
                </button>
              ))}
              {!files.length && <span className="hint">Sin archivos todavía.</span>}
            </div>
            {selectedFile && (
              <div className="editor">
                <div className="edittab">
                  <Icon name={fileIcon(selectedFile)} size={16} />
                  <span>{selectedFile}</span>
                </div>
                <div className="vscode">
                  {highlighted.map((html, i) => (
                    <div key={i} className="cline">
                      <span className="ln">{i + 1}</span>
                      <span
                        className="lc"
                        dangerouslySetInnerHTML={{ __html: html || ' ' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button className="newchatbtn" onClick={newChat}>
              <Icon name="add" size={20} /> Nuevo chat
            </button>
          </div>
        )}

        {tab === 'profile' && (
          <div className="profileview">
            <Avatar size={64} big />
            <h2>Ray</h2>
            <p className="hint">Tus llaves (BYOK) solo viven en tu navegador. Pyrofast no las guarda.</p>
            <label>
              Provider
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="demo">Demo (sin llave)</option>
                <option value="openrouter">OpenRouter</option>
                <option value="groq">Groq</option>
                <option value="gemini">Gemini</option>
                <option value="anthropic">Claude</option>
              </select>
            </label>
            {provider !== 'demo' && (
              <label>
                Tu llave
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
              </label>
            )}
          </div>
        )}
      </main>

      <nav className="bottomnav">
        <button aria-label="Chat" className={tab === 'chat' ? 'navbtn active' : 'navbtn'} onClick={() => setTab('chat')}>
          <Icon name="callChat" size={23} /><span>Chat</span>
        </button>
        <button aria-label="Preview" className={tab === 'preview' ? 'navbtn active' : 'navbtn'} onClick={() => setTab('preview')}>
          <Icon name="globe" size={23} /><span>Preview</span>
        </button>
        <button aria-label="Files" className={tab === 'files' ? 'navbtn active' : 'navbtn'} onClick={() => setTab('files')}>
          <Icon name="folderOpen" size={23} /><span>Files</span>
        </button>
        <button aria-label="Perfil" className={tab === 'profile' ? 'navbtn active' : 'navbtn'} onClick={() => setTab('profile')}>
          <Avatar size={24} /><span>Perfil</span>
        </button>
      </nav>
    </div>
  );
}
