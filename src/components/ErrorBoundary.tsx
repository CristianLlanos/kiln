import { Component, type ReactNode } from 'react'
import { Button } from './Button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Top-level error boundary that catches React rendering crashes.
 * Shows a full-screen error screen with a restart button.
 * Session history in the view is lost (React tree crashed), but
 * this prevents a blank white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Kiln crashed:', error, info.componentStack)
  }

  handleRestart = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-bg text-text-primary select-none">
          <div className="flex flex-col items-center max-w-md text-center px-6">
            <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center mb-6">
              <span className="text-error text-xl">!</span>
            </div>
            <h1 className="text-lg font-semibold mb-2">
              Kiln encountered an error
            </h1>
            <p className="text-sm text-text-secondary mb-1">
              Something went wrong and the interface crashed.
            </p>
            {this.state.error && (
              <p className="text-xs text-text-secondary/60 font-mono mb-6 break-all">
                {this.state.error.message}
              </p>
            )}
            <Button
              onClick={this.handleRestart}
              className="px-5"
            >
              Restart
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
