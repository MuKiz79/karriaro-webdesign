import React, { useState, useCallback, useMemo } from 'react';
import {
  Globe,
  CheckCircle,
  ArrowRight,
  Star,
  Menu,
  X,
  Briefcase,
  FileText,
  Users,
  MessageCircle,
  Play,
  ChevronRight,
} from 'lucide-react';

// Types
type Language = 'de' | 'tr';

interface NavContent {
  services: string;
  about: string;
  testimonials: string;
  contact: string;
  cta: string;
}

interface HeroContent {
  title: string;
  subtitle: string;
  cta_primary: string;
  cta_secondary: string;
  badge: string;
  image_alt: string;
}

interface PainpointsContent {
  title: string;
  p1: string;
  p2: string;
  p3: string;
  solution: string;
}

interface ServicesContent {
  title: string;
  s1_title: string;
  s1_desc: string;
  s2_title: string;
  s2_desc: string;
  s3_title: string;
  s3_desc: string;
}

interface TrustContent {
  title: string;
  text: string;
  video_caption: string;
  stat1: string;
  stat2: string;
  stat3: string;
}

interface TestimonialsContent {
  title: string;
  t1_text: string;
  t1_name: string;
  t1_role: string;
  t2_text: string;
  t2_name: string;
  t2_role: string;
}

interface CtaBannerContent {
  title: string;
  subtitle: string;
  button: string;
}

interface LanguageContent {
  nav: NavContent;
  hero: HeroContent;
  trusted_by: string;
  painpoints: PainpointsContent;
  services: ServicesContent;
  trust: TrustContent;
  testimonials: TestimonialsContent;
  cta_banner: CtaBannerContent;
}

type ContentMap = Record<Language, LanguageContent>;

