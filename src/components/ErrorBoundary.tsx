import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center bg-slate-50 rounded-2xl border border-slate-200">
          <div className="p-4 bg-red-50 text-red-600 rounded-full mb-4">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Ups! Terjadi kesalahan sistem</h3>
          <p className="text-slate-500 text-sm mt-2 max-w-md">
            Aplikasi mengalami kendala teknis saat memuat modul ini. Kami mendeteksi adanya ketidakstabilan rendering.
          </p>
          <div className="mt-4 p-3 bg-slate-100 rounded text-left font-mono text-xs text-slate-600 max-w-lg overflow-x-auto">
            {this.state.error?.toString()}
          </div>
          <button
            onClick={this.handleReset}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm transition-all shadow-sm cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Muat Ulang Aplikasi
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
