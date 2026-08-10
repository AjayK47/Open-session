import { ArrowRight, Github, Megaphone } from "lucide-react";
import { Link } from "react-router";
import "./landing.css";

/**
 * The hero's schedule strip is illustrative, not live data — it exists to show,
 * not tell, what Open Session actually produces at the end of the pipeline.
 * Session 2 is styled as "happening now" to demonstrate the agenda is a live
 * system, not a static PDF.
 */
const programme = [
  {
    time: "09:00",
    room: "Room A",
    track: "Keynote",
    chip: "var(--track-1)",
    title: "Why your CFP tool shouldn't be a Google Form",
    speaker: "Amara Chen",
    live: false,
  },
  {
    time: "10:15",
    room: "Room B",
    track: "Community",
    chip: "var(--track-3)",
    title: "Reviewing 400 proposals without losing your mind",
    speaker: "Priya Raman",
    live: true,
  },
  {
    time: "11:30",
    room: "Room C",
    track: "Platform",
    chip: "var(--track-6)",
    title: "Scheduling six tracks without a single clash",
    speaker: "Diego Alvarez",
    live: false,
  },
  {
    time: "13:00",
    room: "Room A",
    track: "Product",
    chip: "var(--track-5)",
    title: "What speakers actually want from a portal",
    speaker: "Femi Okafor",
    live: false,
  },
];

const pipeline = [
  {
    title: "Submit",
    body: "A CFP form with conditional fields, file uploads, and category-based routing — no separate form tool bolted on the side.",
  },
  {
    title: "Review",
    body: "Assign reviewers, score against weighted criteria, run multiple rounds, blind the submissions if you want to.",
  },
  {
    title: "Decide",
    body: "Accept or decline with a templated, on-brand email — not the same reply copy-pasted forty times.",
  },
  {
    title: "Onboard",
    body: "Speakers get a private portal for bios, headshots, slides, and every task you assign them.",
  },
  {
    title: "Schedule",
    body: "Drag sessions into rooms and tracks. Double-bookings get caught before you publish, not after.",
  },
  {
    title: "Publish",
    body: "One live agenda, speaker directory, and personal itinerary — on your site or ours.",
  },
];

const roles = [
  { name: "Organizers", chip: "var(--track-1)", body: "Run the whole programme from one workspace, not six tabs." },
  { name: "Reviewers", chip: "var(--track-6)", body: "Score what's assigned. Nothing else shows up in the queue." },
  { name: "Speakers", chip: "var(--track-5)", body: "One link handles every request — bio, slides, tasks, all of it." },
  { name: "Attendees", chip: "var(--track-3)", body: "An agenda that's actually current, on any screen." },
];

export function LandingPage() {
  return (
    <div className="os-landing">
      <header className="os-nav">
        <Link to="/" className="os-wordmark" aria-label="Open Session home">
          <span className="os-wordmark__mark" aria-hidden="true"><Megaphone /></span>
          <span>Open Session</span>
        </Link>

        <nav className="os-nav__links" aria-label="Main navigation">
          <a href="#pipeline">How it works</a>
          <a href="https://open-session.mintlify.site/introduction">Documentation</a>
          <a href="https://github.com/AjayK47/Open-session" target="_blank" rel="noreferrer">GitHub</a>
        </nav>

        <div className="os-nav__actions">
          <Link to="/login" className="os-link">Sign in</Link>
          <Link to="/login" className="os-button os-button--small">Get started</Link>
        </div>
      </header>

      <main>
        <section className="os-hero" aria-labelledby="os-hero-title">
          <p className="os-eyebrow">Open-source · self-hosted</p>
          <h1 id="os-hero-title">Run the whole show, not just the form.</h1>
          <p className="os-hero__lede">
            Open Session replaces the CFP form, the review spreadsheet, the speaker
            email thread, and the scheduling doc with one system you run yourself
            — free, open source, and yours to keep.
          </p>
          <div className="os-actions">
            <Link to="/login" className="os-button">Start using Open Session <ArrowRight /></Link>
            <a className="os-text-link" href="https://github.com/AjayK47/Open-session" target="_blank" rel="noreferrer">
              <Github /> View source
            </a>
          </div>
          <p className="os-hero__note">No per-seat licence. No vendor lock-in. Just software you own.</p>

          <div className="os-strip" aria-label="Example programme built with Open Session">
            <p className="os-strip__label">A programme like the one you'd run</p>
            <ol className="os-strip__list">
              {programme.map((session) => (
                <li key={session.title} className="os-card" style={{ "--chip": session.chip } as React.CSSProperties}>
                  <div className="os-card__meta">
                    <span className="os-card__time">{session.time}</span>
                    <span className="os-card__room">{session.room}</span>
                    {session.live && (
                      <span className="os-card__live">
                        <span className="os-card__live-dot" aria-hidden="true" />
                        Live now
                      </span>
                    )}
                  </div>
                  <p className="os-card__title">{session.title}</p>
                  <div className="os-card__foot">
                    <span className="os-card__track">{session.track}</span>
                    <span className="os-card__speaker">{session.speaker}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="pipeline" className="os-rundown" aria-labelledby="os-rundown-title">
          <header className="os-section-head">
            <p className="os-eyebrow">The pipeline</p>
            <h2 id="os-rundown-title">How a submission becomes a session.</h2>
            <p>Six stages, one record. Nothing gets re-typed on the way from proposal to programme.</p>
          </header>

          <ol className="os-rundown__list">
            {pipeline.map((stage, index) => (
              <li key={stage.title}>
                <span className="os-rundown__num">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{stage.title}</h3>
                  <p>{stage.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="os-roles" aria-labelledby="os-roles-title">
          <header className="os-section-head">
            <p className="os-eyebrow">Four roles, one system</p>
            <h2 id="os-roles-title">Everyone gets their own door.</h2>
          </header>

          <ul className="os-roles__list">
            {roles.map((role) => (
              <li key={role.name}>
                <span className="os-roles__dot" style={{ "--chip": role.chip } as React.CSSProperties} aria-hidden="true" />
                <h3>{role.name}</h3>
                <p>{role.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="os-source" aria-labelledby="os-source-title">
          <div className="os-source__intro">
            <p className="os-eyebrow">Own it, not rent it</p>
            <h2 id="os-source-title">Self-host the whole thing, not just the config.</h2>
          </div>
          <div className="os-source__body">
            <p>
              Every part of Open Session ships as source — the CFP builder, the
              review tools, the scheduler, the public programme. Deploy it on your
              own infrastructure, read every line, and extend it through the API.
              No proprietary integration tier, no seat count to negotiate.
            </p>
            <div className="os-actions">
              <a className="os-button" href="https://github.com/AjayK47/Open-session" target="_blank" rel="noreferrer">
                <Github /> Explore the repository
              </a>
              <a className="os-text-link" href="https://open-session.mintlify.site/introduction">
                Read the documentation <ArrowRight />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="os-footer">
        <Link to="/" className="os-wordmark"><span>Open Session</span></Link>
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
