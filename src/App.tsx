import { useEffect, useRef, useState } from 'react';
import { MAJESTICONS } from './majesticons';
import { BACKEND, authClient } from './auth-client';
import { BRANDS } from './brands';

const PROJECT = 'demo';

// App demo espejada del provider demo del backend: permite probar la web
// sin backend (modo demo local). Mismo HTML que genera el backend.
const DEMO_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mis tareas</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#F4F4F5] text-[#0B0B0C] p-6">
<main class="mx-auto max-w-xl">
<h1 class="mb-4 flex items-center gap-2 text-3xl font-bold"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" class="h-7 w-7"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5h10m-10 7h10m-10 7h10"/><rect width="4" height="4" x="3" y="3" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" rx="1"/><rect width="4" height="4" x="3" y="10" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" rx="1"/><rect width="4" height="4" x="3" y="17" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" rx="1"/></svg>Mis tareas</h1>
<form id="f" class="mb-4 flex gap-2"><input id="t" placeholder="Nueva tarea..." class="min-w-0 flex-1 rounded-xl border border-zinc-300 px-3 py-2.5 text-base"><button class="flex items-center gap-1 rounded-xl bg-[#FF6A00] px-4 py-2.5 text-base text-white hover:bg-[#E85D00]"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" class="h-5 w-5"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h7m7 0h-7m0 0V5m0 7v7"/></svg>Agregar</button></form>
<ul id="list" class="space-y-2"></ul>
</main>
<script>
  var ICON_DONE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" class="h-5 w-5"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M8 5v0a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v0M8 5v0a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v0"/><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 14 2 2 4-5"/></svg>';
  var ICON_DEL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" class="h-5 w-5"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7v0a3 3 0 0 1 3-3v0a3 3 0 0 1 3 3v0M9 7h6M9 7H6m9 0h3m2 0h-2M4 7h2m0 0v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"/></svg>';
  var list = document.getElementById('list');
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = document.getElementById('t');
    var v = input.value.trim();
    if (!v) return;
    var li = document.createElement('li');
    li.className = 'flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-3';
    var span = document.createElement('span');
    span.textContent = v;
    var actions = document.createElement('span');
    actions.className = 'flex shrink-0 gap-1';
    var doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'text-zinc-500';
    doneBtn.innerHTML = ICON_DONE;
    doneBtn.addEventListener('click', function () {
      span.classList.toggle('line-through');
      span.classList.toggle('text-zinc-400');
    });
    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'text-zinc-500';
    delBtn.innerHTML = ICON_DEL;
    delBtn.addEventListener('click', function () { li.remove(); });
    actions.appendChild(doneBtn);
    actions.appendChild(delBtn);
    li.appendChild(span);
    li.appendChild(actions);
    list.appendChild(li);
    input.value = '';
  });
