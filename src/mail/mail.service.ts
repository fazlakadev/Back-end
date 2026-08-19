import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import {
  welcomeEmail,
  passwordResetEmail,
  emailVerificationEmail,
  episodeNotificationEmail,
  newsletterEmail,
  adminNotificationEmail,
} from '../common/email/templates';
import type { Lang, AlertType } from '../common/email/templates';

interface MailVerificationOptions {
  link?: string;
  otp?: string;
  locale?: string | null;
}

interface EpisodeNotificationOpts {
  episodeId: string;
  episodeTitle: string;
  seasonName: string;
  episodeNumber: number;
  description?: string;
  watchUrl: string;
  unsubscribeUrl?: string;
}

interface AdminNotificationOpts {
  alertType: AlertType;
  title: string;
  message: string;
  details?: Record<string, string>;
  actionUrl?: string;
  actionLabel?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Mail;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('email.host'),
      port: this.config.get<number>('email.port'),
      secure: false,
      auth: {
        user: this.config.get<string>('email.user'),
        pass: this.config.get<string>('email.pass'),
      },
    });
  }

  private get from(): string {
    return this.config.get<string>('email.from') || 'no-reply@fazlaka.app';
  }

  private get senderName(): string {
    return this.config.get<string>('email.senderName') || 'Fazlaka';
  }

  private get logoUrl(): string {
    return this.config.get<string>('email.logoUrl') || '';
  }

  private get websiteUrl(): string {
    return this.config.get<string>('websiteUrl') || 'http://localhost:3000';
  }

  async send(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: `"${this.senderName}" <${this.from}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${options.to}`,
        error as Error,
      );
      return false;
    }
  }

  // ── NEW: HTML Template Emails ────────────────────────────────────

  async sendWelcomeEmail(
    to: string,
    name: string,
    locale?: string | null,
  ): Promise<boolean> {
    const lang = this.lang(locale);
    const template = welcomeEmail({
      lang,
      userName: name,
      websiteUrl: this.websiteUrl,
    });
    return this.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  async sendPasswordResetHtmlEmail(
    to: string,
    name: string,
    opts: MailVerificationOptions,
  ): Promise<boolean> {
    const lang = this.lang(opts.locale);
    if (!opts.link && !opts.otp) return false;
    const template = passwordResetEmail({
      lang,
      userName: name,
      resetLink: opts.link ?? '',
      otp: opts.otp ?? '',
      websiteUrl: this.websiteUrl,
    });
    return this.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  async sendVerificationHtmlEmail(
    to: string,
    name: string,
    opts: MailVerificationOptions,
  ): Promise<boolean> {
    const lang = this.lang(opts.locale);
    if (!opts.link && !opts.otp) return false;
    const template = emailVerificationEmail({
      lang,
      userName: name,
      verificationLink: opts.link ?? '',
      otp: opts.otp ?? '',
      websiteUrl: this.websiteUrl,
    });
    return this.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  async sendEpisodeNotificationEmail(
    to: string,
    name: string,
    episode: EpisodeNotificationOpts,
    locale?: string | null,
  ): Promise<boolean> {
    const lang = this.lang(locale);
    const template = episodeNotificationEmail({
      lang,
      userName: name,
      episodeTitle: episode.episodeTitle,
      seasonName: episode.seasonName,
      episodeNumber: episode.episodeNumber,
      description: episode.description ?? '',
      watchUrl: episode.watchUrl,
      unsubscribeUrl: episode.unsubscribeUrl,
      websiteUrl: this.websiteUrl,
    });
    return this.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  async sendAdminNotification(
    to: string,
    opts: AdminNotificationOpts,
  ): Promise<boolean> {
    const template = adminNotificationEmail({
      lang: 'en',
      alertType: opts.alertType,
      title: opts.title,
      message: opts.message,
      details: opts.details,
      actionUrl: opts.actionUrl,
      actionLabel: opts.actionLabel,
      websiteUrl: this.websiteUrl,
    });
    return this.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  // ── EXISTING: Backward-Compatible Methods ────────────────────────

  async sendVerificationEmail(
    to: string,
    name: string,
    opts: MailVerificationOptions,
  ): Promise<boolean> {
    const lang = this.lang(opts.locale);
    const t = this.copy(lang);
    return this.send({
      to,
      subject: t.verify.subject,
      html: this.layout(name, lang, [
        this.paragraph(t.verify.intro),
        ...(opts.otp ? [this.otpBox(opts.otp, t.codeLabel)] : []),
        ...(opts.link
          ? [
              this.button(opts.link, t.verify.button),
              this.muted(t.verify.orLink),
            ]
          : []),
        this.muted(t.verify.expires),
      ]),
    });
  }

  async sendPasswordResetEmail(
    to: string,
    name: string,
    opts: MailVerificationOptions,
  ): Promise<boolean> {
    const lang = this.lang(opts.locale);
    const t = this.copy(lang);
    return this.send({
      to,
      subject: t.reset.subject,
      html: this.layout(name, lang, [
        this.paragraph(t.reset.intro),
        ...(opts.otp ? [this.otpBox(opts.otp, t.codeLabel)] : []),
        ...(opts.link
          ? [this.button(opts.link, t.reset.button), this.muted(t.reset.orLink)]
          : []),
        this.muted(t.reset.expires),
      ]),
    });
  }

  async sendOtpEmail(
    to: string,
    name: string,
    otp: string,
    purpose: '2FA' | 'secondary' | 'emailChange' | 'primary' = '2FA',
    locale?: string | null,
  ): Promise<boolean> {
    const lang = this.lang(locale);
    const t = this.copy(lang);
    const key = purpose === '2FA' ? 'otp2fa' : 'otpGeneric';
    return this.send({
      to,
      subject: t[key].subject,
      html: this.layout(name, lang, [
        this.paragraph(t[key].intro),
        this.otpBox(otp, t.codeLabel),
        this.muted(t[key].expires),
      ]),
    });
  }

  async sendSupportReply(
    to: string,
    ticketId: string,
    body: string,
  ): Promise<boolean> {
    return this.send({
      to,
      subject: `Re: Support ticket #${ticketId}`,
      html: this.layout('', 'en', [this.paragraph(body)]),
    });
  }

  async sendAccountNotice(
    to: string,
    name: string,
    kind: 'banned' | 'unbanned',
    opts: {
      reason?: string | null;
      expiresAt?: Date | null;
      locale?: string | null;
    },
  ): Promise<boolean> {
    const lang = this.lang(opts.locale);
    const t = this.copy(lang) as {
      ban?: {
        subject: string;
        intro: string;
        reason: string;
        expires: string;
        appeal: string;
      };
      unban?: { subject: string; intro: string };
      codeLabel: string;
      tagline: string;
    };
    const key = kind === 'banned' ? 'ban' : 'unban';
    const copy = t[key];
    if (!copy) return false;
    const blocks: string[] = [this.paragraph(copy.intro)];
    if (kind === 'banned' && (opts.reason || opts.expiresAt)) {
      const banCopy = copy as {
        reason: string;
        expires: string;
        appeal: string;
      };
      if (opts.reason)
        blocks.push(
          this.paragraph(`${banCopy.reason}: <strong>${opts.reason}</strong>`),
        );
      if (opts.expiresAt)
        blocks.push(
          this.paragraph(
            `${banCopy.expires}: <strong>${opts.expiresAt.toLocaleDateString(lang === 'ar' ? 'ar-EG' : lang === 'fr' ? 'fr-FR' : 'en-US', { dateStyle: 'long' })}</strong>`,
          ),
        );
      blocks.push(this.paragraph(banCopy.appeal));
    }
    return this.send({
      to,
      subject: copy.subject,
      html: this.layout(name, lang, blocks),
    });
  }

  async sendNewLoginEmail(
    to: string,
    name: string,
    opts: {
      method?: string | null;
      ip?: string | null;
      country?: string | null;
      city?: string | null;
      region?: string | null;
      lat?: string | null;
      lng?: string | null;
      platform?: string | null;
      device?: string | null;
      browser?: string | null;
      os?: string | null;
      locale?: string | null;
    },
  ): Promise<boolean> {
    const lang = this.lang(opts.locale);
    const ar = lang === 'ar';
    const c = {
      bannerTitle: ar ? 'تسجيل دخول جديد' : 'New sign-in',
      bannerSub: ar
        ? 'تم تسجيل الدخول إلى حسابك في فذلكة'
        : 'Someone just signed in to your Fazlaka account',
      deviceTitle: ar ? 'الجهاز المستخدم' : 'Device used',
      time: ar ? 'الوقت' : 'Time',
      location: ar ? 'الموقع' : 'Location',
      ip: 'IP',
      method: ar ? 'طريقة الدخول' : 'Sign-in method',
      notYou: ar
        ? 'إذا لم تكن أنت من قام بتسجيل الدخول، غيّر كلمة المرور فوراً وإنهِ الجلسات الأخرى من مركز الأمان.'
        : "If this wasn't you, change your password now and revoke other sessions from the security center.",
      review: ar ? 'مراجعة النشاط والأجهزة' : 'Review activity & devices',
    };
    const methodLabel = (opts.method || '')
      .toUpperCase()
      .replace('OTP', ar ? 'رمز مؤقت (OTP)' : 'One-time code (OTP)')
      .replace('PASSWORD', ar ? 'كلمة المرور' : 'Password')
      .replace('GOOGLE', 'Google')
      .replace('GITHUB', 'GitHub')
      .replace('FACEBOOK', 'Facebook')
      .replace('TELEGRAM', 'Telegram')
      .replace('PHONE', ar ? 'الهاتف' : 'Phone');

    const place = [opts.city, opts.region, opts.country]
      .filter(Boolean)
      .join(ar ? '، ' : ', ');
    const timeStr = new Date().toLocaleString(
      ar ? 'ar-EG' : lang === 'fr' ? 'fr-FR' : 'en-US',
      { dateStyle: 'full', timeStyle: 'short' },
    );
    const platformText = this.platformLabel(opts.platform, opts.os, lang);
    const deviceName = opts.device || '—';
    const osText = opts.os || '—';

    const hasGps = opts.lat && opts.lng;
    const mapUrl = hasGps
      ? `https://staticmap.openstreetmap.de/staticmap.php?center=${opts.lat},${opts.lng}&zoom=13&size=500x230&maptype=standard&markers=${opts.lat},${opts.lng},red-pushpin`
      : null;

    const detailCell = (label: string, value: string) => `
      <tr>
        <td style="padding:9px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;width:110px;vertical-align:top">${label}</td>
        <td style="padding:9px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:13px;font-weight:600;vertical-align:top">${value}</td>
      </tr>`;

    const deviceCard = `
      <div style="background:linear-gradient(135deg,#f5f3ff,#ede9fe);border:1px solid #ddd6fe;border-radius:16px;padding:18px 20px;margin:0 0 18px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#7c3aed;margin:0 0 10px;font-weight:700">${c.deviceTitle}</div>
        <div style="font-size:19px;font-weight:800;color:#4c1d95;margin:0 0 4px">${platformText}</div>
        <div style="font-size:14px;color:#5b21b6;margin:0 0 2px">📲 ${deviceName}</div>
        <div style="font-size:13px;color:#7c3aed;margin:0">${osText}</div>
      </div>`;

    const mapBlock = mapUrl
      ? `
      <div style="border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;margin:0 0 18px">
        <img src="${mapUrl}" width="500" alt="${c.location}" style="display:block;width:100%;height:auto;border:0" />
      </div>`
      : '';

    const warningBox = `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:14px;padding:14px 16px;margin:0 0 18px">
        <p style="margin:0;font-size:13px;line-height:1.7;color:#92400e">⚠️ ${c.notYou}</p>
      </div>`;

    const html = `
      <div dir="${ar ? 'rtl' : 'ltr'}" style="background:#f8fafc;padding:28px 16px;font-family:Arial,'Segoe UI',Tahoma,sans-serif">
        <div style="max-width:560px;margin:auto">
          <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);border-radius:18px 18px 0 0;padding:26px 24px;text-align:center">
            <div style="font-size:34px;line-height:1;margin:0 0 8px">🔔</div>
            <div style="color:#ffffff;font-size:20px;font-weight:800;margin:0 0 4px">${c.bannerTitle}</div>
            <div style="color:#e9d5ff;font-size:13px;margin:0">${c.bannerSub}</div>
          </div>
          <div style="background:#ffffff;border:1px solid #eef2f7;border-top:0;border-radius:0 0 18px 18px;padding:26px 24px;box-shadow:0 1px 4px rgba(15,23,42,.05)">
            ${name ? this.paragraph(ar ? `مرحباً ${name}،` : `Hi ${name},`) : ''}
            ${deviceCard}
            ${mapBlock}
            <table style="width:100%;border-collapse:collapse;margin:0 0 18px;font-size:13px">
              ${detailCell(c.time, timeStr)}
              ${place ? detailCell(c.location, place) : ''}
              ${detailCell(c.ip, opts.ip || '—')}
              ${detailCell(c.method, methodLabel || '—')}
            </table>
            ${warningBox}
            <div style="text-align:center">
              ${this.button(`${this.websiteUrl}/settings`, c.review)}
            </div>
          </div>
        </div>
      </div>`;

    const subject = ar
      ? '🔔 تسجيل دخول جديد إلى حسابك — فذلكة'
      : lang === 'fr'
        ? '🔔 Nouvelle connexion à votre compte — Fazlaka'
        : '🔔 New sign-in to your account — Fazlaka';
    return this.send({ to, subject, html });
  }

  async sendNewsletterEmail(
    to: string,
    name: string,
    subject: string,
    htmlBody: string,
    unsubscribeUrl?: string,
    locale?: string | null,
  ): Promise<boolean> {
    const lang = this.lang(locale);
    return this.send({
      to,
      subject,
      html: this.layout(name, lang, [htmlBody], unsubscribeUrl),
    });
  }

  // ── PRIVATE HELPERS ──────────────────────────────────────────────

  private lang(locale?: string | null): Lang {
    const l = String(locale || '').toLowerCase();
    if (l === 'en' || l === 'fr') return l;
    return 'ar';
  }

  private copy(lang: Lang) {
    const c = {
      ar: {
        codeLabel: 'رمز التحقق',
        tagline: 'أفلامك المفضلة، بطريقتك — فذلكة',
        verify: {
          subject: 'تحقق من بريدك الإلكتروني — فذلكة',
          intro:
            'مرحباً، شكراً لانضمامك إلى فذلكة. للتحقق من بريدك الإلكتروني استخدم الكود أدناه أو الزر السريع.',
          button: 'تحقق من البريد',
          orLink: 'أو اضغط على الرابط أعلاه إن لم تعمل الأزرار.',
          expires: 'الكود والرابط صالحان لمدة 24 ساعة.',
        },
        reset: {
          subject: 'إعادة تعيين كلمة المرور — فذلكة',
          intro: 'استخدم الكود أدناه أو الزر السريع لإعادة تعيين كلمة مرورك.',
          button: 'إعادة تعيين كلمة المرور',
          orLink: 'أو اضغط على الرابط أعلاه إن لم تعمل الأزرار.',
          expires: 'الكود والرابط صالحان لمدة 30 دقيقة.',
        },
        otp2fa: {
          subject: 'رمز التحقق بخطوتين — فذلكة',
          intro: 'أدخل الكود التالي لإكمال تسجيل الدخول بخطوتين.',
          expires: 'الكود صالح لمدة 5 دقائق.',
        },
        otpGeneric: {
          subject: 'رمز التحقق — فذلكة',
          intro: 'أدخل الكود التالي لإتمام العملية.',
          expires: 'الكود صالح لمدة 5 دقائق.',
        },
        ban: {
          subject: 'تم تعليق حسابك — فذلكة',
          intro: 'نأسف لإبلاغك بأن حسابك على فذلكة تم تعليقه.',
          reason: 'السبب',
          expires: 'تاريخ انتهاء التعليق',
          appeal: 'إذا كنت تعتقد أن هذا قرار خاطئ، يرجى التواصل مع فريق الدعم.',
        },
        unban: {
          subject: 'تم رفع التعليق عن حسابك — فذلكة',
          intro:
            'يسعدنا إبلاغك بأن التعليق قد رفع عن حسابك ويمكنك استخدامه من جديد.',
        },
        newLogin: {
          subject: 'تسجيل دخول جديد إلى حسابك — فذلكة',
          intro:
            'حدث تسجيل دخول جديد إلى حسابك على فذلكة. إن لم يكن هذا أنت، فتصرف فوراً.',
          time: 'الوقت',
          location: 'الموقع',
          ip: 'عنوان IP',
          device: 'الجهاز والمتصفح',
          method: 'طريقة الدخول',
          help: 'إذا كان هذا أنت، يمكنك تجاهل هذه الرسالة بأمان.',
          action:
            'إذا لم تكن أنت، غيّر كلمة مرورك فوراً ومراجع إعدادات الأمان في حسابك.',
        },
      },
      en: {
        codeLabel: 'Verification code',
        tagline: 'Fazlaka — your movies, your way',
        verify: {
          subject: 'Verify your email — Fazlaka',
          intro:
            'Thanks for joining Fazlaka. To verify your email, use the code below or the quick link.',
          button: 'Verify Email',
          orLink: 'Or tap the link above if buttons are not rendered.',
          expires: 'The code and link expire in 24 hours.',
        },
        reset: {
          subject: 'Reset your password — Fazlaka',
          intro: 'Use the code below or the quick link to reset your password.',
          button: 'Reset Password',
          orLink: 'Or tap the link above if buttons are not rendered.',
          expires: 'The code and link expire in 30 minutes.',
        },
        otp2fa: {
          subject: 'Two-factor code — Fazlaka',
          intro: 'Enter the code below to complete your two-step sign-in.',
          expires: 'The code expires in 5 minutes.',
        },
        otpGeneric: {
          subject: 'Verification code — Fazlaka',
          intro: 'Enter the code below to complete this action.',
          expires: 'The code expires in 5 minutes.',
        },
        ban: {
          subject: 'Your account has been banned — Fazlaka',
          intro:
            'We are sorry to inform you that your Fazlaka account has been suspended.',
          reason: 'Reason',
          expires: 'Ban expires',
          appeal:
            'If you believe this decision is wrong, please contact our support team.',
        },
        unban: {
          subject: 'Your account has been unbanned — Fazlaka',
          intro:
            'Good news: the suspension on your account has been lifted and you can use it again.',
        },
        newLogin: {
          subject: 'New sign-in to your account — Fazlaka',
          intro:
            'A new sign-in to your Fazlaka account just happened. If this was not you, act immediately.',
          time: 'Time',
          location: 'Location',
          ip: 'IP address',
          device: 'Device & browser',
          method: 'Sign-in method',
          help: 'If this was you, you can safely ignore this email.',
          action:
            'If this was not you, change your password now and review your account security settings.',
        },
      },
      fr: {
        codeLabel: 'Code de vérification',
        tagline: 'Fazlaka — vos films, à votre façon',
        verify: {
          subject: 'Vérifiez votre e-mail — Fazlaka',
          intro:
            'Merci de rejoindre Fazlaka. Pour vérifier votre e-mail, utilisez le code ci-dessous ou le lien rapide.',
          button: 'Vérifier l\'e-mail',
          orLink:
            'Ou cliquez sur le lien ci-dessus si les boutons ne s\'affichent pas.',
          expires: 'Le code et le lien expirent dans 24 heures.',
        },
        reset: {
          subject: 'Réinitialisez votre mot de passe — Fazlaka',
          intro:
            'Utilisez le code ci-dessous ou le lien rapide pour réinitialiser votre mot de passe.',
          button: 'Réinitialiser le mot de passe',
          orLink:
            'Ou cliquez sur le lien ci-dessus si les boutons ne s\'affichent pas.',
          expires: 'Le code et le lien expirent dans 30 minutes.',
        },
        otp2fa: {
          subject: 'Code de double authentification — Fazlaka',
          intro:
            'Saisissez le code ci-dessous pour terminer votre connexion en deux étapes.',
          expires: 'Le code expire dans 5 minutes.',
        },
        otpGeneric: {
          subject: 'Code de vérification — Fazlaka',
          intro: 'Saisissez le code ci-dessous pour terminer cette action.',
          expires: 'Le code expire dans 5 minutes.',
        },
        ban: {
          subject: 'Votre compte a été suspendu — Fazlaka',
          intro:
            'Nous sommes désolés de vous informer que votre compte Fazlaka a été suspendu.',
          reason: 'Raison',
          expires: 'La suspension expire le',
          appeal:
            'Si vous pensez que cette décision est erronée, veuillez contacter notre équipe de support.',
        },
        unban: {
          subject: 'Votre compte a été réactivé — Fazlaka',
          intro:
            'Bonne nouvelle : la suspension de votre compte a été levée et vous pouvez l\'utiliser à nouveau.',
        },
        newLogin: {
          subject: 'Nouvelle connexion à votre compte — Fazlaka',
          intro:
            'Une nouvelle connexion à votre compte Fazlaka vient d\'avoir lieu. Si ce n\'était pas vous, agissez immédiatement.',
          time: 'Heure',
          location: 'Emplacement',
          ip: 'Adresse IP',
          device: 'Appareil et navigateur',
          method: 'Méthode de connexion',
          help: 'S\'il s\'agit bien de vous, vous pouvez ignorer cet e-mail en toute sécurité.',
          action:
            'Si ce n\'était pas vous, changez votre mot de passe immédiatement et vérifiez les paramètres de sécurité de votre compte.',
        },
      },
    };
    return c[lang] ?? c.ar;
  }

  private paragraph(text: string): string {
    return `<p style="font-size:15px;line-height:1.7;color:#334155;margin:0 0 18px">${text}</p>`;
  }

  private muted(text: string): string {
    return `<p style="font-size:12px;line-height:1.6;color:#94a3b8;margin:14px 0 0">${text}</p>`;
  }

  private detailRow(label: string, value: string): string {
    return `
      <tr>
        <td style="padding:7px 0;color:#64748b;font-size:13px;width:110px;vertical-align:top">${label}</td>
        <td style="padding:7px 0;color:#334155;font-size:13px;font-weight:600;vertical-align:top">${value}</td>
      </tr>`;
  }

  private otpBox(otp: string, label: string): string {
    return `
      <div style="background:#f6f1ff;border:1px solid #e9d5ff;border-radius:14px;padding:22px 16px;text-align:center;margin:0 0 20px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#8b5cf6;margin:0 0 12px">${label}</div>
        <div style="font-size:32px;font-weight:700;letter-spacing:10px;color:#6d28d9;font-family:Consolas,Menlo,monospace">${otp}</div>
      </div>`;
  }

  private button(href: string, label: string): string {
    return `
      <a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:10px;font-size:15px;font-weight:700;margin:4px 0 8px;box-shadow:0 4px 10px rgba(124,58,237,.25)">
        ${label}
      </a>`;
  }

  private layout(
    name: string,
    lang: Lang,
    blocks: string[],
    unsubscribeUrl?: string,
  ): string {
    const t = this.copy(lang);
    const greeting =
      lang === 'ar'
        ? `مرحباً ${name},`
        : lang === 'fr'
          ? `Bonjour ${name},`
          : `Hi ${name},`;
    const footer =
      lang === 'ar'
        ? 'إن لم تطلب هذا الإجراء، يمكنك تجاهل هذه الرسالة بأمان.'
        : lang === 'fr'
          ? "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité."
          : 'If you did not request this, you can safely ignore this email.';
    const unsubscribe =
      lang === 'ar'
        ? 'تريد إيقاف النشرة البريدية؟'
        : lang === 'fr'
          ? 'Vous souhaitez ne plus recevoir cette lettre ?'
          : 'Want to stop receiving this newsletter?';
    const brand = this.logoUrl
      ? `<img src="${this.logoUrl}" alt="Fazlaka" width="150" style="width:150px;height:auto;max-width:60%;border:0;outline:none;text-decoration:none" />`
      : `<span style="font-size:22px;font-weight:800;color:#7c3aed">فذلكة <span style="color:#475569">Fazlaka</span></span>`;
    return `
      <div dir="${lang === 'ar' ? 'rtl' : 'ltr'}" style="background:#f8fafc;padding:28px 16px;font-family:Arial,'Segoe UI',Tahoma,sans-serif">
        <div style="max-width:560px;margin:auto">
          <div style="text-align:center;padding:4px 0 22px">
            <a href="${this.websiteUrl}" style="text-decoration:none">${brand}</a>
          </div>
          <div style="background:#ffffff;border:1px solid #eef2f7;border-radius:18px;padding:30px 28px;box-shadow:0 1px 4px rgba(15,23,42,.05)">
            ${name ? `<p style="font-size:15px;line-height:1.7;color:#334155;margin:0 0 18px">${greeting}</p>` : ''}
            ${blocks.join('\n')}
          </div>
          <div style="text-align:center;padding:22px 0 6px">
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.7">${footer}</p>
            ${unsubscribeUrl ? `<p style="margin:8px 0 0;font-size:12px"><a href="${unsubscribeUrl}" style="color:#94a3b8">${unsubscribe}</a></p>` : ''}
            <p style="margin:6px 0 0;color:#cbd5e1;font-size:11px">${t.tagline}</p>
            <p style="margin:4px 0 0;font-size:12px"><a href="${this.websiteUrl}" style="color:#8b5cf6;text-decoration:none">${this.websiteUrl.replace(/^https?:\/\//, '')}</a></p>
          </div>
        </div>
      </div>`;
  }

  private platformLabel(
    platform?: string | null,
    os?: string | null,
    lang: Lang = 'ar',
  ): string {
    const p = (platform || '').toUpperCase();
    const osl = (os || '').toLowerCase();
    const android = osl.includes('android');
    const ios = osl.includes('ios') || osl.includes('iphone');
    if (p === 'MOBILE') {
      if (android)
        return lang === 'ar'
          ? '📱 تطبيق الأندرويد'
          : lang === 'fr'
            ? '📱 Application Android'
            : '📱 Android App';
      if (ios)
        return lang === 'ar'
          ? '📱 تطبيق الآيفون'
          : lang === 'fr'
            ? '📱 Application iPhone'
            : '📱 iPhone App';
      return lang === 'ar' ? '📱 تطبيق موبايل' : '📱 Mobile App';
    }
    if (p === 'DESKTOP')
      return lang === 'ar' ? '💻 تطبيق الكمبيوتر' : '💻 Desktop App';
    return lang === 'ar' ? '🌐 موقع الويب' : '🌐 Website';
  }
}
