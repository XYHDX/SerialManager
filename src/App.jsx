import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import SearchSerial from './components/SearchSerial';
import AddSerial from './components/AddSerial';
import UploadReceipts from './components/UploadReceipts';
import DataManagement from './components/DataManagement';
import './index.css';

function App() {
  const [serials, setSerials] = useState([]);
  const [activeTab, setActiveTab] = useState('search');

  // Load serials from API on mount and when changed
  const fetchSerials = async () => {
    try {
      const res = await fetch('/api/serials');
      if (res.ok) {
        const data = await res.json();
        setSerials(data);
      }
    } catch (err) {
      console.error('Failed to load serials:', err);
    }
  };

  useEffect(() => {
    fetchSerials();
  }, []);

  const addSerials = async (newSerialsList) => {
    try {
      const res = await fetch('/api/serials/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serials: newSerialsList })
      });

      if (res.ok) {
        const result = await res.json();
        // Refresh data to show updates in search and data management
        await fetchSerials();
        return {
          added: result.added,
          duplicates: result.duplicates,
          total: serials.length + result.added // Approximate/Client-side view
        };
      } else {
        console.error('Batch add failed');
        return { added: 0, duplicates: 0, error: true };
      }
    } catch (err) {
      console.error('Batch add network error:', err);
      return { added: 0, duplicates: 0, error: true };
    }
  };

  const checkSerial = (query) => {
    return serials.includes(query);
  };

  return (
    <div className="container fade-in">
      <Header />

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          Search Database
        </button>
        <button
          className={`tab ${activeTab === 'add' ? 'active' : ''}`}
          onClick={() => setActiveTab('add')}
        >
          Add New Entry
        </button>
        <button
          className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          Upload Receipts
        </button>
        <button
          className={`tab ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          Manage Data
        </button>
      </div>

      <main>
        {activeTab === 'search' && (
          <SearchSerial onCheck={checkSerial} serials={serials} />
        )}
        {activeTab === 'add' && (
          <AddSerial onAddBatch={addSerials} />
        )}
        {activeTab === 'upload' && (
          <UploadReceipts onUploadComplete={fetchSerials} />
        )}
        {activeTab === 'data' && (
          <DataManagement onDataChanged={fetchSerials} />
        )}
      </main>

      <footer className="serial-count">
        Total Records: {serials.length}
      </footer>
    </div>
  );
}

export default App;
