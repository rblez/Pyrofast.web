import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Si algo rompe al renderizar, mostrar el error en vez de una pantalla en blanco.
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="shell">
          <main className="authview">
            <div className="authbrand">Pyrofast</div>
            <h2>Algo falló</h2>
            <p className="hint">Copia este error y mándamelo:</p>
            <p className="autherror">{String(this.state.error.message || this.state.error)}</p>
            <button className="authsubmit" onClick={() => window.location.reload()}>Recargar</button>
          </main>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
