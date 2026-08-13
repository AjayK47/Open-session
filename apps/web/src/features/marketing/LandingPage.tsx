import { useState } from "react";
import { ArrowRight, CalendarClock, ClipboardCheck, FileText, Github, Megaphone, Share2, UserRound, UsersRound } from "lucide-react";
import { Link } from "react-router";
import { ThemeToggleBare } from "../../components/theme-toggle";
import "./landing.css";

/** Decorative only (aria-hidden) — a scatter of schedule fragments behind the
 *  headline: time slots, room codes, and track dots, faded toward the text
 *  so it reads as texture, not content. The motif is Open Session's own (a
 *  scheduling grid), not a borrowed one. */
const heroField: { label: string; top: string; left: string; chip?: string }[] = [
  { label: "09:00", top: "6%", left: "56%" },
  { label: "R·A", top: "12%", left: "86%" },
  { label: "+", top: "4%", left: "72%" },
  { label: "14:30", top: "20%", left: "68%" },
  { label: "●", top: "27%", left: "91%", chip: "var(--track-2)" },
  { label: "11:15", top: "34%", left: "80%" },
  { label: "R·C", top: "42%", left: "62%" },
  { label: "+", top: "48%", left: "93%" },
  { label: "○", top: "56%", left: "75%", chip: "var(--track-5)" },
  { label: "16:00", top: "64%", left: "88%" },
  { label: "+", top: "16%", left: "60%" },
  { label: "●", top: "71%", left: "67%", chip: "var(--track-6)" },
  { label: "R·B", top: "78%", left: "84%" },
  { label: "10:45", top: "86%", left: "58%" },
  { label: "○", top: "60%", left: "58%", chip: "var(--track-3)" },
];

const features = [
  { icon: FileText, title: "Custom CFP forms", body: "Conditional questions and category routing you configure once, not per submission." },
  { icon: UserRound, title: "Speaker self-service", body: "Bios, headshots, slides, and travel docs — speakers keep their own profile current." },
  { icon: ClipboardCheck, title: "Review & scoring", body: "Assign reviewers, score against a rubric, and keep decisions blind until you're ready." },
  { icon: CalendarClock, title: "Drag-and-drop agenda", body: "Build the schedule across rooms and tracks with clashes flagged as you go." },
  { icon: Share2, title: "Public widgets", body: "Embed the live agenda, speaker gallery, and itinerary anywhere — no iframe hacks." },
  { icon: UsersRound, title: "Speaker CRM", body: "One directory of every person you've worked with, reusable across every event you run." },
];

const steps = [
  { title: "Open your CFP", body: "Publish a branded submission form with conditional logic and category routing in minutes." },
  { title: "Review, assign, schedule", body: "Score proposals, assign reviewers, and drag sessions into a conflict-free agenda." },
  { title: "Publish everywhere", body: "Push the agenda, speakers, and itinerary live as embeddable public pages." },
];

/** Real screens from the app, captured live against a real event, not
 *  mockups — see apps/web/public/showcase/. */
const tour = [
  { key: "dashboard", label: "Dashboard", src: "/showcase/dashboard.webp", alt: "Organizer dashboard showing submission counts, accepted speakers, and scheduled sessions" },
  { key: "submissions", label: "Submissions", src: "/showcase/submissions.webp", alt: "Submissions list with status, track, speakers, and rating columns" },
  { key: "agenda", label: "Agenda", src: "/showcase/agenda.webp", alt: "Drag-and-drop agenda builder with sessions placed across a day's schedule" },
  { key: "speakers", label: "Speakers", src: "/showcase/speakers.webp", alt: "Speaker roster with workflow and confirmation status per person" },
  { key: "embeds", label: "Embeds", src: "/showcase/embeds.webp", alt: "Embed and share panel with public links and iframe snippets" },
  { key: "public", label: "Public site", src: "/showcase/public.webp", alt: "The public agenda page an attendee would actually see" },
];

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
  const [tab, setTab] = useState(0);
  const active = tour[tab] ?? tour[0]!;

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

          <div className="os-nav__actions">
            <ThemeToggleBare className="os-theme-toggle" />
            <Link to="/login" className="os-button">Get started</Link>
          </div>
        </header>

        <section className="os-hero" aria-labelledby="os-hero-title">
          <div className="os-hero__deco" aria-hidden="true">
            {heroField.map((item, i) => (
              <span
                key={i}
                className="os-hero__glyph"
                style={{ top: item.top, left: item.left, ...(item.chip ? { color: item.chip } : {}) } as React.CSSProperties}
              >
                {item.label}
              </span>
            ))}
          </div>
          <div className="os-hero__content">
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
          </div>
        </section>

        <section className="os-tour" aria-labelledby="os-tour-title">
          <p id="os-tour-title" className="os-visual__label os-tour__label">Every screen, from a real event</p>
          <div className="os-tour__tabs" role="tablist" aria-label="App screens">
            {tour.map((screen, i) => (
              <button
                key={screen.key}
                type="button"
                role="tab"
                aria-selected={i === tab}
                className="os-tour__tab"
                data-active={i === tab || undefined}
                onClick={() => setTab(i)}
              >
                {screen.label}
              </button>
            ))}
          </div>
          <div className="os-tour__stage">
            <div className="os-tour__glow" aria-hidden="true" />
            <div className="os-tour__window">
              <div className="os-tour__chrome">
                <span className="os-tour__dot" aria-hidden="true" />
                <span className="os-tour__dot" aria-hidden="true" />
                <span className="os-tour__dot" aria-hidden="true" />
                <span className="os-tour__url">your-event.com — {active.label.toLowerCase()}</span>
              </div>
              <img src={active.src} alt={active.alt} className="os-tour__image" loading="lazy" />
            </div>
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

        <div className="os-steps">
          <FrameTicks />
          <p className="os-visual__label">How it works</p>
          <ol className="os-steps__grid">
            {steps.map((step, i) => (
              <li key={step.title} className="os-step">
                <span className="os-step__index">{String(i + 1).padStart(2, "0")}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="os-features">
          <FrameTicks />
          <p className="os-visual__label">Everything a programme team needs</p>
          <ul className="os-features__grid">
            {features.map((feature) => (
              <li key={feature.title} className="os-feature">
                <span className="os-feature__icon" aria-hidden="true"><feature.icon /></span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </li>
            ))}
          </ul>
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