</script>
</body>
</html>`;

type Msg = { role: string; text: string };
type Tab = 'chat' | 'preview' | 'files' | 'profile';

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: MAJESTICONS[name] ?? '' }}
    />
  );
}

// Isotipo oficial de Pyrofast: llama naranja, imagen original de Ray (PNG).
function Isotype({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/isotipo.png"
      alt="Pyrofast"
      width={size * 0.76}
      height={size}
      style={{ display: 'block', flexShrink: 0 }}
    />
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

// Proveedores: logo SimpleIcons si existe en el set, icono Majesticons si no
// (Groq, OpenAI y Demo no están en SimpleIcons).
const PROVIDERS = [
  { id: 'demo', label: 'Demo (sin llave)', note: 'Sin llave, app de ejemplo', brand: '', icon: 'bulb' },
  { id: 'openrouter', label: 'OpenRouter', note: 'Modelos :free', brand: 'openrouter', icon: '' },
  { id: 'groq', label: 'Groq', note: 'Tier gratis', brand: '', icon: 'cpu' },
  { id: 'gemini', label: 'Gemini', note: 'Google AI Studio gratis', brand: 'gemini', icon: '' },
  { id: 'deepseek', label: 'DeepSeek', note: 'Precios bajos', brand: 'deepseek', icon: '' },
  { id: 'anthropic', label: 'Claude (Anthropic)', note: 'De pago por uso', brand: 'anthropic', icon: '' },
  { id: 'openai', label: 'OpenAI', note: 'De pago por uso', brand: '', icon: 'robot' },
];

function BrandIcon({ p, size = 24 }: { p: (typeof PROVIDERS)[number]; size?: number }) {
  if (p.brand && BRANDS[p.brand]) {
    const b = BRANDS[p.brand];
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill={b.hex} style={{ display: 'block', flexShrink: 0 }}>
        <path d={b.path} />
      </svg>
    );
  }
  return <Icon name={p.icon} size={size} />;
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
  if (ext === 'html' || ext === 'css' || ext === 'js') return 'code';
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/.test(file)) return 'image';
  return 'file-text';
}

export default function App() {
  const [tab, setTab] = useState<Tab>('chat');
  const [route, setRoute] = useState(() => { const p = window.location.pathname.replace(/\/+$/, ''); return p || '/'; });
  function go(path: string) { window.history.pushState(null, '', path); setRoute(path); }
  useEffect(() => {
    const onPop = () => { const p = window.location.pathname.replace(/\/+$/, ''); setRoute(p || '/'); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (route === '/login') setAuthMode('login');
    if (route === '/register') setAuthMode('signup');
  }, [route]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState('demo');
  const [apiKey, setApiKey] = useState('');
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [demoLocal, setDemoLocal] = useState(false);
  const [replyTo, setReplyTo] = useState('');
  const [copied, setCopied] = useState(-1);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const previewSrc = `${BACKEND}/preview/${PROJECT}/index.html`;
  const displayUrl = demoLocal ? `${window.location.host}/preview/${PROJECT}` : previewSrc.replace(/^https?:\/\//, '');

  async function loadCode(path: string) {
    if (!path) return;
    if (demoLocal) { setCode(DEMO_HTML); return; }
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
      if (provider === 'demo' && !demoLocal) {
        setDemoLocal(true);
        setFiles(['index.html']);
        setSelectedFile('index.html');
        setCode(DEMO_HTML);
        setPreviewKey(Date.now());
        setMessages((m) => [...m, { role: 'assistant', text: 'Voy a crear tu app de ejemplo: una lista de tareas.' }, { role: 'assistant', text: 'Listo, creé tu app de tareas. Puedes verla en el preview y revisar el código.' }]);
      } else if (provider === 'demo') {
        setMessages((m) => [...m, { role: 'assistant', text: 'Tu app de tareas ya está creada: la ves en el preview y su código en Files.' }]);
      } else {
        setMessages((m) => [...m, { role: 'assistant', text: 'Error: no llegué al backend. ¿Está corriendo en el puerto 3000?' }]);
      }
    }
    setBusy(false);
  }

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data?.user?.email) setUser({ email: data.user.email });
    }).catch(() => { /* sin backend: sin sesión */ });
  }, []);

  async function submitAuth() {
    if (!authEmail.trim() || !authPass || authBusy) return;
    setAuthBusy(true);
    setAuthError('');
    try {
      const res = authMode === 'login'
        ? await authClient.signIn.email({ email: authEmail, password: authPass })
        : await authClient.signUp.email({ email: authEmail, password: authPass, name: authEmail.split('@')[0] });
      if (res.error) {
        setAuthError(res.error.message ?? 'Error de autenticación');
      } else {
        const { data } = await authClient.getSession();
        if (data?.user?.email) setUser({ email: data.user.email });
        setAuthEmail('');
        setAuthPass('');
        if (window.location.pathname === '/login' || window.location.pathname === '/register') go('/');
      }
    } catch {
      setAuthError('No llegué al backend. ¿Está corriendo?');
    }
    setAuthBusy(false);
  }

  function newChat() {
    setMessages([]);
    setFiles([]);
    setSelectedFile('');
    setCode('');
    setDemoLocal(false);
    setMenuOpen(false);
    setTab('chat');
  }

  async function logout() {
    try {
      await authClient.signOut();
    } catch { /* sin backend: igual se limpia el estado local */ }
    setMessages([]);
    setFiles([]);
    setSelectedFile('');
    setCode('');
    setDemoLocal(false);
    setApiKey('');
    setProvider('demo');
    setUser(null);
    setMenuOpen(false);
    setTab('chat');
  }

  async function copyMsg(i: number, text: string) {
    try { await navigator.clipboard.writeText(text); } catch { /* portapapeles no disponible */ }
    setCopied(i);
    setTimeout(() => setCopied(-1), 1500);
  }

  function sharePreview() {
    const url = demoLocal ? `${window.location.origin}/preview/${PROJECT}` : previewSrc;
    if (navigator.share) navigator.share({ url }).catch(() => {});
    else navigator.clipboard?.writeText(url).catch(() => {});
  }

  const highlighted = highlightFile(code, extOf(selectedFile));

  if (route === '/login' || route === '/register') {
    const isLogin = route === '/login';
    return (
      <div className="shell">
        <header className="topbar">
          <div className="brand"><Isotype /><b>Pyrofast</b></div>
        </header>
        <main className="profileview">
          <h2>{isLogin ? 'Entrar' : 'Crear cuenta'}</h2>
          <p className="hint">Pyrofast recuerda tu sesión en este navegador.</p>
          <div className="settings">
            {user ? (
              <div className="accountcard">
                <span><b>{user.email}</b><small>Sesión iniciada</small></span>
                <button className="logoutbtn" onClick={() => go('/')}>Ir a la app</button>
              </div>
            ) : (
              <>
                <label>
                  Correo
                  <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="tu@correo.com" />
                </label>
                <label>
                  Contraseña
                  <input type="password" value={authPass} onChange={(e) => setAuthPass(e.target.value)} placeholder="••••••••" />
                </label>
                {authError && <p className="autherror">{authError}</p>}
                <button className="newchatbtn" onClick={submitAuth} disabled={authBusy}>
                  {isLogin ? 'Entrar' : 'Crear cuenta'}
                </button>
              </>
            )}
          </div>
          <button className="linkbtn" onClick={() => go(isLogin ? '/register' : '/login')}>
            {isLogin ? '¿No tienes cuenta? Crea una' : '¿Ya tienes cuenta? Entra'}
          </button>
          <button className="linkbtn" onClick={() => go('/')}>← Volver a Pyrofast</button>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <button aria-label="Abrir menú" className="iconbtn" onClick={() => setMenuOpen(true)}>
          <Icon name="menu" size={24} />
        </button>
        <div className="brand">
          <Isotype />
          <b>Pyrofast</b>
        </div>
        <button aria-label="Nuevo chat" className="iconbtn" onClick={newChat}>
          <Icon name="plus" size={24} />
        </button>
      </header>

      {menuOpen && (
        <div className="drawerwrap">
          <div className="scrim" onClick={() => setMenuOpen(false)} />
          <aside className="drawer">
            <div className="drawerhead">
              <div className="brand"><Isotype size={24} /><b>Pyrofast</b></div>
              <button aria-label="Cerrar menú" className="iconbtn" onClick={() => setMenuOpen(false)}>
                <Icon name="x" size={22} />
              </button>
            </div>
            <button className="newchatbtn" onClick={newChat}>
              <Icon name="plus" size={20} /> Nuevo chat
            </button>
            <div className="drawerlabel">Chats</div>
            <div className="chatitem active">
              <Icon name="message-circle" size={20} />
              <span>{files.length ? 'App de tareas' : 'Nuevo chat'}</span>
            </div>
            <div className="drawerfoot">
              <button className="drawerrow" onClick={logout}>
                <Icon name="logout" size={22} />
                <span>Cerrar sesión</span>
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
                        <Icon name="edit" size={17} /><span>Editar</span>
                      </button>
                    )}
                    <button aria-label="Responder" onClick={() => setReplyTo(m.text)}>
                      <Icon name="corner-up-left" size={17} /><span>Responder</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="providerline">
              {(PROVIDERS.find((p) => p.id === provider)?.label ?? provider)} ·{' '}
              <button onClick={() => setTab('profile')}>cambiar</button>
            </div>
            {replyTo && (
              <div className="replybar">
                <span>Respondiendo a: “{replyTo.slice(0, 40)}…”</span>
                <button aria-label="Quitar respuesta" onClick={() => setReplyTo('')}>✕</button>
              </div>
            )}
            <div className="composer">
              <button aria-label="Adjuntar" className="iconbtn"><Icon name="plus" size={22} /></button>
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Pide tu app..."
                onKeyDown={(e) => e.key === 'Enter' && send()}
              />
              <button aria-label="Enviar" className="sendbtn" onClick={send} disabled={busy}>
                <Icon name="send" size={20} />
              </button>
            </div>
          </>
        )}

        {tab === 'preview' && (
          <div className="browser">
            <div className="chrome">
              <button aria-label="Atrás" className="iconbtn sm" onClick={() => iframeRef.current?.contentWindow?.history.back()}>
                <Icon name="chevron-left" size={20} />
              </button>
              <button aria-label="Recargar" className="iconbtn sm" onClick={() => setPreviewKey(Date.now())}>
                <Icon name="refresh-cw" size={20} />
              </button>
              <div className="urlbar">
                <Icon name="lock" size={14} />
                <span>{displayUrl}</span>
              </div>
              <button aria-label="Compartir" className="iconbtn sm" onClick={sharePreview}>
                <Icon name="share-2" size={20} />
              </button>
            </div>
            {files.length ? (
              <iframe
                ref={iframeRef}
                title="preview"
                key={previewKey}
                {...(demoLocal ? { srcDoc: code } : { src: `${BACKEND}/preview/${PROJECT}/index.html` })}
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
              <Icon name="plus" size={20} /> Nuevo chat
            </button>
          </div>
        )}

        {tab === 'profile' && (
          <div className="profileview">
            <Avatar size={64} big />
            <h2>Ray</h2>
            <p className="hint">Tus llaves (BYOK) solo viven en tu navegador. Pyrofast no las guarda.</p>
            <div className="settings">
              <div className="settingslabel">Cuenta</div>
              {user ? (
                <div className="accountcard">
                  <span><b>{user.email}</b><small>Sesión iniciada</small></span>
                  <button className="logoutbtn" onClick={logout}>Cerrar sesión</button>
                </div>
              ) : (
                <>
                  <label>
                    Correo
                    <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="tu@correo.com" />
                  </label>
                  <label>
                    Contraseña
                    <input type="password" value={authPass} onChange={(e) => setAuthPass(e.target.value)} placeholder="••••••••" />
                  </label>
                  {authError && <p className="autherror">{authError}</p>}
                  <button className="newchatbtn" onClick={submitAuth} disabled={authBusy}>
                    {authMode === 'login' ? 'Entrar' : 'Crear cuenta'}
                  </button>
                  <button className="linkbtn" onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(''); }}>
                    {authMode === 'login' ? '¿No tienes cuenta? Crea una' : '¿Ya tienes cuenta? Entra'}
                  </button>
                </>
              )}
              <div className="settingslabel" style={{ marginTop: 20 }}>Proveedores</div>
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  className={provider === p.id ? 'providerrow active' : 'providerrow'}
                  onClick={() => setProvider(p.id)}
                >
                  <BrandIcon p={p} size={26} />
                  <span className="providername"><b>{p.label}</b><small>{p.note}</small></span>
                  {provider === p.id && <span className="provideractive">Activo</span>}
                </button>
              ))}
              {provider !== 'demo' && (
                <label>
                  Tu llave
                  <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
                </label>
              )}
            </div>
          </div>
        )}
      </main>

      <nav className="bottomnav">
        <button aria-label="Chat" className={tab === 'chat' ? 'navbtn active' : 'navbtn'} onClick={() => setTab('chat')}>
          <Icon name="message-circle" size={23} /><span>Chat</span>
        </button>
        <button aria-label="Preview" className={tab === 'preview' ? 'navbtn active' : 'navbtn'} onClick={() => setTab('preview')}>
          <Icon name="globe" size={23} /><span>Preview</span>
        </button>
        <button aria-label="Files" className={tab === 'files' ? 'navbtn active' : 'navbtn'} onClick={() => setTab('files')}>
          <Icon name="folder" size={23} /><span>Files</span>
        </button>
        <button aria-label="Perfil" className={tab === 'profile' ? 'navbtn active' : 'navbtn'} onClick={() => setTab('profile')}>
          <Avatar size={24} /><span>Perfil</span>
        </button>
      </nav>
    </div>
  );
}
