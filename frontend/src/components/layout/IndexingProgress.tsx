import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';
import { getIndexStatus } from '../../api';
import './IndexingProgress.css';

export type IndexingOperation = 'index' | 'reindex';

interface IndexingProgressProps {
  jobId: string;
  operation?: IndexingOperation;
  onComplete: () => void;
  onDismiss: () => void;
}

// Per-operation copy used by the toast at each lifecycle stage. Adding a new
// operation type only requires adding an entry here.
const COPY: Record<IndexingOperation, Record<'queued' | 'processing' | 'completed' | 'failed', string>> = {
  index: {
    queued: 'Queued for indexing…',
    processing: 'Indexing files',
    completed: 'Indexing complete',
    failed: 'Indexing failed',
  },
  reindex: {
    queued: 'Queued for re-indexing…',
    processing: 'Re-indexing files',
    completed: 'Re-index complete',
    failed: 'Re-index failed',
  },
};

const AUTO_DISMISS_MS = 5000;

export const IndexingProgress: React.FC<IndexingProgressProps> = ({ jobId, operation = 'index', onComplete, onDismiss }) => {
  const [status, setStatus] = useState<'queued' | 'processing' | 'completed' | 'failed'>('queued');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onDismissRef = useRef(onDismiss);
  const hasCalledOnCompleteRef = useRef(false);

  // Keep refs updated so the polling and auto-dismiss effects don't capture stale handlers.
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let isMounted = true;

    const checkStatus = async () => {
      if (!isMounted) return;
      
      try {
        const response = await getIndexStatus(jobId);
        
        if (!isMounted) return;
        
        setStatus(response.status);
        setProgress(response.progress);
        
        if (response.error) {
          setError(response.error);
        }

        if (response.status === 'completed') {
          if (!hasCalledOnCompleteRef.current) {
            hasCalledOnCompleteRef.current = true;
            onCompleteRef.current();
          }
          // Stop polling when completed
          return;
        } else if (response.status === 'failed') {
          // Keep failure state visible, no longer polling
          return;
        } else {
          // If still queued or processing, poll again in 1.5 seconds
          timeoutId = setTimeout(checkStatus, 1500);
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('Failed to get indexing status:', err);
        setError('Lost connection to indexing service.');
        setStatus('failed');
      }
    };

    checkStatus();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [jobId]);

  // Auto-dismiss the toast 5 seconds after the job reaches a terminal state.
  // Failures auto-dismiss too — if the user wants to investigate they can read
  // the message during the 5s window or check the docker logs.
  useEffect(() => {
    if (status !== 'completed' && status !== 'failed') return;
    const t = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [status]);

  const copy = COPY[operation];
  const titleText =
    status === 'processing'
      ? `${copy.processing} (${Math.round(progress)}%)`
      : copy[status];

  return (
    <div className="indexing-progress-toast">
      <div className="toast-header">
        <div className="toast-title">
          {status === 'completed' && <CheckCircle2 size={18} className="text-success" />}
          {status === 'failed' && <AlertCircle size={18} className="text-error" />}
          {(status === 'queued' || status === 'processing') && <Loader2 size={18} className="animate-spin text-accent" />}
          <h3>{titleText}</h3>
        </div>
        <button className="dismiss-btn" onClick={onDismiss} aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>

      {(status === 'queued' || status === 'processing') && (
        <div className="progress-bar-container">
          <div 
            className="progress-bar-fill" 
            style={{ width: `${progress}%`, transition: 'width 0.5s ease-out' }} 
          />
        </div>
      )}

      {error && (
        <div className="toast-error-message">
          {error}
        </div>
      )}
    </div>
  );
};
