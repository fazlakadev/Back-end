-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('ar', 'en', 'fr');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('WEB', 'MOBILE', 'DESKTOP');

-- CreateEnum
CREATE TYPE "TwoFactorMethod" AS ENUM ('EMAIL', 'APP');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('mobile', 'tablet', 'desktop', 'tv', 'unknown');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('article', 'episode', 'season', 'playlist', 'comment', 'user');

-- CreateEnum
CREATE TYPE "LikeType" AS ENUM ('like', 'love', 'haha', 'wow', 'sad', 'angry');

-- CreateEnum
CREATE TYPE "FriendStatus" AS ENUM ('pending', 'accepted', 'rejected', 'blocked');

-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('direct', 'group');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'image', 'video', 'audio');

-- CreateEnum
CREATE TYPE "GroupMemberRole" AS ENUM ('member', 'admin');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('open', 'pending', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('active', 'ended');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('comment', 'like', 'friend_request', 'friend_accepted', 'system', 'support', 'announcement');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'banned', 'deleted');

-- CreateEnum
CREATE TYPE "BannerPosition" AS ENUM ('hero', 'sidebar', 'feed', 'app_banner');

-- CreateEnum
CREATE TYPE "AdminRank" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MODERATOR');

-- CreateEnum
CREATE TYPE "PlaylistKind" AS ENUM ('user', 'platform');

