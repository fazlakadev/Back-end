import {
  emailTemplate,
  emailHeading,
  emailParagraph,
  emailButton,
  emailCard,
  emailDivider,
  emailMuted,
  escapeHtml,
  BRAND,
  BRAND_NAME,
  type Lang,
} from './email-template';

interface WelcomeEmailOptions {
  lang?: Lang;
  userName: string;
  websiteUrl: string;
}

const COPY = {
  ar: {
    subject: 'مرحباً بك في فذلكة! 🎬',
    previewText: 'مرحباً بك في منصة فذلكة — اكتشف عالمك من الأفلام والمحتوى',
    heading: 'مرحباً بك في فذلكة!',
    body: 'يسعدنا انضمامك إلينا. فذلكة منصة تفاعلية مخصصة لعشاق الأفلام والمسلسلات، حيث يمكنك متابعة محتواك المفضل ومشاركة رأيك مع المجتمع.',
    featuresTitle: 'ماذا يمكنك فعله؟',
    feature1: '🎬 استكشف مئات الأفلام والمسلسلات',
    feature2: '⭐ قيّم وراجع ما شاهدته',
    feature3: '👥 انضم لمجتمع ضيوف البودكاست',
    feature4: '📺 شاهد الحلقات الجديدة فور صدورها',
    ctaButton: 'استكشف المحتوى',
    support: 'هل تحتاج مساعدة؟ تواصل معنا عبر البريد الإلكتروني',
    footer: 'نتمنى لك تجربة ممتعة!',
  },
  en: {
    subject: 'Welcome to Fazlaka! 🎬',
    previewText: 'Welcome to Fazlaka — discover your world of movies and content',
    heading: 'Welcome to Fazlaka!',
    body: "We're thrilled to have you on board. Fazlaka is an interactive platform built for movie and series fans, where you can follow your favorite content and share your thoughts with the community.",
    featuresTitle: 'What can you do?',
    feature1: '🎬 Explore hundreds of movies & series',
    feature2: '⭐ Rate and review what you watched',
    feature3: '👥 Join our podcast guests community',
    feature4: '📺 Watch new episodes as they drop',
    ctaButton: 'Explore Content',
    support: 'Need help? Reach us at support@fazlaka.app',
    footer: 'We hope you enjoy the experience!',
  },
  fr: {
    subject: 'Bienvenue sur Fazlaka ! 🎬',
    previewText: 'Bienvenue sur Fazlaka — découvrez votre univers de films et de contenus',
    heading: 'Bienvenue sur Fazlaka !',
    body: "Nous sommes ravis de vous accueillir. Fazlaka est une plateforme interactive conçue pour les amateurs de films et de séries, où vous pouvez suivre vos contenus préférés et partager vos avis avec la communauté.",
    featuresTitle: 'Que pouvez-vous faire ?',
    feature1: '🎬 Explorez des centaines de films et séries',
    feature2: '⭐ Évaluez et commentez ce que vous avez regardé',
    feature3: '👥 Rejoignez notre communauté d\'invités podcast',
    feature4: '📺 Regardez les nouveaux épisodes dès leur sortie',
    ctaButton: 'Explorer le contenu',
    support: 'Besoin d\'aide ? Contactez-nous à support@fazlaka.app',
    footer: 'Nous espérons que vous apprécierez l\'expérience !',
  },
};

export function welcomeEmail(opts: WelcomeEmailOptions) {
  const lang = opts.lang ?? 'ar';
  const t = COPY[lang] ?? COPY.en;
  const brandName = BRAND_NAME[lang];

  const bodyHtml = `
    ${emailHeading(t.heading, lang, { icon: '🎬' })}

    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155">
      ${escapeHtml(t.body)}
    </p>

    ${emailCard({
      title: t.featuresTitle,
      children: `
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#334155;line-height:1.6">${t.feature1}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#334155;line-height:1.6">${t.feature2}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#334155;line-height:1.6">${t.feature3}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#334155;line-height:1.6">${t.feature4}</td>
          </tr>
        </table>
      `,
    })}

    ${emailButton(`${opts.websiteUrl}/explore`, t.ctaButton)}

    ${emailDivider()}

    <p style="margin:0;font-size:14px;line-height:1.7;color:#334155;text-align:center">
      ${escapeHtml(t.footer)}
    </p>
    ${emailMuted(t.support)}
  `;

  return emailTemplate({
    lang,
    subject: t.subject,
    previewText: t.previewText,
    bodyHtml,
  });
}
