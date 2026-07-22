import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#0b0c10] text-gray-100 p-8 font-mono">
          <h1 className="text-2xl text-red-500 mb-4">Runtime Error</h1>
          <pre className="bg-[#15161d] p-4 rounded text-sm overflow-auto whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
          <pre className="mt-4 text-xs text-gray-400">
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