// Content moved outside component to prevent recreation on each render
const CONTENT: ContentMap = {
  de: {
    nav: {
      services: 'Leistungen',
      about: 'Über uns',
      testimonials: 'Erfolgsgeschichten',
      contact: 'Kontakt',
      cta: 'Erstgespräch buchen',
    },
    hero: {
      title: 'Deine Karriere in Deutschland startet hier.',
      subtitle:
        'Wir sind die Brücke zwischen türkischen Talenten und dem deutschen Arbeitsmarkt. Professionelles Onboarding, CV-Optimierung und kulturelles Coaching.',
      cta_primary: 'Kostenlose Analyse',
      cta_secondary: 'Mehr erfahren',
      badge: 'Spezialisiert auf Fachkräfte aus der Türkei',
      image_alt: 'Professionelle Beratungssituation',
    },
    trusted_by: 'Erfolgreich vermittelt an Top-Unternehmen:',
    painpoints: {
      title: 'Kennst du diese Herausforderungen?',
      p1: 'Dein türkischer Lebenslauf wird von deutschen Firmen nicht verstanden?',
      p2: "Du hast Angst vor dem 'Kultur-Schock' im deutschen Büro?",
      p3: 'Bürokratie und Anerkennung deiner Abschlüsse wirken unmöglich?',
      solution: 'Wir lösen genau das. Karriaro ist dein Wegweiser.',
    },
    services: {
      title: 'Unser 3-Stufen-Plan für deinen Erfolg',
      s1_title: 'Professionalisierung',
      s1_desc:
        'Wir transformieren deinen CV in den deutschen Standard und optimieren dein LinkedIn-Profil.',
      s2_title: 'Interview & Kultur',
      s2_desc:
        'Simulation von Vorstellungsgesprächen. Lerne die ungeschriebenen Regeln der deutschen Arbeitswelt.',
      s3_title: 'Relocation Support',
      s3_desc:
        'Unterstützung bei Visum, Anerkennung und den ersten Schritten in der neuen Heimat.',
    },
    trust: {
      title: 'Warum Karriaro?',
      text: 'Ich kenne beide Welten. Mit türkischen Wurzeln und deutscher Karriere-Erfahrung weiß ich genau, welche Hürden du überwinden musst. Ich bin nicht nur dein Berater, sondern dein strategischer Partner.',
      video_caption: 'Lerne mich in 60 Sekunden kennen',
      stat1: 'CV-Checks',
      stat2: 'Erfolgreiche Vermittlungen',
      stat3: 'Jahre Erfahrung',
    },
    testimonials: {
      title: 'Erfolgsgeschichten',
      t1_text:
        'Dank Karriaro habe ich nicht nur einen Job als Ingenieur bei BMW gefunden, sondern mich vom ersten Tag an im Team wohlgefühlt.',
      t1_name: 'Murat Y.',
      t1_role: 'Software Ingenieur in München',
      t2_text:
        'Das Interview-Training war Gold wert. Ich wusste genau, wie ich auf kritische Fragen antworten muss, ohne meine Persönlichkeit zu verlieren.',
      t2_name: 'Ayse K.',
      t2_role: 'Architektin in Berlin',
    },
    cta_banner: {
      title: 'Bist du bereit für den nächsten Schritt?',
      subtitle: 'Lass uns deine Chancen analysieren. Unverbindlich und kostenlos.',
      button: 'Jetzt Termin vereinbaren',
    },
  },
  tr: {
    nav: {
      services: 'Hizmetler',
      about: 'Hakkımızda',
      testimonials: 'Başarı Hikayeleri',
      contact: 'İletişim',
      cta: 'Randevu Al',
    },
    hero: {
      title: "Almanya'daki Kariyerin Burada Başlıyor.",
      subtitle:
        'Türk yetenekleri ile Alman iş piyasası arasındaki köprüyüz. Profesyonel danışmanlık, CV optimizasyonu ve kültürel koçluk.',
      cta_primary: 'Ücretsiz Analiz',
      cta_secondary: 'Daha Fazla Bilgi',
      badge: "Türkiye'den gelen uzmanlar için özel hizmet",
      image_alt: 'Profesyonel Danışmanlık',
    },
    trusted_by: 'Bu şirketlere başarıyla yerleştirildi:',
    painpoints: {
      title: 'Bu sorunları yaşıyor musun?',
      p1: "Türkçe CV'niz Alman şirketleri tarafından anlaşılmıyor mu?",
      p2: 'Alman ofis kültürüne uyum sağlamaktan çekiniyor musunuz?',
      p3: 'Bürokrasi ve diploma denkliği imkansız mı görünüyor?',
      solution: 'Biz tam olarak bunu çözüyoruz. Karriaro senin rehberin.',
    },
    services: {
      title: 'Başarın için 3 Adımlı Planımız',
      s1_title: 'Profesyonelleşme',
      s1_desc:
        "CV'nizi Alman standartlarına dönüştürüyor ve LinkedIn profilinizi optimize ediyoruz.",
      s2_title: 'Mülakat & Kültür',
      s2_desc:
        'İş görüşmesi simülasyonları. Alman iş dünyasının yazılı olmayan kurallarını öğrenin.',
      s3_title: 'Relokasyon Desteği',
      s3_desc: 'Vize, denklik işlemleri ve yeni evinizdeki ilk adımlarınızda destek.',
    },
    trust: {
      title: 'Neden Karriaro?',
      text: 'Her iki dünyayı da tanıyorum. Türk köklerim ve Alman kariyer deneyimimle, aşmanız gereken engelleri çok iyi biliyorum. Sadece danışmanınız değil, stratejik ortağınızım.',
      video_caption: 'Beni 60 saniyede tanıyın',
      stat1: 'CV Analizi',
      stat2: 'Başarılı Yerleştirme',
      stat3: 'Yıllık Tecrübe',
    },
    testimonials: {
      title: 'Başarı Hikayeleri',
      t1_text:
        "Karriaro sayesinde sadece BMW'de mühendis olarak iş bulmakla kalmadım, ilk günden itibaren kendimi ekibe ait hissettim.",
      t1_name: 'Murat Y.',
      t1_role: 'Yazılım Mühendisi, Münih',
      t2_text:
        'Mülakat eğitimi çok değerliydi. Kişiliğimden ödün vermeden kritik sorulara nasıl cevap vereceğimi öğrendim.',
      t2_name: 'Ayşe K.',
      t2_role: 'Mimar, Berlin',
    },
    cta_banner: {
      title: 'Bir sonraki adıma hazır mısın?',
      subtitle: 'Şansını birlikte analiz edelim. Bağlayıcı değil ve ücretsiz.',
      button: 'Şimdi Randevu Al',
    },
  },
};

const TRUSTED_COMPANIES = ['BMW', 'SIEMENS', 'SAP', 'DAIMLER', 'BOSCH'] as const;

