import React from 'react';
import { ProductCredit } from '../lib/credit.jsx';

// What happens with the data of a guest. The text comes from the backend, which
// writes it from the settings of the organization, so page and software stay in step.
export function PrivacyPage({ page, credit = null }) {
  const { organization, controller, ownText, sections = [] } = page;
  return <section className="guest-step guest-privacy">
    {organization?.name && <p className="guest-waiting-kicker">{organization.name}</p>}
    <h1 className="guest-question">Datenschutz</h1>
    <p className="guest-help">Hier steht, was passiert, wenn du den Code scannst und uns etwas zurückmeldest.</p>

    {!controller?.complete && <p className="guest-preview" role="status">
      Die Angaben zur verantwortlichen Stelle fehlen noch. Diese Seite ist damit unvollständig.
    </p>}

    {ownText && <p className="guest-privacy-own">{ownText}</p>}

    {sections.map((section) => <article key={section.id} className="guest-privacy-part">
      <h2>{section.title}</h2>
      {(section.paragraphs || []).map((text, index) => (
        <p key={index} className="guest-privacy-text">{text}</p>
      ))}
      {(section.items || []).length > 0 && <ul className="guest-privacy-list">
        {section.items.map((item, index) => <li key={index}>{item}</li>)}
      </ul>}
    </article>)}

    <ProductCredit credit={credit} />
  </section>;
}
