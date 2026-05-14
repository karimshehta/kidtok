import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

const PANEL_STYLE: React.CSSProperties = {
  minHeight: '100vh', display: 'flex', alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'system-ui,sans-serif', padding: '24px', direction: 'ltr',
}
const CARD_STYLE: React.CSSProperties = {
  background: 'white', borderRadius: '24px', padding: '32px',
  maxWidth: '480px', width: '100%',
  boxShadow: '0 4px 32px rgba(0,0,0,0.12)', textAlign: 'center',
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[KidTok] App crash:', error, info.componentStack)
  }

  render() {
    const envMissing =
      !import.meta.env.VITE_SUPABASE_URL ||
      !import.meta.env.VITE_SUPABASE_ANON_KEY ||
      (import.meta.env.VITE_SUPABASE_ANON_KEY as string) === 'your-anon-key-here'

    // Show env-missing screen even if no JS error happened yet
    if (envMissing) {
      return (
        <div style={{ ...PANEL_STYLE, background: '#fef3c7' }}>
          <div style={CARD_STYLE}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔑</div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '12px' }}>
              Missing Supabase env vars
            </h1>
            <p style={{ color: '#666', marginBottom: '16px', fontSize: '14px', textAlign: 'left' }}>
              Go to <b>Vercel Dashboard → Project → Settings → Environment Variables</b> and add:
            </p>
            <div style={{
              background: '#1e1e1e', color: '#86efac', borderRadius: '12px',
              padding: '16px', fontFamily: 'monospace', fontSize: '12px',
              lineHeight: '1.8', textAlign: 'left', wordBreak: 'break-all',
            }}>
              <div>VITE_SUPABASE_URL=https://xxx.supabase.co</div>
              <div>VITE_SUPABASE_ANON_KEY=eyJ...</div>
            </div>
            <p style={{ color: '#999', marginTop: '16px', fontSize: '12px' }}>
              After adding them, click <b>Redeploy</b> in Vercel.
            </p>
          </div>
        </div>
      )
    }

    if (this.state.hasError) {
      return (
        <div style={{ ...PANEL_STYLE, background: '#f5f5f5' }}>
          <div style={CARD_STYLE}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
              Something went wrong
            </h1>
            <p style={{ color: '#666', marginBottom: '16px', fontSize: '14px' }}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#03BBE5', color: 'white', border: 'none',
                borderRadius: '12px', padding: '12px 24px',
                cursor: 'pointer', fontSize: '15px', fontWeight: 600,
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
