import React from 'react';
import ReactDOM from 'react-dom/client';
import BendingSimulator from '../bending-simulator.jsx';
import './index.css';

// 万一どこかで例外が出ても画面全体が真っ白にならないようにする安全網
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err, info) {
    console.error('アプリエラー:', err, info);
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 20, color: '#e2e8f0', background: '#0f172a', minHeight: '100vh', fontFamily: 'sans-serif' }}>
          <h2>表示中にエラーが発生しました</h2>
          <p style={{ color: '#94a3b8' }}>下のボタンで再読み込みしてください。繰り返す場合は操作内容をお知らせください。</p>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#fca5a5', fontSize: 12 }}>{String(this.state.err && this.state.err.message)}</pre>
          <button onClick={() => this.setState({ err: null })}
            style={{ marginRight: 8, padding: '6px 14px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 6 }}>
            復帰
          </button>
          <button onClick={() => window.location.reload()}
            style={{ padding: '6px 14px', background: '#334155', color: '#fff', border: 'none', borderRadius: 6 }}>
            再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BendingSimulator />
    </ErrorBoundary>
  </React.StrictMode>
);
