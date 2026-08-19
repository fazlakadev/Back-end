import {
  emailTemplate,
  emailHeading,
  emailParagraph,
  emailButton,
  emailOtpBox,
  emailCard,
  emailDivider,
  emailMuted,
  escapeHtml,
  BRAND,
  type Lang,
} from './email-template';

interface EmailVerificationOptions {
  lang?: Lang;
  userName: string;
  verificationLink: string;
  otp: string;
  websiteUrl: string;
}

const COPY = {
  ar: {
    subject: 'تحقق من بريدك الإلكتروني — فذلكة',
    previewText: 'تم إنشاء حسابك. تحقق من بريدك الإلكتروني لتفعيله.',
    heading: 'تحقق من بريدك الإلكتروني',
    intro: 'مرحباً! شكراً لانضمامك إلى فذلكة. للتحقق من بريدك الإلكتروني واستكمال التسجيل، استخدم الكود التالي أو الزر السريع.',
    codeLabel: 'رمز التحقق',
    expires: '⏰ هذا الرابط والكود صالحان لمدة <strong>24 ساعة</strong>.',
    orText: 'أو انسخ هذا الرابط والصقه في المتصفح:',
    successTitle: 'بعد التحقق',
    successNote: 'بمجرد التحقق، ستتمكن من الوصول إلى جميع ميزات فذلكة including الاشتراك في النشرة البريدية والمتابعة.',
    footer: 'شكراً لاختيارك فذلكة.',
  },
  en: {
    subject: 'Verify your email — Fazlaka',
    previewText: 'Your account was created. Verify your email to activate it.',
    heading: 'Verify Your Email',
    intro: 'Thanks for joining Fazlaka! To verify your email and complete registration, use the code below or the quick link.',
    codeLabel: 'Verification Code',
    expires: '⏰ This link and code are valid for <strong>24 hours</strong>.',
    orText: 'Or copy this link and paste it in your browser:',
    successTitle: 'After Verification',
    successNote: 'Once verified, you\'ll have full access to all Fazlaka features including newsletter subscriptions and following.',
    footer: 'Thank you for choosing Fazlaka.',
  },
  fr: {
    subject: 'Vérifiez votre e-mail — Fazlaka',
    previewText: 'Votre compte a été créé. Vérifiez votre e-mail pour l\'activer.',
    heading: 'Vérifiez votre e-mail',
    intro: 'Merci de rejoindre Fazlaka ! Pour vérifier votre e-mail et finaliser l\'inscription, utilisez le code ci-dessous ou le lien rapide.',
    codeLabel: 'Code de vérification',
    expires: '⏰ Ce lien et ce code sont valides pendant <strong>24 heures</strong>.',
    orText: 'Ou copiez ce lien et collez-le dans votre navigateur :',
    successTitle: 'Après la vérification',
    successNote: 'Une fois vérifié, vous aurez un accès complet à toutes les fonctionnalités de Fazlaka, y compris les abonnements et les suivis.',
    footer: 'Merci d\'avoir choisi Fazlaka.',
  },
};

export function emailVerificationEmail(opts: EmailVerificationOptions) {
  const lang = opts.lang ?? 'ar';
  const t = COPY[lang] ?? COPY.en;
  const isRtl = lang === 'ar';

  const bodyHtml = `
    ${emailHeading(t.heading, lang, { icon: '✉️' })}

    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155">
      ${escapeHtml(t.intro)}
    </p>

    ${emailOtpBox(opts.otp, t.codeLabel)}

    ${emailButton(opts.verificationLink, lang === 'ar' ? 'تحقق من البريد الإلكتروني' : lang === 'fr' ? 'Vérifier l\'e-mail' : 'Verify Email', { fullWidth: true })}

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0">
      <tr>
        <td align="center" style="font-size:13px;color:#64748B;line-height:1.6">
          ${t.expires}
        </td>
      </tr>
    </table>

    ${emailDivider()}

    ${emailCard({
      children: `
        <p style="margin:0 0 8px;font-size:12px;color:#64748B;line-height:1.6">${escapeHtml(t.orText)}</p>
        <p style="margin:0;font-size:12px;word-break:break-all;color:${BRAND.green};line-height:1.6" dir="ltr">
          <a href="${opts.verificationLink}" style="color:${BRAND.green};text-decoration:underline">${opts.verificationLink}</a>
        </p>
      `,
    })}

    ${emailCard({
      bg: '#F0FDF4',
      border: '#BBF7D0',
      title: t.successTitle,
      children: `
        <p style="margin:0;font-size:13px;line-height:1.7;color:#166534">${escapeHtml(t.successNote)}</p>
      `,
    })}
  `;

  return emailTemplate({
    lang,
    subject: t.subject,
    previewText: t.previewText,
    bodyHtml,
  });
}
