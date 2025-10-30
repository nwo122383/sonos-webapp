// src/ErrorBoundary.tsx
import React from 'react';

type Props = { children: React.ReactNode };
type State = { hasError: boolean; message?: string; stack?: string };

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(err: any) {
    return { hasError: true, message: String(err?.message || err), stack: String(err?.stack || '') };
  }
  componentDidCatch(err: any, info: any) {
    // Keep noisy logs visible in console
    console.error('[ErrorBoundary] Caught render error:', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, color: '#111', background: '#fff', fontFamily: 'system-ui, sans-serif' }}>
          <h2 style={{ marginTop: 0 }}>😬 Something broke while rendering.</h2>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#b00020' }}>
            {this.state.message || 'Unknown error'}
          </div>
          {this.state.stack && (
            <>
              <h4>Stack</h4>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, border: '1px solid #eee', padding: 8 }}>
                {this.state.stack}
              </pre>
            </>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