const LandingPage: React.FC = () => {
  const [language, setLanguage] = useState<Language>('tr');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleLanguage = useCallback((lang: Language) => {
    setLanguage(lang);
    setIsMenuOpen(false);
  }, []);

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  const t = useMemo(() => CONTENT[language], [language]);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className="font-sans text-slate-800 bg-slate-50 min-h-screen flex flex-col">
      {/* Skip Link for Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:bg-blue-900 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg"
      >
        {language === 'de' ? 'Zum Hauptinhalt springen' : 'Ana içeriğe geç'}
      </a>

      {/* Navigation */}
      <nav className="bg-white shadow-sm sticky top-0 z-50" role="navigation" aria-label="Main">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            {/* Logo */}
            <a href="/" className="flex-shrink-0 flex items-center gap-2" aria-label="Karriaro Home">
              <div className="w-10 h-10 bg-blue-900 rounded-lg flex items-center justify-center text-white font-bold text-xl" aria-hidden="true">
                K
              </div>
              <span className="font-bold text-2xl tracking-tight text-blue-900">karriaro</span>
            </a>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center space-x-8">
              <a href="#services" className="text-slate-600 hover:text-blue-900 font-medium transition">
                {t.nav.services}
              </a>
              <a href="#about" className="text-slate-600 hover:text-blue-900 font-medium transition">
                {t.nav.about}
              </a>
              <a href="#testimonials" className="text-slate-600 hover:text-blue-900 font-medium transition">
                {t.nav.testimonials}
              </a>

              {/* Language Switcher Desktop */}
              <div className="flex bg-slate-100 rounded-full p-1" role="group" aria-label="Language selection">
                <button
                  type="button"
                  onClick={() => toggleLanguage('tr')}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                    language === 'tr' ? 'bg-white shadow text-blue-900' : 'text-slate-500 hover:text-slate-700'
                  }`}
                  aria-pressed={language === 'tr'}
                  aria-label="Türkçe"
                >
                  🇹🇷 TR
                </button>
                <button
                  type="button"
                  onClick={() => toggleLanguage('de')}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                    language === 'de' ? 'bg-white shadow text-blue-900' : 'text-slate-500 hover:text-slate-700'
                  }`}
                  aria-pressed={language === 'de'}
                  aria-label="Deutsch"
                >
                  🇩🇪 DE
                </button>
              </div>

              <button
                type="button"
                className="bg-blue-900 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-800 transition shadow-lg shadow-blue-900/20"
              >
                {t.nav.cta}
              </button>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center gap-4">
              {/* Language Switcher Mobile (Compact) */}
              <button
                type="button"
                onClick={() => toggleLanguage(language === 'tr' ? 'de' : 'tr')}
                className="text-2xl"
                aria-label={language === 'tr' ? 'Switch to German' : 'Türkçeye geç'}
              >
                {language === 'tr' ? '🇹🇷' : '🇩🇪'}
              </button>
              <button
                type="button"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="text-slate-600"
                aria-expanded={isMenuOpen}
                aria-controls="mobile-menu"
                aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              >
                {isMenuOpen ? <X size={28} aria-hidden="true" /> : <Menu size={28} aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div id="mobile-menu" className="md:hidden bg-white border-t border-slate-100 absolute w-full">
            <div className="px-4 pt-2 pb-6 space-y-2 shadow-xl">
              <a
                href="#services"
                onClick={closeMenu}
                className="block px-3 py-3 text-base font-medium text-slate-700 hover:bg-slate-50 rounded-md"
              >
                {t.nav.services}
              </a>
              <a
                href="#about"
                onClick={closeMenu}
                className="block px-3 py-3 text-base font-medium text-slate-700 hover:bg-slate-50 rounded-md"
              >
                {t.nav.about}
              </a>
              <a
                href="#testimonials"
                onClick={closeMenu}
                className="block px-3 py-3 text-base font-medium text-slate-700 hover:bg-slate-50 rounded-md"
              >
                {t.nav.testimonials}
              </a>
              <button
                type="button"
                className="w-full mt-4 bg-blue-900 text-white px-6 py-3 rounded-lg font-semibold"
              >
                {t.nav.cta}
              </button>
            </div>
          </div>
        )}
      </nav>

      <main id="main-content">
        {/* Hero Section */}
        <section className="relative bg-white overflow-hidden" aria-labelledby="hero-title">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-white z-0" aria-hidden="true" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 md:pt-20 md:pb-24">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left Content */}
              <div className="text-left z-10">
                <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-semibold bg-blue-100 text-blue-800 mb-6">
                  <Globe size={16} className="mr-2" aria-hidden="true" />
                  {t.hero.badge}
                </span>
                <h1
                  id="hero-title"
                  className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight mb-6 leading-tight"
                >
                  {t.hero.title}
                </h1>
                <p className="text-lg sm:text-xl text-slate-600 mb-8 leading-relaxed max-w-lg">
                  {t.hero.subtitle}
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    type="button"
                    className="flex items-center justify-center px-8 py-4 border border-transparent text-lg font-bold rounded-xl text-white bg-blue-900 hover:bg-blue-800 shadow-xl shadow-blue-900/20 transition transform hover:-translate-y-1"
                  >
                    {t.hero.cta_primary}
                    <ArrowRight className="ml-2 -mr-1" size={20} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="flex items-center justify-center px-8 py-4 border-2 border-slate-200 text-lg font-bold rounded-xl text-slate-700 bg-white hover:bg-slate-50 transition"
                  >
                    {t.hero.cta_secondary}
                  </button>
                </div>
              </div>

              {/* Right Image */}
              <div className="relative lg:h-full flex items-center justify-center z-10 mt-10 lg:mt-0">
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-blue-100/50 rounded-full blur-3xl -z-10"
                  aria-hidden="true"
                />

                <div className="relative rounded-2xl overflow-hidden shadow-2xl border-4 border-white rotate-2 hover:rotate-0 transition duration-500 ease-out">
                  <div className="bg-slate-200 w-full max-w-md aspect-[4/3] flex flex-col items-center justify-center text-slate-400">
                    <Users size={64} className="mb-4 text-blue-900/40" aria-hidden="true" />
                    <span className="font-semibold text-lg text-slate-500 px-8 text-center">
                      {t.hero.image_alt}
                    </span>
                    <span className="text-sm text-slate-400 mt-2">(Founder & Client Interaction)</span>
                  </div>

                  {/* Floating Card Overlay */}
                  <div className="absolute bottom-6 left-6 right-6 bg-white/95 backdrop-blur-sm p-4 rounded-xl shadow-lg border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <CheckCircle size={20} className="text-green-600" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">100% Success Rate</p>
                        <p className="text-xs text-slate-500">For qualified engineers</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trusted By Logos */}
        <section className="py-10 border-y border-slate-100 bg-white" aria-label="Trusted companies">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-center text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6">
              {t.trusted_by}
            </p>
            <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-60 grayscale">
              {TRUSTED_COMPANIES.map((company) => (
                <span key={company} className="text-xl md:text-2xl font-black text-slate-800">
                  {company}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Pain Points */}
        <section className="py-20 bg-slate-50" aria-labelledby="painpoints-title">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 id="painpoints-title" className="text-3xl font-bold text-slate-900">
                {t.painpoints.title}
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              <article className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition group">
                <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-red-100 transition">
                  <FileText className="text-red-600" size={28} aria-hidden="true" />
                </div>
                <p className="text-lg font-medium text-slate-800 leading-snug">{t.painpoints.p1}</p>
              </article>
              <article className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition group">
                <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-orange-100 transition">
                  <MessageCircle className="text-orange-600" size={28} aria-hidden="true" />
                </div>
                <p className="text-lg font-medium text-slate-800 leading-snug">{t.painpoints.p2}</p>
              </article>
              <article className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition group">
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-blue-100 transition">
                  <Briefcase className="text-blue-600" size={28} aria-hidden="true" />
                </div>
                <p className="text-lg font-medium text-slate-800 leading-snug">{t.painpoints.p3}</p>
              </article>
            </div>
            <div className="mt-12 text-center">
              <p className="text-xl font-semibold text-blue-900 inline-flex items-center">
                {t.painpoints.solution}
                <ChevronRight size={20} className="ml-1" aria-hidden="true" />
              </p>
            </div>
          </div>
        </section>

        {/* Services Section */}
        <section id="services" className="py-24 bg-white" aria-labelledby="services-title">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-20">
              <h2 id="services-title" className="text-3xl md:text-4xl font-bold text-slate-900">
                {t.services.title}
              </h2>
            </div>

            <div className="space-y-20">
              {/* Service 1 */}
              <article className="flex flex-col md:flex-row items-center gap-12">
                <div className="flex-1 order-2 md:order-1">
                  <div className="bg-blue-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-blue-900 font-bold text-2xl shadow-inner" aria-hidden="true">
                    1
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-4">{t.services.s1_title}</h3>
                  <p className="text-lg text-slate-600 leading-relaxed">{t.services.s1_desc}</p>
                  <ul className="mt-6 space-y-3">
                    <li className="flex items-center text-slate-700">
                      <CheckCircle size={20} className="text-green-500 mr-3" aria-hidden="true" /> CV Re-Design
                    </li>
                    <li className="flex items-center text-slate-700">
                      <CheckCircle size={20} className="text-green-500 mr-3" aria-hidden="true" /> LinkedIn SEO
                    </li>
                  </ul>
                </div>
                <div className="flex-1 order-1 md:order-2 bg-slate-100 rounded-3xl h-64 w-full flex items-center justify-center text-slate-300 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-tr from-slate-200 to-slate-100 opacity-50" aria-hidden="true" />
                  <div className="text-center relative z-10 transform group-hover:scale-105 transition duration-500">
                    <FileText size={48} className="mx-auto mb-2 text-slate-400" aria-hidden="true" />
                    <span className="font-medium">Document Analysis</span>
                  </div>
                </div>
              </article>

              {/* Service 2 */}
              <article className="flex flex-col md:flex-row items-center gap-12">
                <div className="flex-1 order-1 bg-slate-100 rounded-3xl h-64 w-full flex items-center justify-center text-slate-300 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-bl from-slate-200 to-slate-100 opacity-50" aria-hidden="true" />
                  <div className="text-center relative z-10 transform group-hover:scale-105 transition duration-500">
                    <Users size={48} className="mx-auto mb-2 text-slate-400" aria-hidden="true" />
                    <span className="font-medium">Interview Lab</span>
                  </div>
                </div>
                <div className="flex-1 order-2">
                  <div className="bg-blue-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-blue-900 font-bold text-2xl shadow-inner" aria-hidden="true">
                    2
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-4">{t.services.s2_title}</h3>
                  <p className="text-lg text-slate-600 leading-relaxed">{t.services.s2_desc}</p>
                  <ul className="mt-6 space-y-3">
                    <li className="flex items-center text-slate-700">
                      <CheckCircle size={20} className="text-green-500 mr-3" aria-hidden="true" /> Mock Interviews
                    </li>
                    <li className="flex items-center text-slate-700">
                      <CheckCircle size={20} className="text-green-500 mr-3" aria-hidden="true" /> Culture Guide
                    </li>
                  </ul>
                </div>
              </article>

              {/* Service 3 */}
              <article className="flex flex-col md:flex-row items-center gap-12">
                <div className="flex-1 order-2 md:order-1">
                  <div className="bg-blue-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-blue-900 font-bold text-2xl shadow-inner" aria-hidden="true">
                    3
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-4">{t.services.s3_title}</h3>
                  <p className="text-lg text-slate-600 leading-relaxed">{t.services.s3_desc}</p>
                  <ul className="mt-6 space-y-3">
                    <li className="flex items-center text-slate-700">
                      <CheckCircle size={20} className="text-green-500 mr-3" aria-hidden="true" /> Blue Card Support
                    </li>
                    <li className="flex items-center text-slate-700">
                      <CheckCircle size={20} className="text-green-500 mr-3" aria-hidden="true" /> Housing Tips
                    </li>
                  </ul>
                </div>
                <div className="flex-1 order-1 md:order-2 bg-slate-100 rounded-3xl h-64 w-full flex items-center justify-center text-slate-300 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-tr from-slate-200 to-slate-100 opacity-50" aria-hidden="true" />
                  <div className="text-center relative z-10 transform group-hover:scale-105 transition duration-500">
                    <Globe size={48} className="mx-auto mb-2 text-slate-400" aria-hidden="true" />
                    <span className="font-medium">Relocation Map</span>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Trust / About Section */}
        <section id="about" className="py-20 bg-blue-900 text-white overflow-hidden relative" aria-labelledby="about-title">
          <div className="absolute top-0 right-0 p-12 opacity-5" aria-hidden="true">
            <Globe size={400} />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="flex flex-col md:flex-row gap-16 items-center">
              <div className="flex-1">
                <h2 id="about-title" className="text-3xl font-bold mb-6">
                  {t.trust.title}
                </h2>
                <p className="text-blue-100 text-lg leading-relaxed mb-8">{t.trust.text}</p>
                <div className="grid grid-cols-3 gap-8 border-t border-blue-800 pt-8">
                  <div>
                    <div className="text-4xl font-bold text-white mb-1">500+</div>
                    <div className="text-blue-300 text-sm">{t.trust.stat1}</div>
                  </div>
                  <div>
                    <div className="text-4xl font-bold text-white mb-1">120+</div>
                    <div className="text-blue-300 text-sm">{t.trust.stat2}</div>
                  </div>
                  <div>
                    <div className="text-4xl font-bold text-white mb-1">10+</div>
                    <div className="text-blue-300 text-sm">{t.trust.stat3}</div>
                  </div>
                </div>
              </div>

              {/* Video Placeholder */}
              <div className="flex-1 flex justify-center w-full">
                <button
                  type="button"
                  className="relative w-full max-w-lg aspect-video bg-blue-800 rounded-2xl overflow-hidden shadow-2xl border-4 border-blue-700/50 group cursor-pointer hover:border-blue-500 transition"
                  aria-label={t.trust.video_caption}
                >
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-transparent to-blue-900/80">
                    <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition duration-300">
                      <Play fill="white" className="text-white ml-1" size={32} aria-hidden="true" />
                    </div>
                    <span className="font-medium text-white">{t.trust.video_caption}</span>
                  </div>
                  <div className="absolute bottom-4 right-4 bg-black/60 px-2 py-1 rounded text-xs font-mono" aria-hidden="true">
                    0:58
                  </div>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section id="testimonials" className="py-20 bg-slate-50" aria-labelledby="testimonials-title">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 id="testimonials-title" className="text-3xl font-bold text-center text-slate-900 mb-16">
              {t.testimonials.title}
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              <article className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex gap-1 text-yellow-400 mb-4" aria-label="5 out of 5 stars">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} fill="currentColor" size={20} aria-hidden="true" />
                  ))}
                </div>
                <blockquote className="text-slate-700 text-lg italic mb-6">
                  "{t.testimonials.t1_text}"
                </blockquote>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-400 text-xl" aria-hidden="true">
                    M
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">{t.testimonials.t1_name}</div>
                    <div className="text-sm text-slate-500">{t.testimonials.t1_role}</div>
                  </div>
                </div>
              </article>
              <article className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex gap-1 text-yellow-400 mb-4" aria-label="5 out of 5 stars">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} fill="currentColor" size={20} aria-hidden="true" />
                  ))}
                </div>
                <blockquote className="text-slate-700 text-lg italic mb-6">
                  "{t.testimonials.t2_text}"
                </blockquote>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-400 text-xl" aria-hidden="true">
                    A
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">{t.testimonials.t2_name}</div>
                    <div className="text-sm text-slate-500">{t.testimonials.t2_role}</div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* CTA Footer */}
        <section className="bg-white py-20 border-t border-slate-100" aria-labelledby="cta-title">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 id="cta-title" className="text-4xl font-bold text-slate-900 mb-6">
              {t.cta_banner.title}
            </h2>
            <p className="text-xl text-slate-600 mb-10">{t.cta_banner.subtitle}</p>
            <button
              type="button"
              className="bg-blue-900 text-white px-10 py-4 rounded-xl font-bold text-lg shadow-xl shadow-blue-900/20 hover:bg-blue-800 transition transform hover:-translate-y-1"
            >
              {t.cta_banner.button}
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 text-center text-sm">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex justify-center gap-8 mb-8" aria-label="Footer">
            <a href="#" className="hover:text-white transition">
              LinkedIn
            </a>
            <a href="#" className="hover:text-white transition">
              Instagram
            </a>
            <a href="#" className="hover:text-white transition">
              Impressum
            </a>
            <a href="#" className="hover:text-white transition">
              Datenschutz
            </a>
          </nav>
          <p>&copy; {currentYear} Karriaro. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
