import { useState } from 'react';
import type { Poll, PollStatus } from '../types/poll';
import '../styles/Polls.css';

type PollCardProps = {
  poll: Poll;
  status: PollStatus;
  isEncryptionReady: boolean;
  isConnected: boolean;
  pendingKey?: string;
  decryptedPreview?: number[];
  onVote: (pollId: number, optionIdx: number) => Promise<void>;
  onFinalize: (pollId: number) => Promise<void>;
  onDecrypt: (pollId: number) => Promise<void>;
  onPublish: (pollId: number) => Promise<void>;
};

const STATUS_LABELS: Record<PollStatus, string> = {
  upcoming: 'Upcoming',
  active: 'Active',
  awaitingFinalization: 'Needs finalization',
  finalized: 'Ready for decryption',
  published: 'Published',
};

function shortenAddress(value: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : '';
}

export function PollCard({
  poll,
  status,
  isEncryptionReady,
  isConnected,
  pendingKey,
  decryptedPreview,
  onVote,
  onFinalize,
  onDecrypt,
  onPublish,
}: PollCardProps) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = poll.endTime > now ? Math.max(poll.endTime - now, 0) : 0;

  const showVote = status === 'active';
  const showFinalize = status === 'awaitingFinalization';
  const showDecrypt = poll.finalized && !poll.resultsPublished;
  const showPublish = Boolean(decryptedPreview) && !poll.resultsPublished;
  const resultsSource = poll.resultsPublished ? poll.results : decryptedPreview ?? [];

  const disableVote =
    !isConnected ||
    !isEncryptionReady ||
    poll.userHasVoted ||
    pendingKey === `vote-${poll.id}` ||
    selectedOption === null;

  const pendingFinalize = pendingKey === `finalize-${poll.id}`;
  const pendingDecrypt = pendingKey === `decrypt-${poll.id}`;
  const pendingPublish = pendingKey === `publish-${poll.id}`;

  return (
    <div className="poll-card">
      <div className="poll-header">
        <div>
          <div className="poll-title">{poll.name}</div>
          <p className="poll-description">{poll.description || 'No description provided.'}</p>
        </div>
        <span
          className={`status-pill ${
            status === 'published' ? 'published' : status === 'awaitingFinalization' ? 'awaiting' : ''
          }`}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>

      <div className="poll-meta">
        <span>Creator: {shortenAddress(poll.creator)}</span>
        <span>Starts: {new Date(poll.startTime * 1000).toLocaleString()}</span>
        <span>Ends: {new Date(poll.endTime * 1000).toLocaleString()}</span>
        {status === 'active' && <span>Ends in: {Math.ceil(expiresIn / 60)} mins</span>}
      </div>

      <div className="poll-options">
        {poll.options.map((option, index) => (
          <div
            key={`${poll.id}-option-${index}`}
            className={`poll-option ${selectedOption === index ? 'active' : ''}`}
          >
            {showVote ? (
              <label>
                <input
                  type="radio"
                  name={`poll-${poll.id}`}
                  checked={selectedOption === index}
                  onChange={() => setSelectedOption(index)}
                />
                {option}
              </label>
            ) : (
              <span>{option}</span>
            )}
            {resultsSource[index] !== undefined && (
              <span className="option-count">{resultsSource[index]} votes</span>
            )}
          </div>
        ))}
      </div>

      {poll.userHasVoted && <div className="success-banner">You have already voted in this poll.</div>}
      {!isEncryptionReady && (
        <div className="error-banner">Encryption service is initializing. Voting and decrypting are unavailable.</div>
      )}

      <div className="action-row">
        {showVote && (
          <button
            className="action-button primary"
            type="button"
            disabled={disableVote}
            onClick={() => selectedOption !== null && onVote(poll.id, selectedOption)}
          >
            {pendingKey === `vote-${poll.id}` ? 'Submitting...' : 'Submit vote'}
          </button>
        )}
        {showFinalize && (
          <button
            className="action-button secondary"
            type="button"
            disabled={pendingFinalize}
            onClick={() => onFinalize(poll.id)}
          >
            {pendingFinalize ? 'Finalizing...' : 'Finalize poll'}
          </button>
        )}
        {showDecrypt && (
          <button
            className="action-button secondary"
            type="button"
            disabled={pendingDecrypt || !isEncryptionReady}
            onClick={() => onDecrypt(poll.id)}
          >
            {pendingDecrypt ? 'Decrypting...' : 'Decrypt results'}
          </button>
        )}
        {showPublish && (
          <button
            className="action-button primary"
            type="button"
            disabled={pendingPublish}
            onClick={() => onPublish(poll.id)}
          >
            {pendingPublish ? 'Publishing...' : 'Publish to chain'}
          </button>
        )}
      </div>

      {resultsSource.length > 0 && (
        <div className="results-grid">
          {poll.options.map((label, idx) => (
            <span className="result-chip" key={`${poll.id}-result-${idx}`}>
              {label}: {resultsSource[idx] ?? 0} votes
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
