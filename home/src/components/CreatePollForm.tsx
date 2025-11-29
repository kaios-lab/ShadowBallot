import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import '../styles/Forms.css';

type PollDraft = {
  name: string;
  description: string;
  startTime: number;
  endTime: number;
  options: string[];
};

type CreatePollFormProps = {
  onCreate: (draft: PollDraft) => Promise<void>;
  isSubmitting: boolean;
  disabled: boolean;
};

export function CreatePollForm({ onCreate, isSubmitting, disabled }: CreatePollFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [error, setError] = useState<string | null>(null);

  const canAddOption = options.length < 4;
  const canRemoveOption = options.length > 2;

  const formattedStart = useMemo(() => startInput, [startInput]);
  const formattedEnd = useMemo(() => endInput, [endInput]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;

    const trimmedOptions = options.map((opt) => opt.trim()).filter((opt) => opt.length > 0);
    if (trimmedOptions.length < 2 || trimmedOptions.length !== options.length) {
      setError('Please provide between two and four option labels.');
      return;
    }

    const startTimestamp = Math.floor(new Date(startInput).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(endInput).getTime() / 1000);

    if (!startTimestamp || !endTimestamp || Number.isNaN(startTimestamp) || Number.isNaN(endTimestamp)) {
      setError('Both start and end dates are required.');
      return;
    }

    if (endTimestamp <= startTimestamp) {
      setError('The end time must be greater than the start time.');
      return;
    }

    if (startTimestamp < Math.floor(Date.now() / 1000)) {
      setError('Please schedule the poll in the future.');
      return;
    }

    setError(null);
    await onCreate({
      name: name.trim(),
      description: description.trim(),
      startTime: startTimestamp,
      endTime: endTimestamp,
      options: trimmedOptions,
    });
  };

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => prev.map((opt, idx) => (idx === index ? value : opt)));
  };

  const removeOption = (index: number) => {
    if (!canRemoveOption) return;
    setOptions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const addOption = () => {
    if (!canAddOption) return;
    setOptions((prev) => [...prev, '']);
  };

  return (
    <form className="section-card form-card" onSubmit={handleSubmit}>
      <div>
        <p className="form-heading">Create a Poll</p>
        <p className="muted-text">
          Configure a new encrypted ballot with 2-4 options and a start/end schedule.
        </p>
      </div>

      <div className="form-field">
        <label htmlFor="poll-name">Title</label>
        <input
          id="poll-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="DAO budget vote"
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="poll-description">Description</label>
        <textarea
          id="poll-description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Provide helpful context for voters..."
        />
      </div>

      <div className="grid-two-column">
        <div className="form-field">
          <label htmlFor="start-time">Start time</label>
          <input
            id="start-time"
            type="datetime-local"
            value={formattedStart}
            onChange={(event) => setStartInput(event.target.value)}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="end-time">End time</label>
          <input
            id="end-time"
            type="datetime-local"
            value={formattedEnd}
            onChange={(event) => setEndInput(event.target.value)}
            required
          />
        </div>
      </div>

      <div className="form-field">
        <label>Options</label>
        <div className="options-grid">
          {options.map((option, index) => (
            <div key={`option-${index}`} className="option-input">
              <input
                value={option}
                onChange={(event) => updateOption(index, event.target.value)}
                placeholder={`Option ${index + 1}`}
                required
              />
              {canRemoveOption && (
                <button type="button" onClick={() => removeOption(index)}>
                  remove
                </button>
              )}
            </div>
          ))}
        </div>
        {canAddOption && (
          <button type="button" className="add-option-btn" onClick={addOption}>
            + Add option
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <button
        className="submit-button"
        type="submit"
        disabled={isSubmitting || disabled}
      >
        {isSubmitting ? 'Submitting...' : 'Create poll'}
      </button>
    </form>
  );
}
