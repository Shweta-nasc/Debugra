/**
 * AIResponsePanel
 * Renders the AI output panel — handles loading, empty state, and all
 * response types: error explanation, fix, logic breakdown, trace, tests, complexity.
 */
export default function AIResponsePanel({ isLoading, response: rawResponse, onApplyFix }) {
  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <span className="spinner" style={{ width: '24px', height: '24px', borderWidth: '3px' }} />
        <p style={{ color: 'var(--text-2)', marginTop: '12px', fontSize: '0.8rem' }}>AI is analyzing...</p>
      </div>
    );
  }

  if (!rawResponse) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-2)' }}>
        <p style={{ fontSize: '0.85rem' }}>AI Assistant</p>
        <p style={{ fontSize: '0.72rem', marginTop: '8px' }}>Use toolbar: Tests, Visualize, Explain, Fix</p>
      </div>
    );
  }

  
  const response = rawResponse.content || rawResponse;
  const usage = rawResponse.usage;

  return (
    <div>
      {response.issue && (
        <div className="ai-card error">
          <div className="ai-card-label">Issue</div>
          <div className="ai-card-content">{response.issue}</div>
        </div>
      )}
      {response.explanation && (
        <div className="ai-card info">
          <div className="ai-card-label">Explanation</div>
          <div className="ai-card-content">{response.explanation}</div>
        </div>
      )}
      {response.fix && (
        <div className="ai-card success">
          <div className="ai-card-label">Fix</div>
          <div className="ai-card-content">{response.fix}</div>
        </div>
      )}
      {response.fixedCode && (
        <div className="ai-card">
          <div className="ai-card-label d-flex align-items-center justify-content-between" style={{ color: 'var(--green)' }}>
            <span>Fixed Code</span>
            {onApplyFix && (
              <button 
                onClick={() => onApplyFix(response.fixedCode)}
                style={{ background: 'var(--green)', color: '#fff', border: 'none', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
              >
                Apply Solution
              </button>
            )}
          </div>
          <pre style={{ fontSize: '0.75rem', color: 'var(--text-0)', whiteSpace: 'pre-wrap', fontFamily: "'JetBrains Mono', monospace", marginTop: '8px' }}>
            {response.fixedCode}
          </pre>
        </div>
      )}
      {Array.isArray(response.steps) && (
        <div style={{ marginBottom: '10px' }}>
          <div className="ai-card-label" style={{ color: 'var(--accent)', marginBottom: '8px', fontSize: '0.7rem' }}>
            ⟡ Execution Trace ({response.steps.length} steps)
          </div>
          {response.steps.map((step, i) => {
            const isString = typeof step === 'string';
            const desc = isString ? step : (step.description || step.explanation || step.action || '');
            const line = isString ? null : step.line;
            const stepCode = isString ? null : step.code;
            const vars = isString ? null : step.variables;
            return (
              <div key={i} className="ai-card" style={{ padding: '8px 10px', marginBottom: '6px', borderLeftColor: 'var(--accent)', borderLeftWidth: '3px' }}>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                  {line && <span style={{ fontSize: '0.62rem', color: 'var(--text-2)', fontFamily: "'JetBrains Mono', monospace" }}>Line {line}</span>}
                </div>
                {stepCode && <pre style={{ fontSize: '0.72rem', color: 'var(--yellow)', fontFamily: "'JetBrains Mono', monospace", margin: '4px 0', padding: '4px 8px', background: 'var(--bg-0)', borderRadius: '3px', whiteSpace: 'pre-wrap' }}>{stepCode}</pre>}
                {desc && <div className="ai-card-content" style={{ fontSize: '0.72rem' }}>{desc}</div>}
                {vars && (
                  <div style={{ marginTop: '4px', padding: '4px 8px', background: 'rgba(78,201,176,0.08)', borderRadius: '3px', border: '1px solid rgba(78,201,176,0.15)' }}>
                    <span style={{ fontSize: '0.6rem', color: 'var(--green)', fontWeight: 600 }}>Variables: </span>
                    <code style={{ fontSize: '0.68rem', color: 'var(--yellow)', fontFamily: "'JetBrains Mono', monospace" }}>
                      {typeof vars === 'string' ? vars : Object.entries(vars).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(', ')}
                    </code>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {Array.isArray(response.testCases) && response.testCases.map((tc, i) => (
        <div key={i} className="ai-card">
          <div className="ai-card-label" style={{ color: 'var(--green)' }}>
            Test {i + 1} <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>({tc.type || 'normal'})</span>
          </div>
          <div className="ai-card-content">
            <div>Input: <code style={{ color: 'var(--text-0)' }}>{tc.input}</code></div>
            <div>Expected: <code style={{ color: 'var(--green)' }}>{tc.expected}</code></div>
            {tc.description && <div style={{ marginTop: '4px', color: 'var(--text-2)' }}>{tc.description}</div>}
          </div>
        </div>
      ))}
      {(response.complexity || response.timeComplexity) && (
        <div className="ai-card info">
          <div className="ai-card-label">Complexity</div>
          <div className="ai-card-content">
            Time: <strong style={{ color: 'var(--text-0)' }}>{response.complexity?.time || response.timeComplexity || 'N/A'}</strong>
            {' | '}
            Space: <strong style={{ color: 'var(--text-0)' }}>{response.complexity?.space || response.spaceComplexity || 'N/A'}</strong>
          </div>
        </div>
      )}
      {response.summary && (
        <div className="ai-card" style={{ borderColor: 'rgba(78,201,176,0.3)' }}>
          <div className="ai-card-label" style={{ color: 'var(--green)' }}>Summary</div>
          <div className="ai-card-content">{response.summary}</div>
        </div>
      )}
      {response.bestPractice && (
        <div className="ai-card" style={{ borderColor: 'rgba(220,220,170,0.3)' }}>
          <div className="ai-card-label" style={{ color: 'var(--yellow)' }}>✦ Best Practice</div>
          <div className="ai-card-content">{response.bestPractice}</div>
        </div>
      )}
      {usage && (
        <div style={{ 
          marginTop: '15px', 
          paddingTop: '10px', 
          borderTop: '1px solid rgba(255,255,255,0.1)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          fontSize: '0.7rem', 
          color: 'var(--text-2)', 
          fontFamily: "'JetBrains Mono', monospace" 
        }}>
          <span>⚡ Tokens: {usage.total_tokens || 0}</span>
          <span>🚀 Speed: {usage.completion_time ? Math.round(usage.completion_tokens / usage.completion_time) : 0} T/s</span>
          <span>💰 Cost: ${(usage.total_tokens * 0.0000005).toFixed(6)}</span>
        </div>
      )}
    </div>
  );
}
