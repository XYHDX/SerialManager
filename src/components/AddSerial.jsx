import React, { useState } from 'react';

const AddSerial = ({ onAddBatch }) => {
  const [input, setInput] = useState('');
  const [message, setMessage] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Parse input: split by newlines, trim, and filter empties
    const lines = input.split(/\r?\n/);
    const serialsToAdd = lines
      .map(line => {
        // Remove leading numbers/whitespace (e.g., "1  ABC" -> "ABC")
        // Regex: start of line, optional digits, optional dot/space, capture rest
        let match = line.match(/^[\d\.\s]*(.*)$/);
        let content = match ? match[1].trim() : line.trim();

        // Remove common " (duplicate)" comments or similar parentheticals if they are at the end
        // This helps when users paste annotated lists
        content = content.replace(/\s*\(duplicate\)$/i, '').trim();

        return content;
      })
      .filter(s => s.length > 0);

    if (serialsToAdd.length === 0) return;

    const result = onAddBatch(serialsToAdd);

    // Feedback message
    if (result.added > 0) {
      const dupMsg = result.duplicates > 0 ? ` (${result.duplicates} duplicates skipped)` : '';
      setMessage({
        type: 'success',
        text: `Successfully added ${result.added} serials${dupMsg}!`
      });
      setInput(''); // Clear input on success
    } else if (result.duplicates > 0) {
      setMessage({
        type: 'error',
        text: `All ${result.duplicates} serials were duplicates.`
      });
    } else {
      setMessage({ type: 'error', text: 'No valid serials found.' });
    }

    // Clear message after 5 seconds
    setTimeout(() => setMessage(null), 5000);
  };

  return (
    <div className="card fade-in">
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Batch Add Serials</h2>
      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label htmlFor="serial-input" className="input-label">Enter Serials (One per line)</label>
          <textarea
            id="serial-input"
            className="input-field"
            placeholder={`1  LB42836549R\n2  MF71554741C\n...`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ minHeight: '300px', fontFamily: 'monospace', resize: 'vertical' }}
            autoFocus
          />
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Paste your list directly. Leading numbers (e.g., "1 ") are automatically removed.
          </p>
        </div>
        <button type="button" className="btn" onClick={handleSubmit}>
          Process Batch
        </button>
      </form>

      {message && (
        <div className={`result-box ${message.type === 'success' ? 'result-success' : 'result-error'}`}>
          {message.text}
        </div>
      )}
    </div>
  );
};

export default AddSerial;
