import React, { useState } from 'react';

const SCENARIO_STEPS = [
  {
    key: 'players',
    question: 'How many players?',
    type: 'number',
    min: 1,
    max: 12,
    default: 4
  },
  {
    key: 'experience',
    question: 'Experience level of the group?',
    type: 'select',
    options: [
      { value: 'newbies', label: 'New to board games', description: 'Light, easy to learn games' },
      { value: 'mixed', label: 'Mixed group', description: 'Some experienced, some new' },
      { value: 'enthusiasts', label: 'Board game enthusiasts', description: 'Bring on the complexity!' }
    ],
    default: 'mixed'
  },
  {
    key: 'duration',
    question: 'How much time do you have?',
    type: 'select',
    options: [
      { value: 30, label: 'Quick game (30 min)' },
      { value: 60, label: 'About an hour' },
      { value: 90, label: '1-2 hours' },
      { value: 120, label: '2+ hours' },
      { value: 180, label: 'Epic session (3+ hours)' }
    ],
    default: 90
  },
  {
    key: 'mood',
    question: 'What\'s the mood?',
    type: 'select',
    options: [
      { value: 'thinky', label: 'Thinky', description: 'Strategic, brain-burning puzzles' },
      { value: 'social', label: 'Social', description: 'Party games, negotiation, bluffing' },
      { value: 'chaotic', label: 'Chaotic', description: 'Wild, unpredictable fun' },
      { value: 'chill', label: 'Chill', description: 'Relaxed, low-stress games' }
    ],
    default: 'social'
  },
  {
    key: 'cooperative',
    question: 'Competitive or cooperative?',
    type: 'select',
    options: [
      { value: false, label: 'Competitive', description: 'Every player for themselves!' },
      { value: true, label: 'Cooperative', description: 'Work together as a team' },
      { value: null, label: 'Either', description: 'No preference' }
    ],
    default: null
  }
];

function ScenarioWizard({ onComplete, onCancel, initialScenario }) {
  const [currentStep, setCurrentStep] = useState(0);
  // When starting fresh (no initialScenario), don't pre-select choices
  // Only players has a default since it uses a number input
  const [scenario, setScenario] = useState(initialScenario || {
    players: 4,
    experience: undefined,
    duration: undefined,
    mood: undefined,
    cooperative: undefined
  });

  const step = SCENARIO_STEPS[currentStep];
  const isLastStep = currentStep === SCENARIO_STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  const handleValueChange = (value) => {
    setScenario(prev => ({
      ...prev,
      [step.key]: value
    }));
  };

  // Check if current step has a valid selection
  const hasSelection = () => {
    const value = scenario[step.key];
    if (step.type === 'number') return value !== undefined;
    // For select, undefined means no selection made
    return value !== undefined;
  };

  const handleNext = () => {
    if (!hasSelection()) return; // Don't proceed without selection
    
    if (isLastStep) {
      onComplete(scenario);
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const renderInput = () => {
    if (step.type === 'number') {
      return (
        <div className="scenario-number-input">
          <button 
            className="scenario-number-btn"
            onClick={() => handleValueChange(Math.max(step.min, scenario[step.key] - 1))}
            disabled={scenario[step.key] <= step.min}
          >
            −
          </button>
          <span className="scenario-number-value">{scenario[step.key]}</span>
          <button 
            className="scenario-number-btn"
            onClick={() => handleValueChange(Math.min(step.max, scenario[step.key] + 1))}
            disabled={scenario[step.key] >= step.max}
          >
            +
          </button>
        </div>
      );
    }

    if (step.type === 'select') {
      const currentValue = scenario[step.key];
      return (
        <div className="scenario-options">
          {step.options.map(option => {
            // Handle null/boolean comparisons properly
            const isSelected = currentValue === option.value || 
              (currentValue === null && option.value === null) ||
              (typeof currentValue === 'boolean' && currentValue === option.value);
            
            return (
              <button
                key={String(option.value)}
                className={`scenario-option ${isSelected ? 'selected' : ''}`}
                onClick={() => handleValueChange(option.value)}
              >
                <span className="option-check">{isSelected ? '✓' : ''}</span>
                <div className="option-content">
                  <span className="option-label">{option.label}</span>
                  {option.description && (
                    <span className="option-description">{option.description}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="scenario-wizard">
      <div className="scenario-progress">
        {SCENARIO_STEPS.map((s, i) => (
          <div 
            key={s.key} 
            className={`progress-dot ${i <= currentStep ? 'active' : ''} ${i < currentStep ? 'completed' : ''}`}
          />
        ))}
      </div>

      <h3 className="scenario-question">{step.question}</h3>
      
      {renderInput()}

      <div className="scenario-actions">
        {!isFirstStep && (
          <button className="scenario-btn secondary" onClick={handleBack}>
            Back
          </button>
        )}
        <button className="scenario-btn secondary" onClick={onCancel}>
          Cancel
        </button>
        <button 
          className="scenario-btn primary" 
          onClick={handleNext}
          disabled={!hasSelection()}
        >
          {isLastStep ? 'Apply Filters' : 'Next'}
        </button>
      </div>
    </div>
  );
}

export default ScenarioWizard;

