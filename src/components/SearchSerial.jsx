import React, { useState, useEffect, useRef } from 'react';

const SearchSerial = ({ onCheck, serials = [] }) => {
    const [query, setQuery] = useState('');
    const [result, setResult] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const wrapperRef = useRef(null);

    // Filter suggestions when query changes
    useEffect(() => {
        if (query.trim().length > 0) {
            const matches = serials
                .filter(s => s.toLowerCase().startsWith(query.toLowerCase())) // Case-insensitive match
                .slice(0, 5); // Limit to top 5
            setSuggestions(matches);
            setShowSuggestions(true);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    }, [query, serials]);

    // Handle click outside to close suggestions
    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);

    const handleSearch = (e) => {
        // If e is present (form submission), prevent default
        if (e) e.preventDefault();
        if (!query.trim()) return;

        setShowSuggestions(false); // Hide suggestions on search
        const exists = onCheck(query.trim());
        setResult({
            found: exists,
            query: query.trim()
        });
    };

    const handleSuggestionClick = (suggestion) => {
        setQuery(suggestion);
        setShowSuggestions(false);

        // Auto-search when clicking a suggestion
        const exists = onCheck(suggestion);
        setResult({
            found: exists,
            query: suggestion
        });
    };

    return (
        <div className="card fade-in">
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Search Serial</h2>
            <form onSubmit={handleSearch}>
                <div className="input-group" ref={wrapperRef}>
                    <label htmlFor="search-input" className="input-label">Enter Serial</label>
                    <input
                        id="search-input"
                        type="text"
                        className="input-field"
                        placeholder="Type query..."
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            if (result) setResult(null); // Clear result on typing
                        }}
                        autoComplete="off"
                    />

                    {showSuggestions && suggestions.length > 0 && (
                        <ul className="suggestions-list">
                            {suggestions.map((suggestion, index) => (
                                <li
                                    key={index}
                                    className="suggestion-item"
                                    onClick={() => handleSuggestionClick(suggestion)}
                                >
                                    <span className="suggestion-match">{query}</span>
                                    {suggestion.slice(query.length)}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <button type="button" className="btn" onClick={() => handleSearch()}>
                    Check Availability
                </button>
            </form>

            {result && (
                <div className={`result-box ${result.found ? 'result-success' : 'result-error'}`}>
                    {result.found
                        ? `Verified: "${result.query}" is Valid.`
                        : `Not Found: "${result.query}" does not exist.`}
                </div>
            )}
        </div>
    );
};

export default SearchSerial;
