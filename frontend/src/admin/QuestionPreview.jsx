import React, { useMemo, useState } from 'react';
import { QuestionStep } from '../guest/FeedbackFlow.jsx';
import { guestPalette, paletteStyle } from '../guest/colors.js';
import { detailFieldFor, emptyAnswers } from '../guest/flow.js';

// Die Vorschau zeigt den echten Schritt der Gästeseite, nicht eine Nachbildung davon:
// dieselbe Komponente, dasselbe CSS, dieselbe Markenfarbe. Damit kann sie nicht
// auseinanderlaufen, wenn sich die Gästeseite ändert.
// Sie ist bedienbar — wer hier tippt, sieht genau das, was ein Gast sehen wird.
export function QuestionPreview({ question, brandColor, texts = {}, theme = 'light' }) {
  const palette = useMemo(() => guestPalette(brandColor, theme), [brandColor, theme]);
  const [state, setState] = useState(() => emptyAnswers());

  const step = useMemo(() => ({
    id: `preview:${question?.internal_name || 'frage'}`,
    kind: 'question',
    question,
    detailField: detailFieldFor(question)
  }), [question]);

  function setAnswer(target, value) {
    setState((current) => ({ ...current, answers: { ...current.answers, [target.internal_name]: value } }));
  }

  return <div
    className="builder-phone mx-auto w-full max-w-[320px] overflow-hidden rounded-[2rem] border-8 border-neutral-900 bg-neutral-900 shadow-xl"
    // Die Vorschau spricht niemanden an; der Bildschirmleser liest die Karte daneben.
    aria-hidden="true"
  >
    <div className="h-[560px] overflow-y-auto">
      <div className="guest" data-theme={theme} lang="de" style={paletteStyle(palette)}>
        <main className="guest-screen">
          <QuestionStep
            step={step}
            state={state}
            texts={texts}
            title={(text) => <h1 id="guest-step-title" className="guest-question">{text || 'Deine Frage erscheint hier'}</h1>}
            onAnswer={setAnswer}
            onChoose={setAnswer}
            onUpdate={(patch) => setState((current) => ({ ...current, ...patch }))}
            onEnter={() => {}}
          />
        </main>
      </div>
    </div>
  </div>;
}
