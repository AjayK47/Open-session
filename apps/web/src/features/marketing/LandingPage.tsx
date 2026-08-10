import { ArrowRight, Github, Megaphone } from "lucide-react";
import { Link } from "react-router";
import "./landing.css";

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

/** The corner registration marks used on every bordered panel — see .os-tick. */
function FrameTicks() {
  return (
    <>
      <span className="os-tick os-tick--tl" aria-hidden="true">+</span>
      <span className="os-tick os-tick--tr" aria-hidden="true">+</span>
      <span className="os-tick os-tick--bl" aria-hidden="true">+</span>
      <span className="os-tick os-tick--br" aria-hidden="true">+</span>
    </>
  );
}

export function LandingPage() {
  return (
    <div className="os-landing">
      <div className="os-frame">
        <FrameTicks />

        <header className="os-nav">
          <Link to="/" className="os-wordmark" aria-label="Open Session home">
            <span className="os-wordmark__mark" aria-hidden="true"><Megaphone /></span>
            <span>Open Session</span>
          </Link>

          <nav className="os-nav__links" aria-label="Main navigation">
            <a href="https://open-session.mintlify.site/introduction">Documentation</a>
            <a href="https://github.com/AjayK47/Open-session" target="_blank" rel="noreferrer">GitHub</a>
          </nav>

          <Link to="/login" className="os-button">Get started</Link>
        </header>

        <section className="os-hero" aria-labelledby="os-hero-title">
          <p className="os-status">
            Open source <span className="os-status__dot" aria-hidden="true" />
            Self-hosted <span className="os-status__dot" aria-hidden="true" />
            <span className="os-status__hl">MIT licensed</span>
          </p>
          <h1 id="os-hero-title">Run the whole show, not just the form.</h1>
          <p className="os-hero__lede">
            Open Session replaces the CFP form, the review spreadsheet, the speaker
            email thread, and the scheduling doc with one system you run yourself.
          </p>
          <div className="os-actions">
            <Link to="/login" className="os-button">Start using Open Session <ArrowRight /></Link>
            <a className="os-text-link" href="https://github.com/AjayK47/Open-session" target="_blank" rel="noreferrer">
              <Github /> View source
            </a>
          </div>
        </section>

        <div className="os-visual">
          <FrameTicks />
          <p className="os-visual__label">A programme like the one you'd run</p>
          <ol className="os-strip">
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
                  <span className="os-card__track">
                    <span className="os-card__track-dot" aria-hidden="true" />
                    {session.track}
                  </span>
                  <span className="os-card__speaker">{session.speaker}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="os-cta">
          <FrameTicks />
          <span className="os-cta__mark" aria-hidden="true"><Megaphone /></span>
          <h2>Own your conference programme.</h2>
          <p>Free, open source, and yours to keep. No per-seat licence, no vendor lock-in.</p>
          <Link to="/login" className="os-button">Start using Open Session <ArrowRight /></Link>
        </div>

        <footer className="os-footer">
          <div>
            <Link to="/" className="os-wordmark"><span>Open Session</span></Link>
            <p>Open-source conference programme management.</p>
          </div>
          <nav aria-label="Footer navigation">
            <a href="https://open-session.mintlify.site/introduction">Documentation</a>
            <a href="https://github.com/AjayK47/Open-session" target="_blank" rel="noreferrer">GitHub</a>
            <Link to="/login">Sign in</Link>
          </nav>
          <p className="os-footer__legal">Open Session — MIT licensed, {new Date().getFullYear()}</p>
        </footer>
      </div>
    </div>
  );
}
