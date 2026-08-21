interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

function buildIceServers(): IceServer[] {
  if (process.env.CALLS_TURN_URL) {
    return [
      {
        urls: process.env.CALLS_TURN_URL,
        username: process.env.CALLS_TURN_USERNAME,
        credential: process.env.CALLS_TURN_CREDENTIAL,
      },
    ];
  }
  try {
    return JSON.parse(process.env.CALLS_ICE_SERVERS || '[]');
  } catch {
    return [];
  }
}

export default () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  apiPrefix: process.env.API_PREFIX || 'api',
  corsOrigins: (
    process.env.CORS_ORIGINS ||
    'http://localhost:3000,http://localhost:3001,http://localhost:3002'
  )
    .split(',')
    .map((o) => o.trim()),

  backendUrl: process.env.BACKEND_URL || 'https://back-end-hq0is.faable.link',
  websiteUrl: process.env.WEBSITE_URL || 'http://localhost:3000',
  nextAuthUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',

  jwt: {
    secret: process.env.JWT_SECRET || process.env.AUTH_SECRET || 'dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',
  },

  adminJwt: {
    secret: process.env.ADMIN_JWT_SECRET || 'dev-admin-secret',
    expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '2h',
    refreshExpiresIn: process.env.ADMIN_REFRESH_TOKEN_EXPIRES_IN || '7d',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL,
    webClientId: process.env.GOOGLE_WEB_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    redirectUrl: process.env.WEBSITE_URL || 'http://localhost:3002',
  },

  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackUrl: process.env.GITHUB_CALLBACK_URL,
    redirectUrl: process.env.WEBSITE_URL || 'http://localhost:3002',
  },

  facebook: {
    clientId: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackUrl: process.env.FACEBOOK_CALLBACK_URL,
    redirectUrl: process.env.WEBSITE_URL || 'http://localhost:3002',
  },

  email: {
    host: process.env.EMAIL_SERVER_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_SERVER_PORT || '587', 10),
    user: process.env.EMAIL_SERVER_USER || process.env.EMAIL_USER,
    pass: process.env.EMAIL_SERVER_PASSWORD || process.env.EMAIL_PASS,
    from: process.env.EMAIL_FROM || process.env.EMAIL_SERVER_USER,
    senderName: process.env.EMAIL_SENDER_NAME || 'Fazlaka',
    logoUrl: process.env.EMAIL_LOGO_URL || '',
    receiver: process.env.RECEIVER_EMAIL || process.env.EMAIL_USER,
  },

  imgbb: {
    apiKey: process.env.IMGBB_API_KEY,
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },

  pusher: {
    appId: process.env.PUSHER_APP_ID,
    appKey: process.env.NEXT_PUBLIC_PUSHER_APP_KEY,
    appSecret: process.env.PUSHER_APP_SECRET,
    cluster: process.env.NEXT_PUBLIC_PUSHER_APP_CLUSTER || 'eu',
    useTLS: (process.env.PUSHER_USE_TLS || 'true') === 'true',
  },

  calls: {
    enabled: (process.env.CALLS_ENABLED || 'true') === 'true',
    signalingPath: process.env.CALLS_SIGNALING_PATH || '/calls',
    wsUrl: process.env.CALLS_WS_URL || '',
    iceServers: buildIceServers(),
  },

  mediasoup: {
    numWorkers: parseInt(process.env.MEDIASOUP_WORKERS || '1', 10),
    worker: {
      logLevel: (process.env.MEDIASOUP_LOG_LEVEL || 'warn') as
        'debug' | 'warn' | 'error' | 'none',
      logTags: (process.env.MEDIASOUP_LOG_TAGS || '')
        .split(',')
        .filter(Boolean),
    },
    router: {
      mediaCodecs: [
        {
          kind: 'audio' as const,
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: 'video' as const,
          mimeType: 'video/VP8',
          clockRate: 90000,
        },
      ],
    },
    webRtcTransport: {
      listenIps: [
        {
          ip: process.env.MEDIASOUP_LISTEN_IP || '127.0.0.1',
          announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || null,
        },
      ],
      initialAvailableOutgoingBitrate: parseInt(
        process.env.MEDIASOUP_OUTGOING_BITRATE || '500000',
        10,
      ),
      maxIncomingBitrate: parseInt(
        process.env.MEDIASOUP_MAX_INCOMING_BITRATE || '500000',
        10,
      ),
    },
    rtc: {
      minPort: parseInt(process.env.MEDIASOUP_RTC_MIN_PORT || '20000', 10),
      maxPort: parseInt(process.env.MEDIASOUP_RTC_MAX_PORT || '20050', 10),
    },
  },

  redis: {
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  },

  vapid: {
    publicKey: process.env.NEXT_PUBLIC_VAPID_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  },

  paymob: {
    apiKey: process.env.PAYMOB_API_KEY,
    integrationId: process.env.PAYMOB_INTEGRATION_ID,
    hmacSecret: process.env.PAYMOB_HMAC_SECRET,
    iframeId: process.env.PAYMOB_IFRAME_ID,
  },

  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY,
    channelId: process.env.YOUTUBE_CHANNEL_ID,
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME || 'Fazlaka_Auth_bot',
  },
});
