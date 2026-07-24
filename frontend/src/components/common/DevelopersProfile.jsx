import { ArrowLeft, Code2, GraduationCap, Globe, Mail, Phone } from 'lucide-react';
import Lanyard from './Lanyard';

const avatarUrl = '/images/dev.png';

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
          <Lanyard
            position={[0, 0, 22]}
            gravity={[0, -38, 0]}
            frontImage={avatarUrl}
            backImage={avatarUrl}
            imageFit="cover"
            imagePosition="top"
            lanyardWidth={0.72}
          />
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
