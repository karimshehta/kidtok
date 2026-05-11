import { Component, ErrorInfo, ReactNode } from 'react'

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-primary-light to-white flex items-center justify-center p-4">
          <div className="card max-w-md w-full text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold mb-2">حدث خطأ غير متوقع</h1>
            <p className="text-neutral-700 mb-6 text-sm">
              نأسف للإزعاج، حاول إعادة تحميل الصفحة
            </p>
            <button onClick={() => window.location.reload()} className="btn-primary w-full">
              إعادة تحميل
            </button>
            {import.meta.env.DEV && this.state.error && (
              <details className="mt-4 text-start text-xs text-neutral-700 bg-neutral-200 rounded-lg p-3">
                <summary className="cursor-pointer">تفاصيل (dev only)</summary>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap">
                  {this.state.error.message}
                  {'\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