-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('active', 'hidden', 'removed');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('spam', 'harassment', 'inappropriate', 'copyright', 'impersonation', 'other');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('pending', 'reviewing', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "RatingStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "BodyFormat" AS ENUM ('text', 'html');

-- CreateEnum
CREATE TYPE "NewsletterStatus" AS ENUM ('pending', 'active', 'unsubscribed', 'bounced');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('pending', 'success', 'failed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "passwordHash" TEXT,
    "googleId" TEXT,
    "githubId" TEXT,
    "facebookId" TEXT,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "publicId" TEXT,
    "avatarUrl" TEXT,
    "bannerUrl" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "termsVersion" TEXT,
    "bio" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "lastActiveAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "lastLoginNotifiedIp" TEXT,
    "lastPlatform" "Platform",
    "locale" "Locale" NOT NULL DEFAULT 'ar',
    "referralCode" TEXT,
    "referredById" TEXT,
    "failedLoginAt" TIMESTAMP(3),
    "onboardedAt" TIMESTAMP(3),
    "phone" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "telegramChatId" TEXT,
    "telegramUsername" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorMethod" "TwoFactorMethod" NOT NULL DEFAULT 'EMAIL',
    "twoFactorSecret" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "banReason" TEXT,
    "banExpiresAt" TIMESTAMP(3),
    "bannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'ar',
    "primaryLocale" "Locale" NOT NULL DEFAULT 'ar',
    "secondaryLocale" "Locale" DEFAULT 'en',
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "loginAlerts" BOOLEAN NOT NULL DEFAULT true,
    "pushNotifications" BOOLEAN NOT NULL DEFAULT true,
    "newsletter" BOOLEAN NOT NULL DEFAULT false,
    "darkMode" BOOLEAN NOT NULL DEFAULT true,
    "showOnline" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT DEFAULT 'Africa/Cairo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "platform" "Platform",
    "deviceType" TEXT,
    "deviceName" TEXT,
    "os" TEXT,
    "browser" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "city" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "method" TEXT,
    "platform" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "ip" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "city" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramLink" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "username" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "email" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "avatarUrl" TEXT,
    "displayName" TEXT,
    "rank" "AdminRank" NOT NULL DEFAULT 'MODERATOR',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "lastLoginCountry" TEXT,
    "lastLoginCity" TEXT,
    "lastLoginLat" DECIMAL(10,7),
    "lastLoginLng" DECIMAL(10,7),
    "lastLoginDevice" TEXT,
    "lastLoginBrowser" TEXT,
    "lastLoginOs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "platform" TEXT,
    "deviceType" TEXT,
    "deviceName" TEXT,
    "os" TEXT,
    "browser" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "city" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuthEvent" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "method" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "ip" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "city" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminOtp" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "otpExpiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "purpose" TEXT NOT NULL DEFAULT '2fa',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformConfig" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "displayName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT,
    "minVersion" TEXT,
    "latestVersion" TEXT,
    "downloadUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "valueJson" JSONB,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "type" TEXT NOT NULL DEFAULT 'manual',
    "data" JSONB,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEmail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "note" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'pending',
    "handledByAdminId" TEXT,
    "platform" "Platform",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportMessage" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL DEFAULT 'admin',
    "senderAdminId" TEXT,
    "senderUserId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Geolocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "country" TEXT,
    "countryCode" TEXT,
    "region" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "platform" "Platform",
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Geolocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'imgbb',
    "deleteUrl" TEXT,
    "kind" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "size" INTEGER,
    "mimeType" TEXT,
    "purpose" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "position" "BannerPosition" NOT NULL DEFAULT 'hero',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BannerTranslation" (
    "id" TEXT NOT NULL,
    "bannerId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,

    CONSTRAINT "BannerTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "authorId" TEXT,
    "seasonId" TEXT,
    "platform" "Platform" NOT NULL DEFAULT 'WEB',
    "coverImage" TEXT,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bodyFormat" "BodyFormat" NOT NULL DEFAULT 'text',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleTranslation" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT,

    CONSTRAINT "ArticleTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdById" TEXT,
    "platform" "Platform" NOT NULL DEFAULT 'WEB',
    "coverImage" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonTranslation" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "SeasonTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "seasonId" TEXT,
    "authorId" TEXT,
    "platform" "Platform" NOT NULL DEFAULT 'WEB',
    "coverImage" TEXT,
    "videoUrl" TEXT,
    "audioUrl" TEXT,
    "duration" INTEGER,
    "episodeNumber" INTEGER,
    "category" TEXT,
    "releaseYear" INTEGER,
    "tags" TEXT[],
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpisodeTranslation" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,

    CONSTRAINT "EpisodeTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "PlaylistKind" NOT NULL DEFAULT 'user',
    "platform" "Platform" NOT NULL DEFAULT 'WEB',
    "ownerId" TEXT,
    "createdByAdminId" TEXT,
    "coverImage" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistTranslation" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "PlaylistTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistItem" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "episodeId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaylistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Like" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "type" "LikeType" NOT NULL DEFAULT 'like',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "status" "CommentStatus" NOT NULL DEFAULT 'active',
    "platform" "Platform",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friend" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "status" "FriendStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Friend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "kind" "ConversationKind" NOT NULL DEFAULT 'direct',
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "bannerUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GroupMemberRole" NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'text',
    "body" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "attachmentMime" TEXT,
    "attachmentName" TEXT,
    "attachmentSize" INTEGER,
    "durationSec" INTEGER,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "View" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "contentType" "ContentType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "deviceType" "DeviceType" NOT NULL DEFAULT 'unknown',
    "deviceName" TEXT,
    "os" TEXT,
    "browser" TEXT,
    "appVersion" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "city" TEXT,
    "referrer" TEXT,
    "locale" "Locale",
    "durationSec" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "View_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'open',
    "priority" "TicketPriority" NOT NULL DEFAULT 'medium',
    "platform" "Platform",
    "deviceInfo" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallSession" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'active',
    "startedBy" TEXT,
    "startedByAdminId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedBy" TEXT,
    "durationSec" INTEGER,

    CONSTRAINT "CallSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderId" TEXT,
    "senderAdminId" TEXT,
    "isAdminReply" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "attachments" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "deepLink" TEXT,
    "locale" TEXT,
    "platform" TEXT,
    "sendPush" BOOLEAN NOT NULL DEFAULT false,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "pushSent" INTEGER NOT NULL DEFAULT 0,
    "pushFailed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybackProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "positionSeconds" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybackProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "RatingStatus" NOT NULL DEFAULT 'approved',
    "moderationNote" TEXT,
    "moderatedById" TEXT,
    "platform" "Platform",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "entityLabel" TEXT,
    "details" JSONB,
    "ip" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "platform" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "city" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "status" "NewsletterStatus" NOT NULL DEFAULT 'pending',
    "token" TEXT,
    "subscribedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastStatus" "WebhookDeliveryStatus",
    "lastTriggeredAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'pending',
    "statusCode" INTEGER,
    "responseBody" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "deviceName" TEXT,
    "os" TEXT,
    "appVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "User_facebookId_key" ON "User"("facebookId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_publicId_key" ON "User"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_referredById_idx" ON "User"("referredById");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthEvent_userId_createdAt_idx" ON "AuthEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuthEvent_eventType_createdAt_idx" ON "AuthEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "AuthEvent_platform_createdAt_idx" ON "AuthEvent"("platform", "createdAt");

-- CreateIndex
CREATE INDEX "AuthEvent_createdAt_idx" ON "AuthEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE INDEX "VerificationToken_userId_idx" ON "VerificationToken"("userId");

-- CreateIndex
CREATE INDEX "VerificationToken_token_idx" ON "VerificationToken"("token");

-- CreateIndex
CREATE INDEX "PhoneVerification_userId_idx" ON "PhoneVerification"("userId");

-- CreateIndex
CREATE INDEX "PhoneVerification_phone_idx" ON "PhoneVerification"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLink_phone_key" ON "TelegramLink"("phone");

-- CreateIndex
CREATE INDEX "TelegramLink_chatId_idx" ON "TelegramLink"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE INDEX "Admin_username_idx" ON "Admin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "AdminRefreshToken_token_key" ON "AdminRefreshToken"("token");

-- CreateIndex
CREATE INDEX "AdminRefreshToken_adminId_idx" ON "AdminRefreshToken"("adminId");

-- CreateIndex
CREATE INDEX "AdminRefreshToken_expiresAt_idx" ON "AdminRefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AdminAuthEvent_adminId_createdAt_idx" ON "AdminAuthEvent"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuthEvent_eventType_createdAt_idx" ON "AdminAuthEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuthEvent_createdAt_idx" ON "AdminAuthEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AdminOtp_adminId_idx" ON "AdminOtp"("adminId");

-- CreateIndex
CREATE INDEX "AdminOtp_createdAt_idx" ON "AdminOtp"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConfig_platform_key" ON "PlatformConfig"("platform");

-- CreateIndex
CREATE INDEX "SiteSetting_isPublic_idx" ON "SiteSetting"("isPublic");

-- CreateIndex
CREATE INDEX "Backup_createdAt_idx" ON "Backup"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserEmail_email_key" ON "UserEmail"("email");

-- CreateIndex
CREATE INDEX "UserEmail_userId_idx" ON "UserEmail"("userId");

-- CreateIndex
CREATE INDEX "UserEmail_email_idx" ON "UserEmail"("email");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE INDEX "Report_contentType_contentId_idx" ON "Report"("contentType", "contentId");

-- CreateIndex
CREATE INDEX "Report_reporterId_idx" ON "Report"("reporterId");

-- CreateIndex
CREATE INDEX "Report_handledByAdminId_idx" ON "Report"("handledByAdminId");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReportMessage_reportId_idx" ON "ReportMessage"("reportId");

-- CreateIndex
CREATE INDEX "ReportMessage_senderType_idx" ON "ReportMessage"("senderType");

-- CreateIndex
CREATE INDEX "ReportMessage_senderUserId_idx" ON "ReportMessage"("senderUserId");

-- CreateIndex
CREATE INDEX "ReportMessage_reportId_createdAt_idx" ON "ReportMessage"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "Geolocation_userId_idx" ON "Geolocation"("userId");

-- CreateIndex
CREATE INDEX "Geolocation_countryCode_idx" ON "Geolocation"("countryCode");

-- CreateIndex
CREATE INDEX "MediaAsset_userId_idx" ON "MediaAsset"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BannerTranslation_bannerId_locale_key" ON "BannerTranslation"("bannerId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_authorId_idx" ON "Article"("authorId");

-- CreateIndex
CREATE INDEX "Article_seasonId_idx" ON "Article"("seasonId");

-- CreateIndex
CREATE INDEX "Article_platform_idx" ON "Article"("platform");

-- CreateIndex
CREATE INDEX "Article_published_idx" ON "Article"("published");

-- CreateIndex
CREATE INDEX "Article_publishedAt_idx" ON "Article"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleTranslation_articleId_locale_key" ON "ArticleTranslation"("articleId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Season_slug_key" ON "Season"("slug");

-- CreateIndex
CREATE INDEX "Season_platform_idx" ON "Season"("platform");

-- CreateIndex
CREATE INDEX "Season_published_idx" ON "Season"("published");

-- CreateIndex
CREATE INDEX "Season_createdById_idx" ON "Season"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonTranslation_seasonId_locale_key" ON "SeasonTranslation"("seasonId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Episode_slug_key" ON "Episode"("slug");

-- CreateIndex
CREATE INDEX "Episode_seasonId_idx" ON "Episode"("seasonId");

-- CreateIndex
CREATE INDEX "Episode_platform_idx" ON "Episode"("platform");

-- CreateIndex
CREATE INDEX "Episode_published_idx" ON "Episode"("published");

-- CreateIndex
CREATE INDEX "Episode_category_idx" ON "Episode"("category");

-- CreateIndex
CREATE INDEX "Episode_releaseYear_idx" ON "Episode"("releaseYear");

-- CreateIndex
CREATE INDEX "Episode_authorId_idx" ON "Episode"("authorId");

-- CreateIndex
CREATE INDEX "Episode_seasonId_episodeNumber_idx" ON "Episode"("seasonId", "episodeNumber");

-- CreateIndex
CREATE INDEX "Episode_published_createdAt_idx" ON "Episode"("published", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EpisodeTranslation_episodeId_locale_key" ON "EpisodeTranslation"("episodeId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Playlist_slug_key" ON "Playlist"("slug");

-- CreateIndex
CREATE INDEX "Playlist_kind_idx" ON "Playlist"("kind");

-- CreateIndex
CREATE INDEX "Playlist_platform_idx" ON "Playlist"("platform");

-- CreateIndex
CREATE INDEX "Playlist_ownerId_isPublic_idx" ON "Playlist"("ownerId", "isPublic");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistTranslation_playlistId_locale_key" ON "PlaylistTranslation"("playlistId", "locale");

-- CreateIndex
CREATE INDEX "PlaylistItem_episodeId_idx" ON "PlaylistItem"("episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistItem_playlistId_episodeId_key" ON "PlaylistItem"("playlistId", "episodeId");

-- CreateIndex
CREATE INDEX "Like_contentType_contentId_idx" ON "Like"("contentType", "contentId");

-- CreateIndex
CREATE INDEX "Like_userId_createdAt_idx" ON "Like"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Like_userId_contentType_contentId_key" ON "Like"("userId", "contentType", "contentId");

-- CreateIndex
CREATE INDEX "Comment_contentType_contentId_idx" ON "Comment"("contentType", "contentId");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");

-- CreateIndex
CREATE INDEX "Comment_contentType_contentId_createdAt_idx" ON "Comment"("contentType", "contentId", "createdAt");

-- CreateIndex
CREATE INDEX "Friend_receiverId_status_idx" ON "Friend"("receiverId", "status");

-- CreateIndex
CREATE INDEX "Friend_senderId_status_idx" ON "Friend"("senderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Friend_senderId_receiverId_key" ON "Friend"("senderId", "receiverId");

-- CreateIndex
CREATE INDEX "Conversation_userAId_userBId_idx" ON "Conversation"("userAId", "userBId");

-- CreateIndex
CREATE INDEX "Conversation_userAId_idx" ON "Conversation"("userAId");

-- CreateIndex
CREATE INDEX "Conversation_userBId_idx" ON "Conversation"("userBId");

-- CreateIndex
CREATE INDEX "Conversation_kind_idx" ON "Conversation"("kind");

-- CreateIndex
CREATE INDEX "Conversation_createdById_idx" ON "Conversation"("createdById");

-- CreateIndex
CREATE INDEX "GroupMember_userId_idx" ON "GroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_conversationId_userId_key" ON "GroupMember"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_createdAt_idx" ON "Message"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "View_contentType_contentId_idx" ON "View"("contentType", "contentId");

-- CreateIndex
CREATE INDEX "View_userId_idx" ON "View"("userId");

-- CreateIndex
CREATE INDEX "View_platform_idx" ON "View"("platform");

-- CreateIndex
CREATE INDEX "View_createdAt_idx" ON "View"("createdAt");

-- CreateIndex
CREATE INDEX "View_countryCode_idx" ON "View"("countryCode");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "CallSession_ticketId_idx" ON "CallSession"("ticketId");

-- CreateIndex
CREATE INDEX "CallSession_status_idx" ON "CallSession"("status");

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_idx" ON "SupportMessage"("ticketId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BroadcastLog_adminId_idx" ON "BroadcastLog"("adminId");

-- CreateIndex
CREATE INDEX "BroadcastLog_createdAt_idx" ON "BroadcastLog"("createdAt");

-- CreateIndex
CREATE INDEX "PlaybackProgress_userId_updatedAt_idx" ON "PlaybackProgress"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "PlaybackProgress_episodeId_idx" ON "PlaybackProgress"("episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybackProgress_userId_episodeId_key" ON "PlaybackProgress"("userId", "episodeId");

-- CreateIndex
CREATE INDEX "Rating_contentType_contentId_status_idx" ON "Rating"("contentType", "contentId", "status");

-- CreateIndex
CREATE INDEX "Rating_status_idx" ON "Rating"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_userId_contentType_contentId_key" ON "Rating"("userId", "contentType", "contentId");

-- CreateIndex
CREATE INDEX "AuditLog_adminId_idx" ON "AuditLog"("adminId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_status_idx" ON "NewsletterSubscriber"("status");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_locale_idx" ON "NewsletterSubscriber"("locale");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_enabled_idx" ON "WebhookEndpoint"("enabled");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_createdAt_idx" ON "WebhookDelivery"("webhookId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- CreateIndex
CREATE INDEX "DeviceToken_platform_idx" ON "DeviceToken"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_userId_key" ON "DeviceToken"("token", "userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthEvent" ADD CONSTRAINT "AuthEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneVerification" ADD CONSTRAINT "PhoneVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminRefreshToken" ADD CONSTRAINT "AdminRefreshToken_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuthEvent" ADD CONSTRAINT "AdminAuthEvent_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminOtp" ADD CONSTRAINT "AdminOtp_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backup" ADD CONSTRAINT "Backup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEmail" ADD CONSTRAINT "UserEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_handledByAdminId_fkey" FOREIGN KEY ("handledByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportMessage" ADD CONSTRAINT "ReportMessage_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportMessage" ADD CONSTRAINT "ReportMessage_senderAdminId_fkey" FOREIGN KEY ("senderAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportMessage" ADD CONSTRAINT "ReportMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Geolocation" ADD CONSTRAINT "Geolocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BannerTranslation" ADD CONSTRAINT "BannerTranslation_bannerId_fkey" FOREIGN KEY ("bannerId") REFERENCES "Banner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTranslation" ADD CONSTRAINT "ArticleTranslation_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonTranslation" ADD CONSTRAINT "SeasonTranslation_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeTranslation" ADD CONSTRAINT "EpisodeTranslation_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistTranslation" ADD CONSTRAINT "PlaylistTranslation_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friend" ADD CONSTRAINT "Friend_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friend" ADD CONSTRAINT "Friend_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "View" ADD CONSTRAINT "View_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_senderAdminId_fkey" FOREIGN KEY ("senderAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybackProgress" ADD CONSTRAINT "PlaybackProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybackProgress" ADD CONSTRAINT "PlaybackProgress_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

