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
  type Lang,
} from './email-template';

interface EpisodeNotificationOptions {
  lang?: Lang;
  userName: string;
  episodeTitle: string;
  seasonName: string;
  episodeNumber: number;
  description: string;
  watchUrl: string;
  unsubscribeUrl?: string;
  websiteUrl: string;
}

const COPY = {
  ar: {
    subject: (title: string) => `حلقة جديدة: ${title} — ف ذلكة`,
    previewText: (title: string) => `حلقة جديدة متاحة الآن: ${title}`,
    heading: 'حلقة جديدة متاحة!',
    seasonLabel: 'الموسم',
    episodeLabel: 'الحلقة',
    ctaButton: 'شاهد الآن',
    noThanks: 'لا ترغب في تلقي هذه الإشعارات؟',
    unsubscribe: 'إلغاء الاشتراك',
    footer: 'نتمنى لك مشاهدة ممتعة!',
  },
  en: {
    subject: (title: string) => `New Episode: ${title} — Fazlaka`,
    previewText: (title: string) => `A new episode is now available: ${title}`,
    heading: 'New Episode Available!',
    seasonLabel: 'Season',
    episodeLabel: 'Episode',
    ctaButton: 'Watch Now',
    noThanks: "Don't want to receive these notifications?",
    unsubscribe: 'Unsubscribe',
    footer: 'Enjoy watching!',
  },
  fr: {
    subject: (title: string) => `Nouvel épisode : ${title} — Fazlaka`,
    previewText: (title: string) => `Un nouvel épisode est disponible : ${title}`,
    heading: 'Nouvel épisode disponible !',
    seasonLabel: 'Saison',
    episodeLabel: 'Épisode',
    ctaButton: 'Regarder maintenant',
    noThanks: 'Vous ne souhaitez plus recevoir ces notifications ?',
    unsubscribe: 'Se désabonner',
    footer: 'Bonne visionnage !',
  },
};

export function episodeNotificationEmail(opts: EpisodeNotificationOptions) {
  const lang = opts.lang ?? 'ar';
  const t = COPY[lang] ?? COPY.en;

  const subject = t.subject(opts.episodeTitle);
  const previewText = t.previewText(opts.episodeTitle);

  const bodyHtml = `
    ${emailHeading(t.heading, lang, { icon: '🎬' })}

    ${emailCard({
      bg: '#F0FDF4',
      border: '#BBF7D0',
      children: `
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td style="padding:4px 0">
              <span style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:${BRAND.muted};font-weight:600">${t.seasonLabel}</span>
              <span style="font-size:14px;color:${BRAND.dark};font-weight:700;margin-${lang === 'ar' ? 'right' : 'left'}:8px">${escapeHtml(opts.seasonName)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:4px 0">
              <span style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:${BRAND.muted};font-weight:600">${t.episodeLabel}</span>
              <span style="font-size:14px;color:${BRAND.dark};font-weight:700;margin-${lang === 'ar' ? 'right' : 'left'}:8px">#${opts.episodeNumber}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 0 4px">
              <div style="font-size:18px;font-weight:800;color:${BRAND.dark};line-height:1.4">${escapeHtml(opts.episodeTitle)}</div>
            </td>
          </tr>
        </table>
        ${opts.description ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#334155">${escapeHtml(opts.description)}</p>` : ''}
      `,
    })}

    ${emailButton(opts.watchUrl, t.ctaButton, { fullWidth: true })}

    ${emailDivider()}

    <p style="margin:0;font-size:13px;line-height:1.7;color:#334155;text-align:center">
      ${escapeHtml(t.footer)}
    </p>

    ${opts.unsubscribeUrl ? `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:16px 0 0">
        <tr>
          <td align="center">
            <p style="margin:0 0 4px;font-size:12px;color:${BRAND.muted}">${escapeHtml(t.noThanks)}</p>
            <a href="${opts.unsubscribeUrl}" style="font-size:12px;color:${BRAND.green};text-decoration:underline;font-weight:600">${escapeHtml(t.unsubscribe)}</a>
          </td>
        </tr>
      </table>
    ` : ''}
  `;

  return emailTemplate({
    lang,
    subject,
    previewText,
    bodyHtml,
  });
}
