import { ArrowRight, Github, Megaphone } from "lucide-react";
import { Link } from "react-router";
import "./landing.css";

const capabilities = [
  {
    title: "Call for papers",
    body: "Create submission forms with conditional fields, file uploads, participant roles, and category-based routing.",
  },
  {
    title: "Review and selection",
    body: "Assign reviewers, define weighted criteria, run multiple rounds, and use optional AI assistance when it helps.",
  },
  {
    title: "Speaker onboarding",
    body: "Give every speaker a private portal for biographies, headshots, slides, agreements, tasks, and resources.",
  },
  {
    title: "Communications",
    body: "Send decisions, reminders, and branded email templates with portable .ics invitations and optional calendar sync.",
  },
  {
    title: "Agenda planning",
    body: "Build the programme across days, rooms, and tracks while Open Session catches scheduling conflicts for you.",
  },
  {
    title: "Public programme",
    body: "Publish a mobile-friendly schedule, speaker directory, and personal itinerary on their own or inside your website.",
  },
];

const teams = [
  ["Organizers", "Manage the programme from one workspace."],
  ["Reviewers", "Score assigned proposals without the noise."],
  ["Speakers", "Complete every request from one private link."],
  ["Attendees", "Browse the programme on any screen."],
];

export function LandingPage() {
  return (
    <div className="open-landing">
      <header className="open-nav">
        <Link to="/" className="open-wordmark" aria-label="Open Session home">
          <span className="open-wordmark__mark" aria-hidden="true"><Megaphone /></span>
          <span>Open Session</span>
        </Link>

        <nav className="open-nav__links" aria-label="Main navigation">
          <a href="#product">Product</a>
          <a href="https://open-session.mintlify.site/introduction">Documentation</a>
          <a href="https://github.com/AjayK47/Open-session" target="_blank" rel="noreferrer">GitHub</a>
        </nav>

        <div className="open-nav__actions">
          <Link to="/login" className="open-link">Sign in</Link>
          <Link to="/login" className="open-button open-button--small">Get started</Link>
        </div>
      </header>

      <main>
        <section className="open-hero" aria-labelledby="open-hero-title">
          <div className="open-hero__copy">
            <p className="open-eyebrow">Free and open-source conference software</p>
            <h1 id="open-hero-title">Run your entire speaker programme in one place.</h1>
            <p className="open-hero__lede">
              Open Session brings calls for papers, reviews, speaker onboarding,
              communications, scheduling, and your public agenda into one workspace.
            </p>
            <div className="open-actions">
              <Link to="/login" className="open-button">Start using Open Session <ArrowRight /></Link>
              <a className="open-text-link" href="https://github.com/AjayK47/Open-session" target="_blank" rel="noreferrer">
                <Github /> View source
              </a>
            </div>
            <p className="open-hero__note">Self-host it. Keep your data. Pay no licence fee.</p>
          </div>

          <aside className="open-hero__audience" aria-label="Who Open Session is for">
            <p>One system for the whole programme</p>
            <dl>
              {teams.map(([team, description]) => (
                <div key={team}>
                  <dt>{team}</dt>
                  <dd>{description}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </section>

        <section className="open-band" aria-label="Open Session workflow">
          <div>
            <p>From the first proposal to the published programme — one record, no re-entry.</p>
          </div>
        </section>

        <section id="product" className="open-product" aria-labelledby="open-product-title">
          <header className="open-section-head">
            <div>
              <p className="open-eyebrow">The product</p>
              <h2 id="open-product-title">Less admin between submission and stage.</h2>
            </div>
            <p>
              Stop moving the same information between forms, spreadsheets, folders,
              inboxes, and scheduling tools. Each proposal becomes the single record
              your team works from throughout the event.
            </p>
          </header>

          <div className="open-capabilities">
            {capabilities.map((capability) => (
              <article key={capability.title}>
                <h3>{capability.title}</h3>
                <p>{capability.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="open-details" aria-label="How Open Session helps">
          <article>
            <p className="open-details__label">Collect and decide</p>
            <div>
              <h2>A better process for choosing the programme.</h2>
              <p>
                Ask the right questions with conditional submission forms, then route
                proposals to the right reviewers. Structured criteria, blind review,
                multiple rounds, and clear assignment progress keep decisions consistent.
              </p>
            </div>
          </article>

          <article>
            <p className="open-details__label">Prepare every speaker</p>
            <div>
              <h2>No more chasing biographies across email threads.</h2>
              <p>
                Speakers update their own profile and complete the tasks you assign.
                Your team sees what is ready, what is missing, and who needs a reminder
                without maintaining another spreadsheet.
              </p>
            </div>
          </article>

          <article>
            <p className="open-details__label">Schedule and publish</p>
            <div>
              <h2>Build once. Keep every view in sync.</h2>
              <p>
                Arrange sessions by day, room, or track and resolve conflicts before
                publishing. The same programme powers your public schedule, speaker
                gallery, and attendee itinerary.
              </p>
            </div>
          </article>
        </section>

        <section className="open-source" aria-labelledby="open-source-title">
          <div>
            <p className="open-eyebrow">Open source, not a trial</p>
            <h2 id="open-source-title">Own the software and the data behind your event.</h2>
          </div>
          <div>
            <p>
              Deploy Open Session on your own infrastructure, inspect every line of code,
              and extend it through the API. The core product stays useful without a
              proprietary integration or paid platform account.
            </p>
            <div className="open-actions">
              <a className="open-button open-button--light" href="https://github.com/AjayK47/Open-session" target="_blank" rel="noreferrer">
                <Github /> Explore the repository
              </a>
              <a className="open-text-link open-text-link--light" href="https://open-session.mintlify.site/introduction">
                Read the documentation <ArrowRight />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="open-footer">
        <Link to="/" className="open-wordmark"><span>Open Session</span></Link>
        <p>Open-source conference programme management.</p>
        <nav aria-label="Footer navigation">
          <a href="https://open-session.mintlify.site/introduction">Documentation</a>
          <a href="https://github.com/AjayK47/Open-session" target="_blank" rel="noreferrer">GitHub</a>
          <Link to="/login">Sign in</Link>
        </nav>
      </footer>
    </div>
  );
}
