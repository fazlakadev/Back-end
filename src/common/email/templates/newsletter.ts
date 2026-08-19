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
  TAGLINE,
  type Lang,
} from './email-template';

interface NewsletterEmailOptions {
  lang?: Lang;
  userName: string;
  subject: string;
  bodyHtml: string;
  unsubscribeUrl?: string;
  websiteUrl: string;
}

const COPY = {
  ar: {
    previewText: 'تحديثات وأخبار من فذلكة',
    featuredTitle: 'أخبار المنصة',
    footer: 'شكراً لتواصلك معنا!',
    unsubscribeLabel: 'تريد إيقاف النشرة البريدية؟',
    unsubscribe: 'إلغاء الاشتراك',
  },
  en: {
    previewText: 'Updates and news from Fazlaka',
    featuredTitle: 'Platform News',
    footer: 'Thank you for staying connected!',
    unsubscribeLabel: 'Want to stop receiving this newsletter?',
    unsubscribe: 'Unsubscribe',
  },
  fr: {
    previewText: 'Actualités et mises à jour de Fazlaka',
    featuredTitle: 'Actualités de la plateforme',
    footer: 'Merci de rester connecté !',
    unsubscribeLabel: 'Vous souhaitez ne plus recevoir cette lettre ?',
    unsubscribe: 'Se désabonner',
  },
};

export function newsletterEmail(opts: NewsletterEmailOptions) {
  const lang = opts.lang ?? 'ar';
  const t = COPY[lang] ?? COPY.en;

  const bodyHtml = `
    ${emailHeading(opts.subject, lang)}

    ${emailCard({
      title: t.featuredTitle,
      children: opts.bodyHtml,
    })}

    ${emailDivider()}

    <p style="margin:0;font-size:13px;line-height:1.7;color:#334155;text-align:center">
      ${escapeHtml(t.footer)}
    </p>

    ${opts.unsubscribeUrl ? `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:16px 0 0">
        <tr>
          <td align="center">
            <p style="margin:0 0 4px;font-size:12px;color:${BRAND.muted}">${escapeHtml(t.unsubscribeLabel)}</p>
            <a href="${opts.unsubscribeUrl}" style="font-size:12px;color:${BRAND.green};text-decoration:underline;font-weight:600">${escapeHtml(t.unsubscribe)}</a>
          </td>
        </tr>
      </table>
    ` : ''}
  `;

  return emailTemplate({
    lang,
    subject: opts.subject,
    previewText: t.previewText,
    bodyHtml,
  });
}
