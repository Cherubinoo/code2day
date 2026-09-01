import { Component, useEffect, useState } from 'react';
import { ArrowLeft, Code2, GraduationCap, Globe, Mail, Phone } from 'lucide-react';
import Lanyard from './Lanyard';

const avatarUrl = '/images/dev.png';

// The lanyard is a WebGL/physics scene (three.js + rapier) — on some
// browsers/GPU drivers it can fail to render a frame (texture upload
// errors etc.) without ever throwing a catchable JS error, so it can go
// silently blank instead of crashing. LanyardBoundary catches real thrown
// errors; the mount-timeout in DevelopersProfile below catches the silent
// case by falling back to a plain photo if no frame ever renders.
class LanyardBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    console.error('Lead developers lanyard failed to render, falling back to a static photo:', error);
    this.props.onError?.();
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

const developers = [
  {
    name: 'Delight Cherubino',
    title: 'Lead Developer',
    handle: 'delightcherubino',
    contact: '+91 8220789878',
    mail: 'delightcherubino@gmail.com',
    domain: 'https://delightcherubino.com/',
    domainLabel: 'delightcherubino.com',
    batch: '2023 - 2027',
    focus: 'Full project architecture, Django backend services, API design, authentication flows, execution pipeline, and the main frontend application experience.',
  },
  {
    name: 'Sanjay R',
    title: 'Lead Developer',
    handle: 'sanjay-r',
    contact: '+91 8523999020',
    mail: 'sanjaydharsaan007@gmail.com',
    batch: '2023 - 2027',
    focus: 'Aptitude question generation, validation modules, analytics support, and quality checks across the learning and assessment flow.',
  },
];

const DevelopersProfile = ({ onBack, isLoggedIn }) => {
  // 'pending' while the 3D scene is still loading, 'ready' once it renders
  // its first frame, 'failed' if it errors or never renders in time.
  const [lanyardStatus, setLanyardStatus] = useState('pending');

  useEffect(() => {
    // Covers the silent failure case — no thrown error, the canvas just
    // never renders a frame (e.g. a texture upload failure on some GPU
    // drivers) — by falling back to a static photo if nothing came up.
    const timer = setTimeout(() => {
      setLanyardStatus((status) => (status === 'ready' ? status : 'failed'));
    }, 6000);
    return () => clearTimeout(timer);
  }, []);

  const handleLanyardReady = () => setLanyardStatus('ready');
  const handleLanyardError = () => setLanyardStatus('failed');

  return (
    <div className="developers-page">
      <div className="developers-hero">
        <button className="developers-back-btn" type="button" onClick={onBack}>
          <ArrowLeft size={18} />
          {isLoggedIn ? 'Back to Dashboard' : 'Back to Login'}
        </button>
        <div>
          <p className="developers-kicker">Project Builders</p>
          <h1>Lead Developers</h1>
          <p>
            Code2Day was built through full-stack engineering, execution-system work, question generation,
            analytics, reports, and the student/staff/HOD learning workflows that connect them.
          </p>
        </div>
      </div>

      <div className="developers-showcase">
        <section className="developers-lanyard-panel" aria-label="Lead developers photo">
          {lanyardStatus === 'failed' ? (
            <img src={avatarUrl} alt="Lead developers" className="developers-fallback-photo" />
          ) : (
            <LanyardBoundary onError={handleLanyardError}>
              <Lanyard
                position={[0, 0, 22]}
                gravity={[0, -38, 0]}
                frontImage={avatarUrl}
                backImage={avatarUrl}
                imageFit="cover"
                imagePosition="top"
                lanyardWidth={0.72}
                onReady={handleLanyardReady}
              />
            </LanyardBoundary>
          )}
        </section>

        <div className="developers-info-stack">
          {developers.map((developer) => (
            <article className="developer-info-card" key={developer.mail}>
              <div className="developer-role">
                <Code2 size={18} />
                <span>{developer.title}</span>
              </div>
              <h2>{developer.name}</h2>
              <p>{developer.focus}</p>

              <div className="developer-contact-list">
                <a href={`tel:${developer.contact.replace(/\s/g, '')}`}>
                  <Phone size={15} />
                  {developer.contact}
                </a>
                <a href={`mailto:${developer.mail}`}>
                  <Mail size={15} />
                  {developer.mail}
                </a>
                {developer.domain && (
                  <a href={developer.domain} target="_blank" rel="noopener noreferrer">
                    <Globe size={15} />
                    {developer.domainLabel}
                  </a>
                )}
                <span>
                  <GraduationCap size={15} />
                  Batch {developer.batch}
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <section className="developers-thanks">
        <p>Special Thanks</p>
        <h3>Dr. M. Kaliappan, Professor and Head</h3>
        <span>For guidance and support throughout the development process.</span>
      </section>
    </div>
  );
};

export default DevelopersProfile;
