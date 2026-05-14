import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[KidTok] App crash:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      const missingEnv =
        !import.meta.env.VITE_SUPABASE_URL ||
        !import.meta.env.VITE_SUPABASE_ANON_KEY ||
        (import.meta.env.VITE_SUPABASE_ANON_KEY as string) === 'your-anon-key-here'

      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#f5f5f5',
          fontFamily: 'system-ui,sans-serif', padding: '24px', direction: 'ltr',
        }}>
          <div style={{
            background: 'white', borderRadius: '24px', padding: '32px',
            maxWidth: '480px', width: '100%',
            boxShadow: '0 4px 32px rgba(0,0,0,0.12)', textAlign: 'center',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>
              {missingEnv ? '🔑' : '⚠️'}
            </div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
              {missingEnv ? 'Missing Configuration' : 'Something went wrong'}
            </h1>
            {missingEnv ? (
              <div style={{ textAlign: 'left' }}>
                <p style={{ color: '#666', marginBottom: '16px', fontSize: '14px' }}>
                  Set these in your Vercel dashboard → Settings → Environment Variables:
                </p>
                <div style={{
                  background: '#1e1e1e', color: '#86efac', borderRadius: '12px',
                  padding: '16px', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.8',
                }}>
                  <div>VITE_SUPABASE_URL=https://xxx.supabase.co</div>
                  <div>VITE_SUPABASE_ANON_KEY=eyJ...</div>
                </div>
              </div>
            ) : (
              <>
                <p style={{ color: '#666', marginBottom: '16px', fontSize: '14px' }}>
                  {this.state.error?.message}
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
              </>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
